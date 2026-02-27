import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePayroll, reverseCalculatePayroll, annualToMonthly, hourlyToMonthly, dailyToMonthly } from '../../../utils/payroll-calc'

// ============================================
// 월별 급여 일괄 생성 API (확장판)
// POST → pay_period(YYYY-MM) 기준 전직원 급여명세서 자동 생성
// - 식대 초과공제 자동 연동
// - 실수령액 역계산 모드 지원
// - 부양가족/수동공제 반영
// - 고용형태/급여형태 스냅샷
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

  // 4. 해당 월 식대 사용 내역 조회 (meal_expense_monthly)
  const { data: mealExpenses } = await sb
    .from('meal_expense_monthly')
    .select('*')
    .eq('company_id', company_id)
    .eq('year_month', pay_period)
    .in('status', ['approved', 'pending'])

  // 직원별 식대 초과 매핑
  const mealByEmployee: Record<string, {
    total_meal_spending: number
    base_allowance: number
    excess_amount: number
    transaction_count: number
    meal_expense_id: string
  }> = {}
  for (const me of (mealExpenses || [])) {
    mealByEmployee[me.employee_id] = {
      total_meal_spending: Number(me.total_meal_spending) || 0,
      base_allowance: Number(me.base_allowance) || 200000,
      excess_amount: Number(me.excess_amount) || 0,
      transaction_count: me.transaction_count || 0,
      meal_expense_id: me.id,
    }
  }

  // 5. 법인카드 총 사용액 조회 (해당 월)
  const { data: cardSpending } = await sb
    .from('classification_queue')
    .select('card_id, amount')
    .eq('company_id', company_id)
    .gte('transaction_date', periodStart)
    .lt('transaction_date', nextMonth)

  // 카드 → 직원 매핑 조회
  const { data: cardAssignments } = await sb
    .from('corporate_cards')
    .select('id, assigned_to')
    .eq('company_id', company_id)
    .not('assigned_to', 'is', null)

  const cardToEmployee: Record<string, string> = {}
  for (const ca of (cardAssignments || [])) {
    if (ca.assigned_to) cardToEmployee[ca.id] = ca.assigned_to
  }

  // 직원별 법인카드 총 사용액
  const cardSpendingByEmployee: Record<string, number> = {}
  for (const cs of (cardSpending || [])) {
    const empId = cardToEmployee[cs.card_id]
    if (!empId) continue
    cardSpendingByEmployee[empId] = (cardSpendingByEmployee[empId] || 0) + Math.abs(Number(cs.amount) || 0)
  }

  // 6. 급여명세서 일괄 생성
  const payslips: any[] = []
  const skipped: string[] = []

  for (const setting of salarySettings) {
    if (existingSet.has(setting.employee_id)) {
      skipped.push(setting.employee_id)
      continue
    }

    // ── 기본급 결정 (급여형태에 따라) ──
    let baseSalary = Number(setting.base_salary) || 0
    const salaryType = setting.salary_type || '월급제'
    const employmentType = setting.employment_type || '정규직'

    if (salaryType === '연봉제' && setting.annual_salary) {
      baseSalary = annualToMonthly(Number(setting.annual_salary))
    } else if (salaryType === '시급제' && setting.hourly_rate) {
      baseSalary = hourlyToMonthly(
        Number(setting.hourly_rate),
        Number(setting.working_hours_per_week) || 40
      )
    } else if (salaryType === '일급제' && setting.daily_rate) {
      baseSalary = dailyToMonthly(Number(setting.daily_rate))
    }

    // ── 수당 병합 (기본 + 확장) ──
    const baseAllowances = (setting.allowances || {}) as Record<string, number>
    const expandedAllowances = (setting.expanded_allowances || {}) as Record<string, number>
    const allowances = { ...baseAllowances, ...expandedAllowances }

    // ── 실비정산 ──
    const expenses = expenseByEmployee[setting.employee_id] || { claims: [], deductions: [] }
    const expenseClaimTotal = expenses.claims.reduce((s: number, e: any) => s + e.amount, 0)
    const expenseDeductionTotal = expenses.deductions.reduce((s: number, e: any) => s + e.amount, 0)

    // ── 식대 초과 공제 ──
    const mealData = mealByEmployee[setting.employee_id]
    const mealExcessDeduction = mealData ? mealData.excess_amount : 0

    // ── 수동 공제 항목 ──
    const customDeductions = (setting.custom_deductions || {}) as Record<string, number>

    // ── 부양가족 수 ──
    const dependentsCount = Number(setting.dependents_count) || 1

    // ── 실수령액 역계산 모드 처리 ──
    if (setting.net_salary_mode && setting.target_net_salary) {
      const reverseResult = reverseCalculatePayroll(
        Number(setting.target_net_salary),
        allowances,
        setting.tax_type as '근로소득' | '사업소득3.3%',
        dependentsCount,
        customDeductions,
        mealExcessDeduction,
      )
      baseSalary = reverseResult.baseSalary
    }

    // ── 급여 계산 ──
    const taxType = employmentType === '프리랜서' ? '사업소득3.3%' : (setting.tax_type as '근로소득' | '사업소득3.3%')

    const calc = calculatePayroll({
      baseSalary,
      allowances,
      taxType,
      expenseClaims: expenseClaimTotal,
      expenseDeductions: expenseDeductionTotal,
      dependentsCount,
      customDeductions,
      mealExcessDeduction,
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
      // ── 확장 필드 (064_payroll_enhanced) ──
      meal_expense_total: mealData?.total_meal_spending || 0,
      meal_expense_allowance: mealData?.base_allowance || 0,
      meal_expense_excess: mealExcessDeduction,
      card_spending_total: cardSpendingByEmployee[setting.employee_id] || 0,
      overtime_hours: 0,
      overtime_pay: calc.overtimePay || 0,
      custom_deductions_applied: customDeductions,
      employment_type_snapshot: employmentType,
      salary_type_snapshot: salaryType,
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

  // 식대 초과분이 적용된 직원의 meal_expense_monthly 상태 업데이트
  const mealAppliedIds: string[] = []
  for (const ps of payslips) {
    if (ps.meal_expense_excess > 0) {
      const mealData = mealByEmployee[ps.employee_id]
      if (mealData?.meal_expense_id) {
        mealAppliedIds.push(mealData.meal_expense_id)
      }
    }
  }
  if (mealAppliedIds.length > 0) {
    await sb
      .from('meal_expense_monthly')
      .update({ status: 'applied', updated_at: new Date().toISOString() })
      .in('id', mealAppliedIds)
  }

  return NextResponse.json({
    success: true,
    created: inserted?.length || 0,
    skipped: skipped.length,
    mealExcessApplied: mealAppliedIds.length,
    data: inserted,
  })
}
