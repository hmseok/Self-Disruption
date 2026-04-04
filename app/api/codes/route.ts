import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/codes — 공통 코드 조회 (common_codes)
// ?type=xxx&category=yyy
export async function GET(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || ''
    const category = searchParams.get('category') || ''

    let data = await prisma.$queryRaw<any[]>`
      SELECT * FROM common_codes
      WHERE 1=1
      ${type ? Prisma.raw(`AND group_code = '${type}'`) : Prisma.empty}
      ${category ? Prisma.raw(`AND code = '${category}'`) : Prisma.empty}
      ORDER BY group_code, sort_order, code
    `

    return NextResponse.json({
      data: serialize(data),
      error: null
    })
  } catch (error: any) {
    console.error('GET /api/codes:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/codes — 공통 코드 추가
export async function POST(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await req.json()

    const result = await prisma.$queryRaw<any[]>`
      INSERT INTO common_codes (group_code, code, name, sort_order, is_active)
      VALUES (${body.group_code}, ${body.code}, ${body.name}, ${body.sort_order || 0}, ${body.is_active !== false})
    `

    const inserted = await prisma.$queryRaw<any[]>`
      SELECT * FROM common_codes WHERE group_code = ${body.group_code} AND code = ${body.code} LIMIT 1
    `

    return NextResponse.json({
      data: serialize(inserted[0] || null),
      error: null
    })
  } catch (error: any) {
    console.error('POST /api/codes:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
