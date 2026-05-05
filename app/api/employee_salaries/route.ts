import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// employee_salaries — 직원 급여 설정 (관리용 기본 정보)
// 세무 정밀계산은 외부 세무사 영역 — 4대보험/소득세 자동계산 모듈 미사용
// 본 API 는 base_salary + 수당 + 계좌정보 의 단순 CRUD

// GET /api/employee_salaries
//   - 옵션 ?employee_id=X — 특정 직원의 설정만 1건 조회
//   - 옵션 ?company_id=X — 회사별 필터
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id')
    const employeeId = searchParams.get('employee_id')

    const conditions: string[] = []
    const params: any[] = []
    if (companyId) { conditions.push('company_id = ?'); params.push(companyId) }
    if (employeeId) { conditions.push('employee_id = ?'); params.push(employeeId) }
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const query = `SELECT * FROM employee_salaries ${whereSql} ORDER BY created_at DESC`
    const data = await prisma.$queryRawUnsafe<any[]>(query, ...params)
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/employee_salaries — UPSERT 기반 (company_id + employee_id unique)
// body: { employee_id, company_id?, base_salary, allowances?, payment_day?,
//         tax_type?, bank_name?, account_number?, account_holder?, is_active? }
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    if (!body.employee_id) {
      return NextResponse.json({ error: 'employee_id 필요' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const employeeId = String(body.employee_id)
    const companyId = body.company_id ? String(body.company_id) : null
    const baseSalary = Number(body.base_salary || 0)
    const allowancesJson = body.allowances ? JSON.stringify(body.allowances) : null
    const paymentDay = body.payment_day != null ? Number(body.payment_day) : 25
    const taxType = body.tax_type || '4대보험'
    const bankName = body.bank_name || null
    const accountNumber = body.account_number || null
    const accountHolder = body.account_holder || null
    const isActive = body.is_active !== false

    // ON DUPLICATE KEY UPDATE — (company_id, employee_id) 가 unique 이므로
    // 동일 직원 재등록 시 자동 UPSERT
    await prisma.$executeRawUnsafe(
      `INSERT INTO employee_salaries
         (id, company_id, employee_id, base_salary, allowances, payment_day,
          tax_type, bank_name, account_number, account_holder, is_active,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         base_salary = VALUES(base_salary),
         allowances = VALUES(allowances),
         payment_day = VALUES(payment_day),
         tax_type = VALUES(tax_type),
         bank_name = VALUES(bank_name),
         account_number = VALUES(account_number),
         account_holder = VALUES(account_holder),
         is_active = VALUES(is_active),
         updated_at = NOW()`,
      id, companyId, employeeId, baseSalary, allowancesJson, paymentDay,
      taxType, bankName, accountNumber, accountHolder, isActive ? 1 : 0,
    )

    // 조회 — INSERT 든 UPDATE 든 같은 employee_id 의 row 반환
    const created = await prisma.$queryRawUnsafe<any[]>(
      companyId
        ? `SELECT * FROM employee_salaries WHERE company_id = ? AND employee_id = ? LIMIT 1`
        : `SELECT * FROM employee_salaries WHERE employee_id = ? LIMIT 1`,
      ...(companyId ? [companyId, employeeId] : [employeeId]),
    )
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[employee_salaries POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
