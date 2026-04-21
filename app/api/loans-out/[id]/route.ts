import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM company_loans_out WHERE id=${id} LIMIT 1`
    if (!rows[0]) return NextResponse.json({ error: '계약을 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ data: serialize(rows[0]), error: null })
  } catch (e: any) {
    console.error('[GET /api/loans-out/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const allowedKeys = [
      'borrower_name', 'borrower_phone', 'borrower_email', 'borrower_reg_number', 'borrower_address',
      'principal_amount', 'current_balance', 'interest_rate', 'tax_type',
      'repayment_type', 'payment_day', 'grace_period_months',
      'contract_start_date', 'contract_end_date', 'purpose', 'collateral', 'status', 'memo',
    ]
    const setParts: string[] = []
    const args: any[] = []
    for (const k of allowedKeys) {
      if (body[k] !== undefined) {
        // 화이트리스트 통과 필드만 컬럼명에 포함 — 백틱 이스케이프
        setParts.push(`\`${k}\` = ?`)
        args.push(['principal_amount', 'current_balance', 'interest_rate', 'payment_day', 'grace_period_months'].includes(k)
          ? Number(body[k]) : body[k])
      }
    }
    if (setParts.length === 0) return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 })
    setParts.push('`updated_at` = NOW()')
    args.push(id)

    const sql = `UPDATE company_loans_out SET ${setParts.join(', ')} WHERE id = ?`
    await prisma.$executeRawUnsafe(sql, ...args)

    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM company_loans_out WHERE id=${id} LIMIT 1`
    return NextResponse.json({ data: rows[0] ? serialize(rows[0]) : { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/loans-out/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    await prisma.$executeRaw`DELETE FROM company_loans_out WHERE id=${id}`
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/loans-out/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
