import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePayroll } from '../../../utils/payroll-calc'

// ============================================
// 개별 급여명세서 관리 API
// GET   → 상세 조회
// PATCH → 수정 (수당/공제 조정 → 자동 재계산)
// POST  → 상태 변경 (confirm / pay)
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
    .from('profiles').select('role, company_id, employee_name').eq('id', user.id).single()
  if (!profile || !['god_admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id, employee_name: profile.employee_name }
}

// GET: 급여명세서 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data, error } = await sb
    .from('payslips')
    .select(`
      *,
      employee:employee_id(id, employee_name, email, phone,
        position:position_id(name),
        department:department_id(name)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: '급여명세서를 찾을 수 없습니다.' }, { status: 404 })

  if (admin.role === 'master' && data.company_id !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // 급여 설정 정보도 함께 조회
  const { data: salaryInfo } = await sb
    .from('employee_salaries')
    .select('bank_name, account_number, account_holder, payment_day')
    .eq('company_id', data.company_id)
    .eq('employee_id', data.employee_id)
    .single()

  return NextResponse.json({ data: { ...data, salary_info: salaryInfo } })
}

// PATCH: 급여명세서 수정 (수당/공제 조정 → 자동 재계산)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const sb = getSupabaseAdmin()

  // 기존 데이터 조회
  const { data: existing, error: fetchErr } = await sb
    .from('payslips')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return NextResponse.json({ error: '급여명세서를 찾을 수 없습니다.' }, { status: 404 })
  if (existing.status === 'paid') return NextResponse.json({ error: '지급 완료된 명세서는 수정할 수 없습니다.' }, { status: 400 })
  if (admin.role === 'master' && existing.company_id !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  // 수정 가능한 필드
  const baseSalary = body.base_salary ?? existing.base_salary
  const allowanceDetails = body.allowance_details ?? existing.allowance_details ?? {}
  const taxType = body.tax_type ?? existing.tax_type
  const expenseClaims = body.expense_claims ?? existing.expense_claims ?? []
  const expenseDeductions = body.expense_deductions ?? existing.expense_deductions ?? []
  const memo = body.memo !== undefined ? body.memo : existing.memo

  const expenseClaimTotal = (expenseClaims as any[]).reduce((s: number, e: any) => s + (e.amount || 0), 0)
  const expenseDeductionTotal = (expenseDeductions as any[]).reduce((s: number, e: any) => s + (e.amount || 0), 0)

  // 자동 재계산
  const calc = calculatePayroll({
    baseSalary: Number(baseSalary),
    allowances: allowanceDetails,
    taxType: taxType as '근로소득' | '사업소득3.3%',
    expenseClaims: expenseClaimTotal,
    expenseDeductions: expenseDeductionTotal,
  })

  const { data: updated, error: updateErr } = await sb
    .from('payslips')
    .update({
      base_salary: calc.baseSalary,
      total_allowances: calc.totalAllowances,
      allowance_details: allowanceDetails,
      gross_salary: calc.grossSalary,
      national_pension: calc.nationalPension,
      health_insurance: calc.healthInsurance,
      long_care_insurance: calc.longCareInsurance,
      employment_insurance: calc.employmentInsurance,
      income_tax: calc.incomeTax,
      local_income_tax: calc.localIncomeTax,
      tax_type: taxType,
      total_deductions: calc.totalDeductions,
      expense_claims: expenseClaims,
      expense_deductions: expenseDeductions,
      net_salary: calc.netSalary,
      memo,
      status: 'draft',  // 수정 시 draft로 리셋
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ data: updated })
}

// POST: 상태 변경 (confirm / pay)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { action } = body  // 'confirm' | 'pay'

  if (!action || !['confirm', 'pay'].includes(action)) {
    return NextResponse.json({ error: 'action: confirm 또는 pay' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: payslip, error: fetchErr } = await sb
    .from('payslips')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !payslip) return NextResponse.json({ error: '급여명세서를 찾을 수 없습니다.' }, { status: 404 })
  if (admin.role === 'master' && payslip.company_id !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  if (action === 'confirm') {
    if (payslip.status !== 'draft') {
      return NextResponse.json({ error: 'draft 상태만 확정할 수 있습니다.' }, { status: 400 })
    }
    const { error } = await sb
      .from('payslips')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, status: 'confirmed' })
  }

  if (action === 'pay') {
    if (payslip.status !== 'confirmed') {
      return NextResponse.json({ error: 'confirmed 상태만 지급 처리할 수 있습니다.' }, { status: 400 })
    }

    const paidDate = new Date().toISOString().split('T')[0]

    // 급여명세서 상태 업데이트
    const { error: updateErr } = await sb
      .from('payslips')
      .update({ status: 'paid', paid_date: paidDate, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // 직원 이름 조회
    const { data: emp } = await sb
      .from('profiles')
      .select('employee_name')
      .eq('id', payslip.employee_id)
      .single()

    // transactions 테이블에 급여 지출 기록
    await sb.from('transactions').insert({
      company_id: payslip.company_id,
      transaction_date: paidDate,
      type: '출금',
      client_name: emp?.employee_name || '직원',
      description: `${payslip.pay_period} 급여 지급`,
      amount: -Number(payslip.net_salary),
      payment_method: '통장',
      category: '급여',
      related_type: 'payroll',
      related_id: id,
      status: 'completed',
    })

    return NextResponse.json({ success: true, status: 'paid', paid_date: paidDate })
  }
}
