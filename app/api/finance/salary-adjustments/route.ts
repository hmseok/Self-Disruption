import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '../../../utils/auth-guard'
import { getSupabaseAdmin } from '../../../utils/supabase-admin'

// ═══ GET: 급여 조정 목록 ═══
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const employeeId = searchParams.get('employee_id')
  const yearMonth = searchParams.get('year_month')
  const status = searchParams.get('status')

  if (!companyId) {
    return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  let query = sb
    .from('salary_adjustments')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (employeeId) query = query.eq('employee_id', employeeId)
  if (yearMonth) query = query.eq('year_month', yearMonth)
  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 직원별 월별 합계 계산
  const summaryByEmployee: Record<string, { deduct: number; add: number; net: number; name: string }> = {}
  for (const adj of (data || [])) {
    if (!summaryByEmployee[adj.employee_id]) {
      summaryByEmployee[adj.employee_id] = { deduct: 0, add: 0, net: 0, name: adj.employee_name || '' }
    }
    const amt = Number(adj.amount) || 0
    if (adj.adjustment_type === 'deduct') {
      summaryByEmployee[adj.employee_id].deduct += amt
    } else {
      summaryByEmployee[adj.employee_id].add += amt
    }
    summaryByEmployee[adj.employee_id].net =
      summaryByEmployee[adj.employee_id].add - summaryByEmployee[adj.employee_id].deduct
  }

  return NextResponse.json({ items: data || [], summaryByEmployee })
}

// ═══ POST: 급여 조정 생성 ═══
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const body = await request.json()
  const { company_id, employee_id, year_month, adjustment_type, amount, reason, source_transaction_id, memo } = body

  if (!company_id || !employee_id || !year_month || !adjustment_type || !amount || !reason) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data, error } = await sb
    .from('salary_adjustments')
    .insert({
      company_id,
      employee_id,
      year_month,
      adjustment_type,
      amount: Math.abs(Number(amount)),
      reason,
      source_transaction_id: source_transaction_id || null,
      status: 'pending',
      memo: memo || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// ═══ PATCH: 급여 조정 상태 변경 (승인/적용/취소) ═══
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const body = await request.json()
  const { ids, status: newStatus } = body

  if (!ids || !Array.isArray(ids) || !newStatus) {
    return NextResponse.json({ error: 'ids, status 필요' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const updateData: any = { status: newStatus }
  if (newStatus === 'approved') {
    updateData.approved_by = auth.userId
    updateData.approved_at = new Date().toISOString()
  }

  const { data, error } = await sb
    .from('salary_adjustments')
    .update(updateData)
    .in('id', ids)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated: data?.length || 0, items: data })
}
