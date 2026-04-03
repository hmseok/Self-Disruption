import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculatePayroll } from '../../../utils/payroll-calc'

// ============================================
// 개별 급여명세서 관리 API
// GET   → 상세 조회
// PATCH → 수정 (수당/공제 조정 → 자동 재계산)
// POST  → 상태 변경 (confirm / pay)
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

    // Query profile for role and employee_name
    const profileData = await prisma.$queryRaw<any[]>`
      SELECT id, role, employee_name FROM profiles WHERE id = ${userId} LIMIT 1
    `
    const profile = profileData?.[0]
    if (!profile || !['admin', 'master'].includes(profile.role)) return null
    return { id: userId, role: profile.role, employee_name: profile.employee_name }
  } catch (e) {
    return null
  }
}

// GET: 급여명세서 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await params

  try {
    // Fetch payslip with employee info
    const payslipData = await prisma.$queryRaw<any[]>`
      SELECT p.*, pr.id as employee_id, pr.employee_name, pr.email, pr.phone
      FROM payslips p
      LEFT JOIN profiles pr ON p.employee_id = pr.id
      WHERE p.id = ${id}
      LIMIT 1
    `

    if (!payslipData || payslipData.length === 0) {
      return NextResponse.json({ error: '급여명세서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const payslip = payslipData[0]

    // Fetch salary info
    const salaryInfoData = await prisma.$queryRaw<any[]>`
      SELECT bank_name, account_number, account_holder, payment_day
      FROM employee_salaries
      WHERE employee_id = ${payslip.employee_id}
      LIMIT 1
    `

    const salaryInfo = salaryInfoData?.[0] || null

    return NextResponse.json({ data: { ...payslip, salary_info: salaryInfo } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
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

  try {
    // Fetch existing payslip
    const existingData = await prisma.$queryRaw<any[]>`
      SELECT * FROM payslips WHERE id = ${id} LIMIT 1
    `

    if (!existingData || existingData.length === 0) {
      return NextResponse.json({ error: '급여명세서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const existing = existingData[0]
    if (existing.status === 'paid') {
      return NextResponse.json({ error: '지급 완료된 명세서는 수정할 수 없습니다.' }, { status: 400 })
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

    const now = new Date().toISOString()
    const allowanceDetailsJson = JSON.stringify(allowanceDetails)
    const expenseClaimsJson = JSON.stringify(expenseClaims)
    const expenseDeductionsJson = JSON.stringify(expenseDeductions)

    await prisma.$executeRaw`
      UPDATE payslips SET
        base_salary = ${calc.baseSalary},
        total_allowances = ${calc.totalAllowances},
        allowance_details = ${allowanceDetailsJson},
        gross_salary = ${calc.grossSalary},
        national_pension = ${calc.nationalPension},
        health_insurance = ${calc.healthInsurance},
        long_care_insurance = ${calc.longCareInsurance},
        employment_insurance = ${calc.employmentInsurance},
        income_tax = ${calc.incomeTax},
        local_income_tax = ${calc.localIncomeTax},
        tax_type = ${taxType},
        total_deductions = ${calc.totalDeductions},
        expense_claims = ${expenseClaimsJson},
        expense_deductions = ${expenseDeductionsJson},
        net_salary = ${calc.netSalary},
        memo = ${memo},
        status = 'draft',
        updated_at = ${now}
      WHERE id = ${id}
    `

    const updatedData = await prisma.$queryRaw<any[]>`
      SELECT * FROM payslips WHERE id = ${id} LIMIT 1
    `

    return NextResponse.json({ data: updatedData?.[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
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

  try {
    // Fetch payslip
    const payslipData = await prisma.$queryRaw<any[]>`
      SELECT * FROM payslips WHERE id = ${id} LIMIT 1
    `

    if (!payslipData || payslipData.length === 0) {
      return NextResponse.json({ error: '급여명세서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const payslip = payslipData[0]

    if (action === 'confirm') {
      if (payslip.status !== 'draft') {
        return NextResponse.json({ error: 'draft 상태만 확정할 수 있습니다.' }, { status: 400 })
      }
      const now = new Date().toISOString()
      await prisma.$executeRaw`
        UPDATE payslips SET status = 'confirmed', updated_at = ${now} WHERE id = ${id}
      `
      return NextResponse.json({ success: true, status: 'confirmed' })
    }

    if (action === 'pay') {
      if (payslip.status !== 'confirmed') {
        return NextResponse.json({ error: 'confirmed 상태만 지급 처리할 수 있습니다.' }, { status: 400 })
      }

      const paidDate = new Date().toISOString().split('T')[0]
      const now = new Date().toISOString()

      // Update payslip status
      await prisma.$executeRaw`
        UPDATE payslips SET status = 'paid', paid_date = ${paidDate}, updated_at = ${now}
        WHERE id = ${id}
      `

      // Fetch employee name
      const empData = await prisma.$queryRaw<any[]>`
        SELECT employee_name FROM profiles WHERE id = ${payslip.employee_id} LIMIT 1
      `
      const empName = empData?.[0]?.employee_name || '직원'

      // Insert transaction records
      const netSalary = Math.abs(Number(payslip.net_salary) || 0)
      const nationalPension = Math.abs(Number(payslip.national_pension || 0))
      const healthIns = Math.abs(Number(payslip.health_insurance || 0))
      const longCareIns = Math.abs(Number(payslip.long_care_insurance || 0))
      const employmentIns = Math.abs(Number(payslip.employment_insurance || 0))
      const incomeTax = Math.abs(Number(payslip.income_tax || 0))
      const localTax = Math.abs(Number(payslip.local_income_tax || 0))

      // 1. Net salary payment
      await prisma.$executeRaw`
        INSERT INTO transactions (
          id, transaction_date, type, client_name, description, amount, payment_method,
          category, related_type, related_id, classification_source, confidence, status, created_at
        ) VALUES (
          UUID(), ${paidDate}, 'expense', ${empName},
          ${`${payslip.pay_period} 급여 지급 (실수령)`},
          ${-netSalary}, '통장',
          ${payslip.tax_type === '사업소득3.3%' ? '용역비(3.3%)' : '급여(정규직)'},
          'salary', ${payslip.employee_id}, 'auto_sync', 100, 'completed', ${now}
        )
      `

      // 2. Company insurance (if 근로소득)
      if (payslip.tax_type === '근로소득') {
        const companyInsurance = nationalPension + healthIns + longCareIns + employmentIns
        if (companyInsurance > 0) {
          await prisma.$executeRaw`
            INSERT INTO transactions (
              id, transaction_date, type, client_name, description, amount, payment_method,
              category, related_type, related_id, classification_source, confidence, status, created_at
            ) VALUES (
              UUID(), ${paidDate}, 'expense', '4대보험(회사부담)',
              ${`${payslip.pay_period} ${empName} 4대보험 회사분`},
              ${-companyInsurance}, '통장',
              '4대보험(회사부담)',
              'salary', ${payslip.employee_id}, 'auto_sync', 100, 'completed', ${now}
            )
          `
        }
      }

      // 3. Tax payment
      const totalTax = incomeTax + localTax
      if (totalTax > 0) {
        await prisma.$executeRaw`
          INSERT INTO transactions (
            id, transaction_date, type, client_name, description, amount, payment_method,
            category, related_type, related_id, classification_source, confidence, status, created_at
          ) VALUES (
            UUID(), ${paidDate}, 'expense', '원천세(급여)',
            ${`${payslip.pay_period} ${empName} 원천세`},
            ${-totalTax}, '통장',
            '세금/공과금',
            'salary', ${payslip.employee_id}, 'auto_sync', 100, 'completed', ${now}
          )
        `
      }

      return NextResponse.json({ success: true, status: 'paid', paid_date: paidDate })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
