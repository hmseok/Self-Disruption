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

    const data = await prisma.$queryRaw<any[]>`SELECT * FROM companies WHERE id = ${id} LIMIT 1`

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

    // 화이트리스트 — companies 테이블에 허용된 컬럼만
    const ALLOWED_COLS = new Set([
      'name', 'business_number', 'representative', 'address', 'phone',
      'email', 'website', 'industry', 'logo_url', 'fax', 'bank_name',
      'bank_account', 'bank_holder', 'stamp_url', 'memo', 'status',
    ])
    const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/

    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_COLS.has(key) || !SAFE_COL.test(key)) continue
      updates.push(`\`${key}\` = ?`)
      values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value)
    }

    values.push(id)

    if (updates.length === 0) {
      const data = await prisma.$queryRaw<any[]>`SELECT * FROM companies WHERE id = ${id} LIMIT 1`
      return NextResponse.json({ data: serialize(data[0]), error: null })
    }

    await prisma.$executeRawUnsafe(
      `UPDATE companies SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM companies WHERE id = ${id} LIMIT 1`
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

    await prisma.$executeRaw`DELETE FROM companies WHERE id = ${id}`

    return NextResponse.json({ data: null, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
