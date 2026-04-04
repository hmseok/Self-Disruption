import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

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
    const year = searchParams.get('year')

    let query = `SELECT * FROM tax_filing_records`
    if (year) {
      query += ` WHERE year = ${year}`
    }
    query += ` ORDER BY year DESC LIMIT 500`

    const data = await prisma.$queryRaw<any[]>(query as any)
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { year, filing_date, filing_type, status, total_income, total_deduction, tax_amount, memo } = body

    await prisma.$queryRaw`
      INSERT INTO tax_filing_records (id, year, filing_date, filing_type, status, total_income, total_deduction, tax_amount, memo, created_at, updated_at)
      VALUES (UUID(), ${year}, ${filing_date}, ${filing_type}, ${status || 'draft'}, ${total_income}, ${total_deduction}, ${tax_amount}, ${memo}, NOW(), NOW())
    `

    return NextResponse.json({ data: { id: 'success' }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
