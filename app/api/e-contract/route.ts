import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET: list contracts
// 단독 회사 ERP — company_id 컬럼 제거됨
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let query = `SELECT * FROM short_term_rental_contracts`
  const conditions: string[] = []
  if (status && status !== 'all') conditions.push(`status = '${status}'`)
  if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`
  query += ` ORDER BY created_at DESC`

  try {
    const data = await prisma.$queryRaw<any[]>`${query}`
    return NextResponse.json({ items: serialize(data) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: create new contract
export async function POST(req: NextRequest) {
  const body = await req.json()

  try {
    const result = await prisma.$executeRaw`
      INSERT INTO short_term_rental_contracts (${Object.keys(body).join(',')}) VALUES (${Object.values(body).join(',')})
    `
    return NextResponse.json(serialize(result))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
