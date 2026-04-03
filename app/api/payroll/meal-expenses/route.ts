import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = getUserIdFromToken(token)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // TODO: Phase 5 - Replace with Firebase Auth verification

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    const yearMonth = searchParams.get('year_month')

    if (!companyId || !yearMonth) {
      return NextResponse.json({ error: 'company_id and year_month required' }, { status: 400 })
    }

    // 1) 기존 집계 데이터 확인
    const existing = await prisma.$queryRaw<any[]>`
      SELECT * FROM meal_expense_monthly
      WHERE year_month = ${yearMonth}
      ORDER BY excess_amount DESC
    `

    if (existing && existing.length > 0) {
      return NextResponse.json({ data: existing, source: 'cached' })
    }

    // 2) 실시간 집계: classification_queue에서 식대 카테고리 거래 조회
    const startDate = `${yearMonth}-01`
    const [y, m] = yearMonth.split('-').map(Number)
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    // 법인카드 목록 조회
    const cards = await prisma.$queryRaw<any[]>`
      SELECT id, card_number, assigned_employee_id, holder_name, card_alias FROM corporate_cards
      WHERE is_active = 1
    `

    // 식대 카테고리 거래 조회 (classification_queue에서)
    const mealTxns = await prisma.$queryRaw<any[]>`
      SELECT id, card_id, source_data, ai_category FROM classification_queue
      WHERE ai_category = '복리후생(식대)'
      AND JSON_UNQUOTE(JSON_EXTRACT(source_data, '$.transaction_date')) >= ${startDate}
      AND JSON_UNQUOTE(JSON_EXTRACT(source_data, '$.transaction_date')) < ${nextMonth}
    `

    // 직원별 집계
    const employeeMap: Record<string, { total: number; count: number; cardId: string | null; cardNumber: string | null }> = {}

    for (const txn of (mealTxns || [])) {
      const cardId = txn.card_id
      const card = cards?.find(c => c.id === cardId)
      const empId = card?.assigned_employee_id
      if (!empId) continue

      const sourceData = typeof txn.source_data === 'string' ? JSON.parse(txn.source_data) : txn.source_data
      if (!employeeMap[empId]) {
        employeeMap[empId] = { total: 0, count: 0, cardId: card?.id || null, cardNumber: card?.card_number || null }
      }
      employeeMap[empId].total += Math.abs(Number(sourceData?.amount) || 0)
      employeeMap[empId].count += 1
    }

    // 직원 급여설정에서 식대 수당 조회
    const salarySettings = await prisma.$queryRaw<any[]>`
      SELECT employee_id, allowances FROM employee_salaries
      WHERE is_active = 1
    `

    const settingsMap: Record<string, number> = {}
    for (const s of (salarySettings || [])) {
      const allowancesRaw = typeof s.allowances === 'string' ? JSON.parse(s.allowances) : s.allowances
      settingsMap[s.employee_id] = allowancesRaw?.['식대'] || 200000
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
    const userId = getUserIdFromToken(token)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // TODO: Phase 5 - Replace with Firebase Auth verification

    const { company_id, year_month } = await req.json()
    if (!company_id || !year_month) {
      return NextResponse.json({ error: 'company_id and year_month required' }, { status: 400 })
    }

    // GET과 동일한 집계 로직 실행 후 DB에 저장
    const startDate = `${year_month}-01`
    const [y, m] = year_month.split('-').map(Number)
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    const cards = await prisma.$queryRaw<any[]>`
      SELECT id, card_number, assigned_employee_id, holder_name FROM corporate_cards
      WHERE is_active = 1
    `

    const mealTxns = await prisma.$queryRaw<any[]>`
      SELECT id, card_id, source_data, ai_category FROM classification_queue
      WHERE ai_category = '복리후생(식대)'
      AND JSON_UNQUOTE(JSON_EXTRACT(source_data, '$.transaction_date')) >= ${startDate}
      AND JSON_UNQUOTE(JSON_EXTRACT(source_data, '$.transaction_date')) < ${nextMonth}
    `

    const employeeMap: Record<string, { total: number; count: number; cardId: string | null; cardNumber: string | null }> = {}
    for (const txn of (mealTxns || [])) {
      const card = cards?.find(c => c.id === txn.card_id)
      const empId = card?.assigned_employee_id
      if (!empId) continue
      const sourceData = typeof txn.source_data === 'string' ? JSON.parse(txn.source_data) : txn.source_data
      if (!employeeMap[empId]) employeeMap[empId] = { total: 0, count: 0, cardId: card?.id || null, cardNumber: card?.card_number || null }
      employeeMap[empId].total += Math.abs(Number(sourceData?.amount) || 0)
      employeeMap[empId].count += 1
    }

    const salarySettings = await prisma.$queryRaw<any[]>`
      SELECT employee_id, allowances FROM employee_salaries
      WHERE is_active = 1
    `

    const settingsMap: Record<string, number> = {}
    for (const s of (salarySettings || [])) {
      const allowancesRaw = typeof s.allowances === 'string' ? JSON.parse(s.allowances) : s.allowances
      settingsMap[s.employee_id] = allowancesRaw?.['식대'] || 200000
    }

    let created = 0
    let adjustmentsCreated = 0

    for (const [empId, data] of Object.entries(employeeMap)) {
      const baseAllowance = settingsMap[empId] || 200000
      const excess = Math.max(0, data.total - baseAllowance)

      // upsert meal_expense_monthly
      try {
        await prisma.$executeRaw`
          INSERT INTO meal_expense_monthly (company_id, employee_id, year_month, card_id, card_number, total_meal_spending, base_allowance, excess_amount, transaction_count, status, created_at, updated_at)
          VALUES (${company_id}, ${empId}, ${year_month}, ${data.cardId}, ${data.cardNumber}, ${data.total}, ${baseAllowance}, ${excess}, ${data.count}, ${excess > 0 ? 'pending' : 'approved'}, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
          card_id = VALUES(card_id),
          card_number = VALUES(card_number),
          total_meal_spending = VALUES(total_meal_spending),
          base_allowance = VALUES(base_allowance),
          excess_amount = VALUES(excess_amount),
          transaction_count = VALUES(transaction_count),
          status = VALUES(status),
          updated_at = NOW()
        `
        created++
      } catch (e: any) {
        console.error('meal_expense_monthly upsert 실패:', e)
      }

      // 초과분이 있으면 salary_adjustment 생성
      if (excess > 0) {
        try {
          await prisma.$executeRaw`
            INSERT INTO salary_adjustments (company_id, employee_id, year_month, adjustment_type, amount, reason, status, created_at, updated_at)
            VALUES (${company_id}, ${empId}, ${year_month}, 'deduct', ${excess}, ${'식대 초과 공제 (사용: ' + data.total.toLocaleString() + '원, 수당: ' + baseAllowance.toLocaleString() + '원, 초과: ' + excess.toLocaleString() + '원)'}, 'pending', NOW(), NOW())
            ON DUPLICATE KEY UPDATE
            amount = VALUES(amount),
            reason = VALUES(reason),
            status = VALUES(status),
            updated_at = NOW()
          `
          adjustmentsCreated++
        } catch (e: any) {
          console.error('salary_adjustments upsert 실패:', e)
        }
      }
    }

    return NextResponse.json({ created, adjustments_created: adjustmentsCreated, total_employees: Object.keys(employeeMap).length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
