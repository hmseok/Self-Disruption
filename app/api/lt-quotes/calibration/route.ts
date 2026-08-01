import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { loadCostReference } from '@/lib/quote-cost-data'

// ═══════════════════════════════════════════════════════════════════
// GET /api/lt-quotes/calibration — 견적 기준표 ↔ 실데이터 대조
//
// 2026-07-30 사용자 문제 제기: "기준표 기본값이 실데이터가 아니라 거리감이 있다.
//   우리의 현실적인 데이터와 맞춰야 한다."
//
// 실측 소스 (전부 기존 테이블 — 읽기 전용):
//   · 렌트료/매입가 비율: long_term_rentals(active) × cars 취득원가
//   · 보험 월액: insurance_contracts × insurance_vehicle_allocations (연보험료/12)
//   · 금융 월액: financial_products.monthly_payment
//   · 정비 월액: transactions(지출, 분류 정비·수리) 차량 매칭 건 최근 12개월 월평균
// 응답: 실측 분포(표본수/중앙값/평균/사분위) vs 기준표 요약
// ═══════════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}
async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try { return await fn() } catch { return [] }
}

function stats(values: number[]) {
  const v = values.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (v.length === 0) return { n: 0, median: null, mean: null, p25: null, p75: null }
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))]
  return {
    n: v.length,
    median: q(0.5),
    mean: Math.round(v.reduce((s, x) => s + x, 0) / v.length),
    p25: q(0.25),
    p75: q(0.75),
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const [rentRows, insRows, finRows, maintRows] = await Promise.all([
      // 실계약 렌트료 + 차량 취득원가 (비율 계산용)
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT l.monthly_fee, l.vehicle_car_number,
               COALESCE(NULLIF(c.total_cost, 0), NULLIF(c.purchase_price, 0)) AS acq_cost
          FROM long_term_rentals l
          LEFT JOIN cars c ON c.id = l.vehicle_id
         WHERE l.status = 'active' AND l.monthly_fee IS NOT NULL AND l.monthly_fee > 0`),
      // 실보험 — 차량 배분 기준 월액 (연보험료/12, 배분 차량 수로 나눔)
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT ic.id, ic.total_premium,
               (SELECT COUNT(*) FROM insurance_vehicle_allocations iva WHERE iva.contract_id = ic.id) AS car_count
          FROM insurance_contracts ic
         WHERE ic.total_premium IS NOT NULL AND ic.total_premium > 0`),
      // 실금융 — 월 납입액
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT monthly_payment FROM financial_products
         WHERE monthly_payment IS NOT NULL AND monthly_payment > 0`),
      // 실정비 — 차량 매칭된 정비·수리 지출, 최근 12개월 차량별 월평균
      safeQuery(() => prisma.$queryRaw<any[]>`
        SELECT ta.assignment_id AS car_id,
               SUM(t.amount) AS total,
               COUNT(DISTINCT DATE_FORMAT(t.transaction_date, '%Y-%m')) AS months
          FROM transactions t
          JOIN transaction_assignments ta
            ON ta.transaction_id = t.id AND ta.assignment_type = 'car'
         WHERE t.deleted_at IS NULL
           AND t.type = 'expense'
           AND (t.category LIKE '%정비%' OR t.category LIKE '%수리%')
           AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY ta.assignment_id`),
    ])

    // 렌트료/매입가 비율 (%) — 취득원가 있는 계약만
    const ratios = rentRows
      .filter(r => Number(r.acq_cost) > 0)
      .map(r => Math.round((Number(r.monthly_fee) / Number(r.acq_cost)) * 1000) / 10)
    // 실측 월렌트료 자체 분포
    const rents = rentRows.map(r => Number(r.monthly_fee))
    // 보험 월액 — 계약 연보험료 / 12 / 배분 차량 수 (배분 0 이면 1대로)
    const insMonthly = insRows.map(r => Number(r.total_premium) / 12 / Math.max(Number(r.car_count) || 1, 1))
    const finMonthly = finRows.map(r => Number(r.monthly_payment))
    const maintMonthly = maintRows
      .filter(r => Number(r.months) > 0)
      .map(r => Number(r.total) / Number(r.months))

    // 기준표 요약 (엔진이 실제 쓰는 값)
    let reference: Record<string, unknown> | null = null
    try {
      const ref = await loadCostReference()
      reference = serialize(ref as unknown as Record<string, unknown>)
    } catch { /* 기준표 미적용 환경 — 실측만 반환 */ }

    return NextResponse.json({
      data: serialize({
        measured: {
          activeRentals: rentRows.length,
          rentalsWithAcqCost: ratios.length,
          rentToPriceRatioPct: stats(ratios),   // 월렌트료/취득원가 (%)
          monthlyRent: stats(rents),            // 실계약 월렌트료 (원)
          insuranceMonthly: stats(insMonthly),  // 차량 1대당 보험 월액 (원)
          financeMonthly: stats(finMonthly),    // 할부 월 납입액 (원)
          maintenanceMonthly: stats(maintMonthly), // 차량별 정비 월평균 (원)
        },
        reference,
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/lt-quotes/calibration]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
