import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET: list contracts for a company
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const company_id = searchParams.get('company_id')
  const status = searchParams.get('status')

  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 })

  let query = `SELECT * FROM short_term_rental_contracts WHERE company_id = ${company_id}`
  if (status && status !== 'all') query += ` AND status = '${status}'`
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
