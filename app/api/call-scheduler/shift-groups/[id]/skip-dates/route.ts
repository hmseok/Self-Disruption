// ═══════════════════════════════════════════════════════════════════
// PR-2SS-h-1 — 그룹 회피일 API
//
// GET    /api/call-scheduler/shift-groups/[id]/skip-dates
//   ?status=approved (선택: 'requested' | 'approved' | 'rejected' | 'canceled' | 'all')
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD (선택)
//
// POST   /api/call-scheduler/shift-groups/[id]/skip-dates
//   body: { worker_id, start_date, end_date, reason?, status? (default 'approved' for manager) }
//
// PATCH  /api/call-scheduler/shift-groups/[id]/skip-dates/[skip_id]
//   body: { status?, reason?, start_date?, end_date? }
//
// DELETE /api/call-scheduler/shift-groups/[id]/skip-dates/[skip_id]
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

const STATUSES = new Set(['requested', 'approved', 'rejected', 'canceled'])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId } = await context.params
    const sp = request.nextUrl.searchParams
    const status = sp.get('status') || 'approved'
    const from = sp.get('from')
    const to   = sp.get('to')

    // 마이그 미적용 graceful
    let hasTable = true
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_member_skip_dates LIMIT 1`
    } catch { hasTable = false }
    if (!hasTable) {
      return NextResponse.json({ data: [], error: null, _migration_pending: true })
    }

    const rows: any[] = status === 'all'
      ? (from && to)
        ? await prisma.$queryRaw<any[]>`
            SELECT s.id, s.group_id, s.worker_id,
                   DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                   DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                   s.reason, s.status,
                   s.requested_by, s.requested_at, s.approved_by, s.approved_at,
                   s.created_at, s.updated_at,
                   w.name AS worker_name, w.color_tone AS worker_tone
            FROM cs_group_member_skip_dates s
            LEFT JOIN cs_workers w ON w.id = s.worker_id
            WHERE s.group_id = ${groupId}
              AND NOT (s.end_date < ${from} OR s.start_date > ${to})
            ORDER BY s.start_date DESC, s.created_at DESC
          `
        : await prisma.$queryRaw<any[]>`
            SELECT s.id, s.group_id, s.worker_id,
                   DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                   DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                   s.reason, s.status,
                   s.requested_by, s.requested_at, s.approved_by, s.approved_at,
                   s.created_at, s.updated_at,
                   w.name AS worker_name, w.color_tone AS worker_tone
            FROM cs_group_member_skip_dates s
            LEFT JOIN cs_workers w ON w.id = s.worker_id
            WHERE s.group_id = ${groupId}
            ORDER BY s.start_date DESC, s.created_at DESC
          `
      : (from && to)
        ? await prisma.$queryRaw<any[]>`
            SELECT s.id, s.group_id, s.worker_id,
                   DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                   DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                   s.reason, s.status,
                   s.requested_by, s.requested_at, s.approved_by, s.approved_at,
                   s.created_at, s.updated_at,
                   w.name AS worker_name, w.color_tone AS worker_tone
            FROM cs_group_member_skip_dates s
            LEFT JOIN cs_workers w ON w.id = s.worker_id
            WHERE s.group_id = ${groupId} AND s.status = ${status}
              AND NOT (s.end_date < ${from} OR s.start_date > ${to})
            ORDER BY s.start_date DESC, s.created_at DESC
          `
        : await prisma.$queryRaw<any[]>`
            SELECT s.id, s.group_id, s.worker_id,
                   DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                   DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                   s.reason, s.status,
                   s.requested_by, s.requested_at, s.approved_by, s.approved_at,
                   s.created_at, s.updated_at,
                   w.name AS worker_name, w.color_tone AS worker_tone
            FROM cs_group_member_skip_dates s
            LEFT JOIN cs_workers w ON w.id = s.worker_id
            WHERE s.group_id = ${groupId} AND s.status = ${status}
            ORDER BY s.start_date DESC, s.created_at DESC
          `
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId } = await context.params
    const body = await request.json()
    const worker_id = String(body?.worker_id || '').trim()
    const start_date = String(body?.start_date || '').trim()
    const end_date = String(body?.end_date || '').trim()
    const reason = body?.reason ? String(body.reason).trim() : null
    const status = STATUSES.has(String(body?.status)) ? String(body.status) : 'approved'  // 매니저 직접 추가 시 즉시 승인

    if (!worker_id || !/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      return NextResponse.json({ error: 'worker_id / start_date / end_date 필수 (YYYY-MM-DD)' }, { status: 400 })
    }
    if (start_date > end_date) {
      return NextResponse.json({ error: 'start_date 가 end_date 보다 이후일 수 없습니다' }, { status: 400 })
    }

    // 마이그 미적용 graceful
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_member_skip_dates LIMIT 1`
    } catch {
      return NextResponse.json({ error: 'cs_group_member_skip_dates 테이블 미생성 — 마이그레이션 실행 필요' }, { status: 503 })
    }

    const id = crypto.randomUUID()
    const requestedBy = (user as any)?.id || (user as any)?.profile_id || null
    if (status === 'approved') {
      await prisma.$executeRaw`
        INSERT INTO cs_group_member_skip_dates
          (id, group_id, worker_id, start_date, end_date, reason, status,
           requested_by, requested_at, approved_by, approved_at, created_at, updated_at)
        VALUES
          (${id}, ${groupId}, ${worker_id}, ${start_date}, ${end_date}, ${reason}, ${status},
           ${requestedBy}, NOW(), ${requestedBy}, NOW(), NOW(), NOW())
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO cs_group_member_skip_dates
          (id, group_id, worker_id, start_date, end_date, reason, status,
           requested_by, requested_at, created_at, updated_at)
        VALUES
          (${id}, ${groupId}, ${worker_id}, ${start_date}, ${end_date}, ${reason}, ${status},
           ${requestedBy}, NOW(), NOW(), NOW())
      `
    }

    return NextResponse.json({ data: { id }, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
