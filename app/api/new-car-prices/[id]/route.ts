import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T | null {
  if (data === undefined || data === null) return null as any
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

const ALLOWED_COLS = ['brand', 'model', 'year', 'source', 'price_data'] as const
const JSON_COLS = new Set(['price_data'])
const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const data = await prisma.$queryRaw<any[]>`SELECT * FROM new_car_prices WHERE id = ${id} LIMIT 1`

    return NextResponse.json({ data: serialize(data[0]) ?? null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    if (!id || id === 'undefined' || id === 'null') {
      return NextResponse.json({ error: '유효하지 않은 id' }, { status: 400 })
    }

    const body = await request.json()

    // 화이트리스트 + 컬럼명 정규식 검증 (object 컬럼은 JSON.stringify 처리)
    const entries = Object.entries(body).filter(
      ([k, v]) => SAFE_COL.test(k) && (ALLOWED_COLS as readonly string[]).includes(k) && v !== undefined
    )

    if (entries.length === 0) {
      const rows = await prisma.$queryRaw<any[]>`SELECT * FROM new_car_prices WHERE id = ${id} LIMIT 1`
      return NextResponse.json({ data: serialize(rows[0]) ?? null, error: null })
    }

    const setClause = entries.map(([k]) => `\`${k}\` = ?`).join(', ')
    const values = entries.map(([k, v]) => {
      if (v === null) return null
      if (JSON_COLS.has(k) || typeof v === 'object') return JSON.stringify(v)
      return v
    })
    values.push(id)

    await prisma.$executeRawUnsafe(
      `UPDATE new_car_prices SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM new_car_prices WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]) ?? null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    await prisma.$executeRaw`DELETE FROM new_car_prices WHERE id = ${id}`

    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
