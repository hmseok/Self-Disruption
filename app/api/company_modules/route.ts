import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/company_modules — 회사 모듈 목록 (단독 ERP)
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    try {
      const data = await prisma.$queryRawUnsafe<any[]>(
        'SELECT * FROM company_modules ORDER BY created_at DESC'
      )
      return NextResponse.json({ data: serialize(data), error: null })
    } catch (e: any) {
      // 테이블 미존재 시 빈 배열 반환
      if (e.message?.includes("doesn't exist")) {
        return NextResponse.json({ data: [], error: null })
      }
      throw e
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/company_modules
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO company_modules (id, created_at, updated_at) VALUES (${id}, NOW(), NOW())
    `

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM company_modules WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
