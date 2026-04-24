import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// DB 타임아웃 래퍼: DB 오류 또는 타임아웃 시 null 반환
const withTimeout = <T>(promise: Promise<T>, ms = 5000): Promise<T | null> =>
  Promise.race([
    promise.catch(() => null),
    new Promise<null>(r => setTimeout(() => r(null), ms))
  ])

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
      query += ' WHERE company_id = ?'
      params.push(companyId)
    }

    query += ' ORDER BY created_at DESC'

    const data = await withTimeout(prisma.$queryRawUnsafe<any[]>(query, ...params))

    if (data === null) {
      console.warn('[departments GET] DB 조회 실패 또는 타임아웃 — 빈 배열 반환')
      return NextResponse.json({ data: [], error: null })
    }

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[departments GET] 예외:', e.message)
    return NextResponse.json({ data: [], error: null })
  }
}

// POST /api/departments
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()
    const name = body.name || ''

    await prisma.$executeRaw`
      INSERT INTO departments (id, name, created_at, updated_at)
      VALUES (${id}, ${name}, NOW(), NOW())
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM departments WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
