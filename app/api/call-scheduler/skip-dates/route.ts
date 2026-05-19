// ═══════════════════════════════════════════════════════════════════
// PR-2SS-h-4 — 회피일 통합 조회 (매트릭스 시각화용)
//
// GET /api/call-scheduler/skip-dates?from=YYYY-MM-DD&to=YYYY-MM-DD&status=approved,requested
//   모든 그룹의 회피일을 한 번에 — 매트릭스 페이지가 월간 fetch.
//
// N-60 — 글로벌 회피일 등록 (group_id = NULL)
// POST /api/call-scheduler/skip-dates
//   body: { worker_id, start_date, end_date, reason?, status? }
//   → cs_group_member_skip_dates 에 group_id=NULL 로 INSERT (글로벌 적용)
//
// graceful: 테이블 미적용 시 빈 배열 + _migration_pending: true.
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

const VALID_STATUSES = new Set(['requested', 'approved', 'rejected', 'canceled'])

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const sp = request.nextUrl.searchParams
    const from = sp.get('from') || ''
    const to = sp.get('to') || ''
    const statusParam = sp.get('status') || 'approved,requested'
    const statuses = statusParam.split(',')
      .map(s => s.trim())
      .filter(s => VALID_STATUSES.has(s))

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: 'from/to 필수 (YYYY-MM-DD)' }, { status: 400 })
    }
    if (statuses.length === 0) {
      return NextResponse.json({ data: [], error: null })
    }

    // 마이그 미적용 graceful
    let hasTable = true
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_member_skip_dates LIMIT 1`
    } catch { hasTable = false }
    if (!hasTable) {
      return NextResponse.json({ data: [], error: null, _migration_pending: true })
    }

    // status IN (...) — Prisma raw IN 안전 처리
    const statusPlaceholders = statuses.map(() => '?').join(',')
    const sql = `
      SELECT s.id, s.group_id, s.worker_id,
             DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
             DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
             s.reason, s.status,
             s.created_at, s.updated_at,
             w.name AS worker_name, w.color_tone AS worker_tone,
             g.name AS group_name
      FROM cs_group_member_skip_dates s
      LEFT JOIN cs_workers w ON w.id = s.worker_id
      LEFT JOIN cs_shift_groups g ON g.id = s.group_id
      WHERE s.status IN (${statusPlaceholders})
        AND NOT (s.end_date < ? OR s.start_date > ?)
      ORDER BY s.start_date ASC, s.worker_id ASC
    `
    const rows: any[] = await prisma.$queryRawUnsafe(sql, ...statuses, from, to)
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// N-60 — 글로벌 회피일 등록 (group_id = NULL)
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    // 마이그 미적용 graceful
    let hasTable = true
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_member_skip_dates LIMIT 1`
    } catch { hasTable = false }
    if (!hasTable) {
      return NextResponse.json({ error: '마이그 미적용 — cs_group_member_skip_dates 생성 필요' }, { status: 503 })
    }
    // group_id NULL 허용 확인
    let nullable = false
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT IS_NULLABLE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'cs_group_member_skip_dates'
          AND COLUMN_NAME = 'group_id'
        LIMIT 1
      `
      nullable = rows.length > 0 && rows[0].IS_NULLABLE === 'YES'
    } catch { /* graceful */ }
    if (!nullable) {
      return NextResponse.json({
        error: 'group_id NOT NULL — migrations/2026-05-19_cs_skip_dates_global.sql 적용 필요',
      }, { status: 503 })
    }

    const body = await request.json()
    const worker_id = String(body?.worker_id || '').trim()
    const start_date = String(body?.start_date || '').trim()
    const end_date = String(body?.end_date || '').trim()
    const reason = body?.reason ? String(body.reason).trim() : null
    const status = VALID_STATUSES.has(String(body?.status))
      ? String(body.status) : 'approved'  // 매니저 직접 등록 = 즉시 승인

    if (!worker_id || !/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      return NextResponse.json({ error: 'worker_id / start_date / end_date 필수 (YYYY-MM-DD)' }, { status: 400 })
    }
    if (start_date > end_date) {
      return NextResponse.json({ error: 'start_date 가 end_date 보다 이후일 수 없습니다' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const requestedBy = (user as any)?.id || (user as any)?.profile_id || null
    if (status === 'approved') {
      await prisma.$executeRaw`
        INSERT INTO cs_group_member_skip_dates
          (id, group_id, worker_id, start_date, end_date, reason, status,
           requested_by, requested_at, approved_by, approved_at, created_at, updated_at)
        VALUES
          (${id}, NULL, ${worker_id}, ${start_date}, ${end_date}, ${reason}, ${status},
           ${requestedBy}, NOW(), ${requestedBy}, NOW(), NOW(), NOW())
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO cs_group_member_skip_dates
          (id, group_id, worker_id, start_date, end_date, reason, status,
           requested_by, requested_at, created_at, updated_at)
        VALUES
          (${id}, NULL, ${worker_id}, ${start_date}, ${end_date}, ${reason}, ${status},
           ${requestedBy}, NOW(), NOW(), NOW())
      `
    }

    const out = await prisma.$queryRaw<any[]>`
      SELECT id, group_id, worker_id,
             DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
             DATE_FORMAT(end_date,   '%Y-%m-%d') AS end_date,
             reason, status, created_at
      FROM cs_group_member_skip_dates
      WHERE id = ${id}
      LIMIT 1
    `
    return NextResponse.json({ data: serialize(out[0] || null), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
