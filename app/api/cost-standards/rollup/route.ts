import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================================
// /api/cost-standards/rollup — 운영학습 사이클
//
// 호출:
//   POST /api/cost-standards/rollup?months=12
//
// 동작:
//   1) operational_actuals (최근 N개월) → contracts.car_id → cars
//      → (vehicle_class, fuel_type) 또는 (brand, model) 그룹 평균 산출
//   2) cost_standards_value.our_value 업데이트 (단위 변환):
//      - actual_insurance (월) × 12  → insurance.our_value (annual)
//      - actual_maintenance (월)     → maintenance.our_value (monthly)
//      - actual_tax (월) × 12        → tax.our_value (annual)
//   3) 변경 시 cost_auto_updates 에 알림 row 생성 (old/new/delta_pct)
//
// 참고:
//   - finance_rate / inspection / registration 은 actuals 컬럼이 없어 제외
//   - is_locked = 1 인 row 는 자동 갱신 스킵
// ============================================================

interface AvgRow {
  vehicle_class: string | null
  fuel_type: string | null
  brand: string | null
  model: string | null
  avg_ins: number | null
  avg_maint: number | null
  avg_tax: number | null
  sample_count: number
}

const COMPONENT_MAP: Array<{
  component: 'insurance' | 'maintenance' | 'tax'
  field: keyof Pick<AvgRow, 'avg_ins' | 'avg_maint' | 'avg_tax'>
  toUnit: (monthly: number) => number  // 월 평균 → cost_standards 단위 값
}> = [
  { component: 'insurance',   field: 'avg_ins',   toUnit: m => Math.round(m * 12) },  // annual
  { component: 'maintenance', field: 'avg_maint', toUnit: m => Math.round(m) },        // monthly
  { component: 'tax',         field: 'avg_tax',   toUnit: m => Math.round(m * 12) },  // annual
]

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const monthsParam = request.nextUrl.searchParams.get('months')
    const months = Math.max(1, Math.min(36, parseInt(monthsParam || '12', 10) || 12))

    // ── 1) 클래스+유종 그룹 평균 ──
    const classRows = await prisma.$queryRawUnsafe<AvgRow[]>(`
      SELECT
        cars.vehicle_class, cars.fuel_type,
        NULL AS brand, NULL AS model,
        AVG(NULLIF(oa.actual_insurance, 0))    AS avg_ins,
        AVG(NULLIF(oa.actual_maintenance, 0))  AS avg_maint,
        AVG(NULLIF(oa.actual_tax, 0))          AS avg_tax,
        COUNT(*) AS sample_count
      FROM operational_actuals oa
      JOIN contracts c   ON c.id = oa.contract_id
      JOIN cars     cars ON cars.id = c.car_id
      WHERE oa.recorded_month >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ? MONTH), '%Y-%m')
        AND cars.vehicle_class IS NOT NULL
        AND cars.fuel_type IS NOT NULL
      GROUP BY cars.vehicle_class, cars.fuel_type
    `, months)

    // ── 2) 모델 그룹 평균 (model 스코프 매칭용) ──
    const modelRows = await prisma.$queryRawUnsafe<AvgRow[]>(`
      SELECT
        NULL AS vehicle_class, NULL AS fuel_type,
        cars.brand, cars.model,
        AVG(NULLIF(oa.actual_insurance, 0))    AS avg_ins,
        AVG(NULLIF(oa.actual_maintenance, 0))  AS avg_maint,
        AVG(NULLIF(oa.actual_tax, 0))          AS avg_tax,
        COUNT(*) AS sample_count
      FROM operational_actuals oa
      JOIN contracts c   ON c.id = oa.contract_id
      JOIN cars     cars ON cars.id = c.car_id
      WHERE oa.recorded_month >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ? MONTH), '%Y-%m')
        AND cars.brand IS NOT NULL
        AND cars.model IS NOT NULL
      GROUP BY cars.brand, cars.model
    `, months)

    let updatedCount = 0
    const notifications: any[] = []

    const allRows = [...classRows, ...modelRows]
    if (allRows.length === 0) {
      return NextResponse.json({
        ok: true,
        months_window: months,
        actuals_groups: 0,
        updated: 0,
        notifications: 0,
        message: 'operational_actuals 데이터 없음 — 롤업할 그룹 0개',
      })
    }

    for (const row of allRows) {
      // 매칭되는 cost_standards_scope 찾기
      const scopes = row.vehicle_class
        ? await prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM cost_standards_scope
              WHERE scope_type = 'class'
                AND vehicle_class = ? AND fuel_type = ?
              LIMIT 1`,
            row.vehicle_class, row.fuel_type
          )
        : await prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM cost_standards_scope
              WHERE scope_type = 'model'
                AND brand = ? AND model = ?
              LIMIT 1`,
            row.brand, row.model
          )
      if (scopes.length === 0) continue
      const scopeId = scopes[0].id

      for (const m of COMPONENT_MAP) {
        const monthly = row[m.field]
        if (!monthly || monthly <= 0) continue
        const newVal = m.toUnit(Number(monthly))

        // 현재 value row 조회
        const [current] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, our_value, is_locked FROM cost_standards_value
            WHERE scope_id = ? AND component = ?`,
          scopeId, m.component
        )
        if (!current) continue
        if (current.is_locked) continue

        const oldVal = current.our_value !== null ? Number(current.our_value) : null
        if (oldVal !== null && Math.abs(oldVal - newVal) < 1) continue  // 변동 없음

        await prisma.$executeRawUnsafe(
          `UPDATE cost_standards_value
              SET our_value = ?, sample_count = ?, our_updated_at = NOW()
            WHERE scope_id = ? AND component = ?`,
          newVal, row.sample_count, scopeId, m.component
        )
        updatedCount++

        // 알림 row 생성
        const deltaPct = oldVal !== null && oldVal > 0
          ? ((newVal - oldVal) / oldVal) * 100
          : null
        await prisma.$executeRawUnsafe(
          `INSERT INTO cost_auto_updates
            (scope_id, component, value_kind, old_value, new_value, delta_pct,
             sample_count, trigger_type, trigger_detail)
           VALUES (?, ?, 'our', ?, ?, ?, ?, 'actuals_rollup', ?)`,
          scopeId, m.component, oldVal, newVal, deltaPct,
          row.sample_count, `최근 ${months}개월 운영 실적 평균`
        )
        notifications.push({
          scope_id: scopeId, component: m.component,
          old: oldVal, new: newVal, delta_pct: deltaPct,
          sample: row.sample_count,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      months_window: months,
      actuals_groups: allRows.length,
      updated: updatedCount,
      notifications: notifications.length,
      details: notifications,
    })
  } catch (e: any) {
    console.error('[rollup] 실패:', e)
    return NextResponse.json({ error: e.message || '롤업 실패' }, { status: 500 })
  }
}
