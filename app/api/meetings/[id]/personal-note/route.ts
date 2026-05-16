import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/[id]/personal-note — 개인 메모 (PR-MTG-V2-Note, 2026-05-16)
//
// GET  → { body, body_text, updated_at, created_at } (본인 것만)
// PUT  { body, body_text? } → upsert (본인 것만)
//
// 권한: 모든 인증 사용자 (참석 여부 무관)
// 데이터: meeting_personal_notes (UNIQUE meeting_id + user_id)
//
// Rule 23 graceful fallback — 마이그 미적용 시 _migration_pending: true
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function isMigrationMissing(msg: string): boolean {
  return msg.includes('meeting_personal_notes') && (msg.includes("doesn't exist") || msg.includes('1146') || msg.includes('Unknown column') || msg.includes('1054'))
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT body, body_text, updated_at, created_at
           FROM meeting_personal_notes
          WHERE meeting_id = ? AND user_id = ? LIMIT 1`,
        id, user.id
      )
      if (!rows[0]) {
        return NextResponse.json({
          data: { body: null, body_text: null, updated_at: null, created_at: null },
          error: null,
        })
      }
      let body = rows[0].body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch {}
      }
      return NextResponse.json({
        data: serialize({
          body: body ?? null,
          body_text: rows[0].body_text ?? null,
          updated_at: rows[0].updated_at,
          created_at: rows[0].created_at,
        }),
        error: null,
      })
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (isMigrationMissing(msg)) {
        console.warn('[GET /api/meetings/[id]/personal-note] 마이그 미적용:', msg)
        return NextResponse.json({
          data: { body: null, body_text: null, updated_at: null, created_at: null },
          error: null,
          _migration_pending: true,
        })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[GET /api/meetings/[id]/personal-note]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PUT ─────────────────────────────────────────────────────────
// upsert — INSERT ... ON DUPLICATE KEY UPDATE
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const payload = await request.json()
    const body = payload?.body ?? null
    const bodyText = typeof payload?.body_text === 'string' ? payload.body_text : null

    // 회의 존재 + 미삭제 확인 (관리 부담 X — 잘못된 meeting_id 면 거부)
    try {
      const m = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        id
      )
      if (!m[0]) return NextResponse.json({ error: '회의 없음' }, { status: 404 })
    } catch {
      // meetings 테이블 조회 실패 — 무시 (graceful)
    }

    try {
      const bodyJson = body === null ? null : JSON.stringify(body)
      // INSERT ... ON DUPLICATE KEY UPDATE — id 는 신규 시만 사용
      await prisma.$executeRawUnsafe(
        `INSERT INTO meeting_personal_notes (id, meeting_id, user_id, body, body_text, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
              body = VALUES(body),
              body_text = VALUES(body_text),
              updated_at = NOW()`,
        randomUUID(), id, user.id, bodyJson, bodyText
      )

      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT updated_at FROM meeting_personal_notes WHERE meeting_id = ? AND user_id = ? LIMIT 1`,
        id, user.id
      )
      return NextResponse.json({
        ok: true,
        data: { updated_at: rows[0]?.updated_at || null },
      })
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (isMigrationMissing(msg)) {
        console.warn('[PUT /api/meetings/[id]/personal-note] 마이그 미적용:', msg)
        return NextResponse.json({
          error: 'migration_pending',
          message: 'DB 마이그 미적용 — 관리자에게 migrations/2026-05-16_meeting_personal_notes.sql 적용 요청',
          _migration_pending: true,
        }, { status: 503 })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[PUT /api/meetings/[id]/personal-note]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
