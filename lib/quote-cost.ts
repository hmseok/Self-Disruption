/**
 * lib/quote-cost.ts — PR-Q2-2
 *
 * 장기렌트 견적 원가 산출 wrapper.
 * rent-calc-engine.ts (1,593줄) 의 calculateRentCost / calculateAcquisitionCost
 * 를 단순 입력 인터페이스로 wrap.
 *
 * 영업이 입력하는 최소 8개 필드만 받아 7대 원가 + 마진 + IRR 산출.
 * 14개 기준표 reference 는 quote-cost-data.ts 의 loadCostReference() 로 별도 fetch.
 *
 * 사용:
 *   const ref = await loadCostReference()
 *   const result = calculateQuoteCost({
 *     purchase_price: 35_000_000,
 *     brand: '현대', model: '쏘나타', fuel: 'gasoline', engine_cc: 1999,
 *     term_months: 36, annual_km: 20000, rent_type: 'return',
 *   }, ref)
 *   // result.suggested_rent_with_vat / cost_breakdown / margin_rate / irr_annual
 */

import { calculateRentCost, calculateAcquisitionCost, type CalcInput, type CalcResult } from './rent-calc-engine'
import type { CostReference } from './quote-cost-data'

// ── 입력 ─────────────────────────────────────────────
export interface QuoteCostInput {
  // 필수 8개 — 영업이 모달에서 입력
  purchase_price: number              // 매입가 (할인 후 실제 매입가, VAT 포함)
  brand: string                       // 현대 / 기아 / BMW ...
  model: string
  fuel: 'gasoline' | 'diesel' | 'hybrid' | 'ev'
  engine_cc: number                   // 1999 / 2497 ...
  term_months: 24 | 36 | 48 | 60
  annual_km: number                   // 15000 / 20000 / 30000
  rent_type: 'return' | 'buyout'      // 반납형 / 인수형

  // 선택 — 영업이 협상 시 조정
  deposit?: number                    // 보증금 (할인 적용)
  upfront_months?: number             // 선납월수 (할인 적용)
  year?: number                       // 연식 (default: 올해)
  registration_region?: string        // 등록 지역 (default: '서울')
}

// ── 출력 ─────────────────────────────────────────────
export interface QuoteCostResult {
  cost_breakdown: {
    depreciation: number          // 월
    finance: number
    insurance: number
    maintenance: number
    tax_inspection: number
    risk: number
    overhead: number
    discount: number              // 보증금/선납 할인 (음수 또는 0)
    total: number                 // 합계 (월)
  }
  suggested_rent: number          // 적정가 (VAT 별도)
  suggested_rent_with_vat: number // 적정가 (VAT 포함) ← UI 표시 핵심
  vat_amount: number
  margin_rate: number             // %
  irr_annual: number              // %
  breakeven_months: number
  competitive_index: number       // 1.0=시장평균, <1.0=우위
  rent_to_price_ratio: number     // %

  // 부가 — 영업이 협상가 입력 시 마진 재산출용
  acquisition_total: number       // 취득원가 합계 (매입가+취득세+공채+탁송 등)
}

// ── 한국어 연료명 ↔ ENUM 매핑 ──────────────────────────
function fuelToKor(f: QuoteCostInput['fuel']): string {
  switch (f) {
    case 'gasoline': return '가솔린'
    case 'diesel':   return '디젤'
    case 'hybrid':   return '하이브리드'
    case 'ev':       return '전기'
    default:         return '가솔린'
  }
}

// ── 안전 숫자 ────────────────────────────────────────
function n(v: any, def = 0): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : def
}

// ── 메인 ─────────────────────────────────────────────
export function calculateQuoteCost(input: QuoteCostInput, ref: CostReference): QuoteCostResult {
  const r = ref.rules
  const loanRate = n(r.LOAN_INTEREST_RATE, 6.5)
  const investmentRate = n(r.INVESTMENT_RETURN_RATE, 4.0)
  const ltvDefault = n(r.LOAN_LTV_DEFAULT, 70)
  const loanAmount = Math.round(input.purchase_price * ltvDefault / 100)

  const fuelKor = fuelToKor(input.fuel)

  // 취득원가 (acquisition)
  const acq = calculateAcquisitionCost({
    purchase_price: input.purchase_price,
    engine_cc: input.engine_cc,
    model: input.model,
    fuel: fuelKor,
    is_commercial: true,
    registration_region: input.registration_region || '서울',
    reg_costs: ref.reg_costs,
  })

  // CalcInput 구성 (rent-calc-engine 이 요구하는 형태)
  const calcInput: CalcInput = {
    vehicle: {
      brand: input.brand,
      model: input.model,
      fuel: fuelKor,
      engine_cc: input.engine_cc,
      // 출고가 ≈ 매입가 × 1.15 (할인 역산 — 시장가 추정)
      factory_price: Math.round(input.purchase_price * 1.15),
      purchase_price: input.purchase_price,
      year: input.year || new Date().getFullYear(),
      mileage: 0,
      is_commercial: true,
    },
    contract: {
      term_months: input.term_months,
      car_age_mode: 'new',
      custom_car_age: 0,
      contract_type: input.rent_type,
      residual_rate: input.rent_type === 'buyout' ? 60 : 100,
      buyout_premium: 0,
      annual_mileage: input.annual_km / 10000,  // 만 단위
      baseline_km: 2.0,
    },
    depreciation: {
      curve_preset: 'db_based',
      popularity_grade: 'B등급 (일반)',
    },
    finance: {
      loan_amount: loanAmount,
      loan_rate: loanRate,
      investment_rate: investmentRate,
    },
    insurance: {
      auto_mode: true,
      monthly_cost: 0,
      driver_age: '26세이상',
      deductible: n(r.DEDUCTIBLE_AMOUNT, 500_000),
      own_damage_ratio: 100,
    },
    maintenance: {
      package: 'basic',
      oil_change_freq: 1,
      monthly_cost: 0,
    },
    tax: {
      annual_tax: 0,
      engine_cc: input.engine_cc,
      registration_region: input.registration_region || '서울',
    },
    risk: {
      rate: n(r.RISK_RESERVE_RATE, 2.0),
    },
    overhead: {
      overhead_rate: n(r.OVERHEAD_RATE, 5),
      margin: n(r.DEFAULT_MARGIN_RATE) ? n(r.DEFAULT_MARGIN_RATE) * 10_000 : 100_000,
      insurance_loading: n(r.INSURANCE_LOADING, 15),
    },
    deposit_prepay: {
      deposit: n(input.deposit),
      prepayment: n(input.upfront_months) * 0,  // 선납월수는 계산 단계에서 활용
      deposit_discount_rate: 0,
      prepayment_discount_rate: 0,
    },
    acquisition: {
      total_cost: acq.total,
      acquisition_tax: acq.acquisition_tax,
      bond_cost: acq.bond_cost,
      delivery_fee: acq.delivery_fee,
      misc_fee: acq.misc_fee,
    },
    reference: {
      dep_rates: ref.dep_rates,
      dep_adjustments: ref.dep_adjustments,
      dep_db: ref.dep_db,
      tax_rates: ref.tax_rates,
      reg_costs: ref.reg_costs,
      inspection_costs: ref.inspection_costs,
      inspection_schedules: ref.inspection_schedules,
      ins_base_premiums: ref.ins_base_premiums,
      ins_own_rates: ref.ins_own_rates,
      insurance_rates: ref.insurance_rates,
      finance_rates: ref.finance_rates,
      maintenance_costs: ref.maintenance_costs,
    },
    rules: r,
  }

  const result: CalcResult = calculateRentCost(calcInput)

  // breakdown 합계
  const bd = result.breakdown
  const total =
    n(bd.depreciation.monthly) + n(bd.finance.monthly) + n(bd.insurance.monthly) +
    n(bd.maintenance.monthly) + n(bd.tax_inspection.monthly) + n(bd.risk.monthly) +
    n(bd.overhead.monthly) + n(bd.discount.monthly)

  return {
    cost_breakdown: {
      depreciation: Math.round(n(bd.depreciation.monthly)),
      finance: Math.round(n(bd.finance.monthly)),
      insurance: Math.round(n(bd.insurance.monthly)),
      maintenance: Math.round(n(bd.maintenance.monthly)),
      tax_inspection: Math.round(n(bd.tax_inspection.monthly)),
      risk: Math.round(n(bd.risk.monthly)),
      overhead: Math.round(n(bd.overhead.monthly)),
      discount: Math.round(n(bd.discount.monthly)),
      total: Math.round(total),
    },
    suggested_rent: Math.round(n(result.suggested_rent)),
    suggested_rent_with_vat: Math.round(n(result.rent_with_vat)),
    vat_amount: Math.round(n(result.vat_amount)),
    margin_rate: Math.round(n(result.market_analysis?.margin_rate) * 10) / 10,
    irr_annual: Math.round(n(result.irr_result?.annualIRR) * 10) / 10,  // calcIRR.annualIRR 은 이미 % (예: 19.7) — 소수1자리 반올림만 (구버전 ×100 → 100배 과대 버그 수정)
    breakeven_months: Math.round(n(result.market_analysis?.breakeven_months)),
    competitive_index: Math.round(n(result.market_analysis?.competitive_index) * 100) / 100,
    rent_to_price_ratio: Math.round(n(result.market_analysis?.rent_to_price_ratio) * 100) / 100,
    acquisition_total: Math.round(acq.total),
  }
}

// ── 협상가 입력 시 마진 재산출 (월 렌트료 → 마진율 역산) ──
export function recomputeMarginRate(
  monthly_fee_with_vat: number,  // 영업이 입력한 협상가 (VAT 포함)
  acquisition_total: number,
  cost_total_monthly: number,
  term_months: number,
): { margin_amount: number; margin_rate: number } {
  // VAT 별도 환산
  const monthly_fee_excl_vat = Math.round(monthly_fee_with_vat / 1.1)
  const margin_amount = monthly_fee_excl_vat - cost_total_monthly  // 월 마진
  const total_margin = margin_amount * term_months                 // 계약 전체 마진
  // 마진율 = 전체 마진 / 취득원가 × 100
  const margin_rate = acquisition_total > 0
    ? Math.round((total_margin / acquisition_total) * 1000) / 10
    : 0
  return { margin_amount, margin_rate }
}
