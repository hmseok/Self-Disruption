import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.replace('Bearer ', '')
    const userId = getUserIdFromToken(token)
    if (!userId) return null
    const profiles = await prisma.$queryRaw<any[]>`SELECT id, role, company_id FROM profiles WHERE id = ${userId} LIMIT 1`
    const profile = profiles[0]
    return profile ? { id: userId, ...profile } : null
  } catch { return null }
}

// GET /api/departments
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id')

    let query = 'SELECT * FROM departments'
    const params: any[] = []

    if (companyId) {
      query += ' WHERE company_id = $1'
      params.push(companyId)
    }

    query += ' ORDER BY created_at DESC'

    const data = await prisma.$queryRawUnsafe<any[]>(query, ...params)
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/departments
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    // TODO: Adjust INSERT statement based on table schema
    const result = await prisma.$queryRaw<any[]>`
      INSERT INTO departments (id, created_at, updated_at) VALUES (${id}, NOW(), NOW())
      RETURNING *
    `

    return NextResponse.json({ data: serialize(result[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
