import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/positions
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id')

    let query = 'SELECT * FROM positions'
    const params: any[] = []

    if (companyId) {
      query += ' WHERE company_id = ?'
      params.push(companyId)
    }

    query += ' ORDER BY created_at DESC'

    let data: any[] = []
    try {
      data = await prisma.$queryRawUnsafe<any[]>(query, ...params)
    } catch (dbErr: any) {
      // positions 테이블 미존재 시 빈 배열 반환
      if (dbErr.message?.includes("doesn't exist")) {
        return NextResponse.json({ data: [], error: null })
      }
      throw dbErr
    }
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/positions
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO positions (id, created_at, updated_at) VALUES (${id}, NOW(), NOW())
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM positions WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
