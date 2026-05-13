import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/[id]/body — TipTap JSON 본문 (PR-MTG-V2-A, 2026-05-13)
//
// GET    /api/meetings/[id]/body — { body, body_version, body_updated_at, body_updated_by }
// PATCH  /api/meetings/[id]/body — { body, body_version } 낙관적 락
//
// Rule 23 graceful fallback — 마이그 미적용 시 body=null 빈 응답 + _migration_pending=true
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, body, body_version, body_updated_at, body_updated_by
           FROM meetings
          WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        id
      )
      if (!rows[0]) return NextResponse.json({ error: '회의 없음' }, { status: 404 })
      const m = rows[0]
      // body 는 MySQL JSON 컬럼 — Prisma 가 이미 객체로 변환해서 줌. 문자열로 오면 parse.
      let body = m.body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch {}
      }
      return NextResponse.json({
        data: serialize({
          id: m.id,
          body: body ?? null,
          body_version: Number(m.body_version || 1),
          body_updated_at: m.body_updated_at,
          body_updated_by: m.body_updated_by,
        }),
        error: null,
      })
    } catch (e: any) {
      // Rule 23 graceful fallback — 마이그 미적용 시 (ER_BAD_FIELD_ERROR: 1054)
      const msg = String(e?.message || '')
      if (msg.includes('Unknown column') || msg.includes('1054')) {
        console.warn('[GET /api/meetings/[id]/body] 마이그 미적용:', msg)
        return NextResponse.json({
          data: { id, body: null, body_version: 1, body_updated_at: null, body_updated_by: null },
          error: null,
          _migration_pending: true,
        })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[GET /api/meetings/[id]/body]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH ───────────────────────────────────────────────────────
// 낙관적 락: WHERE body_version = ? 일치 시만 update
// 안 맞으면 409 Conflict + 현재 server 값 반환 (클라가 reconcile)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const body = await request.json()
    const newBody = body?.body
    const expectedVersion = Number(body?.body_version || 0)
    if (newBody === undefined) {
      return NextResponse.json({ error: 'body 필수' }, { status: 400 })
    }
    if (!expectedVersion) {
      return NextResponse.json({ error: 'body_version 필수' }, { status: 400 })
    }

    // 권한 — 본인 작성 / organizer / admin / master / page can_edit
    try {
      const existing = await prisma.$queryRawUnsafe<any[]>(
        `SELECT organizer_id, created_by FROM meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        id
      )
      if (!existing[0]) return NextResponse.json({ error: '회의 없음' }, { status: 404 })

      const editPerm = await prisma.$queryRaw<any[]>`
        SELECT can_edit FROM user_page_permissions
         WHERE user_id = ${user.id} AND page_path = '/meetings' LIMIT 1
      `
      const hasEditPagePerm = !!(editPerm[0]?.can_edit)
      const canEdit = user.role === 'admin'
                   || user.role === 'master'
                   || hasEditPagePerm
                   || existing[0].organizer_id === user.id
                   || existing[0].created_by === user.id
      if (!canEdit) return NextResponse.json({ error: '편집 권한 없음' }, { status: 403 })

      // 낙관적 락 UPDATE
      const bodyJson = JSON.stringify(newBody)
      const result: any = await prisma.$executeRawUnsafe(
        `UPDATE meetings
            SET body = ?,
                body_version = body_version + 1,
                body_updated_at = NOW(),
                body_updated_by = ?,
                updated_at = NOW()
          WHERE id = ?
            AND body_version = ?
            AND deleted_at IS NULL`,
        bodyJson, user.id, id, expectedVersion
      )

      // result는 affected rows (Prisma $executeRawUnsafe 반환)
      const affected = Number(result || 0)
      if (affected === 0) {
        // 버전 불일치 — 현재 server 상태 반환 (409 Conflict)
        const current = await prisma.$queryRawUnsafe<any[]>(
          `SELECT body, body_version, body_updated_at, body_updated_by FROM meetings WHERE id = ? LIMIT 1`,
          id
        )
        let curBody = current[0]?.body
        if (typeof curBody === 'string') {
          try { curBody = JSON.parse(curBody) } catch {}
        }
        return NextResponse.json({
          error: 'version_conflict',
          message: '다른 세션에서 본문이 변경됨 — 새로고침 후 재시도',
          data: serialize({
            body: curBody ?? null,
            body_version: Number(current[0]?.body_version || 1),
            body_updated_at: current[0]?.body_updated_at,
            body_updated_by: current[0]?.body_updated_by,
          }),
        }, { status: 409 })
      }

      // 성공 — 새 version 조회 + 반환
      const after = await prisma.$queryRawUnsafe<any[]>(
        `SELECT body_version, body_updated_at, body_updated_by FROM meetings WHERE id = ? LIMIT 1`,
        id
      )
      return NextResponse.json({
        ok: true,
        data: serialize({
          body_version: Number(after[0]?.body_version || expectedVersion + 1),
          body_updated_at: after[0]?.body_updated_at,
          body_updated_by: after[0]?.body_updated_by,
        }),
      })
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.includes('Unknown column') || msg.includes('1054')) {
        console.warn('[PATCH /api/meetings/[id]/body] 마이그 미적용:', msg)
        return NextResponse.json({
          error: 'migration_pending',
          message: 'DB 마이그 미적용 — 관리자에게 migrations/2026-05-13_meetings_v2.sql 적용 요청',
          _migration_pending: true,
        }, { status: 503 })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[PATCH /api/meetings/[id]/body]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
