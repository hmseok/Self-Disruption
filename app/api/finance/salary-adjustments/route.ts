import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '../../../utils/auth-guard'

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

  // Build dynamic WHERE clause
  let whereClause = 'WHERE 1=1'
  const params: any[] = []

  if (employeeId) {
    whereClause += ` AND employee_id = ?`
    params.push(employeeId)
  }
  if (yearMonth) {
    whereClause += ` AND year_month = ?`
    params.push(yearMonth)
  }
  if (status) {
    whereClause += ` AND status = ?`
    params.push(status)
  }

  const data = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM salary_adjustments ${whereClause} ORDER BY created_at DESC`,
    ...params
  )

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

  await prisma.$executeRaw`
    INSERT INTO salary_adjustments
    (company_id, employee_id, year_month, adjustment_type, amount, reason, source_transaction_id, status, memo, created_at)
    VALUES (
      ${company_id}, ${employee_id}, ${year_month}, ${adjustment_type},
      ${Math.abs(Number(amount))}, ${reason}, ${source_transaction_id || null},
      'pending', ${memo || null}, NOW()
    )
  `

  const data = await prisma.$queryRaw<any[]>`
    SELECT * FROM salary_adjustments
    WHERE employee_id = ${employee_id} AND year_month = ${year_month}
    ORDER BY created_at DESC LIMIT 1
  `

  return NextResponse.json(data.length > 0 ? data[0] : {})
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

  const now = new Date().toISOString()

  if (newStatus === 'approved') {
    for (const id of ids) {
      await prisma.$executeRaw`
        UPDATE salary_adjustments SET
          status = ${newStatus}, approved_by = ${auth.userId}, approved_at = ${now}
        WHERE id = ${id}
      `
    }
  } else {
    for (const id of ids) {
      await prisma.$executeRaw`
        UPDATE salary_adjustments SET status = ${newStatus} WHERE id = ${id}
      `
    }
  }

  const data = await prisma.$queryRaw<any[]>`
    SELECT * FROM salary_adjustments WHERE id IN (${ids.join(',')})
  `

  return NextResponse.json({ updated: data?.length || 0, items: data })
}
