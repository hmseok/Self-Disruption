// ═══════════════════════════════════════════════════════════════════
// PR-2SS-h-4 — 회피일 통합 조회 (매트릭스 시각화용)
//
// GET /api/call-scheduler/skip-dates?from=YYYY-MM-DD&to=YYYY-MM-DD&status=approved,requested
//
// 모든 그룹의 회피일을 한 번에 — 매트릭스 페이지가 월간 fetch.
// graceful: 테이블 미적용 시 빈 배열 + _migration_pending: true.
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

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
