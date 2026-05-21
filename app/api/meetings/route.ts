import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
// /api/meetings — 회의 CRUD
//
// GET    ?type=&department=&from=&to=&search=&mine=true
// POST   { meeting, attendees[], minutes[], action_items[] }
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')

    // PR-V2-Visibility hotfix #3 (Rule 23 graceful) —
    // migrations/2026-05-16_meetings_visibility.sql 미적용 시
    // visibility 컬럼 + meeting_editors 테이블 없음 → 권한 필터 skip (마이그 전 옛 동작)
    let v2VisibilitySupported = true
    try {
      await prisma.$queryRawUnsafe(`SELECT visibility FROM meetings LIMIT 1`)
      await prisma.$queryRawUnsafe(`SELECT 1 FROM meeting_editors LIMIT 1`)
    } catch {
      v2VisibilitySupported = false
    }

    // 단건 상세
    if (id) {
      const meetings = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM meetings WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        id
      )
      const m = meetings[0]
      if (!m) return NextResponse.json({ data: null })

      // PR-V2-Visibility — 단건 조회 권한 체크 (마이그 적용 시만)
      const isAdmin = user.role === 'admin' || user.role === 'master'
      if (!isAdmin && v2VisibilitySupported) {
        const visibility = m.visibility || 'attendees'
        let canRead = false
        if (visibility === 'public') canRead = true
        else if (m.organizer_id === user.id || m.created_by === user.id) canRead = true
        else {
          // attendees / editors / department 체크
          const checks = await Promise.all([
            prisma.$queryRawUnsafe<any[]>(
              `SELECT 1 FROM meeting_attendees WHERE meeting_id = ? AND profile_id = ? LIMIT 1`,
              id, user.id
            ),
            prisma.$queryRawUnsafe<any[]>(
              `SELECT 1 FROM meeting_editors WHERE meeting_id = ? AND profile_id = ? LIMIT 1`,
              id, user.id
            ),
            visibility === 'department' && m.department
              ? prisma.$queryRawUnsafe<any[]>(
                  `SELECT 1 FROM ride_employees WHERE profile_id = ? AND department = ? AND is_active = 1 LIMIT 1`,
                  user.id, m.department
                )
              : Promise.resolve([]),
          ])
          canRead = checks[0].length > 0 || checks[1].length > 0 || checks[2].length > 0
        }
        if (!canRead) return NextResponse.json({ error: '조회 권한 없음' }, { status: 403 })
      }

      const [attendees, minutes, actions] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT a.*, p.name AS profile_name, p.department AS profile_department, p.position AS profile_position
             FROM meeting_attendees a
             LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = a.profile_id COLLATE utf8mb4_unicode_ci
            WHERE a.meeting_id = ?`,
          id
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM meeting_minutes WHERE meeting_id = ? ORDER BY order_no ASC, created_at ASC`,
          id
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT ai.*, p.name AS assignee_name
             FROM meeting_action_items ai
             LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = ai.assignee_id COLLATE utf8mb4_unicode_ci
            WHERE ai.meeting_id = ?
            ORDER BY ai.status ASC, ai.due_date ASC, ai.created_at ASC`,
          id
        ),
      ])

      return NextResponse.json({
        data: serialize({ meeting: m, attendees, minutes, action_items: actions })
      })
    }

    // 목록 (필터)
    const conditions: string[] = ['m.deleted_at IS NULL']
    const params: any[] = []
    const type = searchParams.get('type')
    const department = searchParams.get('department')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const search = searchParams.get('search')
    const mine = searchParams.get('mine') === 'true'

    if (type) { conditions.push('m.type = ?'); params.push(type) }
    if (department) { conditions.push('m.department = ?'); params.push(department) }
    if (from) { conditions.push('m.meeting_date >= ?'); params.push(from) }
    if (to) { conditions.push('m.meeting_date <= ?'); params.push(to) }
    if (search) {
      conditions.push('(m.title LIKE ? OR m.agenda LIKE ? OR m.summary LIKE ?)')
      const q = `%${search}%`
      params.push(q, q, q)
    }
    if (mine) {
      conditions.push(`(m.organizer_id = ? OR m.id IN (SELECT meeting_id FROM meeting_attendees WHERE profile_id = ?))`)
      params.push(user.id, user.id)
    }

    // PR-V2-Visibility — 권한 체크 (hotfix #3 — 마이그 적용 시만)
    // admin/master 면 모두, 그 외는 visibility 별 필터
    const isAdmin = user.role === 'admin' || user.role === 'master'
    if (!isAdmin && v2VisibilitySupported) {
      conditions.push(`(
        m.visibility = 'public'
        OR m.organizer_id = ?
        OR m.created_by = ?
        OR EXISTS (SELECT 1 FROM meeting_attendees ma WHERE ma.meeting_id = m.id AND ma.profile_id = ?)
        OR EXISTS (SELECT 1 FROM meeting_editors me WHERE me.meeting_id = m.id AND me.profile_id = ?)
        OR (m.visibility = 'department' AND m.department IS NOT NULL AND m.department IN (
          SELECT department FROM ride_employees WHERE profile_id = ? AND is_active = 1 LIMIT 1
        ))
      )`)
      params.push(user.id, user.id, user.id, user.id, user.id)
    }

    // visibility 컬럼 — 마이그 적용 시만 SELECT, 아니면 'attendees' 고정값
    const visibilityCol = v2VisibilitySupported ? 'm.visibility,' : `'attendees' AS visibility,`
    const list = await prisma.$queryRawUnsafe<any[]>(
      `SELECT m.id, m.title, m.type, m.meeting_date, m.duration_min, m.location,
              m.organizer_id, m.department, m.status, m.created_by, m.created_at,
              ${visibilityCol}
              p.name AS organizer_name,
              (SELECT COUNT(*) FROM meeting_attendees WHERE meeting_id = m.id) AS attendee_count,
              (SELECT COUNT(*) FROM meeting_action_items WHERE meeting_id = m.id) AS action_count,
              (SELECT COUNT(*) FROM meeting_action_items WHERE meeting_id = m.id AND status = 'open') AS open_action_count
         FROM meetings m
         LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = m.organizer_id COLLATE utf8mb4_unicode_ci
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.meeting_date DESC, m.created_at DESC
        LIMIT 500`,
      ...params
    )

    // 통계
    const stats = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN type = 'regular' THEN 1 ELSE 0 END) AS regular_count,
         SUM(CASE WHEN type = 'specific' THEN 1 ELSE 0 END) AS specific_count,
         SUM(CASE WHEN type = 'one_on_one' THEN 1 ELSE 0 END) AS one_on_one_count,
         SUM(CASE WHEN type = 'department' THEN 1 ELSE 0 END) AS department_count,
         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_count
       FROM meetings WHERE deleted_at IS NULL`
    )

    return NextResponse.json({
      data: serialize(list),
      stats: serialize(stats[0] || {}),
    })
  } catch (e: any) {
    console.error('[GET /api/meetings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { meeting, attendees = [], minutes = [], action_items = [] } = body

    if (!meeting?.title) return NextResponse.json({ error: '제목 필수' }, { status: 400 })

    const meetingId = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO meetings (
         id, title, type, meeting_date, duration_min, location,
         organizer_id, department, status, agenda, summary,
         created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      meetingId,
      meeting.title,
      meeting.type || 'specific',
      meeting.meeting_date || null,
      meeting.duration_min || null,
      meeting.location || null,
      meeting.organizer_id || user.id,
      meeting.department || null,
      meeting.status || 'draft',
      meeting.agenda || null,
      meeting.summary || null,
      user.id
    )

    // 참석자
    for (const a of attendees) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO meeting_attendees (id, meeting_id, profile_id, external_name, role, attendance, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(), meetingId,
          a.profile_id || null,
          a.external_name || null,
          a.role || 'attendee',
          a.attendance || 'present',
          a.note || null
        )
      } catch (e: any) {
        console.warn('[meetings POST] attendee 추가 실패:', e?.message)
      }
    }

    // 회의록 본문
    for (const [i, m] of minutes.entries()) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO meeting_minutes (id, meeting_id, section_type, order_no, title, content, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(), meetingId,
        m.section_type || 'note',
        m.order_no || i + 1,
        m.title || null,
        m.content || null,
        user.id
      )
    }

    // 액션 아이템
    for (const ai of action_items) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO meeting_action_items (id, meeting_id, assignee_id, external_assignee, content, due_date, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(), meetingId,
        ai.assignee_id || null,
        ai.external_assignee || null,
        ai.content,
        ai.due_date || null,
        ai.status || 'open',
        user.id
      )
    }

    return NextResponse.json({ ok: true, id: meetingId })
  } catch (e: any) {
    console.error('[POST /api/meetings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

    const body = await request.json()
    const { meeting, attendees, minutes, action_items } = body

    // 권한 체크 — admin/master + 권한 페이지 can_edit + 본인 작성
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT organizer_id, created_by FROM meetings WHERE id = ? LIMIT 1`, id
    )
    if (!existing[0]) return NextResponse.json({ error: '회의 없음' }, { status: 404 })
    // 권한 페이지의 /meetings can_edit ON 인 사용자는 타인 회의록도 수정 가능
    const editPerm = await prisma.$queryRaw<any[]>`
      SELECT can_edit FROM user_page_permissions
       WHERE user_id = ${user.id} AND page_path = '/meetings' LIMIT 1
    `
    const hasEditPagePerm = !!(editPerm[0]?.can_edit)

    // PR-V2-Visibility — meeting_editors.role='editor' 도 편집 가능
    let isEditorByList = false
    try {
      const editorRow = await prisma.$queryRawUnsafe<any[]>(
        `SELECT 1 FROM meeting_editors WHERE meeting_id = ? AND profile_id = ? AND role = 'editor' LIMIT 1`,
        id, user.id
      )
      isEditorByList = editorRow.length > 0
    } catch {
      // meeting_editors 테이블 미적용 시 무시 (graceful)
    }

    const canEdit = user.role === 'admin'
                  || user.role === 'master'
                  || hasEditPagePerm
                  || existing[0].organizer_id === user.id
                  || existing[0].created_by === user.id
                  || isEditorByList
    if (!canEdit) return NextResponse.json({ error: '편집 권한 없음' }, { status: 403 })

    if (meeting) {
      const ALLOWED = new Set([
        'title', 'type', 'meeting_date', 'duration_min', 'location',
        'organizer_id', 'department', 'status', 'agenda', 'summary',
        'visibility',                                                  // PR-V2-Visibility
      ])
      const entries = Object.entries(meeting).filter(([k]) => ALLOWED.has(k))
      if (entries.length > 0) {
        const setClause = entries.map(([k]) => `\`${k}\` = ?`).join(', ')
        await prisma.$executeRawUnsafe(
          `UPDATE meetings SET ${setClause}, updated_at = NOW() WHERE id = ?`,
          ...entries.map(([, v]) => v as any), id
        )
      }
    }

    // 참석자/회의록/액션 아이템 — 전체 교체 패턴
    if (Array.isArray(attendees)) {
      await prisma.$executeRawUnsafe(`DELETE FROM meeting_attendees WHERE meeting_id = ?`, id)
      for (const a of attendees) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO meeting_attendees (id, meeting_id, profile_id, external_name, role, attendance, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(), id,
          a.profile_id || null, a.external_name || null,
          a.role || 'attendee', a.attendance || 'present', a.note || null
        )
      }
    }
    if (Array.isArray(minutes)) {
      await prisma.$executeRawUnsafe(`DELETE FROM meeting_minutes WHERE meeting_id = ?`, id)
      for (const [i, m] of minutes.entries()) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO meeting_minutes (id, meeting_id, section_type, order_no, title, content, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(), id, m.section_type || 'note', m.order_no || i + 1,
          m.title || null, m.content || null, user.id
        )
      }
    }
    if (Array.isArray(action_items)) {
      await prisma.$executeRawUnsafe(`DELETE FROM meeting_action_items WHERE meeting_id = ?`, id)
      for (const ai of action_items) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO meeting_action_items (id, meeting_id, assignee_id, external_assignee, content, due_date, status, done_at, done_note, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(), id, ai.assignee_id || null, ai.external_assignee || null,
          ai.content, ai.due_date || null, ai.status || 'open',
          ai.done_at || null, ai.done_note || null, user.id
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[PATCH /api/meetings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

    // 권한 체크 — admin/master + 권한 페이지 can_delete + 본인 작성
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT organizer_id, created_by FROM meetings WHERE id = ? LIMIT 1`, id
    )
    if (!existing[0]) return NextResponse.json({ error: '회의 없음' }, { status: 404 })
    const delPerm = await prisma.$queryRaw<any[]>`
      SELECT can_delete FROM user_page_permissions
       WHERE user_id = ${user.id} AND page_path = '/meetings' LIMIT 1
    `
    const hasDeletePagePerm = !!(delPerm[0]?.can_delete)
    const canDelete = user.role === 'admin'
                   || user.role === 'master'
                   || hasDeletePagePerm
                   || existing[0].organizer_id === user.id
                   || existing[0].created_by === user.id
    if (!canDelete) return NextResponse.json({ error: '삭제 권한 없음' }, { status: 403 })

    // soft delete
    await prisma.$executeRawUnsafe(
      `UPDATE meetings SET deleted_at = NOW() WHERE id = ?`, id
    )
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[DELETE /api/meetings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
