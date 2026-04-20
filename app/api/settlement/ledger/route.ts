import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/settlement/ledger?month=YYYY-MM&status=pending|matched|paid|all&type=jiip|invest|all
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // 단일 월
    const monthFrom = searchParams.get('from') // 범위 시작
    const monthTo = searchParams.get('to') // 범위 끝
    const status = searchParams.get('status') // pending|matched|paid
    const type = searchParams.get('type') // jiip|invest|loan

    const where: string[] = []
    const values: any[] = []
    if (month) { where.push('settlement_month = ?'); values.push(month) }
    if (monthFrom) { where.push('settlement_month >= ?'); values.push(monthFrom) }
    if (monthTo) { where.push('settlement_month <= ?'); values.push(monthTo) }
    if (status && status !== 'all') { where.push('status = ?'); values.push(status) }
    if (type && type !== 'all') { where.push('contract_type = ?'); values.push(type) }

    const sql = `
      SELECT * FROM settlement_ledger
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY settlement_month DESC, contract_type, recipient_name
       LIMIT 2000
    `
    const data = await prisma.$queryRawUnsafe<any[]>(sql, ...values)
    return NextResponse.json({ data: serialize(data || []), error: null })
  } catch (e: any) {
    console.error('[GET /api/settlement/ledger]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
