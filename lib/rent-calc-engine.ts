/**
 * rent-calc-engine.ts
 * ─────────────────────────────────────────────────────────
 * 렌트 원가 계산 엔진 v2.0
 *
 * 설계 원칙:
 *  1. 순수함수: 모든 입력은 인자, 모든 출력은 리턴값 (사이드이펙트 없음)
 *  2. 원가 7대 요소 구조화: 감가 / 금융 / 보험 / 정비 / 세금·검사 / 리스크 / 간접비
 *  3. DB 우선, 폴백 명시: 모든 계산에서 DB값 → 하드코딩 폴백 순서
 *  4. 시장 현실성: 실 업계 데이터 기반, 영업용 세율 정확 반영
 *  5. 감사추적: 모든 계산 결과에 source(출처)와 formula(공식) 포함
 *
 * 평가 기준:
 *  1. 견적 포함항목 완전성
 *  2. 원가 신뢰성 (계산 정확도)
 *  3. 현실성 (시장 반영도)
 *  4. 사업성 (수익구조)
 *  5. 시장성 (경쟁력)
 *  6. 원가작성 용이성 (UX)
 *  7. 실제 운영 학습 (피드백 루프)
 * ─────────────────────────────────────────────────────────
 */

import {
  mapToDepAxes,
  getInsVehicleClass,
  estimateInsurance,
  mapToMaintenanceType,
  getMaintCostPerKm,
  buildCurveFromDbRates,
  getDepRateFromCurve,
  calcIRR,
  getExcessMileageRateFromTerms,
  getExcessMileageRateFallback,
  INS_BASE_ANNUAL,
  INS_OWN_DAMAGE_RATE,
  DEP_CURVE_PRESETS,
  DEP_CLASS_MULTIPLIER,
  MAINTENANCE_PACKAGES,
  MAINT_MULTIPLIER,
  type DepCurvePreset,
  type MaintenancePackage,
} from './rent-calc'

import type {
  DepAxes,
  InsVehicleClass,
  DriverAgeGroup,
} from './rent-calc-types'

import { IMPORT_BRANDS, EV_FUEL_KEYWORDS, EV_MODEL_KEYWORDS } from './rent-calc-types'

// ============================================================
// 타입 정의
// ============================================================

/** 계산 입력: 7대 원가요소 + 차량정보 + 기준표 */
export interface CalcInput {
  // ── 차량 기본 ──
  vehicle: {
    brand: string
    model: string
    trim?: string
    fuel?: string
    year?: number
    engine_cc: number
    factory_price: number
    purchase_price: number
    mileage: number           // km (현재 주행거리)
    purchase_mileage?: number // km (구입 시 주행거리, 중고차)
    is_commercial: boolean    // 영업용 여부 (기본 true)
  }

  // ── 계약 조건 ──
  contract: {
    term_months: number
    car_age_mode: 'new' | 'used'
    custom_car_age: number      // 연식차량일 때 수동 차령
    contract_type: 'return' | 'buyout'
    residual_rate: number       // 잔존가치 설정율 % (인수형)
    buyout_premium: number      // 인수형 추가마진 (원/월)
    annual_mileage: number      // 만km/년 (약정주행)
    baseline_km: number         // 만km/년 (0% 감가 기준)

    // ── v2.1 신규 (모두 optional, 기본값은 기존 동작 유지) ──
    /** 계약 원천 — owned: 자체보유, external_rent: 외부렌탈, lease: 리스 (default: owned) */
    contract_source?: 'owned' | 'external_rent' | 'lease'
    /** 렌트 기간 분류 — longterm/shortterm/subscription (default: longterm) */
    rental_term?: 'longterm' | 'shortterm' | 'subscription'
    /** 가동률 % — 단기에서만 원가 보정 적용 (default: 100) */
    utilization_rate?: number
    /** 외부렌탈 월렌탈료 (contract_source === 'external_rent'일 때만 사용) */
    external_rent_monthly?: number
  }

  // ── 1. 감가 설정 ──
  depreciation: {
    curve_preset: DepCurvePreset
    custom_curve?: number[]
    class_override?: string     // 차종 클래스 수동 오버라이드
    origin_override?: string
    vehicle_class_override?: string
    fuel_type_override?: string
    popularity_grade: string
  }

  // ── 2. 금융 설정 ──
  finance: {
    loan_amount: number
    loan_rate: number           // 연이자율 %
    investment_rate: number     // 기회비용 %
  }

  // ── 3. 보험 설정 ──
  insurance: {
    auto_mode: boolean
    monthly_cost: number        // 직접입력 시
    driver_age: DriverAgeGroup
    deductible: number
    own_damage_ratio: number    // 자차보장비율 %
  }

  // ── 4. 정비 설정 ──
  maintenance: {
    package: MaintenancePackage
    oil_change_freq: 1 | 2
    monthly_cost: number        // 직접입력 시
  }

  // ── 5. 세금·검사 설정 ──
  tax: {
    annual_tax: number          // 직접입력 시 (0이면 자동계산)
    engine_cc: number
    registration_region: string
  }

  // ── 6. 리스크 설정 ──
  risk: {
    rate: number                // 리스크 적립률 %
  }

  // ── 7. 간접비·마진 설정 ──
  overhead: {
    overhead_rate: number       // 간접비율 % (인건비, 사무실, 시스템 등)
    margin: number              // 마진 (원/월)
    insurance_loading: number   // 보험 로딩율 %
  }

  // ── 보증금/선납금 ──
  deposit_prepay: {
    deposit: number
    prepayment: number
    deposit_discount_rate: number   // %
    prepayment_discount_rate: number // %
  }

  // ── 취득원가 (외부에서 계산된 값, 0이면 자동계산) ──
  acquisition: {
    total_cost: number          // 총 취득원가 (0이면 자동)
    acquisition_tax: number
    bond_cost: number
    delivery_fee: number
    misc_fee: number
  }

  // ── 기준표 데이터 (DB에서 로드됨) ──
  reference: {
    dep_rates: any[]
    dep_adjustments: any[]
    dep_db: any[]               // legacy depreciation_db
    tax_rates: any[]
    reg_costs: any[]
    inspection_costs: any[]
    inspection_schedules: any[]
    ins_base_premiums: any[]
    ins_own_rates: any[]
    insurance_rates: any[]
    finance_rates: any[]
    maintenance_costs: any[]      // maintenance_cost_table (차종별 정비 단가)
    terms_config?: {
      calc_params: Record<string, any>
    }
    /** v2.1 신규 — 외부시세 (vehicle_market_price, optional) */
    vehicle_market_prices?: any[]
  }

  // ── BusinessRules ──
  rules: Record<string, number>
}

/** 원가 항목별 계산 결과 (감사추적 포함) */
export interface CostItem {
  label: string
  monthly: number
  annual?: number
  source: 'db' | 'calc' | 'fallback' | 'manual'
  formula?: string
  details?: Record<string, any>
}

/** 7대 원가 카테고리별 결과 */
export interface CostBreakdown {
  depreciation: CostItem
  finance: CostItem & {
    loan_interest: number
    opportunity_cost: number
    avg_loan_balance: number
    avg_equity_balance: number
  }
  insurance: CostItem & {
    base_premium: number
    own_damage_premium: number
    loading_amount: number
  }
  maintenance: CostItem
  tax_inspection: CostItem & {
    monthly_tax: number
    monthly_inspection: number
    annual_tax: number
    inspections_in_term: number
  }
  risk: CostItem
  overhead: CostItem
  discount: CostItem & {
    deposit_discount: number
    prepayment_discount: number
  }
}

/** 감가 분석 결과 */
export interface DepreciationAnalysis {
  car_age: number
  axes: DepAxes | null
  effective_axes: DepAxes | null
  matched_db_rate: any | null
  active_curve: number[]
  class_multiplier: number
  adjustment_factor: number
  // 현재 시점
  year_dep_now: number
  mileage_dep_now: number
  total_dep_rate_now: number
  current_market_value: number
  // 종료 시점
  year_dep_end: number
  mileage_dep_end: number
  total_dep_rate_end: number
  end_market_value: number
  effective_end_market_value: number
  // 잔존가치
  residual_value: number
  buyout_price: number
  cost_base: number
}

/** 전체 계산 결과 */
export interface CalcResult {
  // 원가 구조
  breakdown: CostBreakdown
  // 감가 상세
  depreciation_analysis: DepreciationAnalysis
  // 합계
  total_monthly_cost: number
  suggested_rent: number
  rent_with_vat: number
  vat_amount: number
  // 투자분석
  irr_result: { monthlyIRR: number; annualIRR: number; totalReturn: number; multiple: number } | null
  // 시장비교
  excess_mileage_rate: number
  excess_mileage_source: 'terms_db' | 'fallback'
  // 시장 경쟁력 분석
  market_analysis: {
    rent_to_price_ratio: number       // 월렌탈료 / 차량가 비율 (%)
    annual_cost_ratio: number         // 연간총비용 / 차량가 비율 (%)
    cost_structure_pct: {             // 원가 구성 비중 (%)
      depreciation: number
      finance: number
      insurance: number
      maintenance: number
      tax_inspection: number
      risk: number
      overhead: number
    }
    breakeven_months: number          // 손익분기 월수 (IRR 기준)
    competitive_index: number         // 경쟁력 지수 (1.0 = 시장 평균, <1.0 = 우위)
    margin_rate: number               // 마진율 (%)
  }
  // 메타
  calculation_version: string
  calculated_at: string
}

// ============================================================
// 유틸리티 함수
// ============================================================

/** 안전한 숫자 변환 */
function n(val: any, fallback: number = 0): number {
  const num = Number(val)
  return isNaN(num) || !isFinite(num) || Math.abs(num) >= 1e15 ? fallback : num
}

// ============================================================
// 🔴 자동차세 계산 (세법 정확 반영)
// ============================================================
/**
 * 영업용 자동차세 (지방세법 시행령 제131조)
 * - 배기량 1,000cc 이하: 18원/cc
 * - 배기량 1,001~1,600cc: 18원/cc
 * - 배기량 1,601cc 이상: 19원/cc  ← 핵심 수정! (기존 18원 일괄 적용 → 구간별 차등)
 * - 교육세: 영업용 비과세
 *
 * 비영업용 자동차세 (참고용)
 * - 1,000cc 이하: 80원/cc + 교육세 30%
 * - 1,001~1,600cc: 140원/cc + 교육세 30%
 * - 1,601cc 이상: 200원/cc + 교육세 30%
 *
 * 전기차 (지방세법 시행령 제131조의2)
 * - 영업용: 연 20,000원 (교육세 비과세)
 * - 비영업용: 연 130,000원 + 교육세 30% = 169,000원
 */
export function calculateVehicleTax(
  engineCC: number,
  fuelCategory: '전기' | '내연기관',
  isCommercial: boolean,
  taxRates: any[]
): { annual: number; source: 'db' | 'fallback'; formula: string } {
  // 1순위: DB 기준표 조회
  const taxType = isCommercial ? '영업용' : '비영업용'
  const taxRecord = taxRates.find((r: any) =>
    r.tax_type === taxType &&
    r.fuel_category === fuelCategory &&
    engineCC >= r.cc_min && engineCC <= r.cc_max
  )

  if (taxRecord) {
    let tax = 0
    if (taxRecord.fixed_annual > 0) {
      tax = n(taxRecord.fixed_annual)
    } else {
      tax = Math.round(engineCC * n(taxRecord.rate_per_cc))
    }
    // 교육세 적용
    tax = Math.round(tax * (1 + n(taxRecord.education_tax_rate) / 100))
    return { annual: tax, source: 'db', formula: `DB: ${taxType} ${fuelCategory} ${engineCC}cc` }
  }

  // 2순위: 법정 세율 폴백 (정확한 구간별 차등)
  if (fuelCategory === '전기') {
    if (isCommercial) {
      return { annual: 20000, source: 'fallback', formula: '영업용 전기차: 연 2만원 (교육세 비과세)' }
    } else {
      return { annual: Math.round(130000 * 1.3), source: 'fallback', formula: '비영업용 전기차: 13만원 × 1.3 = 169,000원' }
    }
  }

  if (isCommercial) {
    // 🔴 핵심 수정: 영업용 배기량 구간별 세율
    let rate: number
    let desc: string
    if (engineCC <= 1000) {
      rate = 18
      desc = '1,000cc 이하: 18원/cc'
    } else if (engineCC <= 1600) {
      rate = 18
      desc = '1,001~1,600cc: 18원/cc'
    } else {
      rate = 19  // ← 기존 버그 수정 (18원→19원)
      desc = '1,601cc 이상: 19원/cc'
    }
    const tax = engineCC * rate
    return { annual: tax, source: 'fallback', formula: `영업용 내연: ${desc} = ${tax}원 (교육세 비과세)` }
  } else {
    // 비영업용 (참고)
    let rate: number
    if (engineCC <= 1000) rate = 80
    else if (engineCC <= 1600) rate = 140
    else rate = 200
    const tax = Math.round(engineCC * rate * 1.3) // 교육세 30%
    return { annual: tax, source: 'fallback', formula: `비영업용: ${rate}원/cc × ${engineCC}cc × 1.3 = ${tax}원` }
  }
}

// ============================================================
// 정기검사 비용 계산
// ============================================================
export function calculateInspection(
  carAge: number,
  termMonths: number,
  vehicleClass: string,
  fuelType: string,
  region: string,
  inspectionCosts: any[],
  inspectionSchedules: any[]
): {
  monthly: number
  total: number
  count: number
  cost_per_time: number
  interval_months: number
  source: 'db' | 'fallback'
} {
  // 검사비용 조회 (단계적 fallback)
  const inspCost =
    inspectionCosts.find((r: any) => r.vehicle_class === vehicleClass && r.fuel_type === fuelType && r.inspection_type === '종합검사' && r.region === region) ||
    inspectionCosts.find((r: any) => r.vehicle_class === vehicleClass && r.fuel_type === fuelType && r.inspection_type === '종합검사' && r.region === '전국') ||
    inspectionCosts.find((r: any) => r.vehicle_class === vehicleClass && r.fuel_type === '전체' && r.inspection_type === '종합검사' && r.region === region) ||
    inspectionCosts.find((r: any) => r.vehicle_class === vehicleClass && r.fuel_type === '전체' && r.inspection_type === '종합검사' && r.region === '전국')
  const costPerTime = n(inspCost?.total_cost, 65000)
  const source: 'db' | 'fallback' = inspCost ? 'db' : 'fallback'

  // 검사 주기 조회 함수
  const getInterval = (ageYr: number): number => {
    const rec =
      inspectionSchedules.find((r: any) => r.vehicle_usage === '사업용_승용' && r.fuel_type === fuelType && ageYr >= r.age_from && ageYr <= r.age_to) ||
      inspectionSchedules.find((r: any) => r.vehicle_usage === '사업용_승용' && (r.fuel_type === '전체' || !r.fuel_type) && ageYr >= r.age_from && ageYr <= r.age_to) ||
      inspectionSchedules.find((r: any) => r.vehicle_usage === '사업용' && ageYr >= r.age_from && ageYr <= r.age_to)
    return n(rec?.interval_months, 12)
  }

  // 첫 검사 시기
  const firstInspSchedule = inspectionSchedules.find((r: any) =>
    r.vehicle_usage === '사업용_승용' && (r.fuel_type === fuelType || r.fuel_type === '전체' || !r.fuel_type) &&
    0 >= r.age_from && 0 <= r.age_to
  )
  const firstInspMonths = n(firstInspSchedule?.first_inspection_months, 24)

  // 계약 기간 내 검사 횟수 시뮬레이션
  const startAgeMonths = Math.round(carAge * 12)
  const firstInspAt = carAge === 0 ? firstInspMonths : 0
  let count = 0
  let monthSinceLastInsp = 0
  for (let m = 1; m <= termMonths; m++) {
    const currentAgeMonths = startAgeMonths + m
    if (currentAgeMonths < firstInspAt) continue
    const currentAgeYears = Math.floor(currentAgeMonths / 12)
    const interval = getInterval(currentAgeYears)
    monthSinceLastInsp++
    if (monthSinceLastInsp >= interval) {
      count++
      monthSinceLastInsp = 0
    }
  }

  const total = count * costPerTime
  const monthly = termMonths > 0 ? Math.round(total / termMonths) : 0
  const intervalMonths = getInterval(Math.floor(carAge))

  return { monthly, total, count, cost_per_time: costPerTime, interval_months: intervalMonths, source }
}

// ============================================================
// 🔴 선납금 할인 계산 (금융비용 절감 반영)
// ============================================================
/**
 * 선납금 할인 = 선납금에 대한 금융비용 절감
 * 기존 버그: prepayment / termMonths (단순 분할, discount_rate 미사용)
 * 수정: 선납금 × 할인율% / 12 + 선납금 / termMonths
 *
 * 할인율 의미: 선납금을 미리 받음으로써 그만큼의 자금을 조기 운용할 수 있는 이점
 * 연 할인율 기준이므로 /12로 월 환산
 */
export function calculatePrepaymentDiscount(
  prepayment: number,
  termMonths: number,
  discountRate: number  // 연%
): { monthly: number; finance_benefit: number; amortization: number; formula: string } {
  if (prepayment <= 0 || termMonths <= 0) {
    return { monthly: 0, finance_benefit: 0, amortization: 0, formula: '선납금 없음' }
  }
  // 선납금 금융이점: 선납금 × 할인율% / 12 (월 환산)
  const financeBenefit = Math.round(prepayment * (discountRate / 100) / 12)
  // 선납금 분할상환분
  const amortization = Math.round(prepayment / termMonths)
  const monthly = financeBenefit + amortization
  return {
    monthly,
    finance_benefit: financeBenefit,
    amortization,
    formula: `선납 ${prepayment.toLocaleString()}원 × ${discountRate}%/12 + ${prepayment.toLocaleString()}원/${termMonths}개월`
  }
}

// ============================================================
// 비선형 주행감가 (체감감소)
// ============================================================
/**
 * 주행거리 감가 계산
 * @param excess10k - 기준 초과 주행 (만km 단위)
 * @param basePer10k - 만km당 기본 감가율 % (BusinessRules DEP_MILEAGE_10K, 기본 2.0)
 */
function calcMileageDep(excess10k: number, basePer10k: number = 2.0): number {
  if (excess10k === 0) return 0
  const sign = excess10k > 0 ? 1 : -1
  const abs = Math.abs(excess10k)
  // basePer10k 적용: 첫 5만km까지 basePer10k, 5~10만km는 basePer10k×0.75, 10만km 초과는 basePer10k×0.5
  let dep = 0
  if (abs <= 5) dep = abs * basePer10k
  else if (abs <= 10) dep = 5 * basePer10k + (abs - 5) * (basePer10k * 0.75)
  else dep = 5 * basePer10k + 5 * (basePer10k * 0.75) + (abs - 10) * (basePer10k * 0.5)
  return sign * dep
}

// ============================================================
// 연료 카테고리 판별
// ============================================================
function getFuelCategory(fuel: string, model: string): '전기' | '내연기관' {
  const f = (fuel || '').toUpperCase()
  const m = (model || '').toUpperCase()
  if (EV_FUEL_KEYWORDS.some(k => f.includes(k.toUpperCase())) || EV_MODEL_KEYWORDS.some(k => m.includes(k.toUpperCase()))) return '전기'
  return '내연기관'
}

// ============================================================
// 검사용 연료타입 매핑
// ============================================================
function getInspFuelType(fuel: string, model: string): string {
  const rawFuel = (fuel || '').toLowerCase()
  const modelName = (model || '').toUpperCase()
  const isEVByModel = EV_MODEL_KEYWORDS.some(k => modelName.includes(k.toUpperCase()))
  if (isEVByModel || ['전기', 'ev', 'electric', 'bev'].some(k => rawFuel.includes(k))) return '전기'
  if (['수소', 'hydrogen', 'fcev', 'fuel cell'].some(k => rawFuel.includes(k))) return '수소'
  if (['하이브리드', 'hybrid', 'hev', 'phev'].some(k => rawFuel.includes(k))) return '하이브리드'
  if (['디젤', 'diesel'].some(k => rawFuel.includes(k))) return '디젤'
  if (['lpg', 'lng', 'cng'].some(k => rawFuel.includes(k))) return 'LPG'
  return '가솔린'
}

// ============================================================
// 검사용 차급 매핑
// ============================================================
function getInspVehicleClass(cc: number, fuelType: string, price: number): string {
  if (cc === 0 || fuelType === '전기' || fuelType === '수소') {
    if (price < 20000000) return '경형'
    if (price < 35000000) return '소형'
    if (price < 50000000) return '중형'
    return '대형'
  }
  if (cc <= 1000) return '경형'
  if (cc <= 1600) return '소형'
  if (cc <= 2000) return '중형'
  return '대형'
}

// ============================================================
// 🔴 경차 판별 (engine_cc 필드 사용으로 통일)
// ============================================================
function isLightVehicle(engineCC: number, model: string, trim?: string): boolean {
  // engine_cc 기반 판별 (displacement 필드 제거, engine_cc로 통일)
  if (engineCC > 0 && engineCC < 1000) return true
  // 모델명 기반 판별 (배기량 정보 없는 경우 보조)
  return /레이|Ray|모닝|Morning|다마스|라보|마티즈|스파크|Spark/i.test(`${model || ''} ${trim || ''}`)
}

// ============================================================
// v2.1 외부렌탈 계산 (pass-through + 마진)
// ============================================================
/**
 * 외부렌탈 차량은 자체 원가 계산을 하지 않고 월 렌탈료를 pass-through,
 * 마진(EXTERNAL_RENT_MARGIN_RATE)만 추가. 단기일 경우 가동률 보정도 적용.
 *
 * 원가 구조:
 *   depreciation / finance / tax / risk = 0 (외부업체가 부담)
 *   insurance / maintenance = 0 (통상 렌탈료에 포함)
 *   external_rent (금융비용 항목으로 표시) = monthly rent pass-through
 *   overhead = OVERHEAD_MONTHLY_PER_VEHICLE (우리 측 고정비는 발생)
 *   margin = external_rent × EXTERNAL_RENT_MARGIN_RATE%
 */
export function calculateExternalRent(input: CalcInput): CalcResult {
  const { vehicle: v, contract: c, rules } = input
  const monthlyRent = n(c.external_rent_monthly)
  const rentalTerm = c.rental_term || 'longterm'
  const utilRate = n(c.utilization_rate, n(rules.SHORT_TERM_UTILIZATION_RATE, 60))

  // 가동률 보정 (단기일 때만)
  const utilMultiplier = rentalTerm === 'shortterm' ? (100 / utilRate) : 1.0

  // 간접비 (고정액)
  const overheadPerVehicle = n(rules.OVERHEAD_MONTHLY_PER_VEHICLE, 1111111)
  const monthlyOverhead = Math.round(overheadPerVehicle * utilMultiplier)

  // 외부렌탈 원가 (가동률 보정 포함)
  const adjustedRent = Math.round(monthlyRent * utilMultiplier)

  // 합계 (원가)
  const totalMonthlyCost = adjustedRent + monthlyOverhead

  // 마진 (총원가 = 외부렌탈료 + 간접비 위에 EXTERNAL_RENT_MARGIN_RATE% 부과)
  const marginRate = n(rules.EXTERNAL_RENT_MARGIN_RATE, 15)
  const marginAmount = Math.round(totalMonthlyCost * marginRate / 100)

  const rawSuggestedRent = totalMonthlyCost + marginAmount
  const suggestedRent = Math.round(rawSuggestedRent / 1000) * 1000
  const vatRate = n(rules.VAT_RATE, 10)
  const rentWithVAT = Math.round(suggestedRent * (1 + vatRate / 100) / 1000) * 1000
  const vatAmount = rentWithVAT - suggestedRent

  const utilSuffix = rentalTerm === 'shortterm' ? ` × 가동률보정 ${utilMultiplier.toFixed(2)}` : ''

  const breakdown: CostBreakdown = {
    depreciation: {
      label: '감가상각비', monthly: 0, annual: 0, source: 'calc',
      formula: '외부렌탈: 감가는 외부업체 부담',
    },
    finance: {
      label: '외부렌탈료 (pass-through)',
      monthly: adjustedRent, annual: adjustedRent * 12, source: 'manual',
      formula: `월렌탈료 ${monthlyRent.toLocaleString()}${utilSuffix}`,
      loan_interest: adjustedRent, opportunity_cost: 0, avg_loan_balance: 0, avg_equity_balance: 0,
    },
    insurance: {
      label: '보험료', monthly: 0, annual: 0, source: 'manual',
      formula: '외부렌탈: 렌탈료에 포함',
      base_premium: 0, own_damage_premium: 0, loading_amount: 0,
    },
    maintenance: {
      label: '정비비', monthly: 0, annual: 0, source: 'manual',
      formula: '외부렌탈: 렌탈료에 포함',
    },
    tax_inspection: {
      label: '세금·검사', monthly: 0, annual: 0, source: 'manual',
      formula: '외부렌탈: 외부업체 부담',
      monthly_tax: 0, monthly_inspection: 0, annual_tax: 0, inspections_in_term: 0,
    },
    risk: {
      label: '리스크적립', monthly: 0, annual: 0, source: 'calc',
      formula: '외부렌탈: 자체 리스크 없음',
    },
    overhead: {
      label: '간접비', monthly: monthlyOverhead, annual: monthlyOverhead * 12, source: 'calc',
      formula: `월 간접비 ${overheadPerVehicle.toLocaleString()}원/대${utilSuffix}`,
    },
    discount: {
      label: '할인(보증금·선납)', monthly: 0, source: 'calc',
      formula: '외부렌탈: 할인 미적용',
      deposit_discount: 0, prepayment_discount: 0,
    },
  }

  const costTotal = adjustedRent + monthlyOverhead
  const costPct = (v: number) => costTotal > 0 ? Math.round(v / costTotal * 1000) / 10 : 0
  const purchasePrice = n(v.purchase_price)
  const rentToPriceRatio = purchasePrice > 0 ? Math.round((suggestedRent / purchasePrice) * 10000) / 100 : 0
  const marginRateCalc = suggestedRent > 0 ? Math.round(marginAmount / suggestedRent * 1000) / 10 : 0

  return {
    breakdown,
    depreciation_analysis: {
      car_age: 0, axes: null, effective_axes: null, matched_db_rate: null,
      active_curve: [], class_multiplier: 1, adjustment_factor: 1,
      year_dep_now: 0, mileage_dep_now: 0, total_dep_rate_now: 0, current_market_value: 0,
      year_dep_end: 0, mileage_dep_end: 0, total_dep_rate_end: 0, end_market_value: 0,
      effective_end_market_value: 0, residual_value: 0, buyout_price: 0, cost_base: 0,
    },
    total_monthly_cost: totalMonthlyCost,
    suggested_rent: suggestedRent,
    rent_with_vat: rentWithVAT,
    vat_amount: vatAmount,
    irr_result: null,
    excess_mileage_rate: 0,
    excess_mileage_source: 'fallback',
    market_analysis: {
      rent_to_price_ratio: rentToPriceRatio,
      annual_cost_ratio: 0,
      cost_structure_pct: {
        depreciation: 0, finance: costPct(adjustedRent), insurance: 0, maintenance: 0,
        tax_inspection: 0, risk: 0, overhead: costPct(monthlyOverhead),
      },
      breakeven_months: 999,
      competitive_index: 1.0,
      margin_rate: marginRateCalc,
    },
    calculation_version: '2.1.0',
    calculated_at: new Date().toISOString(),
  }
}

// ============================================================
// 메인 계산 함수
// ============================================================
export function calculateRentCost(input: CalcInput): CalcResult {
  // v2.1 분기: 외부렌탈은 별도 경로
  if (input.contract.contract_source === 'external_rent') {
    return calculateExternalRent(input)
  }

  const { vehicle, contract, depreciation, finance, insurance, maintenance, tax, risk, overhead, deposit_prepay, acquisition, reference, rules } = input
  const v = vehicle
  const c = contract

  // 안전한 숫자 변환
  const factoryPrice = n(v.factory_price)
  const purchasePrice = n(v.purchase_price)
  const totalAcqCost = n(acquisition.total_cost) || purchasePrice
  const loanAmount = n(finance.loan_amount)

  const thisYear = new Date().getFullYear()
  const carAge = c.car_age_mode === 'new'
    ? 0
    : c.custom_car_age > 0
      ? c.custom_car_age
      : Math.max(0, thisYear - (v.year || thisYear))
  const mileage10k = (v.mileage || 0) / 10000
  const isUsedCar = c.car_age_mode === 'used' && carAge > 0

  // ─────────────────────────────────────────
  // 1. 감가 계산
  // ─────────────────────────────────────────
  const autoAxes = mapToDepAxes(v.brand, v.model, v.fuel, factoryPrice)
  const effectiveAxes: DepAxes = {
    origin: (depreciation.origin_override || autoAxes.origin) as DepAxes['origin'],
    vehicle_class: (depreciation.vehicle_class_override || autoAxes.vehicle_class) as DepAxes['vehicle_class'],
    fuel_type: (depreciation.fuel_type_override || autoAxes.fuel_type) as DepAxes['fuel_type'],
    label: `${depreciation.origin_override || autoAxes.origin} ${(depreciation.vehicle_class_override || autoAxes.vehicle_class).replace(/_/g, ' ')} ${(depreciation.fuel_type_override || autoAxes.fuel_type) !== '내연기관' ? (depreciation.fuel_type_override || autoAxes.fuel_type) : ''}`.trim(),
  }
  const depClass = depreciation.class_override || effectiveAxes.label

  // DB 기반 곡선
  const matchedDepRate = reference.dep_rates.find((d: any) =>
    d.origin === effectiveAxes.origin && d.vehicle_class === effectiveAxes.vehicle_class && d.fuel_type === effectiveAxes.fuel_type
  )
  const dbCurve = matchedDepRate ? buildCurveFromDbRates(matchedDepRate) : null

  // BusinessRules 기반 폴백 커브 생성 (DEP_YEAR_1, DEP_YEAR_2PLUS가 설정되어 있을 때)
  const ruleYear1 = n(rules.DEP_YEAR_1)
  const ruleYear2Plus = n(rules.DEP_YEAR_2PLUS)
  const rulesFallbackCurve = (ruleYear1 > 0 || ruleYear2Plus > 0)
    ? [ruleYear1 || 20, ruleYear2Plus || 12, ruleYear2Plus || 12, ruleYear2Plus || 11, ruleYear2Plus || 10]
    : null

  // 활성 곡선 결정 (DB → BusinessRules 폴백 → 하드코딩 프리셋)
  const defaultFallback = rulesFallbackCurve || DEP_CURVE_PRESETS.standard.curve
  const activeCurve = depreciation.curve_preset === 'custom'
    ? (depreciation.custom_curve || defaultFallback)
    : depreciation.curve_preset === 'db_based'
      ? (dbCurve || defaultFallback)
      : DEP_CURVE_PRESETS[depreciation.curve_preset as keyof typeof DEP_CURVE_PRESETS]?.curve || defaultFallback

  // 클래스 보정 승수
  const classMult = depreciation.curve_preset === 'db_based'
    ? 1.0
    : (DEP_CLASS_MULTIPLIER[depClass]?.mult ?? 1.0)

  // 보정계수
  const marketFactor = (() => {
    const marketAdjs = reference.dep_adjustments.filter((a: any) => a.adjustment_type === 'market_condition' && a.is_active && n(a.factor) !== 1.0)
    return marketAdjs.length === 0 ? 1.0 : marketAdjs.reduce((acc: number, a: any) => acc * n(a.factor), 1.0)
  })()

  const popularityFactor = (() => {
    const popAdjs = reference.dep_adjustments.filter((a: any) => a.adjustment_type === 'popularity' && a.is_active)
    const match = popAdjs.find((a: any) => a.label === depreciation.popularity_grade)
    if (match) return n(match.factor)
    const defaults: Record<string, number> = { 'S등급 (인기)': 1.05, 'A등급 (준인기)': 1.02, 'B등급 (일반)': 1.0, 'C등급 (비인기)': 0.97, 'D등급 (저인기)': 0.93 }
    return defaults[depreciation.popularity_grade] ?? 1.0
  })()

  const adjustmentFactor = marketFactor * popularityFactor
  const mileageDepPer10k = n(rules.DEP_MILEAGE_10K, 2.0) // BusinessRules 폴백: 만km당 2%

  // 현재 시점 감가
  const yearDepNow = getDepRateFromCurve(activeCurve, carAge, classMult)
  const avgMileageNow = carAge * c.baseline_km
  const excessMileageNow = mileage10k - avgMileageNow
  const mileageDepNow = calcMileageDep(excessMileageNow, mileageDepPer10k)
  const totalDepRateNow = Math.max(0, Math.min(yearDepNow + mileageDepNow, 90))
  const adjustedNowResidualPct = carAge === 0 ? 1.0 : Math.max(0, Math.min((1 - totalDepRateNow / 100) * adjustmentFactor, 1.0))
  const curveBasedMarketValue = Math.round(factoryPrice * adjustedNowResidualPct)

  // v2.1: 외부시세 가중치 블렌드 (DEP_MARKET_PRICE_WEIGHT / DEP_CURVE_WEIGHT)
  const marketPrices = reference.vehicle_market_prices || []
  const matchedMarketPrice = marketPrices.find((p: any) =>
    p.brand === v.brand && p.model === v.model && p.year === v.year && (p.is_active !== false && p.is_active !== 0)
  )
  const marketWeight = n(rules.DEP_MARKET_PRICE_WEIGHT, 0.7)
  const curveWeight  = n(rules.DEP_CURVE_WEIGHT, 0.3)
  const externalMarketPrice = matchedMarketPrice ? n(matchedMarketPrice.market_price) : 0
  const currentMarketValue = externalMarketPrice > 0
    ? Math.round(externalMarketPrice * marketWeight + curveBasedMarketValue * curveWeight)
    : curveBasedMarketValue
  const marketPriceSource: 'external+curve' | 'curve_only' = externalMarketPrice > 0 ? 'external+curve' : 'curve_only'

  // 종료 시점 감가
  const termYears = c.term_months / 12
  const endAge = carAge + termYears
  const yearDepEnd = getDepRateFromCurve(activeCurve, endAge, classMult)
  const projectedMileage10k = mileage10k + (termYears * c.annual_mileage)
  const avgMileageEnd = endAge * c.baseline_km
  const excessMileageEnd = projectedMileage10k - avgMileageEnd
  const mileageDepEnd = calcMileageDep(excessMileageEnd, mileageDepPer10k)
  const totalDepRateEnd = Math.max(0, Math.min(yearDepEnd + mileageDepEnd, 90))
  const adjustedEndResidualPct = Math.max(0, Math.min((1 - totalDepRateEnd / 100) * adjustmentFactor, 1.0))
  const endMarketValue = Math.round(factoryPrice * adjustedEndResidualPct)

  // 중고차 감가 분리 (고객 귀책분만)
  const purchaseMileage10k = isUsedCar ? (v.purchase_mileage || 0) / 10000 : 0
  const customerDriven10k = termYears * c.annual_mileage
  const standardAddition10k = termYears * c.baseline_km
  const customerExcessMileage = isUsedCar ? (customerDriven10k - standardAddition10k) : excessMileageEnd
  const customerMileageDep = calcMileageDep(customerExcessMileage, mileageDepPer10k)
  const usedCarEndTotalDep = isUsedCar ? Math.max(0, Math.min(yearDepEnd + customerMileageDep, 90)) : totalDepRateEnd
  const usedCarEndResidualPct = isUsedCar
    ? Math.max(0, Math.min((1 - usedCarEndTotalDep / 100) * adjustmentFactor, 1.0))
    : adjustedEndResidualPct
  const effectiveEndMarketValue = isUsedCar ? Math.round(factoryPrice * usedCarEndResidualPct) : endMarketValue

  // 잔존가치 & 월 감가비
  const costBase = totalAcqCost > 0 ? totalAcqCost : purchasePrice
  const residualValue = c.contract_type === 'return'
    ? effectiveEndMarketValue
    : Math.round(effectiveEndMarketValue * (c.residual_rate / 100))
  const buyoutPrice = residualValue
  const baseMonthlyDep = Math.round(Math.max(0, costBase - residualValue) / c.term_months)
  const buyoutPremiumAmount = c.contract_type === 'buyout' ? n(c.buyout_premium) : 0
  const monthlyDepreciation = baseMonthlyDep + buyoutPremiumAmount

  // ─────────────────────────────────────────
  // 2. 금융비용 (평균잔액법)
  // ─────────────────────────────────────────
  const effectiveLoan = Math.min(loanAmount, purchasePrice)
  const residualRatio = costBase > 0 ? Math.max(0, residualValue / costBase) : 0
  const loanEndBalance = Math.round(effectiveLoan * residualRatio)
  const avgLoanBalance = Math.round((effectiveLoan + loanEndBalance) / 2)
  const equityAmount = costBase - effectiveLoan
  const equityEndBalance = Math.round(equityAmount * residualRatio)
  const avgEquityBalance = Math.round((equityAmount + equityEndBalance) / 2)
  const monthlyLoanInterest = Math.round(avgLoanBalance * (finance.loan_rate / 100) / 12)
  const monthlyOpportunityCost = Math.round(avgEquityBalance * (finance.investment_rate / 100) / 12)
  const totalMonthlyFinance = monthlyLoanInterest + monthlyOpportunityCost

  // ─────────────────────────────────────────
  // 3. 보험비용 (+ 로딩율)
  // ─────────────────────────────────────────
  let monthlyInsurance = insurance.auto_mode ? 0 : n(insurance.monthly_cost)
  let basePremium = 0
  let ownDamagePremium = 0

  if (insurance.auto_mode) {
    const insResult = estimateInsurance({
      cc: v.engine_cc,
      brand: v.brand,
      purchasePrice: purchasePrice,
      factoryPrice: factoryPrice,
      fuelType: v.fuel,
      driverAge: insurance.driver_age,
      deductible: insurance.deductible,
      carAge: carAge,
      isCommercial: v.is_commercial,
      ownDamageCoverageRatio: insurance.own_damage_ratio,
    })
    basePremium = insResult.basePremium
    ownDamagePremium = insResult.ownDamagePremium
    monthlyInsurance = insResult.totalMonthly
  }

  // 보험 로딩율 적용 (보험사 수수료, 관리비 반영)
  const insuranceLoading = n(overhead.insurance_loading)
  const loadingAmount = Math.round(monthlyInsurance * insuranceLoading / 100)
  const monthlyInsuranceWithLoading = monthlyInsurance + loadingAmount

  // ─────────────────────────────────────────
  // 4. 정비비용 (DB 우선 → 하드코딩 폴백)
  // ─────────────────────────────────────────
  const maintType = mapToMaintenanceType(v.brand, v.model, v.fuel, purchasePrice)
  const multiplier = MAINT_MULTIPLIER[maintType.type] || 1.0
  // DB maintenance_cost_table에서 차종별 월 정비비 조회
  const maintCostRecords = reference.maintenance_costs || []
  const dbMaintRecord = maintCostRecords.find((r: any) => r.vehicle_type === maintType.type)
    || maintCostRecords.find((r: any) => r.vehicle_type === '기본')
  const dbMaintMonthly = dbMaintRecord ? n(dbMaintRecord.monthly_cost || dbMaintRecord.cost_per_month) : 0
  // DB 값이 있으면 DB 우선, 없으면 하드코딩 패키지 폴백
  const baseMaintCost = dbMaintMonthly > 0 ? dbMaintMonthly : MAINTENANCE_PACKAGES[maintenance.package].monthly
  const maintSource: 'db' | 'calc' | 'manual' = dbMaintMonthly > 0 ? 'db' : 'calc'
  const oilAdjust = maintenance.package === 'oil_only' && maintenance.oil_change_freq === 2 ? 1.8 : 1.0
  const monthlyMaint = maintenance.package === 'self'
    ? 0
    : n(maintenance.monthly_cost) > 0
      ? n(maintenance.monthly_cost)
      : Math.round(baseMaintCost * multiplier * oilAdjust)

  // ─────────────────────────────────────────
  // 5. 세금 + 검사
  // ─────────────────────────────────────────
  const fuelCategory = getFuelCategory(v.fuel || '', v.model)
  const cc = n(v.engine_cc) || n(tax.engine_cc)

  // 자동차세
  let annualTax: number
  let taxSource: 'db' | 'fallback' | 'manual'
  let taxFormula: string

  if (n(tax.annual_tax) > 0) {
    annualTax = n(tax.annual_tax)
    taxSource = 'manual'
    taxFormula = '직접입력'
  } else {
    const taxResult = calculateVehicleTax(cc, fuelCategory, v.is_commercial, reference.tax_rates)
    annualTax = taxResult.annual
    taxSource = taxResult.source
    taxFormula = taxResult.formula
  }
  const monthlyTax = Math.round(annualTax / 12)

  // 정기검사
  const inspFuelType = getInspFuelType(v.fuel || '', v.model)
  const inspVehicleClass = getInspVehicleClass(cc, inspFuelType, purchasePrice || factoryPrice)
  const inspResult = calculateInspection(
    carAge, c.term_months, inspVehicleClass, inspFuelType,
    tax.registration_region, reference.inspection_costs, reference.inspection_schedules
  )

  const totalMonthlyTaxInsp = monthlyTax + inspResult.monthly

  // ─────────────────────────────────────────
  // 6. 리스크 적립
  // ─────────────────────────────────────────
  const monthlyRiskReserve = Math.round(purchasePrice * (risk.rate / 100) / 12)

  // ─────────────────────────────────────────
  // 7. 간접비 (OVERHEAD) — v2.1: 고정액 우선, % 폴백
  // ─────────────────────────────────────────
  // v2.1 원칙:
  //   1순위: OVERHEAD_MONTHLY_PER_VEHICLE (원/대·월) — 월 고정비 ÷ 자체 대수
  //   2순위: OVERHEAD_MONTHLY_TOTAL / OVERHEAD_FLEET_SIZE 계산
  //   3순위: overhead.overhead_rate % × 원가소계 (구 방식, 폴백)
  const subtotalBeforeOverhead = monthlyDepreciation + totalMonthlyFinance + monthlyInsuranceWithLoading + monthlyMaint + totalMonthlyTaxInsp + monthlyRiskReserve

  const overheadPerVehicleRule = n(rules.OVERHEAD_MONTHLY_PER_VEHICLE, 0)
  const overheadMonthlyTotal = n(rules.OVERHEAD_MONTHLY_TOTAL, 0)
  const overheadFleetSize = n(rules.OVERHEAD_FLEET_SIZE, 0)

  let monthlyOverhead: number
  let overheadSource: 'fixed_per_vehicle' | 'total_div_fleet' | 'rate_percent' = 'rate_percent'
  let overheadFormula: string

  if (overheadPerVehicleRule > 0) {
    monthlyOverhead = overheadPerVehicleRule
    overheadSource = 'fixed_per_vehicle'
    overheadFormula = `고정 월 간접비 ${overheadPerVehicleRule.toLocaleString()}원/대`
  } else if (overheadMonthlyTotal > 0 && overheadFleetSize > 0) {
    monthlyOverhead = Math.round(overheadMonthlyTotal / overheadFleetSize)
    overheadSource = 'total_div_fleet'
    overheadFormula = `월 고정비 ${overheadMonthlyTotal.toLocaleString()}원 ÷ ${overheadFleetSize}대`
  } else {
    monthlyOverhead = Math.round(subtotalBeforeOverhead * (n(overhead.overhead_rate) / 100))
    overheadSource = 'rate_percent'
    overheadFormula = `[구방식] 원가소계 ${subtotalBeforeOverhead.toLocaleString()} × ${overhead.overhead_rate}%`
  }

  // ─────────────────────────────────────────
  // 8. 보증금/선납금 할인
  // ─────────────────────────────────────────
  const monthlyDepositDiscount = Math.round(n(deposit_prepay.deposit) * (n(deposit_prepay.deposit_discount_rate) / 100))
  const prepayResult = calculatePrepaymentDiscount(
    n(deposit_prepay.prepayment),
    c.term_months,
    n(deposit_prepay.prepayment_discount_rate)
  )
  const totalDiscount = monthlyDepositDiscount + prepayResult.monthly

  // ─────────────────────────────────────────
  // v2.1: 단기 가동률 보정
  //   단기렌트는 차량이 항상 대여되지 않음 (60% 가동률 기본).
  //   감가·세금·검사는 시간비례라 가동률 무관, 나머지는 ÷ 가동률로 상승.
  //   → 한 고객당 실제로 받는 일수가 줄어드니 원가가 더 빨리 회수되어야 함.
  // ─────────────────────────────────────────
  const rentalTerm = c.rental_term || 'longterm'
  const utilRateRaw = n(c.utilization_rate, n(rules.SHORT_TERM_UTILIZATION_RATE, 60))
  const utilRate = utilRateRaw > 0 && utilRateRaw <= 100 ? utilRateRaw : 60
  const utilMultiplier = rentalTerm === 'shortterm' ? (100 / utilRate) : 1.0

  // 단기면 항목별 보정 적용 (감가·세금·검사 제외)
  let adjFinance      = totalMonthlyFinance
  let adjInsurance    = monthlyInsuranceWithLoading
  let adjMaint        = monthlyMaint
  let adjRisk         = monthlyRiskReserve
  let adjOverhead     = monthlyOverhead

  if (rentalTerm === 'shortterm' && utilMultiplier > 1.0) {
    adjFinance      = Math.round(totalMonthlyFinance * utilMultiplier)
    adjInsurance    = Math.round(monthlyInsuranceWithLoading * utilMultiplier)
    adjMaint        = Math.round(monthlyMaint * utilMultiplier)
    adjRisk         = Math.round(monthlyRiskReserve * utilMultiplier)
    adjOverhead     = Math.round(monthlyOverhead * utilMultiplier)
  }

  // ─────────────────────────────────────────
  // 합계 & 렌트가
  // ─────────────────────────────────────────
  const totalMonthlyCost = Math.max(0,
    monthlyDepreciation +
    adjFinance +
    adjInsurance +
    adjMaint +
    totalMonthlyTaxInsp +
    adjRisk +
    adjOverhead -
    totalDiscount
  )

  const rawSuggestedRent = totalMonthlyCost + n(overhead.margin)
  const suggestedRent = Math.round(rawSuggestedRent / 1000) * 1000
  const vatRate = n(rules.VAT_RATE, 10)
  const rentWithVAT = Math.round(suggestedRent * (1 + vatRate / 100) / 1000) * 1000
  const vatAmount = rentWithVAT - suggestedRent

  // IRR
  const irrResult = calcIRR(costBase, suggestedRent, c.term_months, residualValue, n(deposit_prepay.deposit), n(deposit_prepay.prepayment))

  // 초과주행 요금
  const vehicleClass = getInsVehicleClass(cc, v.brand, purchasePrice, v.fuel)
  const excessInfo = getExcessMileageRateFromTerms(reference.terms_config?.calc_params, vehicleClass, factoryPrice || purchasePrice)

  // ─────────────────────────────────────────
  // 9. 시장 경쟁력 분석 — v2.1: 가동률 보정된 값 기준
  // ─────────────────────────────────────────
  const rentToPriceRatio = purchasePrice > 0 ? Math.round((suggestedRent / purchasePrice) * 10000) / 100 : 0
  const annualCostRatio = purchasePrice > 0 ? Math.round((totalMonthlyCost * 12 / purchasePrice) * 10000) / 100 : 0
  const adjSubtotal = monthlyDepreciation + adjFinance + adjInsurance + adjMaint + totalMonthlyTaxInsp + adjRisk
  const costTotal = adjSubtotal + adjOverhead
  const costPct = (v: number) => costTotal > 0 ? Math.round(v / costTotal * 1000) / 10 : 0
  const marginRate = suggestedRent > 0 ? Math.round((suggestedRent - totalMonthlyCost) / suggestedRent * 1000) / 10 : 0
  const INDUSTRY_AVG_RENT_RATIO = n(rules.INDUSTRY_AVG_RENT_RATIO, 2.2)
  const competitiveIndex = INDUSTRY_AVG_RENT_RATIO > 0 ? Math.round(rentToPriceRatio / INDUSTRY_AVG_RENT_RATIO * 100) / 100 : 1.0
  const monthlyNetIncome = suggestedRent - totalMonthlyCost
  const breakevenMonths = monthlyNetIncome > 0 ? Math.ceil(costBase / monthlyNetIncome) : 999

  const marketAnalysis = {
    rent_to_price_ratio: rentToPriceRatio,
    annual_cost_ratio: annualCostRatio,
    cost_structure_pct: {
      depreciation: costPct(monthlyDepreciation),
      finance: costPct(adjFinance),
      insurance: costPct(adjInsurance),
      maintenance: costPct(adjMaint),
      tax_inspection: costPct(totalMonthlyTaxInsp),
      risk: costPct(adjRisk),
      overhead: costPct(adjOverhead),
    },
    breakeven_months: breakevenMonths,
    competitive_index: competitiveIndex,
    margin_rate: marginRate,
  }

  // ─────────────────────────────────────────
  // 결과 구성
  // ─────────────────────────────────────────
  const breakdown: CostBreakdown = {
    depreciation: {
      label: '감가상각비',
      monthly: monthlyDepreciation,
      annual: monthlyDepreciation * 12,
      source: matchedDepRate ? 'db' : 'calc',
      formula: buyoutPremiumAmount > 0
        ? `(취득원가 ${costBase.toLocaleString()} - 잔존가 ${residualValue.toLocaleString()}) / ${c.term_months}개월 + 인수프리미엄 ${buyoutPremiumAmount.toLocaleString()}`
        : `(취득원가 ${costBase.toLocaleString()} - 잔존가 ${residualValue.toLocaleString()}) / ${c.term_months}개월`,
    },
    finance: {
      label: '금융비용',
      monthly: adjFinance,
      annual: adjFinance * 12,
      source: 'calc',
      formula: rentalTerm === 'shortterm'
        ? `(대출이자 ${monthlyLoanInterest.toLocaleString()} + 기회비용 ${monthlyOpportunityCost.toLocaleString()}) × 가동률보정 ${utilMultiplier.toFixed(2)}`
        : `대출이자 ${monthlyLoanInterest.toLocaleString()} + 기회비용 ${monthlyOpportunityCost.toLocaleString()}`,
      loan_interest: monthlyLoanInterest,
      opportunity_cost: monthlyOpportunityCost,
      avg_loan_balance: avgLoanBalance,
      avg_equity_balance: avgEquityBalance,
    },
    insurance: {
      label: '보험료',
      monthly: adjInsurance,
      annual: adjInsurance * 12,
      source: insurance.auto_mode ? 'calc' : 'manual',
      formula: (() => {
        const base = insurance.auto_mode
          ? `기본분담금 ${basePremium.toLocaleString()} + 자차 ${ownDamagePremium.toLocaleString()} + 로딩 ${loadingAmount.toLocaleString()}`
          : '직접입력'
        return rentalTerm === 'shortterm' ? `(${base}) × 가동률보정 ${utilMultiplier.toFixed(2)}` : base
      })(),
      base_premium: basePremium,
      own_damage_premium: ownDamagePremium,
      loading_amount: loadingAmount,
    },
    maintenance: {
      label: '정비비',
      monthly: adjMaint,
      annual: adjMaint * 12,
      source: maintenance.package === 'self' ? 'manual' : (n(maintenance.monthly_cost) > 0 ? 'manual' : maintSource),
      formula: (() => {
        const base = maintenance.package === 'self' ? '자가정비 (미포함)'
          : n(maintenance.monthly_cost) > 0 ? '직접입력'
          : dbMaintMonthly > 0 ? `DB기준 ${dbMaintMonthly.toLocaleString()}원 × ${multiplier} 배수`
          : `${MAINTENANCE_PACKAGES[maintenance.package].label} × ${multiplier} 배수`
        return rentalTerm === 'shortterm' ? `(${base}) × 가동률보정 ${utilMultiplier.toFixed(2)}` : base
      })(),
    },
    tax_inspection: {
      label: '세금·검사',
      monthly: totalMonthlyTaxInsp,
      annual: totalMonthlyTaxInsp * 12,
      source: taxSource,
      formula: taxFormula,
      monthly_tax: monthlyTax,
      monthly_inspection: inspResult.monthly,
      annual_tax: annualTax,
      inspections_in_term: inspResult.count,
    },
    risk: {
      label: '리스크적립',
      monthly: adjRisk,
      annual: adjRisk * 12,
      source: 'calc',
      formula: rentalTerm === 'shortterm'
        ? `(매입가 ${purchasePrice.toLocaleString()} × ${risk.rate}% / 12) × 가동률보정 ${utilMultiplier.toFixed(2)}`
        : `매입가 ${purchasePrice.toLocaleString()} × ${risk.rate}% / 12`,
    },
    overhead: {
      label: '간접비',
      monthly: adjOverhead,
      annual: adjOverhead * 12,
      source: overheadSource === 'rate_percent' ? 'calc' : 'db',
      formula: rentalTerm === 'shortterm'
        ? `${overheadFormula} × 가동률보정 ${utilMultiplier.toFixed(2)}`
        : overheadFormula,
    },
    discount: {
      label: '할인(보증금·선납)',
      monthly: -totalDiscount,
      source: 'calc',
      formula: `보증금할인 ${monthlyDepositDiscount.toLocaleString()} + 선납할인 ${prepayResult.monthly.toLocaleString()}`,
      deposit_discount: monthlyDepositDiscount,
      prepayment_discount: prepayResult.monthly,
    },
  }

  const depreciationAnalysis: DepreciationAnalysis = {
    car_age: carAge,
    axes: autoAxes,
    effective_axes: effectiveAxes,
    matched_db_rate: matchedDepRate,
    active_curve: activeCurve,
    class_multiplier: classMult,
    adjustment_factor: adjustmentFactor,
    year_dep_now: yearDepNow,
    mileage_dep_now: mileageDepNow,
    total_dep_rate_now: totalDepRateNow,
    current_market_value: currentMarketValue,
    year_dep_end: yearDepEnd,
    mileage_dep_end: mileageDepEnd,
    total_dep_rate_end: totalDepRateEnd,
    end_market_value: endMarketValue,
    effective_end_market_value: effectiveEndMarketValue,
    residual_value: residualValue,
    buyout_price: buyoutPrice,
    cost_base: costBase,
  }

  return {
    breakdown,
    depreciation_analysis: depreciationAnalysis,
    total_monthly_cost: totalMonthlyCost,
    suggested_rent: suggestedRent,
    rent_with_vat: rentWithVAT,
    vat_amount: vatAmount,
    irr_result: irrResult,
    excess_mileage_rate: excessInfo.rate,
    excess_mileage_source: excessInfo.source,
    market_analysis: marketAnalysis,
    calculation_version: '2.1.0',
    calculated_at: new Date().toISOString(),
  }
}

// ============================================================
// 취득원가 자동 계산
// ============================================================
export function calculateAcquisitionCost(input: {
  purchase_price: number
  engine_cc: number
  model: string
  trim?: string
  fuel: string
  is_commercial: boolean
  registration_region: string
  reg_costs: any[]
}): {
  acquisition_tax: number
  bond_cost: number
  delivery_fee: number
  misc_fee: number
  total: number
  details: Record<string, any>
} {
  const { purchase_price, engine_cc, model, trim, fuel, is_commercial, registration_region, reg_costs } = input
  const fuelCat = getFuelCategory(fuel, model)

  // 취득세
  const acqCategory = is_commercial
    ? (fuelCat === '전기' ? '영업용 전기' : '영업용')
    : (fuelCat === '전기' ? '비영업용 전기' : '비영업용')
  const acqTaxRecord = reg_costs.find((r: any) => r.cost_type === '취득세' && r.vehicle_category === acqCategory)
    || reg_costs.find((r: any) => r.cost_type === '취득세' && r.vehicle_category === (is_commercial ? '영업용' : '비영업용'))
  const defaultAcqRate = is_commercial ? 0.04 : 0.07
  let acqTaxAmt = acqTaxRecord
    ? Math.round(purchase_price * n(acqTaxRecord.rate) / 100)
    : Math.round(purchase_price * defaultAcqRate)

  // 🔴 경차 취득세 감면 (engine_cc로 통일)
  const LIGHT_CAR_TAX_EXEMPT_LIMIT = 750000
  if (isLightVehicle(engine_cc, model, trim)) {
    if (acqTaxAmt <= LIGHT_CAR_TAX_EXEMPT_LIMIT) {
      acqTaxAmt = 0
    } else {
      acqTaxAmt = acqTaxAmt - LIGHT_CAR_TAX_EXEMPT_LIMIT
    }
  }

  // 공채매입
  const cc = engine_cc || 0
  const getBondCategory = (cc: number): string => {
    if (cc >= 2000) return '영업용'
    if (cc >= 1600) return '영업용 중형'
    return '영업용 소형'
  }
  const bondCategory = getBondCategory(cc)
  let bondRecord = reg_costs.find((r: any) => r.cost_type === '공채매입' && r.region === registration_region && r.vehicle_category === bondCategory)
    || reg_costs.find((r: any) => r.cost_type === '공채매입' && r.region === registration_region && r.vehicle_category === '영업용')
    || reg_costs.find((r: any) => r.cost_type === '공채매입' && r.region === '기타' && r.vehicle_category === '영업용')
  const bondRate = bondRecord ? n(bondRecord.rate) : 0
  const bondGross = Math.round(purchase_price * bondRate / 100)
  const bondDiscountRecord = reg_costs.find((r: any) => r.cost_type === '공채할인')
  const bondDiscountRate = bondDiscountRecord ? n(bondDiscountRecord.rate) / 100 : 0.06
  const bondNet = bondRate > 0 ? Math.round(bondGross * (1 - bondDiscountRate)) : 0

  // 탁송료
  const deliveryRecord = reg_costs.find((r: any) => r.cost_type === '탁송료')
  const deliveryFee = n(deliveryRecord?.fixed_amount, 350000)

  // 기타 (번호판, 인지세, 대행료, 검사비)
  const miscItems = reg_costs.filter((r: any) => ['번호판', '인지세', '대행료', '검사비'].includes(r.cost_type))
  const miscFee = miscItems.reduce((s: number, r: any) => s + n(r.fixed_amount, 0), 0) || 167000

  const total = purchase_price + acqTaxAmt + bondNet + deliveryFee + miscFee

  return {
    acquisition_tax: acqTaxAmt,
    bond_cost: bondNet,
    delivery_fee: deliveryFee,
    misc_fee: miscFee,
    total,
    details: {
      acq_rate: acqTaxRecord ? n(acqTaxRecord.rate) : (is_commercial ? 4 : 7),
      bond_rate: bondRate,
      bond_gross: bondGross,
      bond_discount_rate: bondDiscountRate * 100,
      is_light_car: isLightVehicle(engine_cc, model, trim),
      light_car_exempt: isLightVehicle(engine_cc, model, trim) ? LIGHT_CAR_TAX_EXEMPT_LIMIT : 0,
    }
  }
}

// ============================================================
// 🔄 운영학습 모듈 (Operational Learning)
// ============================================================

/** 계산 결과 스냅샷 — 견적 저장 시 DB에 기록하여 이후 실적 비교 */
export interface CalcSnapshot {
  quote_id: string
  vehicle_id: string
  created_at: string
  input_hash: string              // CalcInput JSON hash (변경 추적용)
  result: CalcResult
  input_summary: {
    purchase_price: number
    term_months: number
    contract_type: 'return' | 'buyout'
    annual_mileage: number
    loan_rate: number
    vehicle_class: string
  }
}

/** 실적 vs 예측 비교 데이터 */
export interface ActualVsPredicted {
  category: string
  predicted_monthly: number
  actual_monthly: number
  variance: number               // actual - predicted
  variance_pct: number           // (variance / predicted) * 100
  status: 'accurate' | 'underestimate' | 'overestimate'
}

/**
 * 실적 대비 예측 정확도 분석
 * 실제 운영 데이터가 축적되면, 각 원가 항목별로 예측 vs 실적을 비교하여
 * 계산 엔진의 정확도를 측정하고 개선 포인트를 도출합니다.
 */
export function analyzeActualVsPredicted(
  predicted: CostBreakdown,
  actuals: {
    depreciation?: number       // 실 감가 (매각 후 역산)
    insurance?: number          // 실 보험료 월평균
    maintenance?: number        // 실 정비비 월평균
    tax?: number                // 실 세금 월할
    accident_cost?: number      // 실 사고비용 월할 (리스크 항목 비교)
  }
): { items: ActualVsPredicted[]; overall_accuracy: number; recommendations: string[] } {
  const items: ActualVsPredicted[] = []
  const recommendations: string[] = []

  const compare = (category: string, predicted_monthly: number, actual_monthly: number | undefined) => {
    if (actual_monthly === undefined || actual_monthly === 0) return
    const variance = actual_monthly - predicted_monthly
    const variance_pct = predicted_monthly > 0 ? Math.round(variance / predicted_monthly * 1000) / 10 : 0
    const status: ActualVsPredicted['status'] =
      Math.abs(variance_pct) <= 10 ? 'accurate' :
      variance_pct > 0 ? 'underestimate' : 'overestimate'

    items.push({ category, predicted_monthly, actual_monthly, variance, variance_pct, status })

    // 20% 이상 차이 시 추천 생성
    if (Math.abs(variance_pct) > 20) {
      if (status === 'underestimate') {
        recommendations.push(`${category}: 실 비용이 예측 대비 ${Math.abs(variance_pct)}% 높음 → 기준값 상향 권장`)
      } else {
        recommendations.push(`${category}: 실 비용이 예측 대비 ${Math.abs(variance_pct)}% 낮음 → 기준값 하향 검토 (경쟁력 개선 여지)`)
      }
    }
  }

  compare('감가상각', predicted.depreciation.monthly, actuals.depreciation)
  compare('보험료', predicted.insurance.monthly, actuals.insurance)
  compare('정비비', predicted.maintenance.monthly, actuals.maintenance)
  compare('세금·검사', predicted.tax_inspection.monthly, actuals.tax)
  compare('리스크', predicted.risk.monthly, actuals.accident_cost)

  // 전체 정확도 = accurate 항목 비율
  const accurateCount = items.filter(i => i.status === 'accurate').length
  const overall_accuracy = items.length > 0 ? Math.round(accurateCount / items.length * 100) : 100

  if (overall_accuracy < 60) {
    recommendations.unshift('⚠️ 전체 예측 정확도가 60% 미만입니다. BusinessRules 전반적인 검토가 필요합니다.')
  }

  return { items, overall_accuracy, recommendations }
}

/**
 * BusinessRules 설정값 자동 추천 (과거 견적 데이터 기반)
 * 과거 N건의 CalcSnapshot을 분석하여 최적 설정값을 산출합니다.
 */
export function suggestBusinessRules(snapshots: CalcSnapshot[]): {
  suggestions: Array<{
    key: string
    current_value: number
    suggested_value: number
    reason: string
    confidence: 'high' | 'medium' | 'low'
  }>
  sample_size: number
  analysis_period: string
} {
  if (snapshots.length < 5) {
    return {
      suggestions: [],
      sample_size: snapshots.length,
      analysis_period: '데이터 부족 (최소 5건 필요)',
    }
  }

  const suggestions: Array<{
    key: string; current_value: number; suggested_value: number
    reason: string; confidence: 'high' | 'medium' | 'low'
  }> = []

  // 감가율 분석: 실제 market_analysis.rent_to_price_ratio 평균
  const ratios = snapshots.map(s => s.result.market_analysis.rent_to_price_ratio).filter(r => r > 0)
  if (ratios.length >= 3) {
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
    // rent-to-price가 업계 평균(2.2%)보다 너무 높으면 감가율 또는 마진 조정 필요
    if (avgRatio > 2.8) {
      suggestions.push({
        key: 'DEFAULT_MARGIN_RATE',
        current_value: 0, // 호출 시 채워짐
        suggested_value: Math.round((avgRatio - 0.3) * 100) / 100,
        reason: `평균 rent/price 비율 ${avgRatio}%로 높음 — 마진 하향 시 경쟁력 개선`,
        confidence: ratios.length >= 10 ? 'high' : 'medium',
      })
    }
  }

  // 마진율 분석
  const margins = snapshots.map(s => s.result.market_analysis.margin_rate).filter(m => m > 0)
  if (margins.length >= 3) {
    const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length
    if (avgMargin > 15) {
      suggestions.push({
        key: 'OVERHEAD_RATE',
        current_value: 0,
        suggested_value: Math.max(3, Math.round(avgMargin * 0.3 * 10) / 10),
        reason: `평균 마진율 ${avgMargin.toFixed(1)}%로 높음 — 간접비 비중 재검토`,
        confidence: margins.length >= 10 ? 'high' : 'medium',
      })
    }
  }

  // 경쟁력 지수 분석
  const compIndexes = snapshots.map(s => s.result.market_analysis.competitive_index).filter(c => c > 0)
  if (compIndexes.length >= 3) {
    const avgCI = compIndexes.reduce((a, b) => a + b, 0) / compIndexes.length
    if (avgCI > 1.2) {
      suggestions.push({
        key: 'RISK_RESERVE_RATE',
        current_value: 0,
        suggested_value: Math.max(1, Math.round((3 * (1 / avgCI)) * 10) / 10),
        reason: `경쟁력 지수 ${avgCI.toFixed(2)} (>1.2) — 리스크 적립 하향으로 가격 경쟁력 확보`,
        confidence: compIndexes.length >= 10 ? 'high' : 'low',
      })
    }
  }

  // 분석 기간
  const dates = snapshots.map(s => s.created_at).sort()
  const period = dates.length >= 2
    ? `${dates[0].slice(0, 10)} ~ ${dates[dates.length - 1].slice(0, 10)} (${snapshots.length}건)`
    : `${snapshots.length}건`

  return { suggestions, sample_size: snapshots.length, analysis_period: period }
}

/**
 * CalcInput → 스냅샷용 요약 생성 (DB 저장용 경량 데이터)
 */
export function createCalcSnapshot(
  quoteId: string,
  vehicleId: string,
  input: CalcInput,
  result: CalcResult
): CalcSnapshot {
  // 간단한 hash: JSON 문자열 기반 (실제 운영에서는 crypto.subtle 등 사용)
  const inputStr = JSON.stringify({
    pp: input.vehicle.purchase_price,
    tm: input.contract.term_months,
    ct: input.contract.contract_type,
    lr: input.finance.loan_rate,
  })
  const hash = inputStr.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0).toString(36)

  return {
    quote_id: quoteId,
    vehicle_id: vehicleId,
    created_at: new Date().toISOString(),
    input_hash: hash,
    result,
    input_summary: {
      purchase_price: input.vehicle.purchase_price,
      term_months: input.contract.term_months,
      contract_type: input.contract.contract_type,
      annual_mileage: input.contract.annual_mileage,
      loan_rate: input.finance.loan_rate,
      vehicle_class: input.depreciation.class_override || 'auto',
    },
  }
}
