import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/[id]/editors — 공동 편집자/조회자 (PR-MTG-V2-Visibility)
//
// GET   → [{ id, profile_id, role, added_by, added_at, name, department }]
// POST  { profile_id, role? } → add (UNIQUE 충돌 시 ON DUPLICATE UPDATE role)
// DELETE ?profile_id=  → 제거
//
// 권한: organizer / created_by / admin / master 만 편집자 관리 가능
// graceful (Rule 23): meeting_editors 테이블 미적용 시 _migration_pending: true
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function isMigrationMissing(msg: string): boolean {
  return msg.includes('meeting_editors') && (msg.includes("doesn't exist") || msg.includes('1146'))
}

async function checkOwnerOrAdmin(meetingId: string, user: any): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'master') return true
  const m = await prisma.$queryRawUnsafe<any[]>(
    `SELECT organizer_id, created_by FROM meetings WHERE id = ? LIMIT 1`,
    meetingId
  )
  if (!m[0]) return false
  return m[0].organizer_id === user.id || m[0].created_by === user.id
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT me.id, me.profile_id, me.role, me.added_by, me.added_at,
                p.name, p.department
           FROM meeting_editors me
           LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = me.profile_id COLLATE utf8mb4_unicode_ci
          WHERE me.meeting_id = ?
          ORDER BY me.added_at ASC`,
        id
      )
      return NextResponse.json({ data: serialize(rows), error: null })
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (isMigrationMissing(msg)) {
        return NextResponse.json({ data: [], error: null, _migration_pending: true })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[GET /api/meetings/[id]/editors]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const ok = await checkOwnerOrAdmin(id, user)
    if (!ok) return NextResponse.json({ error: '편집자 관리 권한 없음 — organizer/admin만' }, { status: 403 })

    const body = await request.json()
    const profileId = body?.profile_id
    const role = body?.role === 'viewer' ? 'viewer' : 'editor'
    if (!profileId) return NextResponse.json({ error: 'profile_id 필수' }, { status: 400 })

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO meeting_editors (id, meeting_id, profile_id, role, added_by, added_at)
              VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        randomUUID(), id, profileId, role, user.id
      )
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (isMigrationMissing(msg)) {
        return NextResponse.json({
          error: 'migration_pending',
          message: 'DB 마이그 미적용 — migrations/2026-05-16_meetings_visibility.sql 적용 요청',
          _migration_pending: true,
        }, { status: 503 })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[POST /api/meetings/[id]/editors]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── DELETE ──────────────────────────────────────────────────────
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const ok = await checkOwnerOrAdmin(id, user)
    if (!ok) return NextResponse.json({ error: '편집자 관리 권한 없음 — organizer/admin만' }, { status: 403 })

    const { searchParams } = request.nextUrl
    const profileId = searchParams.get('profile_id')
    if (!profileId) return NextResponse.json({ error: 'profile_id 필수' }, { status: 400 })

    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM meeting_editors WHERE meeting_id = ? AND profile_id = ?`,
        id, profileId
      )
      return NextResponse.json({ ok: true })
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (isMigrationMissing(msg)) {
        return NextResponse.json({ ok: true, _migration_pending: true })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[DELETE /api/meetings/[id]/editors]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
