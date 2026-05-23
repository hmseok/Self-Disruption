// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/eval-weights — CX KPI 평가 항목·가중치 CRUD
//   migrations/2026-05-22_cs_kpi_eval_weights.sql — cs_kpi_eval_weights
//
//   GET  : cs_kpi_eval_weights 전체 행 (sort_order 순)
//          테이블 미적재 시 graceful — 기본 4지표 + _migration_pending:true
//   POST : body { weights:[{ metric, enabled, weight }] } → metric 단위 UPDATE
//          (UNIQUE metric — 행이 있으면 갱신, 없으면 무시)
//
//   metric: call_count(통화량) / aht(평균처리시간) /
//           acw_away_ratio(후처리·이석) / work_hours(근무시간)
//           — kpi/evaluation route 의 평가 지표와 일치
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

interface WeightRow {
  metric: string
  label: string
  enabled: number
  weight: number
  sort_order: number
}

// evaluation route 의 WEIGHTS 상수와 동일 — 테이블 미적재 시 fallback
const DEFAULT_WEIGHTS: WeightRow[] = [
  { metric: 'call_count',     label: '통화량',          enabled: 1, weight: 35, sort_order: 1 },
  { metric: 'aht',            label: '평균처리시간',     enabled: 1, weight: 30, sort_order: 2 },
  { metric: 'acw_away_ratio', label: '후처리·이석 관리', enabled: 1, weight: 15, sort_order: 3 },
  { metric: 'work_hours',     label: '근무시간',         enabled: 1, weight: 20, sort_order: 4 },
]
const ALLOWED_METRICS = new Set(DEFAULT_WEIGHTS.map(w => w.metric))

// ───────────────────────────── GET ─────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT metric, label, enabled, weight, sort_order
      FROM cs_kpi_eval_weights
      ORDER BY sort_order ASC, metric ASC
    `
    if (rows.length === 0) {
      // 테이블은 있으나 시드 없음 — 기본값 반환
      return NextResponse.json({
        data: serialize({ weights: DEFAULT_WEIGHTS, _migration_pending: true }),
        error: null,
      })
    }
    const weights: WeightRow[] = rows.map(r => ({
      metric: String(r.metric || ''),
      label: String(r.label || ''),
      enabled: Number(r.enabled ?? 1) ? 1 : 0,
      weight: Number(r.weight ?? 0),
      sort_order: Number(r.sort_order ?? 0),
    }))
    return NextResponse.json({ data: serialize({ weights }), error: null })
  } catch {
    // cs_kpi_eval_weights 미적재 — graceful 기본값
    return NextResponse.json({
      data: serialize({ weights: DEFAULT_WEIGHTS, _migration_pending: true }),
      error: null,
    })
  }
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const input = Array.isArray(body?.weights) ? body.weights : []
    if (input.length === 0) {
      return NextResponse.json({ error: '저장할 항목이 없습니다.' }, { status: 400 })
    }

    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const w of input) {
      const metric = String(w?.metric || '')
      if (!ALLOWED_METRICS.has(metric)) {
        errors.push(`알 수 없는 지표: ${metric}`); skipped++; continue
      }
      const enabled = w?.enabled ? 1 : 0
      let weight = Math.round(Number(w?.weight))
      if (!Number.isFinite(weight) || weight < 0) weight = 0
      if (weight > 1000) weight = 1000  // 상한 가드

      try {
        const affected = await prisma.$executeRaw`
          UPDATE cs_kpi_eval_weights
          SET enabled = ${enabled}, weight = ${weight}
          WHERE metric = ${metric}
        `
        if (Number(affected) > 0) updated++
        else { errors.push(`행 없음: ${metric} (마이그레이션 미적용)`); skipped++ }
      } catch (e: any) {
        errors.push(`${metric}: ${e?.message || '저장 실패'}`); skipped++
      }
    }

    return NextResponse.json({
      data: serialize({ updated, skipped, errors }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
