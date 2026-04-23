import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { serialize } from '@/lib/operational-learning-helpers'

// ═══════════════════════════════════════════════════════════════
// 월별 정확도 추이 API
//   GET /api/operational-learning/accuracy-trend
//     - 필터: from, to, vehicle_class, contract_type
//     → 월별 (predicted vs actual) 정확도 집계 반환
//
// 반환 형태:
// {
//   months: ["2026-01", "2026-02", ...],
//   categories: {
//     "감가상각": [85, 90, ...],
//     "보험": [75, 80, ...], ...
//   },
//   overall: [80, 85, ...],
//   snapshot_counts: [5, 8, ...]
// }
// ═══════════════════════════════════════════════════════════════

const CATEGORY_MAP: Record<string, { pred: string; actual: string; label: string }> = {
  depreciation:   { pred: 'predicted_depreciation',   actual: 'actual_depreciation',   label: '감가상각' },
  insurance:      { pred: 'predicted_insurance',      actual: 'actual_insurance',      label: '보험' },
  maintenance:    { pred: 'predicted_maintenance',    actual: 'actual_maintenance',    label: '정비' },
  tax:            { pred: 'predicted_tax',            actual: 'actual_tax',            label: '세금' },
  accident_cost:  { pred: 'predicted_accident_cost',  actual: 'actual_accident_cost',  label: '사고비용' },
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const vehicleClass = searchParams.get('vehicle_class')
    const contractType = searchParams.get('contract_type')

    // 조인 쿼리: calc_snapshots + operational_actuals
    // 실적이 있는 스냅샷만 대상
    const wheres: string[] = []
    const params: any[] = []

    if (from) { wheres.push('a.recorded_month >= ?'); params.push(from.slice(0, 7)) }
    if (to) { wheres.push('a.recorded_month <= ?'); params.push(to.slice(0, 7)) }
    if (vehicleClass) { wheres.push('s.vehicle_class = ?'); params.push(vehicleClass) }
    if (contractType) { wheres.push('s.contract_type = ?'); params.push(contractType) }

    const whereClause = wheres.length > 0 ? `AND ${wheres.join(' AND ')}` : ''

    const sql = `
      SELECT
        a.recorded_month AS month,
        COUNT(DISTINCT s.id) AS snapshot_count,
        AVG(CAST(s.predicted_depreciation AS DECIMAL(12,2))) AS avg_pred_dep,
        AVG(CAST(s.predicted_insurance AS DECIMAL(12,2)))    AS avg_pred_ins,
        AVG(CAST(s.predicted_maintenance AS DECIMAL(12,2)))  AS avg_pred_mnt,
        AVG(CAST(s.predicted_tax AS DECIMAL(12,2)))          AS avg_pred_tax,
        AVG(CAST(s.predicted_accident_cost AS DECIMAL(12,2)))AS avg_pred_acc,
        AVG(CAST(a.actual_depreciation AS DECIMAL(12,2)))    AS avg_act_dep,
        AVG(CAST(a.actual_insurance AS DECIMAL(12,2)))       AS avg_act_ins,
        AVG(CAST(a.actual_maintenance AS DECIMAL(12,2)))     AS avg_act_mnt,
        AVG(CAST(a.actual_tax AS DECIMAL(12,2)))             AS avg_act_tax,
        AVG(CAST(a.actual_accident_cost AS DECIMAL(12,2)))   AS avg_act_acc
      FROM operational_actuals a
      INNER JOIN calc_snapshots s ON a.snapshot_id = s.id
      WHERE 1=1 ${whereClause}
      GROUP BY a.recorded_month
      ORDER BY a.recorded_month ASC
      LIMIT 36
    `

    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)

    // 결과 가공
    const months: string[] = []
    const categories: Record<string, number[]> = {}
    const overall: number[] = []
    const snapshotCounts: number[] = []

    // 카테고리 초기화
    for (const key of Object.keys(CATEGORY_MAP)) {
      categories[CATEGORY_MAP[key].label] = []
    }

    for (const row of rows) {
      months.push(row.month)
      snapshotCounts.push(Number(row.snapshot_count || 0))

      const accuracies: number[] = []

      // 감가상각
      const depAcc = computeAccuracy(row.avg_pred_dep, row.avg_act_dep)
      categories['감가상각'].push(depAcc)
      if (depAcc >= 0) accuracies.push(depAcc)

      // 보험
      const insAcc = computeAccuracy(row.avg_pred_ins, row.avg_act_ins)
      categories['보험'].push(insAcc)
      if (insAcc >= 0) accuracies.push(insAcc)

      // 정비
      const mntAcc = computeAccuracy(row.avg_pred_mnt, row.avg_act_mnt)
      categories['정비'].push(mntAcc)
      if (mntAcc >= 0) accuracies.push(mntAcc)

      // 세금
      const taxAcc = computeAccuracy(row.avg_pred_tax, row.avg_act_tax)
      categories['세금'].push(taxAcc)
      if (taxAcc >= 0) accuracies.push(taxAcc)

      // 사고비용
      const accAcc = computeAccuracy(row.avg_pred_acc, row.avg_act_acc)
      categories['사고비용'].push(accAcc)
      if (accAcc >= 0) accuracies.push(accAcc)

      // 전체 평균 정확도
      overall.push(
        accuracies.length > 0
          ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
          : 0
      )
    }

    return NextResponse.json({
      data: serialize({ months, categories, overall, snapshot_counts: snapshotCounts }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * 정확도 계산: max(0, 100 - |variance_pct|)
 * variance_pct = (actual - predicted) / predicted * 100
 * 양쪽 모두 0이면 -1 (데이터 없음)
 */
function computeAccuracy(predicted: any, actual: any): number {
  const p = Number(predicted || 0)
  const a = Number(actual || 0)
  if (p === 0 && a === 0) return -1 // 데이터 없음 표시
  if (p === 0) return 0 // 예측 0인데 실적 있으면 정확도 0
  const variancePct = Math.abs((a - p) / p * 100)
  return Math.max(0, Math.round(100 - variancePct))
}
