import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 계약 자동 만료 처리 (Cron / 수동 호출)
// contract_end_date < today인 active 계약을 expired로 변경
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  // 간단한 시크릿 키 인증 (cron 보안)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY

  // Bearer 토큰 또는 cron 시크릿 확인
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    // 관리자 토큰 또는 cron 시크릿
    if (token !== cronSecret) {
      const sb = getSupabaseAdmin()
      const { data: { user } } = await sb.auth.getUser(token)
      if (!user) return NextResponse.json({ error: '인증 실패' }, { status: 401 })
      const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || profile.role !== 'god_admin') {
        return NextResponse.json({ error: 'god_admin만 실행 가능' }, { status: 403 })
      }
    }
  } else {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]
  let totalExpired = 0

  // jiip_contracts 만료 처리
  const { data: jiipExpired } = await sb
    .from('jiip_contracts')
    .select('id, company_id, status')
    .eq('status', 'active')
    .lt('contract_end_date', today)

  if (jiipExpired && jiipExpired.length > 0) {
    const ids = jiipExpired.map(c => c.id)
    await sb.from('jiip_contracts').update({ status: 'expired' }).in('id', ids)

    // 이력 기록
    const histories = jiipExpired.map(c => ({
      company_id: c.company_id,
      contract_type: 'jiip',
      contract_id: c.id,
      old_status: 'active',
      new_status: 'expired',
      change_reason: 'auto_expire',
    }))
    await sb.from('contract_status_history').insert(histories)
    totalExpired += jiipExpired.length
  }

  // general_investments 만료 처리
  const { data: investExpired } = await sb
    .from('general_investments')
    .select('id, company_id, status')
    .eq('status', 'active')
    .lt('contract_end_date', today)

  if (investExpired && investExpired.length > 0) {
    const ids = investExpired.map(c => c.id)
    await sb.from('general_investments').update({ status: 'expired' }).in('id', ids)

    const histories = investExpired.map(c => ({
      company_id: c.company_id,
      contract_type: 'invest',
      contract_id: c.id,
      old_status: 'active',
      new_status: 'expired',
      change_reason: 'auto_expire',
    }))
    await sb.from('contract_status_history').insert(histories)
    totalExpired += investExpired.length
  }

  return NextResponse.json({
    success: true,
    date: today,
    expired: {
      jiip: jiipExpired?.length || 0,
      invest: investExpired?.length || 0,
      total: totalExpired,
    },
  })
}
