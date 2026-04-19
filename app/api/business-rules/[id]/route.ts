import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const data = await prisma.$queryRaw<any[]>`SELECT * FROM business_rules WHERE id = ${id} LIMIT 1`

    return NextResponse.json({ data: data[0] || null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const body = await request.json()
    const updates: string[] = []
    const values: any[] = []
    const ALLOWED = new Set(['key', 'value', 'description', 'rule_name', 'rule_value'])

    // NOTE: `key`/`value`는 MySQL 예약어/JSON → backtick + CAST 필요
    for (const [rawKey, rawValue] of Object.entries(body)) {
      if (!ALLOWED.has(rawKey)) continue
      const col = rawKey === 'rule_name' ? 'key' : (rawKey === 'rule_value' ? 'value' : rawKey)
      if (col === 'value') {
        // JSON 컬럼 — JSON 텍스트로 바인딩 후 CAST
        let jsonVal: string
        if (rawValue === null || rawValue === undefined) jsonVal = 'null'
        else if (typeof rawValue === 'string') {
          try { JSON.parse(rawValue); jsonVal = rawValue } catch { jsonVal = JSON.stringify(rawValue) }
        } else jsonVal = JSON.stringify(rawValue)
        updates.push('`value` = CAST(? AS JSON)')
        values.push(jsonVal)
      } else {
        updates.push('`' + col + '` = ?')
        values.push(rawValue)
      }
    }

    values.push(id)

    if (updates.length === 0) {
      const data = await prisma.$queryRaw<any[]>`SELECT * FROM business_rules WHERE id = ${id} LIMIT 1`
      return NextResponse.json({ data: serialize(data[0]), error: null })
    }

    await prisma.$executeRawUnsafe(
      `UPDATE business_rules SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM business_rules WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    await prisma.$executeRaw`DELETE FROM business_rules WHERE id = ${id}`

    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
