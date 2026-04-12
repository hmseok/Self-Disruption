/**
 * rent-calc.ts
 * Pure calculation functions for rental car pricing
 * Extracted from RentPricingBuilder.tsx
 */

import type {
  CarData,
  DepAxes,
  InsVehicleClass,
  DriverAgeGroup,
} from './rent-calc-types'
import {
  IMPORT_BRANDS,
  EV_FUEL_KEYWORDS,
  EV_MODEL_KEYWORDS,
  HEV_KEYWORDS,
  PREMIUM_MODELS,
} from './rent-calc-types'

// ============================================
// 감가 분류 매핑 함수
// ============================================
export function mapToDepAxes(brand: string, model: string, fuelType?: string, purchasePrice?: number): DepAxes {
  const b = (brand || '').toUpperCase()
  const m = (model || '').toUpperCase()
  const f = (fuelType || '').toUpperCase()
  const isImport = IMPORT_BRANDS.some(ib => b.includes(ib.toUpperCase()))
  const isEV = EV_FUEL_KEYWORDS.some(k => f.includes(k.toUpperCase())) || EV_MODEL_KEYWORDS.some(k => m.includes(k.toUpperCase()))
  const isHEV = HEV_KEYWORDS.some(k => m.includes(k.toUpperCase()) || f.includes(k.toUpperCase()))
  const isPremium = PREMIUM_MODELS.some(pm => m.includes(pm.toUpperCase()))

  // 연료 타입 결정
  const fuel: DepAxes['fuel_type'] = isEV ? '전기' : isHEV ? '하이브리드' : '내연기관'
  // 원산지 결정
  const origin: DepAxes['origin'] = isImport ? '수입' : '국산'

  // 차급 결정
  let vc: DepAxes['vehicle_class'] = '중형_세단' // 기본 폴백

  if (isImport && isPremium) {
    vc = '프리미엄'
  } else if (isImport) {
    const price = purchasePrice || 0
    if (price >= 80000000) vc = '대형_세단'
    else if (m.includes('SUV') || m.includes('GLC') || m.includes('X3') || m.includes('X5') || m.includes('Q5') || m.includes('Q7'))
      vc = '중형_SUV'
    else vc = '중형_세단'
  } else {
    // 국산차 — EV 모델별 차급 매핑 우선 적용
    if (m.includes('EV9'))
      vc = '대형_SUV'
    else if (m.includes('EV6') || m.includes('아이오닉5') || m.includes('IONIQ 5') || m.includes('아이오닉6') || m.includes('IONIQ 6'))
      vc = '중형_SUV'   // 아이오닉5/EV6는 CUV — 중형_SUV 매핑
    else if (m.includes('EV4') || m.includes('EV3') || m.includes('코나 일렉트릭') || m.includes('KONA ELECTRIC') || m.includes('니로') || m.includes('NIRO'))
      vc = '소형_SUV'   // EV3, EV4, 코나EV, 니로EV — 소형 SUV
    else if (m.includes('EV5'))
      vc = '중형_SUV'
    // ── 일반 내연기관/하이브리드 국산차 ──
    else if (m.includes('팰리세이드') || m.includes('쏘렌토') || m.includes('모하비'))
      vc = '대형_SUV'
    else if (m.includes('투싼') || m.includes('스포티지') || m.includes('싼타페') || m.includes('SANTA'))
      vc = '중형_SUV'
    else if (m.includes('셀토스') || m.includes('코나') || m.includes('XM3') || m.includes('트랙스'))
      vc = '소형_SUV'
    else if (m.includes('카니발') || m.includes('스타리아') || m.includes('CARNIVAL') || m.includes('STARIA'))
      vc = 'MPV'
    else if (m.includes('모닝') || m.includes('레이') || m.includes('캐스퍼') || m.includes('MORNING') || m.includes('RAY'))
      vc = '경차'
    else if (m.includes('그랜저') || m.includes('K8') || m.includes('GRANDEUR'))
      vc = '중형_세단'
    else if (m.includes('제네시스') || m.includes('GENESIS'))
      vc = '대형_세단'
    else if (m.includes('쏘나타') || m.includes('K5') || m.includes('SONATA'))
      vc = '준중형_세단'
    else if (m.includes('아반떼') || m.includes('K3') || m.includes('AVANTE'))
      vc = '소형_세단'
    else {
      // 폴백: 가격 기준
      const price = purchasePrice || 0
      if (price < 20000000) vc = '경차'
      else if (price < 35000000) vc = '준중형_세단'
      else if (price < 50000000) vc = '중형_세단'
      else vc = '대형_SUV'
    }
  }

  const label = `${origin} ${vc.replace(/_/g, ' ')} ${fuel !== '내연기관' ? fuel : ''}`.trim()
  return { origin, vehicle_class: vc, fuel_type: fuel, label }
}

// 하위 호환: 기존 코드에서 flat 카테고리 문자열이 필요한 경우
export function mapToDepCategory(brand: string, model: string, fuelType?: string, purchasePrice?: number): string {
  return mapToDepAxes(brand, model, fuelType, purchasePrice).label
}

// 보험 유형 매핑
export function mapToInsuranceType(brand: string, fuelType?: string): string {
  const isImport = IMPORT_BRANDS.some(ib => (brand || '').toUpperCase().includes(ib.toUpperCase()))
  const isEV = EV_FUEL_KEYWORDS.some(k => (fuelType || '').toUpperCase().includes(k.toUpperCase()))
  if (isEV) return '전기차'
  if (isImport) return '수입 승용'
  return '국산 승용'
}

// ============================================
// 🛡️ 렌터카 공제조합 보험료 추정 시스템
// ============================================
// 기준: 렌터카공제조합(KRMA) 영업용 공제 요율 기반 추정
// 실제 요율은 가입 후 TORIS 시스템에서 확인, 아래는 업계 평균 추정치

export function getInsVehicleClass(cc: number, brand: string, purchasePrice: number, fuelType?: string): InsVehicleClass {
  const isImport = IMPORT_BRANDS.some(ib => (brand || '').toUpperCase().includes(ib.toUpperCase()))
  if (isImport || purchasePrice >= 60000000) return '수입'
  if (cc <= 1000 || purchasePrice < 18000000) return '경형'
  if (cc <= 1600 || purchasePrice < 28000000) return '소형'
  if (cc <= 2000 || purchasePrice < 45000000) return '중형'
  return '대형'
}

// ── 실데이터 보정 기본 분담금 (KRMA 공제조합 2026.01 실청약서 7건 분석) ──
// 대인I+대인II+대물+자기신체+무보험+긴급출동+한도할증 = 거의 고정
export const INS_BASE_ANNUAL: Record<string, number> = {
  '승용':   923830,   // 월 ~7.7만 (실데이터: 전기차/승용 공통)
  '다인승': 925330,   // 월 ~7.7만 (카니발 등 — 대인I/II 약간 낮고 대물이 높음)
  '경형':   880000,   // 추정: 경차 할인 적용
  '소형':   923830,   // 승용과 동일
  '중형':   923830,
  '대형':   923830,
  '수입':   923830,   // 승용과 동일 (자차에서 차등 발생)
}

// ── 실데이터 보정 자차 요율 (차량가 대비 %) ──
// 기존 수입차 4.2%는 크게 과대 → 실제 테슬라 2.16~2.18%
export const INS_OWN_DAMAGE_RATE: Record<InsVehicleClass, number> = {
  '경형': 1.90,   // 추정 (실데이터 부족)
  '소형': 1.96,   // 실데이터: 아이오닉6(1.96%), EV6(1.96%)
  '중형': 2.00,   // 실데이터: EV4(1.96%), 모델Y RWD(2.16%) 평균
  '대형': 2.10,   // 추정: 대형 국산
  '수입': 2.18,   // 실데이터: 테슬라 모델Y LR(2.18%), RWD(2.16%)
}

// 면책금별 자차보험 할인율
export const DEDUCTIBLE_DISCOUNT: Record<number, number> = {
  0: 1.0,         // 완전자차 (면책금 없음) → 할인 없음
  200000: 0.92,   // 20만원 면책
  300000: 0.88,   // 30만원 면책
  500000: 0.82,   // 50만원 면책
  1000000: 0.72,  // 100만원 면책
  1500000: 0.65,  // 150만원 면책
  2000000: 0.60,  // 200만원 면책
}

// 운전자 연령 기준 (렌터카 공제조합 실무)
// 실무: 26세이상이 표준, 21세이상은 할증, 전연령은 최대 할증
export const DRIVER_AGE_FACTORS: Record<DriverAgeGroup, { factor: number; label: string; desc: string }> = {
  '26세이상': { factor: 1.00, label: '만 26세 이상', desc: '표준 요율 (가장 일반적)' },
  '21세이상': { factor: 1.40, label: '만 21세 이상', desc: '젊은층 할증 +40%' },
  '전연령':   { factor: 1.65, label: '전 연령',      desc: '최대 할증 +65%' },
}

// 차령(차량 나이)별 보험료 조정
export function getCarAgeFactor(carAge: number): number {
  if (carAge <= 1) return 1.0    // 신차~1년
  if (carAge <= 3) return 0.95   // 1~3년 (차량가 하락 → 자차 기준 감소)
  if (carAge <= 5) return 0.90
  if (carAge <= 7) return 0.85
  return 0.80                    // 7년 이상
}

// 면책금에 가장 가까운 할인율 찾기
export function getDeductibleDiscount(deductible: number): number {
  const thresholds = Object.keys(DEDUCTIBLE_DISCOUNT).map(Number).sort((a, b) => a - b)
  let closest = 0
  for (const t of thresholds) {
    if (deductible >= t) closest = t
  }
  return DEDUCTIBLE_DISCOUNT[closest] || 1.0
}

// 종합 보험료 산출
export function estimateInsurance(params: {
  cc: number
  brand: string
  purchasePrice: number
  factoryPrice: number
  fuelType?: string
  driverAge: DriverAgeGroup
  deductible: number
  carAge: number
  isCommercial?: boolean  // true=영업용(기본), false=비영업용
  ownDamageCoverageRatio?: number  // 자차보장비율 0~100% (기본 100 = 전액보장)
}): {
  vehicleClass: InsVehicleClass
  basePremium: number        // 기본 공제료 (대인/대물/자손/무보험)
  ownDamagePremium: number   // 자차보험료
  ageFactor: number          // 연령 계수
  carAgeFactor: number       // 차령 계수
  deductibleDiscount: number // 면책금 할인율
  totalAnnual: number        // 연간 총 보험료
  totalMonthly: number       // 월 보험료
  breakdown: {
    label: string
    annual: number
    monthly: number
  }[]
} {
  const vehicleClass = getInsVehicleClass(params.cc, params.brand, params.purchasePrice, params.fuelType)
  const ageFactor = DRIVER_AGE_FACTORS[params.driverAge].factor
  const carAgeFactor = getCarAgeFactor(params.carAge)
  const deductibleDiscount = getDeductibleDiscount(params.deductible)

  // 기본 분담금 — 실데이터 기준 거의 고정값 (차량유형별)
  // 실데이터: 승용 923,830 / 다인승 925,330 (연령/차령 영향 미미)
  // 비영업용: 개인보험사 기준 — 영업용 대비 기본분담금 약 30% 높고, 자차 요율도 다름
  const isNonCommercial = params.isCommercial === false
  const baseKey = vehicleClass === '수입' ? '수입' : vehicleClass
  const rawBase = INS_BASE_ANNUAL[baseKey] || INS_BASE_ANNUAL['승용']
  const nonCommercialBaseFactor = isNonCommercial ? 1.30 : 1.0  // 비영업용은 개인보험사 기준 ~30% 할증
  const basePremium = Math.round(rawBase * ageFactor * nonCommercialBaseFactor)

  // 자차보험 = 차량가액 × 자차요율% × 면책금할인 × 차령계수 × 보장비율
  // 실데이터: 국산전기 1.79~1.96%, 수입전기 2.16~2.18%
  // 비영업용: 자차요율 약 15% 높음 (개인보험사 기준)
  const nonCommercialOwnFactor = isNonCommercial ? 1.15 : 1.0
  const ownDamageRate = (INS_OWN_DAMAGE_RATE[vehicleClass] / 100) * nonCommercialOwnFactor
  const vehicleValue = params.factoryPrice > 0 ? params.factoryPrice : params.purchasePrice
  const coverageRatio = (params.ownDamageCoverageRatio ?? 100) / 100  // 자차보장비율 (60% → 0.6)
  const ownDamagePremium = Math.round(
    vehicleValue * ownDamageRate * deductibleDiscount * carAgeFactor * coverageRatio
  )

  const totalAnnual = basePremium + ownDamagePremium
  const totalMonthly = Math.round(totalAnnual / 12)

  // 실데이터 기반 담보별 비중 (KRMA 승용 기준)
  // 대인I: 284,720 (30.8%), 대인II: 189,000 (20.5%), 대물: 349,860 (37.9%)
  // 자기신체: 29,100 (3.2%), 무보험: 33,470 (3.6%), 긴급출동+한도: 37,680 (4.1%)
  return {
    vehicleClass,
    basePremium,
    ownDamagePremium,
    ageFactor,
    carAgeFactor,
    deductibleDiscount,
    totalAnnual,
    totalMonthly,
    breakdown: [
      { label: '대인배상 I (의무)', annual: Math.round(basePremium * 0.308), monthly: Math.round(basePremium * 0.308 / 12) },
      { label: '대인배상 II (무한)', annual: Math.round(basePremium * 0.205), monthly: Math.round(basePremium * 0.205 / 12) },
      { label: '대물배상 (2억)', annual: Math.round(basePremium * 0.379), monthly: Math.round(basePremium * 0.379 / 12) },
      { label: '자기신체사고', annual: Math.round(basePremium * 0.032), monthly: Math.round(basePremium * 0.032 / 12) },
      { label: '무보험차상해', annual: Math.round(basePremium * 0.036), monthly: Math.round(basePremium * 0.036 / 12) },
      { label: '긴급출동+한도할증', annual: Math.round(basePremium * 0.041), monthly: Math.round(basePremium * 0.041 / 12) },
      { label: `자차손해 (면책 ${(params.deductible / 10000).toFixed(0)}만·보장${Math.round(coverageRatio * 100)}%)`, annual: ownDamagePremium, monthly: Math.round(ownDamagePremium / 12) },
    ],
  }
}

// 정비 유형 매핑
export function mapToMaintenanceType(brand: string, model: string, fuelType?: string, purchasePrice?: number): { type: string, fuel: string } {
  const isImport = IMPORT_BRANDS.some(ib => (brand || '').toUpperCase().includes(ib.toUpperCase()))
  const fUp = (fuelType || '').toUpperCase()
  const mUp = (model || '').toUpperCase()
  const isEV = EV_FUEL_KEYWORDS.some(k => fUp.includes(k.toUpperCase())) || EV_MODEL_KEYWORDS.some(k => mUp.includes(k.toUpperCase()))
  const isHEV = HEV_KEYWORDS.some(k => ((fuelType || '') + (model || '')).toUpperCase().includes(k.toUpperCase()))

  if (isEV) return { type: '전기차', fuel: '전기' }
  if (isHEV) return { type: '하이브리드', fuel: '하이브리드' }
  if (isImport) return { type: '수입차', fuel: '내연기관' }

  const price = purchasePrice || 0
  if (price >= 40000000) return { type: '국산 대형/SUV', fuel: '내연기관' }
  if (price >= 25000000) return { type: '국산 중형', fuel: '내연기관' }
  return { type: '국산 경차/소형', fuel: '내연기관' }
}

// ============================================
// 초과주행 요금
// ============================================
// 초과주행 km당 추가요금 fallback (약관 DB 미연동 시)
export const getExcessMileageRateFallback = (fp: number): number => {
  if (fp < 25000000) return 110; if (fp < 40000000) return 150
  if (fp < 60000000) return 200; if (fp < 80000000) return 250
  if (fp < 120000000) return 320; return 450
}

// 약관 DB excess_mileage_rates 키 매핑: 차량 보험등급 → DB 카테고리 키
// DB 키: 국산_경소형, 국산_중형, 국산_대형, 수입_소중형, 수입_대형
export function getExcessMileageRateKey(vehicleClass: InsVehicleClass): string {
  switch (vehicleClass) {
    case '경형': return '국산_경소형'
    case '소형': return '국산_경소형'
    case '중형': return '국산_중형'
    case '대형': return '국산_대형'
    case '수입': return '수입_대형' // 기본값; 가격대별로 아래에서 세분화
    default: return '국산_중형'
  }
}

// 약관 DB에서 초과주행 요금 조회 (약관 우선, fallback 보조)
export function getExcessMileageRateFromTerms(
  calcParams: Record<string, any> | undefined,
  vehicleClass: InsVehicleClass,
  purchasePrice: number
): { rate: number; source: 'terms_db' | 'fallback'; key?: string } {
  const rates = calcParams?.excess_mileage_rates
  if (!rates || typeof rates !== 'object') {
    return { rate: getExcessMileageRateFallback(purchasePrice), source: 'fallback' }
  }
  // 수입차는 가격대별 세분화: 5000만 이하 → 수입_소중형, 그 외 → 수입_대형
  let key = getExcessMileageRateKey(vehicleClass)
  if (vehicleClass === '수입' && purchasePrice < 50000000) {
    key = '수입_소중형'
  }
  const dbRate = rates[key]
  if (typeof dbRate === 'number' && dbRate > 0) {
    return { rate: dbRate, source: 'terms_db', key }
  }
  // DB에 해당 키 없으면 fallback
  return { rate: getExcessMileageRateFallback(purchasePrice), source: 'fallback' }
}

// ============================================
// 🔧 정비 패키지 상수
// ============================================
export type MaintenancePackage = 'self' | 'oil_only' | 'basic' | 'full'

export const MAINTENANCE_PACKAGES: Record<MaintenancePackage, {
  label: string; desc: string; icon: string; monthly: number
}> = {
  self:     { label: '자가정비', desc: '고객 직접 정비 (정비비 미포함)', icon: '🙋', monthly: 0 },
  oil_only: { label: '엔진오일', desc: '엔진오일+필터 교환만 포함', icon: '🛢️', monthly: 15000 },
  basic:    { label: '기본정비', desc: '오일+점검+순회정비 포함', icon: '🔧', monthly: 40000 },
  full:     { label: '종합정비', desc: '전 항목 관리 (타이어·배터리 포함)', icon: '🏥', monthly: 80000 },
}

// 차량 유형별 정비비 배수
export const MAINT_MULTIPLIER: Record<string, number> = {
  '국산 경차/소형': 0.7,
  '국산 중형': 1.0,
  '국산 대형/SUV': 1.3,
  '수입차': 1.8,
  '전기차': 0.6,
  '하이브리드': 1.0,
}

// 정비 항목별 교체주기(km)와 1회 비용(원) — 국산 중형 기준
// 각 정비 상품에 포함되는 항목이 다름
export type MaintItem = { name: string; cycleKm: number; costPer: number; packages: MaintenancePackage[]; evExclude?: boolean }
export const MAINT_ITEMS: MaintItem[] = [
  // 엔진오일 상품부터 포함
  { name: '엔진오일+필터',       cycleKm: 10000,  costPer: 80000,   packages: ['oil_only', 'basic', 'full'], evExclude: true },
  // 기본정비부터 포함
  { name: '에어컨필터',          cycleKm: 15000,  costPer: 20000,   packages: ['basic', 'full'] },
  { name: '에어클리너',          cycleKm: 20000,  costPer: 25000,   packages: ['basic', 'full'], evExclude: true },
  { name: '와이퍼',              cycleKm: 20000,  costPer: 30000,   packages: ['basic', 'full'] },
  { name: '점화플러그',          cycleKm: 40000,  costPer: 60000,   packages: ['basic', 'full'], evExclude: true },
  { name: '순회정비(방문점검)',   cycleKm: 20000,  costPer: 30000,   packages: ['basic', 'full'] },
  // 종합정비만 포함
  { name: '브레이크패드(전)',     cycleKm: 40000,  costPer: 120000,  packages: ['full'] },
  { name: '브레이크패드(후)',     cycleKm: 60000,  costPer: 100000,  packages: ['full'] },
  { name: '타이어(4본)',         cycleKm: 50000,  costPer: 400000,  packages: ['full'] },
  { name: '배터리',              cycleKm: 60000,  costPer: 150000,  packages: ['full'] },
  { name: '미션오일',            cycleKm: 60000,  costPer: 80000,   packages: ['full'], evExclude: true },
  { name: '냉각수/부동액',       cycleKm: 40000,  costPer: 50000,   packages: ['full'], evExclude: true },
]

// 정비 상품별 km당 정비비 산출
export function getMaintCostPerKm(pkg: MaintenancePackage, multiplier: number = 1.0, isEV: boolean = false): { total: number; items: { name: string; perKm: number }[] } {
  if (pkg === 'self') return { total: 0, items: [] }
  const items = MAINT_ITEMS
    .filter(item => item.packages.includes(pkg) && !(isEV && item.evExclude))
    .map(item => ({
      name: item.name,
      perKm: Math.round((item.costPer / item.cycleKm) * multiplier),
    }))
  const total = items.reduce((sum, i) => sum + i.perKm, 0)
  return { total, items }
}

// ============================================
// 📉 감가 곡선 프리셋 (비선형 모델)
// ============================================
// 연도별 누적 감가율 (%) — index 0 = 0년차(신차), 1 = 1년차, ...
// 10년 이상은 마지막 값 기반 외삽
export type DepCurvePreset = 'db_based' | 'conservative' | 'standard' | 'optimistic' | 'custom'

export const DEP_CURVE_PRESETS: Record<Exclude<DepCurvePreset, 'custom' | 'db_based'>, {
  label: string; desc: string; curve: number[]
}> = {
  conservative: {
    label: '보수적',
    desc: '잔가율표 기준 (세금/보험 산정용, 가장 높은 감가)',
    //        0yr  1yr   2yr   3yr   4yr   5yr   6yr   7yr   8yr   9yr  10yr
    curve: [  0,  27.5, 40.0, 47.4, 56.2, 61.3, 65.0, 68.5, 71.6, 74.3, 76.8 ],
  },
  standard: {
    label: '표준',
    desc: '잔가율표 + 실거래 혼합 (렌터카 실무 기준)',
    curve: [  0,  20.0, 32.0, 40.0, 48.0, 54.0, 59.0, 63.0, 66.5, 69.5, 72.0 ],
  },
  optimistic: {
    label: '낙관적',
    desc: '인기차종/SUV 실거래 기준 (감가 최소)',
    curve: [  0,  14.0, 23.0, 30.0, 37.0, 43.0, 48.5, 53.0, 57.0, 60.5, 63.5 ],
  },
}

/**
 * depreciation_rates 테이블의 잔존율(%) → 감가율 곡선 변환
 * rate_1yr=80.0(잔존율 80%) → 감가율 20% → curve[1]=20.0
 * 5년 이후는 마지막 2년 기울기로 외삽 (최대 10년까지)
 */
export function buildCurveFromDbRates(dbRecord: any): number[] {
  if (!dbRecord) return DEP_CURVE_PRESETS.standard.curve
  const r1 = 100 - Number(dbRecord.rate_1yr || 80)
  const r2 = 100 - Number(dbRecord.rate_2yr || 68)
  const r3 = 100 - Number(dbRecord.rate_3yr || 58)
  const r4 = 100 - Number(dbRecord.rate_4yr || 48)
  const r5 = 100 - Number(dbRecord.rate_5yr || 38)
  // 5년→10년 외삽: 마지막 구간 기울기 유지
  const slope = r5 - r4
  const curve = [0, r1, r2, r3, r4, r5]
  for (let i = 6; i <= 10; i++) {
    curve.push(Math.min(curve[i - 1] + slope, 90))
  }
  return curve
}

// 차종 클래스별 감가 보정 계수 (프리셋 곡선 사용 시만 적용, DB 기반은 1.0)
// ※ DB 기반(db_based)에서는 depreciation_rates 테이블에 3축별 잔존율이 이미 반영되어 있으므로
//   이 테이블은 무시됨. standard/conservative 등 하드코딩 곡선 사용 시에만 활용.
// 키는 effectiveAxes.label 형식: "{origin} {vehicle_class} {fuel_type}" (예: "국산 중형 세단 전기")
export const DEP_CLASS_MULTIPLIER: Record<string, { label: string; mult: number }> = {
  // ── 국산 내연기관 ──
  '국산 경차':         { label: '국산 경차', mult: 1.05 },
  '국산 소형 세단':     { label: '국산 소형 세단', mult: 0.95 },
  '국산 준중형 세단':    { label: '국산 준중형 세단', mult: 0.90 },
  '국산 중형 세단':     { label: '국산 중형 세단', mult: 1.0 },
  '국산 대형 세단':     { label: '국산 대형 세단', mult: 1.10 },
  '국산 소형 SUV':     { label: '국산 소형 SUV', mult: 0.85 },
  '국산 중형 SUV':     { label: '국산 중형 SUV', mult: 0.85 },
  '국산 대형 SUV':     { label: '국산 대형 SUV', mult: 0.90 },
  '국산 MPV':          { label: '국산 MPV', mult: 0.95 },
  // ── 수입 내연기관 ──
  '수입 중형 세단':     { label: '수입 중형 세단', mult: 1.15 },
  '수입 대형 세단':     { label: '수입 대형 세단', mult: 1.25 },
  '수입 중형 SUV':     { label: '수입 중형 SUV', mult: 1.0 },
  '수입 프리미엄':      { label: '수입 프리미엄', mult: 1.20 },
  // ── 국산 전기차 (label에 "전기" 포함) ──
  '국산 소형 세단 전기':  { label: '국산 소형 전기', mult: 1.0 },
  '국산 준중형 세단 전기': { label: '국산 준중형 전기', mult: 1.0 },
  '국산 중형 세단 전기':  { label: '국산 중형 전기', mult: 1.0 },
  '국산 대형 세단 전기':  { label: '국산 대형 전기', mult: 1.05 },
  '국산 소형 SUV 전기':  { label: '국산 소형SUV 전기', mult: 1.0 },
  '국산 중형 SUV 전기':  { label: '국산 중형SUV 전기', mult: 1.0 },
  '국산 대형 SUV 전기':  { label: '국산 대형SUV 전기', mult: 1.05 },
  // ── 수입 전기차 ──
  '수입 중형 세단 전기':  { label: '수입 중형 전기', mult: 1.10 },
  '수입 대형 세단 전기':  { label: '수입 대형 전기', mult: 1.15 },
  '수입 중형 SUV 전기':  { label: '수입 중형SUV 전기', mult: 1.10 },
  '수입 프리미엄 전기':   { label: '수입 프리미엄 전기', mult: 1.20 },
  // ── 하이브리드 ──
  '국산 소형 세단 하이브리드':  { label: '국산 소형 HEV', mult: 0.90 },
  '국산 준중형 세단 하이브리드': { label: '국산 준중형 HEV', mult: 0.85 },
  '국산 중형 세단 하이브리드':  { label: '국산 중형 HEV', mult: 0.85 },
  '국산 대형 세단 하이브리드':  { label: '국산 대형 HEV', mult: 0.90 },
  '국산 소형 SUV 하이브리드':  { label: '국산 소형SUV HEV', mult: 0.85 },
  '국산 중형 SUV 하이브리드':  { label: '국산 중형SUV HEV', mult: 0.85 },
  '국산 대형 SUV 하이브리드':  { label: '국산 대형SUV HEV', mult: 0.85 },
  '국산 MPV 하이브리드':      { label: '국산 MPV HEV', mult: 0.85 },
  '수입 중형 세단 하이브리드':  { label: '수입 중형 HEV', mult: 1.0 },
  '수입 중형 SUV 하이브리드':  { label: '수입 중형SUV HEV', mult: 1.0 },
  '수입 프리미엄 하이브리드':   { label: '수입 프리미엄 HEV', mult: 1.10 },
}

// 감가 곡선에서 특정 연차의 누적 감가율 보간 (소수 연차 지원)
export function getDepRateFromCurve(curve: number[], age: number, classMultiplier: number = 1.0): number {
  if (age <= 0) return 0
  const maxIdx = curve.length - 1
  if (age >= maxIdx) {
    // 10년 이상: 마지막 구간 기울기로 외삽
    const lastSlope = curve[maxIdx] - curve[maxIdx - 1]
    const extraYears = age - maxIdx
    const raw = curve[maxIdx] + lastSlope * extraYears
    return Math.min(raw * classMultiplier, 90)
  }
  // 선형 보간
  const lower = Math.floor(age)
  const upper = Math.ceil(age)
  if (lower === upper) return Math.min(curve[lower] * classMultiplier, 90)
  const frac = age - lower
  const raw = curve[lower] + (curve[upper] - curve[lower]) * frac
  return Math.min(raw * classMultiplier, 90)
}

// ============================================
// IRR (내부수익률) 계산 — Newton-Raphson법
// cashFlows: [t0, t1, t2, ...tN] 배열 (월 단위 현금흐름)
// returns: 월 IRR → 연환산 IRR(%)
// ============================================
export function calcMonthlyIRR(cashFlows: number[], maxIter = 200, tol = 1e-8): number | null {
  // Newton-Raphson: NPV(r)=0 풀기
  let r = 0.005 // 초기 추정 월 0.5%
  for (let i = 0; i < maxIter; i++) {
    let npv = 0, dnpv = 0
    for (let t = 0; t < cashFlows.length; t++) {
      const disc = Math.pow(1 + r, t)
      npv += cashFlows[t] / disc
      if (t > 0) dnpv -= t * cashFlows[t] / Math.pow(1 + r, t + 1)
    }
    if (Math.abs(dnpv) < 1e-15) break
    const rNew = r - npv / dnpv
    if (Math.abs(rNew - r) < tol) return rNew
    r = rNew
    // 발산 방지
    if (r < -0.5 || r > 1) return null
  }
  return r
}

export function calcIRR(initialInvestment: number, monthlyIncome: number, termMonths: number, terminalValue: number, depositReceived: number = 0, prepaymentReceived: number = 0): { monthlyIRR: number; annualIRR: number; totalReturn: number; multiple: number } | null {
  if (initialInvestment <= 0 || monthlyIncome <= 0 || termMonths <= 0) return null
  // 현금흐름 배열 구성 (월 단위)
  // t=0: -투자금 + 보증금수취 + 선납금수취
  // t=1~N-1: +월렌트료
  // t=N: +월렌트료 + 잔존가치회수 - 보증금반환
  const flows: number[] = []
  flows[0] = -initialInvestment + depositReceived + prepaymentReceived
  for (let t = 1; t < termMonths; t++) {
    flows[t] = monthlyIncome
  }
  flows[termMonths] = monthlyIncome + terminalValue - depositReceived // 마지막 월: 렌트료 + 처분 - 보증금반환
  const monthlyRate = calcMonthlyIRR(flows)
  if (monthlyRate === null || isNaN(monthlyRate)) return null
  const annualRate = (Math.pow(1 + monthlyRate, 12) - 1) * 100
  const totalReturn = monthlyIncome * termMonths + terminalValue - initialInvestment + prepaymentReceived
  const multiple = (monthlyIncome * termMonths + terminalValue + prepaymentReceived) / initialInvestment
  return { monthlyIRR: monthlyRate * 100, annualIRR: annualRate, totalReturn, multiple }
}
