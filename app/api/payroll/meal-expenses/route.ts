import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    const yearMonth = searchParams.get('year_month')

    if (!companyId || !yearMonth) {
      return NextResponse.json({ error: 'company_id and year_month required' }, { status: 400 })
    }

    // 1) 기존 집계 데이터 확인
    const { data: existing } = await supabase
      .from('meal_expense_monthly')
      .select('*, employee:employee_id(id, employee_name, position:position_id(name), department:department_id(name))')
      .eq('company_id', companyId)
      .eq('year_month', yearMonth)
      .order('excess_amount', { ascending: false })

    if (existing && existing.length > 0) {
      return NextResponse.json({ data: existing, source: 'cached' })
    }

    // 2) 실시간 집계: classification_queue에서 식대 카테고리 거래 조회
    const startDate = `${yearMonth}-01`
    const [y, m] = yearMonth.split('-').map(Number)
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    // 법인카드 목록 조회
    const { data: cards } = await supabase
      .from('corporate_cards')
      .select('id, card_number, assigned_employee_id, holder_name, card_alias')
      .eq('company_id', companyId)
      .eq('is_active', true)

    // 식대 카테고리 거래 조회 (classification_queue에서)
    const { data: mealTxns } = await supabase
      .from('classification_queue')
      .select('id, card_id, source_data, ai_category')
      .eq('company_id', companyId)
      .gte('source_data->>transaction_date', startDate)
      .lt('source_data->>transaction_date', nextMonth)
      .in('ai_category', ['복리후생(식대)'])

    // 직원별 집계
    const employeeMap: Record<string, { total: number; count: number; cardId: string | null; cardNumber: string | null }> = {}

    for (const txn of (mealTxns || [])) {
      const cardId = txn.card_id
      const card = cards?.find(c => c.id === cardId)
      const empId = card?.assigned_employee_id
      if (!empId) continue

      if (!employeeMap[empId]) {
        employeeMap[empId] = { total: 0, count: 0, cardId: card?.id || null, cardNumber: card?.card_number || null }
      }
      employeeMap[empId].total += Math.abs(Number(txn.source_data?.amount) || 0)
      employeeMap[empId].count += 1
    }

    // 직원 급여설정에서 식대 수당 조회
    const { data: salarySettings } = await supabase
      .from('employee_salaries')
      .select('employee_id, allowances')
      .eq('company_id', companyId)
      .eq('is_active', true)

    const settingsMap: Record<string, number> = {}
    for (const s of (salarySettings || [])) {
      settingsMap[s.employee_id] = s.allowances?.['식대'] || 200000
    }

    // 결과 조합
    const results = Object.entries(employeeMap).map(([empId, data]) => {
      const baseAllowance = settingsMap[empId] || 200000
      const excess = Math.max(0, data.total - baseAllowance)
      return {
        employee_id: empId,
        year_month: yearMonth,
        card_id: data.cardId,
        card_number: data.cardNumber,
        total_meal_spending: data.total,
        base_allowance: baseAllowance,
        excess_amount: excess,
        transaction_count: data.count,
        status: 'pending',
      }
    })

    return NextResponse.json({ data: results, source: 'realtime' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { company_id, year_month } = await req.json()
    if (!company_id || !year_month) {
      return NextResponse.json({ error: 'company_id and year_month required' }, { status: 400 })
    }

    // GET과 동일한 집계 로직 실행 후 DB에 저장
    const startDate = `${year_month}-01`
    const [y, m] = year_month.split('-').map(Number)
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    const { data: cards } = await supabase
      .from('corporate_cards')
      .select('id, card_number, assigned_employee_id, holder_name')
      .eq('company_id', company_id)
      .eq('is_active', true)

    const { data: mealTxns } = await supabase
      .from('classification_queue')
      .select('id, card_id, source_data, ai_category')
      .eq('company_id', company_id)
      .gte('source_data->>transaction_date', startDate)
      .lt('source_data->>transaction_date', nextMonth)
      .in('ai_category', ['복리후생(식대)'])

    const employeeMap: Record<string, { total: number; count: number; cardId: string | null; cardNumber: string | null }> = {}
    for (const txn of (mealTxns || [])) {
      const card = cards?.find(c => c.id === txn.card_id)
      const empId = card?.assigned_employee_id
      if (!empId) continue
      if (!employeeMap[empId]) employeeMap[empId] = { total: 0, count: 0, cardId: card?.id || null, cardNumber: card?.card_number || null }
      employeeMap[empId].total += Math.abs(Number(txn.source_data?.amount) || 0)
      employeeMap[empId].count += 1
    }

    const { data: salarySettings } = await supabase
      .from('employee_salaries')
      .select('employee_id, allowances')
      .eq('company_id', company_id)
      .eq('is_active', true)

    const settingsMap: Record<string, number> = {}
    for (const s of (salarySettings || [])) {
      settingsMap[s.employee_id] = s.allowances?.['식대'] || 200000
    }

    let created = 0
    let adjustmentsCreated = 0

    for (const [empId, data] of Object.entries(employeeMap)) {
      const baseAllowance = settingsMap[empId] || 200000
      const excess = Math.max(0, data.total - baseAllowance)

      // upsert meal_expense_monthly
      const { error } = await supabase
        .from('meal_expense_monthly')
        .upsert({
          company_id,
          employee_id: empId,
          year_month,
          card_id: data.cardId,
          card_number: data.cardNumber,
          total_meal_spending: data.total,
          base_allowance: baseAllowance,
          excess_amount: excess,
          transaction_count: data.count,
          status: excess > 0 ? 'pending' : 'approved',
        }, { onConflict: 'company_id,employee_id,year_month' })

      if (!error) created++

      // 초과분이 있으면 salary_adjustment 생성
      if (excess > 0) {
        const { error: adjError } = await supabase
          .from('salary_adjustments')
          .upsert({
            company_id,
            employee_id: empId,
            year_month,
            adjustment_type: 'deduct',
            amount: excess,
            reason: `식대 초과 공제 (사용: ${data.total.toLocaleString()}원, 수당: ${baseAllowance.toLocaleString()}원, 초과: ${excess.toLocaleString()}원)`,
            status: 'pending',
          }, { onConflict: 'source_transaction_id,adjustment_type', ignoreDuplicates: true })

        if (!adjError) adjustmentsCreated++
      }
    }

    return NextResponse.json({ created, adjustments_created: adjustmentsCreated, total_employees: Object.keys(employeeMap).length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
