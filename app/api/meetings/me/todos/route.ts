import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/me/todos — 개인 TODO (PR-MTG-V2-Todo-A)
//
// GET    ?status=open|done|dropped|all → { data: [], stats: {} }
// POST   { content, due_date?, category?, priority?, memo? } → 생성
// PATCH  { id, ...patch } → 수정 (status='done' 시 done_at 자동)
// DELETE ?id= → 삭제
//
// 본인 (user_id = current) 것만. 회의 무관 독립 TODO.
// Rule 23 graceful: personal_todos 테이블 미적용 시 _migration_pending
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function isMigrationMissing(msg: string): boolean {
  return msg.includes('personal_todos') && (msg.includes("doesn't exist") || msg.includes('1146'))
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const status = (searchParams.get('status') || 'all').toLowerCase()

    try {
      const conditions = ['user_id = ?']
      const params: any[] = [user.id]
      if (status === 'open' || status === 'done' || status === 'dropped') {
        conditions.push('status = ?')
        params.push(status)
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, content, due_date, status, category, priority, memo, done_at, created_at
           FROM personal_todos
          WHERE ${conditions.join(' AND ')}
          ORDER BY
            CASE WHEN status = 'open' THEN 0 WHEN status = 'done' THEN 1 ELSE 2 END ASC,
            CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
            due_date ASC,
            created_at DESC`,
        ...params
      )
      const statsRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_cnt,
           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_cnt,
           SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END) AS dropped_cnt
         FROM personal_todos WHERE user_id = ?`,
        user.id
      )
      return NextResponse.json({
        data: serialize(rows),
        stats: serialize(statsRows[0] || {}),
        error: null,
      })
    } catch (e: any) {
      if (isMigrationMissing(String(e?.message || ''))) {
        return NextResponse.json({ data: [], stats: {}, error: null, _migration_pending: true })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[GET /api/meetings/me/todos]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const content = (body?.content || '').trim()
    if (!content) return NextResponse.json({ error: '내용 필수' }, { status: 400 })

    try {
      const id = randomUUID()
      await prisma.$executeRawUnsafe(
        `INSERT INTO personal_todos (id, user_id, content, due_date, status, category, priority, memo, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'open', ?, ?, ?, NOW(), NOW())`,
        id, user.id, content,
        body?.due_date || null,
        body?.category || null,
        body?.priority || null,
        body?.memo || null
      )
      return NextResponse.json({ ok: true, id })
    } catch (e: any) {
      if (isMigrationMissing(String(e?.message || ''))) {
        return NextResponse.json({
          error: 'migration_pending',
          message: 'DB 마이그 미적용 — migrations/2026-05-16_personal_todos.sql 적용 요청',
          _migration_pending: true,
        }, { status: 503 })
      }
      throw e
    }
  } catch (e: any) {
    console.error('[POST /api/meetings/me/todos]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH ───────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = body?.id
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    // 본인 것만 — 소유 확인
    const own = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 1 FROM personal_todos WHERE id = ? AND user_id = ? LIMIT 1`,
      id, user.id
    )
    if (!own[0]) return NextResponse.json({ error: '권한 없음 또는 없음' }, { status: 404 })

    const ALLOWED = new Set(['content', 'due_date', 'status', 'category', 'priority', 'memo'])
    const entries = Object.entries(body).filter(([k]) => ALLOWED.has(k))
    if (entries.length === 0) return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })

    const setParts: string[] = []
    const params: any[] = []
    for (const [k, v] of entries) {
      setParts.push(`\`${k}\` = ?`)
      params.push(v === '' ? null : v)
    }
    // status='done' 시 done_at 자동
    if (body.status === 'done') setParts.push('done_at = NOW()')
    else if (body.status === 'open' || body.status === 'dropped') setParts.push('done_at = NULL')
    setParts.push('updated_at = NOW()')

    await prisma.$executeRawUnsafe(
      `UPDATE personal_todos SET ${setParts.join(', ')} WHERE id = ? AND user_id = ?`,
      ...params, id, user.id
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[PATCH /api/meetings/me/todos]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── DELETE ──────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    await prisma.$executeRawUnsafe(
      `DELETE FROM personal_todos WHERE id = ? AND user_id = ?`,
      id, user.id
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[DELETE /api/meetings/me/todos]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
