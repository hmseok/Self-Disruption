// ═══════════════════════════════════════════════════════════════════
// lib/pnl-engine.ts — 손익 계산 엔진 (REDESIGN 5단계, 2026-08-01 신설)
//
// 원칙: "숫자는 한 곳에서만 계산한다"
//   차량 손익탭 / 손익 페이지 / (향후) 정산 검증이 모두 본 엔진을 소비.
//   기준: 장부(transactions)의 실거래 — 확정(completed) 건만.
//
// 손익 정의 (목업 fmi-erp-redesign 손익 화면):
//   매출  = 차량 매칭 수입 + 대차(fmi_rental) 연결 수입
//   비용  = 차량 매칭 지출 (자본성 거래 제외)
//   정산 지급 = 지입/투자 지급 지출 (차량 귀속)
//   순이익 = 매출 − 비용 − 정산 지급
//
// 자본성 제외 (CAPITAL_CATEGORIES): 차량 구입·매각, 보증금 수수 등 자산 이동.
//   ※ 할부 납입(할부상환)은 v1 에서 전액 비용(현금주의) — 원금/이자 분리는
//     상환스케줄 데이터 확보 후 v2 (QUOTE-ENGINE-NOTES 참조).
//
// 차량 귀속 규칙 (우선순위 합집합, 중복 제거):
//   1) transactions.related_type='car' AND related_id = 차량 id
//   2) transaction_assignments.assignment_type='car' (5차원 분리 매칭)
//   3) transactions.related_type='fmi_rental' → fmi_rentals.vehicle_id (대차 매출/비용)
//   4) 지입/투자 지급: related_type IN ('jiip','jiip_share','invest') →
//      jiip_contracts.car_id / general_investments.car_id
// ═══════════════════════════════════════════════════════════════════

import { prisma } from './prisma'

export const CAPITAL_CATEGORIES = new Set([
  // 카드대금 자동이체 — 카드 지출이 건별(excel/sms)로 이미 비용 계상되어 이중 방지 (2026-08-05)
  '카드대금 결제',
  '차량구입', '차량 구입', '차량매입', '차량매각', '차량 매각',
  '보증금', '보증금 반환', '대출실행', '대출 실행',
  // 투자 원금 흐름 — 손익 아님 (2026-08-05 사용자 확정: 입금=투자, 지출=회수)
  '투자 입금', '투자금 회수', '대출 상환', '세금 환급',
])

export interface CarPnl {
  carId: string
  number: string | null
  brand: string | null
  model: string | null
  status: string | null
  ownershipType: string | null
  revenue: number
  rentalRevenue: number      // 매출 중 대차(fmi_rental) 연결분
  expense: number
  settlementPayout: number   // 지입/투자 지급
  netProfit: number
  profitRate: number | null  // % (매출 0 이면 null)
  txCount: number
  byCategory: Record<string, number>  // 비용 카테고리별 (지급 제외)
}

export interface PnlResult {
  from: string
  to: string
  cars: CarPnl[]
  totals: {
    revenue: number
    expense: number
    settlementPayout: number
    netProfit: number
    profitRate: number | null
    excludedCapital: number   // 자본성으로 제외된 금액 합계 (참고 표시용)
  }
  unassigned: { revenue: number; expense: number; count: number } // 차량 미귀속 거래 (참고)
}

type TxRow = {
  id: string
  transaction_date: Date | string | null
  type: string | null
  amount: unknown
  category: string | null
  related_type: string | null
  related_id: string | null
}

const N = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function calculatePnl(from: string, to: string): Promise<PnlResult> {
  // ── 1) 기간 내 확정 거래 (Prisma 타입드 — 규칙 8) ──
  const txs = await prisma.transaction.findMany({
    where: {
      deleted_at: null,
      OR: [{ status: null }, { status: 'completed' }],
      transaction_date: { gte: new Date(from + 'T00:00:00'), lte: new Date(to + 'T23:59:59') },
    },
    select: {
      id: true, transaction_date: true, type: true, amount: true,
      category: true, related_type: true, related_id: true,
    },
  }) as unknown as TxRow[]

  // ── 2) 보조 매핑 로드 ──
  const [cars, assignments, rentals, jiips, invests] = await Promise.all([
    prisma.car.findMany({ select: { id: true, number: true, brand: true, model: true, status: true, ownership_type: true } }),
    prisma.transactionAssignment.findMany({
      where: { assignment_type: 'car', transaction_id: { in: txs.map(t => t.id) } },
      select: { transaction_id: true, assignment_id: true },
    }),
    prisma.fmiRental.findMany({ select: { id: true, vehicle_id: true } }),
    // jiip_contracts.id 는 DB 실체가 숫자 (schema String 드리프트) — raw 로 문자열 변환 조회
    prisma.$queryRaw<Array<{ id: string; car_id: string | null }>>`
      SELECT CAST(id AS CHAR) AS id, car_id FROM jiip_contracts`,
    prisma.$queryRaw<Array<{ id: string; car_id: string | null }>>`
      SELECT CAST(id AS CHAR) AS id, car_id FROM general_investments`,
  ])

  const rentalToCar = new Map(rentals.filter(r => r.vehicle_id).map(r => [r.id, r.vehicle_id as string]))
  const jiipToCar = new Map(jiips.filter(j => j.car_id).map(j => [j.id, j.car_id as string]))
  const investToCar = new Map(invests.filter(i => i.car_id).map(i => [i.id, i.car_id as string]))
  const assignByTx = new Map<string, string>()
  for (const a of assignments) if (!assignByTx.has(a.transaction_id)) assignByTx.set(a.transaction_id, a.assignment_id)

  // ── 3) 거래 → 차량 귀속 ──
  const perCar = new Map<string, CarPnl>()
  const carById = new Map(cars.map(c => [c.id, c]))
  const ensure = (carId: string): CarPnl => {
    let p = perCar.get(carId)
    if (!p) {
      const c = carById.get(carId)
      p = {
        carId, number: c?.number ?? null, brand: c?.brand ?? null, model: c?.model ?? null,
        status: c?.status ?? null, ownershipType: c?.ownership_type ?? null,
        revenue: 0, rentalRevenue: 0, expense: 0, settlementPayout: 0,
        netProfit: 0, profitRate: null, txCount: 0, byCategory: {},
      }
      perCar.set(carId, p)
    }
    return p
  }

  let excludedCapital = 0
  const unassigned = { revenue: 0, expense: 0, count: 0 }

  for (const t of txs) {
    const amt = N(t.amount)
    if (amt <= 0) continue
    const cat = (t.category || '').trim()
    const isIncome = t.type === 'income'

    // 자본성 거래 — 손익 제외 (금액만 집계해 참고 표시)
    if (cat && CAPITAL_CATEGORIES.has(cat)) { excludedCapital += amt; continue }

    // 귀속 차량 결정
    let carId: string | null = null
    let isRental = false
    let isPayout = false
    if (t.related_type === 'car' && t.related_id && carById.has(t.related_id)) {
      carId = t.related_id
    } else if (t.related_type === 'fmi_rental' && t.related_id && rentalToCar.has(t.related_id)) {
      carId = rentalToCar.get(t.related_id)!
      isRental = true
    } else if ((t.related_type === 'jiip' || t.related_type === 'jiip_share') && t.related_id && jiipToCar.has(t.related_id)) {
      carId = jiipToCar.get(t.related_id)!
      isPayout = !isIncome
    } else if (t.related_type === 'invest' && t.related_id && investToCar.has(t.related_id)) {
      carId = investToCar.get(t.related_id)!
      isPayout = !isIncome
    } else if (assignByTx.has(t.id)) {
      carId = assignByTx.get(t.id)!
    }

    if (!carId) {
      unassigned.count += 1
      if (isIncome) unassigned.revenue += amt
      else unassigned.expense += amt
      continue
    }

    const p = ensure(carId)
    p.txCount += 1
    if (isIncome) {
      p.revenue += amt
      if (isRental) p.rentalRevenue += amt
    } else if (isPayout) {
      p.settlementPayout += amt
    } else {
      p.expense += amt
      const key = cat || '기타'
      p.byCategory[key] = (p.byCategory[key] || 0) + amt
    }
  }

  // ── 3b) 빌려타(지입) 정산 흐름 (2026-08-03 사용자 승인 — 고정비 연결 ②) ──
  //   지입차 수입/지입료는 통장을 거치지 않는 정산 상계 구조 → 정산 테이블이 원천.
  //   수입: ride_settlement_deposits(입금일 기준) / 비용: ride_settlement_fees(월렌트료, 정산월 기준)
  try {
    const digits = (s: unknown) => String(s || '').replace(/[^0-9]/g, '')
    const carByDigits = new Map(cars.filter(c => c.number).map(c => [digits(c.number), c.id]))
    const [rideDeposits, rideFees] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ vehicle_number: string | null; amt: unknown }>>(
        `SELECT vehicle_number, SUM(amount) amt FROM ride_settlement_deposits
          WHERE deposit_date BETWEEN ? AND ? GROUP BY vehicle_number`, from, to),
      prisma.$queryRawUnsafe<Array<{ vehicle_number: string; monthly_fee: unknown }>>(
        `SELECT vehicle_number, SUM(monthly_fee) monthly_fee FROM ride_settlement_fees
          WHERE STR_TO_DATE(CONCAT(settle_month,'-01'),'%Y-%m-%d') BETWEEN ? AND ?
          GROUP BY vehicle_number`, from.slice(0, 8) + '01', to),
    ])
    for (const d of rideDeposits) {
      const carId = carByDigits.get(digits(d.vehicle_number))
      const amt = N(d.amt)
      if (!carId || amt <= 0) { unassigned.revenue += amt; unassigned.count += 1; continue }
      const p = ensure(carId)
      p.revenue += amt
      p.rentalRevenue += amt
      p.txCount += 1
    }
    for (const f of rideFees) {
      const carId = carByDigits.get(digits(f.vehicle_number))
      const amt = N(f.monthly_fee)
      if (!carId || amt <= 0) continue
      const p = ensure(carId)
      p.expense += amt
      p.byCategory['지입료(월렌트)'] = (p.byCategory['지입료(월렌트)'] || 0) + amt
      p.txCount += 1
    }
  } catch { /* 정산 테이블 미생성 — 통장 거래만으로 산출 (기존 동작) */ }

  // ── 4) 파생값 + 정렬 (수익률 낮은 순 — 목업 기본) ──
  const list = [...perCar.values()].map(p => {
    p.netProfit = p.revenue - p.expense - p.settlementPayout
    p.profitRate = p.revenue > 0 ? Math.round((p.netProfit / p.revenue) * 1000) / 10 : null
    return p
  }).sort((a, b) => (a.profitRate ?? -Infinity) - (b.profitRate ?? -Infinity))

  const totals = list.reduce((s, p) => ({
    revenue: s.revenue + p.revenue,
    expense: s.expense + p.expense,
    settlementPayout: s.settlementPayout + p.settlementPayout,
    netProfit: s.netProfit + p.netProfit,
    profitRate: null as number | null,
    excludedCapital,
  }), { revenue: 0, expense: 0, settlementPayout: 0, netProfit: 0, profitRate: null as number | null, excludedCapital })
  totals.profitRate = totals.revenue > 0 ? Math.round((totals.netProfit / totals.revenue) * 1000) / 10 : null

  return { from, to, cars: list, totals, unassigned }
}
