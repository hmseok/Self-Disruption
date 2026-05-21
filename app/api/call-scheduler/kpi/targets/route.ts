// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/targets — CX KPI 목표치 CRUD
//   KPI-DESIGN.md §3-3 / §5-3 / §6 — cs_kpi_targets
//
//   GET  ?year=&month=  : 해당 연·월 목표 행 목록 (team + agent scope 모두)
//   POST                : 목표치 저장/갱신
//     body: { targets: [{ scope, worker_id, metric, period_kind,
//                          target_value, year, month }] }
//     같은 (scope, worker_id, metric, period_kind, year, month) → 갱신,
//     아니면 신규. cs_kpi_targets 에 UNIQUE 없음 → 앱에서 SELECT 후
//     UPDATE/INSERT 분기.
//
//   metric: call_count(통화량) / aht(평균통화시간) /
//           login_sec(로그인시간) / work_hours(근무시간)
//           — KpiDashboard 가 표출하는 지표와 일치
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// KpiDashboard 와 일치하는 허용 지표
const ALLOWED_METRICS = new Set(['call_count', 'aht', 'login_sec', 'work_hours'])
const ALLOWED_PERIODS = new Set(['daily', 'weekly', 'monthly'])
const ALLOWED_SCOPES = new Set(['team', 'agent'])

interface TargetRow {
  id: string
  scope: string
  worker_id: string | null
  metric: string
  period_kind: string
  target_value: number
  year: number | null
  month: number | null
}

// ───────────────────────────── GET ─────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const now = new Date()
    const year = Number(url.searchParams.get('year')) || now.getFullYear()
    const month = Number(url.searchParams.get('month')) || (now.getMonth() + 1)

    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT id, scope, worker_id, metric, period_kind,
               target_value, year, month
        FROM cs_kpi_targets
        WHERE year = ${year} AND month = ${month}
        ORDER BY scope ASC, metric ASC
      `
      const targets: TargetRow[] = rows.map(r => ({
        id: String(r.id),
        scope: String(r.scope || 'team'),
        worker_id: r.worker_id ? String(r.worker_id) : null,
        metric: String(r.metric || ''),
        period_kind: String(r.period_kind || 'monthly'),
        target_value: Number(r.target_value || 0),
        year: r.year != null ? Number(r.year) : null,
        month: r.month != null ? Number(r.month) : null,
      }))
      return NextResponse.json({
        data: serialize({ year, month, targets }),
        error: null,
      })
    } catch {
      // cs_kpi_targets 미적재 — graceful 빈 결과
      return NextResponse.json({
        data: serialize({ year, month, targets: [], _migration_pending: true }),
        error: null,
      })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const input = Array.isArray(body?.targets) ? body.targets : []
    if (input.length === 0) {
      return NextResponse.json({ error: '저장할 목표가 없습니다.' }, { status: 400 })
    }

    let inserted = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const t of input) {
      const scope = ALLOWED_SCOPES.has(String(t?.scope)) ? String(t.scope) : 'team'
      const metric = String(t?.metric || '')
      const periodKind = ALLOWED_PERIODS.has(String(t?.period_kind))
        ? String(t.period_kind) : 'monthly'
      const workerId = scope === 'agent' && t?.worker_id
        ? String(t.worker_id) : null
      const year = Number(t?.year)
      const month = Number(t?.month)
      const targetValue = Number(t?.target_value)

      // 입력 검증
      if (!ALLOWED_METRICS.has(metric)) {
        errors.push(`알 수 없는 지표: ${metric}`); skipped++; continue
      }
      if (!Number.isFinite(year) || !Number.isFinite(month) ||
          month < 1 || month > 12) {
        errors.push(`잘못된 연·월: ${year}-${month}`); skipped++; continue
      }
      if (scope === 'agent' && !workerId) {
        errors.push(`상담원 목표인데 worker_id 누락 (${metric})`); skipped++; continue
      }
      // 빈/음수 목표치 → 해당 목표 제거 (입력 후 0 으로 비우면 삭제)
      if (!Number.isFinite(targetValue) || targetValue <= 0) {
        try {
          if (workerId) {
            await prisma.$executeRaw`
              DELETE FROM cs_kpi_targets
              WHERE scope = ${scope} AND worker_id = ${workerId}
                AND metric = ${metric} AND period_kind = ${periodKind}
                AND year = ${year} AND month = ${month}
            `
          } else {
            await prisma.$executeRaw`
              DELETE FROM cs_kpi_targets
              WHERE scope = ${scope} AND worker_id IS NULL
                AND metric = ${metric} AND period_kind = ${periodKind}
                AND year = ${year} AND month = ${month}
            `
          }
        } catch { /* graceful */ }
        skipped++
        continue
      }

      // 기존 행 SELECT (UNIQUE 없음 → 앱에서 분기)
      let existingId: string | null = null
      if (workerId) {
        const ex = await prisma.$queryRaw<any[]>`
          SELECT id FROM cs_kpi_targets
          WHERE scope = ${scope} AND worker_id = ${workerId}
            AND metric = ${metric} AND period_kind = ${periodKind}
            AND year = ${year} AND month = ${month}
          LIMIT 1
        `
        if (ex.length > 0) existingId = String(ex[0].id)
      } else {
        const ex = await prisma.$queryRaw<any[]>`
          SELECT id FROM cs_kpi_targets
          WHERE scope = ${scope} AND worker_id IS NULL
            AND metric = ${metric} AND period_kind = ${periodKind}
            AND year = ${year} AND month = ${month}
          LIMIT 1
        `
        if (ex.length > 0) existingId = String(ex[0].id)
      }

      if (existingId) {
        await prisma.$executeRaw`
          UPDATE cs_kpi_targets
          SET target_value = ${targetValue}
          WHERE id = ${existingId}
        `
        updated++
      } else {
        const id = crypto.randomUUID()
        await prisma.$executeRaw`
          INSERT INTO cs_kpi_targets
            (id, scope, worker_id, metric, period_kind,
             target_value, year, month, created_at)
          VALUES
            (${id}, ${scope}, ${workerId}, ${metric}, ${periodKind},
             ${targetValue}, ${year}, ${month}, NOW())
        `
        inserted++
      }
    }

    return NextResponse.json({
      data: serialize({ inserted, updated, skipped, errors }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
