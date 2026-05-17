import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/me/actions — 내 TODO 대시보드 (PR-MTG-V2-Me)
//
// GET ?status=open|done|dropped|all&limit= → {
//   data: [{ id, content, due_date, status, done_at, done_note,
//            meeting_id, meeting_title, meeting_date, meeting_type, organizer_name }],
//   stats: { total, open, done, dropped, overdue, due_this_week }
// }
//
// WHERE assignee_id = user.id (profiles.id 기반)
// 정렬: open 우선 → due_date ASC → created_at DESC
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const status = (searchParams.get('status') || 'all').toLowerCase()
    const limit = Math.min(500, Math.max(10, parseInt(searchParams.get('limit') || '200', 10)))

    const conditions: string[] = [
      'ai.assignee_id = ?',
      'm.deleted_at IS NULL',
    ]
    const params: any[] = [user.id]

    if (status === 'open' || status === 'done' || status === 'dropped') {
      conditions.push('ai.status = ?')
      params.push(status)
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         ai.id, ai.content, ai.due_date, ai.status, ai.done_at, ai.done_note, ai.created_at,
         ai.meeting_id,
         m.title AS meeting_title,
         m.meeting_date,
         m.type AS meeting_type,
         p.name AS organizer_name
       FROM meeting_action_items ai
       INNER JOIN meetings m ON m.id = ai.meeting_id
       LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = m.organizer_id COLLATE utf8mb4_unicode_ci
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE WHEN ai.status = 'open' THEN 0 WHEN ai.status = 'done' THEN 1 ELSE 2 END ASC,
         CASE WHEN ai.due_date IS NULL THEN 1 ELSE 0 END ASC,
         ai.due_date ASC,
         ai.created_at DESC
       LIMIT ?`,
      ...params, limit
    )

    // 통계 — assignee_id = user.id 전체 (status 필터 무시)
    const statsRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN ai.status = 'open' THEN 1 ELSE 0 END) AS open_cnt,
         SUM(CASE WHEN ai.status = 'done' THEN 1 ELSE 0 END) AS done_cnt,
         SUM(CASE WHEN ai.status = 'dropped' THEN 1 ELSE 0 END) AS dropped_cnt,
         SUM(CASE WHEN ai.status = 'open' AND ai.due_date IS NOT NULL AND ai.due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_cnt,
         SUM(CASE WHEN ai.status = 'open' AND ai.due_date IS NOT NULL
                   AND ai.due_date >= CURDATE() AND ai.due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                  THEN 1 ELSE 0 END) AS due_week_cnt
       FROM meeting_action_items ai
       INNER JOIN meetings m ON m.id = ai.meeting_id
       WHERE ai.assignee_id = ? AND m.deleted_at IS NULL`,
      user.id
    )

    return NextResponse.json({
      data: serialize(rows),
      stats: serialize(statsRows[0] || {}),
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/meetings/me/actions]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ── PATCH ───────────────────────────────────────────────────────
// 단일 액션 상태 변경 — 본인 (assignee) 만 가능 (또는 organizer/admin)
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const actionId = body?.action_id
    const newStatus = body?.status
    if (!actionId || !['open', 'done', 'dropped'].includes(newStatus)) {
      return NextResponse.json({ error: 'action_id + status (open|done|dropped) 필수' }, { status: 400 })
    }

    // 권한 — 본인 assignee 또는 admin/master
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT ai.assignee_id, ai.meeting_id, m.organizer_id, m.created_by
         FROM meeting_action_items ai
         INNER JOIN meetings m ON m.id = ai.meeting_id
        WHERE ai.id = ? AND m.deleted_at IS NULL LIMIT 1`,
      actionId
    )
    if (!rows[0]) return NextResponse.json({ error: '액션 없음' }, { status: 404 })
    const it = rows[0]
    const canEdit = user.role === 'admin' || user.role === 'master'
                 || it.assignee_id === user.id
                 || it.organizer_id === user.id
                 || it.created_by === user.id
    if (!canEdit) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    // done_at 자동 set/reset
    if (newStatus === 'done') {
      await prisma.$executeRawUnsafe(
        `UPDATE meeting_action_items SET status = ?, done_at = NOW(), updated_at = NOW() WHERE id = ?`,
        newStatus, actionId
      )
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE meeting_action_items SET status = ?, done_at = NULL, updated_at = NOW() WHERE id = ?`,
        newStatus, actionId
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[PATCH /api/meetings/me/actions]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
