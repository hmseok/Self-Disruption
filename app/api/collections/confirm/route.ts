import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 수금 확인 API
// POST → 입금 확인 처리 (transactions 생성 + schedule 매칭)
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

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const body = await request.json()
    const {
      schedule_id,
      actual_amount,
      payment_date,
      payment_method = '계좌이체',
      memo = '',
    } = body

    if (!schedule_id || !actual_amount || !payment_date) {
      return NextResponse.json({ error: 'schedule_id, actual_amount, payment_date 필수' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // 1. 스케줄 조회
    const { data: schedule, error: schedErr } = await sb
      .from('expected_payment_schedules')
      .select('*')
      .eq('id', schedule_id)
      .single()

    if (schedErr || !schedule) {
      return NextResponse.json({ error: '결제 스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (schedule.status === 'completed') {
      return NextResponse.json({ error: '이미 수금 완료된 건입니다.' }, { status: 409 })
    }

    // 2. 계약 정보 조회 (고객명)
    const tableName = schedule.contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'
    const nameField = schedule.contract_type === 'jiip' ? 'investor_name' : 'investor_name'
    const { data: contract } = await sb
      .from(tableName)
      .select(`${nameField}, company_id`)
      .eq('id', schedule.contract_id)
      .single()

    const clientName = contract?.[nameField] || '고객'
    const companyId = contract?.company_id || schedule.company_id

    // 3. 거래 내역 생성 (transactions)
    const monthStr = new Date(schedule.payment_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })
    const { data: tx, error: txErr } = await sb
      .from('transactions')
      .insert({
        company_id: companyId,
        transaction_date: payment_date,
        type: 'income',
        status: 'completed',
        category: schedule.contract_type === 'jiip' ? '지입수입' : '금융수입',
        client_name: clientName,
        description: `${monthStr} ${clientName} ${schedule.contract_type === 'jiip' ? '관리비' : '이자'} 수금${memo ? ` (${memo})` : ''}`,
        amount: actual_amount,
        payment_method,
        related_type: schedule.contract_type,
        related_id: schedule.contract_id,
      })
      .select('id')
      .single()

    if (txErr) {
      console.error('[collections/confirm] 거래 생성 실패:', txErr)
      return NextResponse.json({ error: '거래 내역 생성 실패: ' + txErr.message }, { status: 500 })
    }

    // 4. 스케줄 업데이트 (매칭)
    const newStatus = actual_amount >= schedule.expected_amount ? 'completed' : 'partial'
    const { error: updateErr } = await sb
      .from('expected_payment_schedules')
      .update({
        actual_amount,
        status: newStatus,
        matched_transaction_id: tx.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule_id)

    if (updateErr) {
      console.error('[collections/confirm] 스케줄 업데이트 실패:', updateErr)
      return NextResponse.json({ error: '스케줄 업데이트 실패: ' + updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transaction_id: tx.id,
      schedule_id,
      status: newStatus,
      actual_amount,
    })
  } catch (err: any) {
    console.error('[collections/confirm] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
