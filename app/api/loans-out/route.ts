import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * 회사 → 외부 대여 계약 (company lending out)
 * 투자(general_investments)와 반대 방향 — 원금 지급 OUT, 이자 수입 IN
 *
 * GET    /api/loans-out?status=active
 * POST   /api/loans-out
 */

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')

    const where: string[] = []
    const args: any[] = []
    if (status) {
      where.push('status = ?')
      args.push(status)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sql = `SELECT * FROM company_loans_out ${whereSql} ORDER BY contract_start_date DESC, created_at DESC LIMIT 1000`
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...args)
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    console.error('[GET /api/loans-out]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = randomUUID()
    const principal = Number(body.principal_amount || 0)
    const balance = body.current_balance != null ? Number(body.current_balance) : principal

    await prisma.$executeRaw`
      INSERT INTO company_loans_out (
        id, borrower_name, borrower_phone, borrower_email, borrower_reg_number, borrower_address,
        principal_amount, current_balance, interest_rate, tax_type,
        repayment_type, payment_day, grace_period_months,
        contract_start_date, contract_end_date, purpose, collateral, status, memo,
        created_at, updated_at
      ) VALUES (
        ${id}, ${body.borrower_name}, ${body.borrower_phone || null}, ${body.borrower_email || null},
        ${body.borrower_reg_number || null}, ${body.borrower_address || null},
        ${principal}, ${balance}, ${Number(body.interest_rate || 0)}, ${body.tax_type || '이자소득(27.5%)'},
        ${body.repayment_type || 'interest_only'}, ${Number(body.payment_day || 25)}, ${Number(body.grace_period_months || 0)},
        ${body.contract_start_date || null}, ${body.contract_end_date || null},
        ${body.purpose || null}, ${body.collateral || null}, ${body.status || 'active'}, ${body.memo || null},
        NOW(), NOW()
      )
    `

    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM company_loans_out WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(rows[0]), error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/loans-out]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
