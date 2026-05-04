// ═══════════════════════════════════════════════════════════════════
// POST   /api/ride-employees/[id]/token  — 토큰 발급/재발급
// DELETE /api/ride-employees/[id]/token  — 토큰 폐기 (revoke)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params

    // 존재 확인
    const exists = await prisma.$queryRaw<any[]>`
      SELECT id FROM ride_employees WHERE id = ${id} LIMIT 1
    `
    if (exists.length === 0) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 새 토큰 생성 — 32자 hex
    const token = crypto.randomBytes(16).toString('hex')

    await prisma.$executeRaw`
      UPDATE ride_employees
      SET public_token = ${token},
          public_token_issued_at = NOW(),
          updated_at = NOW()
      WHERE id = ${id}
    `

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, public_token, public_token_issued_at
      FROM ride_employees WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    await prisma.$executeRaw`
      UPDATE ride_employees
      SET public_token = NULL,
          public_token_issued_at = NULL,
          updated_at = NOW()
      WHERE id = ${id}
    `
    return NextResponse.json({ data: { id, revoked: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
