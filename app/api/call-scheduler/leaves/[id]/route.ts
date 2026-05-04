// ═══════════════════════════════════════════════════════════════════
// PATCH  /api/call-scheduler/leaves/[id]
// DELETE /api/call-scheduler/leaves/[id]
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const ALLOWED = new Set(['leave_type', 'start_date', 'end_date', 'am_pm', 'reason'])
const TYPES = new Set(['annual', 'familyday', 'sick', 'unpaid', 'family', 'holiday', 'other'])
const AM_PM = new Set(['full', 'am', 'pm'])
const STATUSES = new Set(['pending', 'approved', 'rejected', 'canceled'])

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()

    // 상태 변경 (승인/반려/취소) — 별도 처리
    if (typeof body?.status === 'string' && STATUSES.has(body.status)) {
      const status = body.status
      const note: string | null = body?.resolution_note ?? null
      if (status === 'approved') {
        await prisma.$executeRaw`
          UPDATE cs_leaves
          SET status = 'approved',
              approved_at = NOW(), approved_by = ${user.id},
              resolution_note = ${note}, updated_at = NOW()
          WHERE id = ${id}
        `
      } else if (status === 'rejected') {
        await prisma.$executeRaw`
          UPDATE cs_leaves
          SET status = 'rejected',
              approved_at = NOW(), approved_by = ${user.id},
              resolution_note = ${note}, updated_at = NOW()
          WHERE id = ${id}
        `
      } else if (status === 'canceled') {
        await prisma.$executeRaw`
          UPDATE cs_leaves
          SET status = 'canceled', resolution_note = ${note}, updated_at = NOW()
          WHERE id = ${id}
        `
      } else {
        // pending 으로 되돌리기
        await prisma.$executeRaw`
          UPDATE cs_leaves
          SET status = 'pending', approved_at = NULL, approved_by = NULL,
              resolution_note = NULL, updated_at = NOW()
          WHERE id = ${id}
        `
      }
      const rows = await prisma.$queryRaw<any[]>`
        SELECT l.id, l.worker_id, l.leave_type,
               DATE_FORMAT(l.start_date, '%Y-%m-%d') AS start_date,
               DATE_FORMAT(l.end_date, '%Y-%m-%d')   AS end_date,
               l.am_pm, l.reason, l.status,
               l.applied_at, l.requested_by, l.approved_at, l.approved_by, l.resolution_note,
               l.created_at, l.updated_at,
               w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
        FROM cs_leaves l
        JOIN cs_workers w ON w.id = l.worker_id
        WHERE l.id = ${id} LIMIT 1
      `
      return NextResponse.json({ data: serialize(rows[0] || null), error: null })
    }

    // 일반 필드 변경
    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED.has(k)) continue
      if (k === 'leave_type' && !TYPES.has(String(v))) continue
      if (k === 'am_pm' && !AM_PM.has(String(v))) continue
      sets.push(`${k} = ?`); params.push(v ?? null)
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')
    const sql = `UPDATE cs_leaves SET ${sets.join(', ')} WHERE id = ?`
    params.push(id)
    await prisma.$executeRawUnsafe(sql, ...params)

    const rows = await prisma.$queryRaw<any[]>`
      SELECT l.id, l.worker_id, l.leave_type,
             DATE_FORMAT(l.start_date, '%Y-%m-%d') AS start_date,
             DATE_FORMAT(l.end_date, '%Y-%m-%d')   AS end_date,
             l.am_pm, l.reason, l.applied_at, l.applied_by, l.created_at, l.updated_at,
             w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
      FROM cs_leaves l
      JOIN cs_workers w ON w.id = l.worker_id
      WHERE l.id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
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
    await prisma.$executeRaw`DELETE FROM cs_leaves WHERE id = ${id}`
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
