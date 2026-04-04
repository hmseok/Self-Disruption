import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/contract_terms
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const category = searchParams.get('contract_category')

    let query = 'SELECT * FROM contract_terms'
    const params: any[] = []

    if (category) {
      query += ' WHERE contract_category = ?'
      params.push(category)
    }

    query += ' ORDER BY created_at DESC'

    const data = await prisma.$queryRawUnsafe<any[]>(query, ...params)
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/contract_terms
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO contract_terms (
        id, version, title, description, status, contract_category,
        created_by, created_at, updated_at
      ) VALUES (
        ${id}, ${body.version}, ${body.title}, ${body.description || null},
        ${body.status || 'draft'}, ${body.contract_category || 'long_term_rental'},
        ${user.id}, NOW(), NOW()
      )
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM contract_terms WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
