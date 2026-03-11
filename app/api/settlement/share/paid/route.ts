import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 정산 지급완료 처리 API
// PATCH → settlement_shares의 paid_at 업데이트
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles').select('role, company_id').eq('id', user.id).single()
  if (!profile || !['god_admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const { share_ids, action } = await request.json() as {
      share_ids: string[]
      action: 'mark_paid' | 'unmark_paid'
    }

    if (!Array.isArray(share_ids) || share_ids.length === 0) {
      return NextResponse.json({ error: 'share_ids 필수' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const updateData = action === 'mark_paid'
      ? { paid_at: new Date().toISOString() }
      : { paid_at: null }

    const { data, error } = await sb
      .from('settlement_shares')
      .update(updateData)
      .in('id', share_ids)
      .eq('company_id', admin.company_id)
      .select('id, paid_at')

    if (error) {
      console.error('[settlement/share/paid] 오류:', error)
      return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true, updated: data })
  } catch (err: any) {
    console.error('[settlement/share/paid] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
