import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================================
// /api/cost-standards/vehicle-analysis?car_id=...
//
// 차량 한 대에 대한 통합 원가 분석:
//  · 차량 정보 (cars)
//  · 매칭된 cost_standards (모델 우선, 클래스 폴백) — market/our
//  · 실제 운영 평균 (operational_actuals 평균, 최근 12개월)
//  · 편차 (시장 vs 우리, 우리 vs 실제)
//  · 영업가 후보 (sales_presets 별 마진 적용)
// ============================================================

const COMPONENTS = [
  { component: 'insurance',   label: '보험료',      unit: 'annual',  monthly: (v: number) => v / 12 },
  { component: 'maintenance', label: '정비비',      unit: 'monthly', monthly: (v: number) => v },
  { component: 'tax',         label: '자동차세',    unit: 'annual',  monthly: (v: number) => v / 12 },
  { component: 'inspection',  label: '검사비',      unit: 'annual',  monthly: (v: number) => v / 12 },
  { component: 'finance_rate',label: '금융금리',    unit: 'percent', monthly: (v: number) => v }, // 자체는 금리
  { component: 'registration',label: '등록비',      unit: 'fixed',   monthly: (v: number) => v / 36 }, // 36개월 분할 가정
]

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const carId = request.nextUrl.searchParams.get('car_id')
    if (!carId) return NextResponse.json({ error: 'car_id 필요' }, { status: 400 })

    // 1) 차량 정보
    const [cars] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, number, brand, model, year, fuel_type, vehicle_class, displacement, status
         FROM cars WHERE id = ?`,
      carId
    )
    if (!cars) return NextResponse.json({ error: '차량 없음' }, { status: 404 })

    // 2) 매칭 스코프 (모델 > 클래스)
    const modelScope = cars.brand && cars.model
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM cost_standards_scope
            WHERE scope_type = 'model' AND brand = ? AND model = ? LIMIT 1`,
          cars.brand, cars.model
        )
      : []
    const classScope = cars.vehicle_class && cars.fuel_type
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM cost_standards_scope
            WHERE scope_type = 'class' AND vehicle_class = ? AND fuel_type = ? LIMIT 1`,
          cars.vehicle_class, cars.fuel_type
        )
      : []
    const matchedScopes: { type: 'model' | 'class'; scope: any }[] = []
    if (modelScope[0]) matchedScopes.push({ type: 'model', scope: modelScope[0] })
    if (classScope[0]) matchedScopes.push({ type: 'class', scope: classScope[0] })

    // 3) 매칭 스코프의 cost_standards_value
    const scopeIds = matchedScopes.map(s => s.scope.id)
    const valueRows = scopeIds.length > 0
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT scope_id, component, unit, market_value, our_value, sample_count, market_synced_at, our_updated_at
             FROM cost_standards_value WHERE scope_id IN (${scopeIds.map(() => '?').join(',')})`,
          ...scopeIds
        )
      : []

    // 4) 차량별 실제 운영 평균 (최근 12개월)
    const [actuals] = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         AVG(NULLIF(actual_insurance, 0))    AS avg_ins_monthly,
         AVG(NULLIF(actual_maintenance, 0))  AS avg_maint_monthly,
         AVG(NULLIF(actual_tax, 0))          AS avg_tax_monthly,
         COUNT(*) AS sample_count,
         MIN(recorded_month) AS from_month,
         MAX(recorded_month) AS to_month
       FROM operational_actuals oa
       JOIN contracts c ON c.id = oa.contract_id
       WHERE c.car_id = ?
         AND oa.recorded_month >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 12 MONTH), '%Y-%m')`,
      carId
    )

    // 5) 컴포넌트별 통합 뷰
    const components = COMPONENTS.map(c => {
      // 모델 매칭 우선, 없으면 클래스
      let row: any = null
      let scopeType: 'model' | 'class' | null = null
      for (const s of matchedScopes) {
        const v = valueRows.find(r => r.scope_id === s.scope.id && r.component === c.component)
        if (v && (v.market_value !== null || v.our_value !== null)) {
          row = v; scopeType = s.type; break
        }
      }
      const market = row?.market_value !== null && row?.market_value !== undefined ? Number(row.market_value) : null
      const our    = row?.our_value !== null && row?.our_value !== undefined ? Number(row.our_value) : null

      // 실적 매칭 (insurance/maintenance/tax 만 actuals 있음)
      let actualMonthly: number | null = null
      if (c.component === 'insurance' && actuals?.avg_ins_monthly) actualMonthly = Number(actuals.avg_ins_monthly)
      else if (c.component === 'maintenance' && actuals?.avg_maint_monthly) actualMonthly = Number(actuals.avg_maint_monthly)
      else if (c.component === 'tax' && actuals?.avg_tax_monthly) actualMonthly = Number(actuals.avg_tax_monthly)

      // 편차 계산 (시장 vs 우리, 우리 vs 실제)
      const marketVsOurPct = (market !== null && our !== null && market > 0)
        ? ((our - market) / market) * 100 : null
      const ourVsActualPct = (our !== null && actualMonthly !== null && c.unit !== 'percent')
        ? (() => {
            const ourMonthly = c.monthly(our)
            return ourMonthly > 0 ? ((actualMonthly - ourMonthly) / ourMonthly) * 100 : null
          })()
        : null

      return {
        component: c.component,
        label: c.label,
        unit: c.unit,
        market_value: market,
        market_monthly: market !== null ? Math.round(c.monthly(market)) : null,
        our_value: our,
        our_monthly: our !== null ? Math.round(c.monthly(our)) : null,
        actual_monthly: actualMonthly !== null ? Math.round(actualMonthly) : null,
        market_vs_our_pct: marketVsOurPct !== null ? Math.round(marketVsOurPct * 10) / 10 : null,
        our_vs_actual_pct: ourVsActualPct !== null ? Math.round(ourVsActualPct * 10) / 10 : null,
        scope_type: scopeType,
        sample_count: row?.sample_count || 0,
        market_synced_at: row?.market_synced_at,
        our_updated_at: row?.our_updated_at,
      }
    })

    // 6) 영업프리셋 (sales_presets) — 영업가 시뮬용
    const presets = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, label, margin_rate, loan_interest_rate, is_default
         FROM sales_presets WHERE is_active = 1 ORDER BY sort_order ASC`
    )

    return NextResponse.json({
      ok: true,
      car: cars,
      matched_scopes: matchedScopes.map(s => ({ type: s.type, label: s.scope.display_label })),
      components,
      actuals: {
        sample_count: Number(actuals?.sample_count || 0),
        from_month: actuals?.from_month,
        to_month: actuals?.to_month,
      },
      presets,
    })
  } catch (e: any) {
    console.error('[vehicle-analysis] 실패:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
