import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * POST /api/long-term-quotes/[id]/send
 *   견적 발송 액션:
 *     - status='sent', sent_at=NOW
 *     - share_token 발급 (없을 때만 — 재발송 시 토큰 유지)
 *
 * PR-Q1 (2026-05-26)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

function genToken(): string {
  // 32바이트 random → base64url (44자) → 정렬 안전한 64자 이내 토큰
  return crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]!))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, share_token, status FROM long_term_quotes WHERE id = ${id} LIMIT 1`
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const current = rows[0]
    const token = (current.share_token as string) || genToken()

    await prisma.$executeRaw`
      UPDATE long_term_quotes
         SET status = 'sent',
             sent_at = COALESCE(sent_at, NOW()),
             share_token = ${token},
             updated_at = NOW()
       WHERE id = ${id}`

    const after = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM long_term_quotes WHERE id = ${id} LIMIT 1`
    return NextResponse.json({
      data: serialize(after[0] || null),
      share_token: token,
      error: null,
    })
  } catch (e: unknown) {
    console.error('[long-term-quotes SEND]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
