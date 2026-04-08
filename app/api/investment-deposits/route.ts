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
    const investmentId = searchParams.get('investment_id')

    // CLAUDE.md: $queryRaw는 태그 함수 → 태그 템플릿 또는 $queryRawUnsafe 사용
    let data: any[]
    if (investmentId) {
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM investment_deposits
        WHERE investment_id = ${investmentId}
        ORDER BY deposit_date DESC
        LIMIT 500
      `
    } else {
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM investment_deposits
        ORDER BY deposit_date DESC
        LIMIT 500
      `
    }
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
    const { investment_id, deposit_date, amount, description, status } = body

    await prisma.$executeRaw`
      INSERT INTO investment_deposits (id, investment_id, deposit_date, amount, description, status, created_at, updated_at)
      VALUES (UUID(), ${investment_id}, ${deposit_date}, ${amount}, ${description}, ${status || 'pending'}, NOW(), NOW())
    `

    return NextResponse.json({ data: { id: 'success' }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
