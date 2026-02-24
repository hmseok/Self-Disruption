import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 결제 스케줄 API
// POST → 월별 예상 결제 스케줄 자동 생성
// GET  → 스케줄 목록 + 실제 입금 현황
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

// POST: 결제 스케줄 생성
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { contract_type, contract_id } = body

  if (!contract_type || !contract_id) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const tableName = contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'

  // 계약 정보 조회
  const { data: contract, error: fetchErr } = await sb
    .from(tableName).select('*').eq('id', contract_id).single()

  if (fetchErr || !contract) {
    return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (!contract.contract_start_date || !contract.contract_end_date) {
    return NextResponse.json({ error: '계약 시작일/종료일이 필요합니다.' }, { status: 400 })
  }

  // 기존 스케줄 삭제 (재생성)
  await sb
    .from('expected_payment_schedules')
    .delete()
    .eq('contract_type', contract_type)
    .eq('contract_id', contract_id)

  // 월별 스케줄 생성
  const startDate = new Date(contract.contract_start_date)
  const endDate = new Date(contract.contract_end_date)
  const payDay = contract_type === 'jiip' ? (contract.payout_day || 10) : (contract.payment_day || 10)

  // 월별 예상 금액 계산
  let monthlyAmount: number
  if (contract_type === 'jiip') {
    monthlyAmount = contract.admin_fee || 0
  } else {
    // 일반투자: 월 이자 = 투자금 × 연이자율 / 12
    const amount = Number(contract.invest_amount || 0)
    const rate = Number(contract.interest_rate || 0)
    monthlyAmount = Math.round(amount * rate / 100 / 12)
  }

  const schedules: any[] = []
  let paymentNumber = 1
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), payDay)

  // 시작일 이전이면 다음달로
  if (current < startDate) {
    current.setMonth(current.getMonth() + 1)
  }

  while (current <= endDate) {
    schedules.push({
      company_id: contract.company_id,
      contract_type,
      contract_id,
      payment_date: current.toISOString().split('T')[0],
      payment_number: paymentNumber,
      expected_amount: monthlyAmount,
      status: 'pending',
    })
    paymentNumber++
    current.setMonth(current.getMonth() + 1)
  }

  if (schedules.length === 0) {
    return NextResponse.json({ error: '생성할 스케줄이 없습니다.' }, { status: 400 })
  }

  const { error: insertErr } = await sb
    .from('expected_payment_schedules')
    .insert(schedules)

  if (insertErr) {
    return NextResponse.json({ error: '스케줄 생성 실패: ' + insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    count: schedules.length,
    monthly_amount: monthlyAmount,
    total_expected: monthlyAmount * schedules.length,
  })
}

// GET: 스케줄 목록 + 실제 입금 현황
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const contractType = searchParams.get('contract_type')
  const contractId = searchParams.get('contract_id')

  if (!contractType || !contractId) {
    return NextResponse.json({ error: 'contract_type, contract_id 필수' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // 스케줄 조회
  const { data: schedules, error } = await sb
    .from('expected_payment_schedules')
    .select('*')
    .eq('contract_type', contractType)
    .eq('contract_id', contractId)
    .order('payment_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 실제 입금 내역 조회
  const { data: transactions } = await sb
    .from('transactions')
    .select('id, amount, type, created_at, description')
    .eq('related_type', contractType)
    .eq('related_id', contractId)
    .eq('type', 'income')
    .order('created_at', { ascending: true })

  // 요약 계산
  const totalExpected = (schedules || []).reduce((sum, s) => sum + (s.expected_amount || 0), 0)
  const totalActual = (transactions || []).reduce((sum, t) => sum + (t.amount || 0), 0)
  const completedCount = (schedules || []).filter(s => s.status === 'completed').length
  const overdueCount = (schedules || []).filter(s => {
    return s.status === 'pending' && new Date(s.payment_date) < new Date()
  }).length

  return NextResponse.json({
    schedules: schedules || [],
    transactions: transactions || [],
    summary: {
      total_months: schedules?.length || 0,
      completed: completedCount,
      overdue: overdueCount,
      total_expected: totalExpected,
      total_actual: totalActual,
      balance: totalExpected - totalActual,
    },
  })
}
