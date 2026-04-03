import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================
// 급여 설정 CRUD API
// GET  → 직원별 급여 설정 목록
// POST → 급여 설정 생성/수정 (upsert)
// ============================================

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  try {
    // TODO: Phase 5 Firebase Auth
    const tokenParts = token.split('.')
    if (tokenParts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
    const userId = payload.sub || payload.user_id
    if (!userId) return null

    // Query profile for role
    const profileData = await prisma.$queryRaw<any[]>`
      SELECT id, role FROM profiles WHERE id = ${userId} LIMIT 1
    `
    const profile = profileData?.[0]
    if (!profile || !['admin', 'master'].includes(profile.role)) return null
    return { id: userId, role: profile.role }
  } catch (e) {
    return null
  }
}

// GET: 급여 설정 목록
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')

  if (!companyId) {
    return NextResponse.json({ error: 'company_id 필수 파라미터입니다.' }, { status: 400 })
  }

  try {
    // Raw query to fetch employee salaries with profile joins
    const data = await prisma.$queryRaw<any[]>`
      SELECT
        es.*,
        p.id as employee_id,
        p.employee_name,
        p.email,
        p.phone
      FROM employee_salaries es
      LEFT JOIN profiles p ON es.employee_id = p.id
      WHERE es.company_id = ${companyId}
      ORDER BY es.created_at DESC
    `

    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST: 급여 설정 생성/수정 (upsert)
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const {
    company_id,
    employee_id,
    base_salary,
    allowances = {},
    deduction_overrides = {},
    payment_day = 25,
    tax_type = '근로소득',
    bank_name,
    account_number,
    account_holder,
    is_active = true,
    // ── 확장 필드 (064_payroll_enhanced) ──
    employment_type = '정규직',
    salary_type = '월급제',
    annual_salary,
    hourly_rate,
    daily_rate,
    working_hours_per_week = 40,
    dependents_count = 1,
    net_salary_mode = false,
    target_net_salary,
    custom_deductions = {},
    expanded_allowances = {},
  } = body

  if (!company_id || !employee_id) {
    return NextResponse.json({ error: '회사 ID와 직원 ID가 필요합니다.' }, { status: 400 })
  }

  try {
    const now = new Date().toISOString()
    const allowancesJson = JSON.stringify(allowances)
    const deductionOverridesJson = JSON.stringify(deduction_overrides)
    const customDeductionsJson = JSON.stringify(custom_deductions)
    const expandedAllowancesJson = JSON.stringify(expanded_allowances)

    // Upsert using raw SQL
    await prisma.$executeRaw`
      INSERT INTO employee_salaries (
        id, company_id, employee_id, base_salary, allowances, deduction_overrides,
        payment_day, tax_type, bank_name, account_number, account_holder, is_active,
        employment_type, salary_type, annual_salary, hourly_rate, daily_rate,
        working_hours_per_week, dependents_count, net_salary_mode, target_net_salary,
        custom_deductions, expanded_allowances, created_at, updated_at
      ) VALUES (
        UUID(), ${company_id}, ${employee_id}, ${base_salary || 0}, ${allowancesJson}, ${deductionOverridesJson},
        ${payment_day}, ${tax_type}, ${bank_name || null}, ${account_number || null}, ${account_holder || null}, ${is_active ? 1 : 0},
        ${employment_type}, ${salary_type}, ${annual_salary || null}, ${hourly_rate || null}, ${daily_rate || null},
        ${working_hours_per_week}, ${dependents_count}, ${net_salary_mode ? 1 : 0}, ${target_net_salary || null},
        ${customDeductionsJson}, ${expandedAllowancesJson}, ${now}, ${now}
      )
      ON DUPLICATE KEY UPDATE
        base_salary = ${base_salary || 0},
        allowances = ${allowancesJson},
        deduction_overrides = ${deductionOverridesJson},
        payment_day = ${payment_day},
        tax_type = ${tax_type},
        bank_name = ${bank_name || null},
        account_number = ${account_number || null},
        account_holder = ${account_holder || null},
        is_active = ${is_active ? 1 : 0},
        employment_type = ${employment_type},
        salary_type = ${salary_type},
        annual_salary = ${annual_salary || null},
        hourly_rate = ${hourly_rate || null},
        daily_rate = ${daily_rate || null},
        working_hours_per_week = ${working_hours_per_week},
        dependents_count = ${dependents_count},
        net_salary_mode = ${net_salary_mode ? 1 : 0},
        target_net_salary = ${target_net_salary || null},
        custom_deductions = ${customDeductionsJson},
        expanded_allowances = ${expandedAllowancesJson},
        updated_at = ${now}
    `

    // Fetch the upserted record
    const data = await prisma.$queryRaw<any[]>`
      SELECT * FROM employee_salaries
      WHERE company_id = ${company_id} AND employee_id = ${employee_id}
      LIMIT 1
    `

    return NextResponse.json({ data: data?.[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
