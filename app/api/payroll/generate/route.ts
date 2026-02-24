import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePayroll } from '../../../utils/payroll-calc'

// ============================================
// 월별 급여 일괄 생성 API
// POST → pay_period(YYYY-MM) 기준 전직원 급여명세서 자동 생성
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
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { company_id, pay_period } = body

  if (!company_id || !pay_period) {
    return NextResponse.json({ error: 'company_id, pay_period(YYYY-MM) 필수' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}$/.test(pay_period)) {
    return NextResponse.json({ error: 'pay_period 형식: YYYY-MM' }, { status: 400 })
  }
  if (admin.role === 'master' && company_id !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()

  // 1. 활성 직원 급여 설정 조회
  const { data: salarySettings, error: ssErr } = await sb
    .from('employee_salaries')
    .select('*')
    .eq('company_id', company_id)
    .eq('is_active', true)

  if (ssErr) return NextResponse.json({ error: ssErr.message }, { status: 500 })
  if (!salarySettings || salarySettings.length === 0) {
    return NextResponse.json({ error: '급여 설정된 직원이 없습니다.' }, { status: 400 })
  }

  // 2. 이미 생성된 급여명세서 확인
  const { data: existing } = await sb
    .from('payslips')
    .select('employee_id')
    .eq('company_id', company_id)
    .eq('pay_period', pay_period)

  const existingSet = new Set((existing || []).map((e: any) => e.employee_id))

  // 3. 해당 월 실비정산 내역 조회 (transactions 테이블)
  const periodStart = `${pay_period}-01`
  const [y, m] = pay_period.split('-').map(Number)
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { data: expenseTransactions } = await sb
    .from('transactions')
    .select('*')
    .eq('company_id', company_id)
    .eq('related_type', 'expense_claim')
    .gte('transaction_date', periodStart)
    .lt('transaction_date', nextMonth)

  // 직원별 실비정산 그룹핑
  const expenseByEmployee: Record<string, { claims: any[]; deductions: any[] }> = {}
  for (const tx of (expenseTransactions || [])) {
    const empId = tx.related_id
    if (!empId) continue
    if (!expenseByEmployee[empId]) expenseByEmployee[empId] = { claims: [], deductions: [] }
    if (tx.type === '입금' || tx.amount > 0) {
      expenseByEmployee[empId].claims.push({ memo: tx.description, amount: Math.abs(tx.amount) })
    } else {
      expenseByEmployee[empId].deductions.push({ memo: tx.description, amount: Math.abs(tx.amount) })
    }
  }

  // 4. 급여명세서 일괄 생성
  const payslips: any[] = []
  const skipped: string[] = []

  for (const setting of salarySettings) {
    if (existingSet.has(setting.employee_id)) {
      skipped.push(setting.employee_id)
      continue
    }

    const allowances = (setting.allowances || {}) as Record<string, number>
    const expenses = expenseByEmployee[setting.employee_id] || { claims: [], deductions: [] }
    const expenseClaimTotal = expenses.claims.reduce((s: number, e: any) => s + e.amount, 0)
    const expenseDeductionTotal = expenses.deductions.reduce((s: number, e: any) => s + e.amount, 0)

    const calc = calculatePayroll({
      baseSalary: Number(setting.base_salary) || 0,
      allowances,
      taxType: setting.tax_type as '근로소득' | '사업소득3.3%',
      expenseClaims: expenseClaimTotal,
      expenseDeductions: expenseDeductionTotal,
    })

    payslips.push({
      company_id,
      employee_id: setting.employee_id,
      pay_period,
      base_salary: calc.baseSalary,
      total_allowances: calc.totalAllowances,
      allowance_details: allowances,
      gross_salary: calc.grossSalary,
      national_pension: calc.nationalPension,
      health_insurance: calc.healthInsurance,
      long_care_insurance: calc.longCareInsurance,
      employment_insurance: calc.employmentInsurance,
      income_tax: calc.incomeTax,
      local_income_tax: calc.localIncomeTax,
      tax_type: setting.tax_type,
      total_deductions: calc.totalDeductions,
      expense_claims: expenses.claims,
      expense_deductions: expenses.deductions,
      net_salary: calc.netSalary,
      status: 'draft',
    })
  }

  if (payslips.length === 0) {
    return NextResponse.json({
      success: true,
      message: '모든 직원의 급여가 이미 생성되어 있습니다.',
      created: 0,
      skipped: skipped.length,
    })
  }

  const { data: inserted, error: insertErr } = await sb
    .from('payslips')
    .insert(payslips)
    .select('id, employee_id')

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    created: inserted?.length || 0,
    skipped: skipped.length,
    data: inserted,
  })
}
