'use client'

import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { DEFAULT_INSURANCE_COVERAGE, DEFAULT_QUOTE_NOTICES, DEFAULT_CALC_PARAMS } from '@/lib/contract-terms'

// ============================================
// 타입 정의
// ============================================
interface CarData {
  id: string
  number: string
  brand: string
  model: string
  trim?: string
  year?: number
  fuel?: string
  fuel_type?: string         // DB 컬럼명 호환 (fuel과 동일 데이터)
  mileage?: number
  purchase_price: number
  factory_price?: number
  engine_cc?: number
  image_url?: string
  status: string
  is_used?: boolean          // 중고차 여부
  purchase_mileage?: number  // 구입 시 주행거리 (km)
  is_commercial?: boolean    // 영업용 여부
}

interface MarketComp {
  id?: string
  competitor_name: string
  vehicle_info: string
  monthly_rent: number
  deposit: number
  term_months: number
  source: string
}

interface NewCarOption {
  name: string
  price: number
  description?: string
}

interface NewCarColor {
  name: string
  code?: string
  price: number
}

interface NewCarTrim {
  name: string
  base_price: number
  note?: string
  exterior_colors?: NewCarColor[]
  interior_colors?: NewCarColor[]
  options: NewCarOption[]
}

interface NewCarVariant {
  variant_name: string
  fuel_type: string
  engine_cc: number
  consumption_tax?: string    // 개별소비세 구분 (예: "개별소비세 5%", "개별소비세 3.5%")
  trims: NewCarTrim[]
}

interface NewCarResult {
  brand: string
  model: string
  model_detail?: string   // 상세모델명 (트림 포함, 예: "520i (Base, M Sport)")
  year: number
  variants: NewCarVariant[]
  available: boolean
  message?: string
  source?: string
}

interface BusinessRules {
  [key: string]: number
}

// ============================================
// 🏭 브랜드 프리셋 (국내 / 수입)
// ============================================
const DOMESTIC_BRANDS = ['기아', '현대', '제네시스', '쉐보레', '르노코리아', 'KG모빌리티']
const IMPORT_BRAND_PRESETS = ['BMW', '벤츠', '아우디', '폭스바겐', '볼보', '테슬라', '토요타', '렉서스', '포르쉐', '미니', '랜드로버', '푸조', '혼다']

// ============================================
// 🆕 기준 테이블 차종 매핑 유틸
// ============================================
const IMPORT_BRANDS = ['벤츠', 'BMW', 'BENZ', 'Mercedes', '아우디', 'Audi', '폭스바겐', 'VW', '렉서스', 'Lexus',
  '포르쉐', 'Porsche', '볼보', 'Volvo', '재규어', 'Jaguar', '랜드로버', '링컨', 'Lincoln', '캐딜락',
  '인피니티', '미니', 'MINI', '마세라티', '페라리', '람보르기니', '벤틀리', '롤스로이스', '맥라렌',
  '테슬라', 'Tesla', '리비안', 'Rivian', '폴스타', 'Polestar']

const PREMIUM_MODELS = ['S-Class', 'S클래스', '7시리즈', 'A8', 'LS', 'G80', 'G90', 'GV80', 'GV70',
  '카이엔', '파나메라', 'Cayenne', 'Panamera', 'X7', 'GLS', 'Q8', 'Range Rover']

// 전기차 판별: fuel 기반 키워드 (연료 타입에서 판별)
const EV_FUEL_KEYWORDS = ['전기', 'EV', 'Electric', 'BEV', 'ELECTRIC', '배터리', 'Battery']
// 전기차 판별: 모델명 기반 키워드 (정확한 모델명만)
const EV_MODEL_KEYWORDS = ['EV3', 'EV4', 'EV5', 'EV6', 'EV9', '아이오닉', 'IONIQ', 'EQE', 'EQS', 'EQA', 'EQB',
  'iX', 'i4', 'i5', 'i7', 'iX1', 'iX3', 'E-TRON', 'Q4 E-TRON', 'Q6 E-TRON', 'Q8 E-TRON', 'ID.3', 'ID.4', 'ID.7',
  'MODEL 3', 'MODEL Y', 'MODEL S', 'MODEL X', '모델3', '모델Y', '모델S', '모델X',
  'KONA ELECTRIC', '코나 일렉트릭', 'NIRO EV', '니로 EV', 'NIRO PLUS', '니로 플러스',
  'BOLT', '볼트', 'MACH-E', '머스탱 마하', 'ENYAQ', 'BORN', 'ARIYA', '아리아',
  'e-2008', 'e-208', 'E-C4', 'DOLPHIN', 'SEAL', 'ATTO', '돌핀', '씰', '아토']
const HEV_KEYWORDS = ['하이브리드', 'HEV', 'PHEV', 'Hybrid']

// ============================================
// 3축 감가 분류 매핑 (depreciation_rates 테이블과 1:1 매칭)
// ============================================
interface DepAxes {
  origin: '국산' | '수입'
  vehicle_class: '경차' | '소형_세단' | '준중형_세단' | '중형_세단' | '대형_세단' | '소형_SUV' | '중형_SUV' | '대형_SUV' | 'MPV' | '프리미엄'
  fuel_type: '내연기관' | '하이브리드' | '전기'
  /** 하위 호환용 flat 카테고리 라벨 */
  label: string
}

function mapToDepAxes(brand: string, model: string, fuelType?: string, purchasePrice?: number): DepAxes {
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
function mapToDepCategory(brand: string, model: string, fuelType?: string, purchasePrice?: number): string {
  return mapToDepAxes(brand, model, fuelType, purchasePrice).label
}

// 보험 유형 매핑
function mapToInsuranceType(brand: string, fuelType?: string): string {
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

// 차종 분류 (공제조합 기준 5분류)
type InsVehicleClass = '경형' | '소형' | '중형' | '대형' | '수입'

function getInsVehicleClass(cc: number, brand: string, purchasePrice: number, fuelType?: string): InsVehicleClass {
  const isImport = IMPORT_BRANDS.some(ib => (brand || '').toUpperCase().includes(ib.toUpperCase()))
  if (isImport || purchasePrice >= 60000000) return '수입'
  if (cc <= 1000 || purchasePrice < 18000000) return '경형'
  if (cc <= 1600 || purchasePrice < 28000000) return '소형'
  if (cc <= 2000 || purchasePrice < 45000000) return '중형'
  return '대형'
}

// ── 실데이터 보정 기본 분담금 (KRMA 공제조합 2026.01 실청약서 7건 분석) ──
// 대인I+대인II+대물+자기신체+무보험+긴급출동+한도할증 = 거의 고정
const INS_BASE_ANNUAL: Record<string, number> = {
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
const INS_OWN_DAMAGE_RATE: Record<InsVehicleClass, number> = {
  '경형': 1.90,   // 추정 (실데이터 부족)
  '소형': 1.96,   // 실데이터: 아이오닉6(1.96%), EV6(1.96%)
  '중형': 2.00,   // 실데이터: EV4(1.96%), 모델Y RWD(2.16%) 평균
  '대형': 2.10,   // 추정: 대형 국산
  '수입': 2.18,   // 실데이터: 테슬라 모델Y LR(2.18%), RWD(2.16%)
}

// 면책금별 자차보험 할인율
const DEDUCTIBLE_DISCOUNT: Record<number, number> = {
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
type DriverAgeGroup = '26세이상' | '21세이상' | '전연령'
const DRIVER_AGE_FACTORS: Record<DriverAgeGroup, { factor: number; label: string; desc: string }> = {
  '26세이상': { factor: 1.00, label: '만 26세 이상', desc: '표준 요율 (가장 일반적)' },
  '21세이상': { factor: 1.40, label: '만 21세 이상', desc: '젊은층 할증 +40%' },
  '전연령':   { factor: 1.65, label: '전 연령',      desc: '최대 할증 +65%' },
}

// 차령(차량 나이)별 보험료 조정
function getCarAgeFactor(carAge: number): number {
  if (carAge <= 1) return 1.0    // 신차~1년
  if (carAge <= 3) return 0.95   // 1~3년 (차량가 하락 → 자차 기준 감소)
  if (carAge <= 5) return 0.90
  if (carAge <= 7) return 0.85
  return 0.80                    // 7년 이상
}

// 면책금에 가장 가까운 할인율 찾기
function getDeductibleDiscount(deductible: number): number {
  const thresholds = Object.keys(DEDUCTIBLE_DISCOUNT).map(Number).sort((a, b) => a - b)
  let closest = 0
  for (const t of thresholds) {
    if (deductible >= t) closest = t
  }
  return DEDUCTIBLE_DISCOUNT[closest] || 1.0
}

// 종합 보험료 산출
function estimateInsurance(params: {
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
function mapToMaintenanceType(brand: string, model: string, fuelType?: string, purchasePrice?: number): { type: string, fuel: string } {
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
// 숫자 포맷 유틸
// ============================================
const f = (n: number) => Math.round(n).toLocaleString()
const parseNum = (v: string) => Number(v.replace(/,/g, '')) || 0
const fDate = (d: string) => {
  const dt = new Date(d)
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

// 정비 패키지 라벨 (견적서 표시용)
const MAINT_PACKAGE_LABELS: Record<string, string> = {
  self: '자가정비', oil_only: '엔진오일 교환', basic: '기본정비', full: '종합정비',
}
const MAINT_PACKAGE_DESC: Record<string, string> = {
  self: '고객 직접 정비 (렌탈료 미포함)',
  oil_only: '엔진오일+필터 교환 포함',
  basic: '오일+에어필터+브레이크점검+순회정비 포함',
  full: '오일+필터+브레이크+타이어+배터리+와이퍼+냉각수 전항목 포함',
}
// 초과주행 km당 추가요금 fallback (약관 DB 미연동 시)
const getExcessMileageRateFallback = (fp: number): number => {
  if (fp < 25000000) return 110; if (fp < 40000000) return 150
  if (fp < 60000000) return 200; if (fp < 80000000) return 250
  if (fp < 120000000) return 320; return 450
}

// 약관 DB excess_mileage_rates 키 매핑: 차량 보험등급 → DB 카테고리 키
// DB 키: 국산_경소형, 국산_중형, 국산_대형, 수입_소중형, 수입_대형
function getExcessMileageRateKey(vehicleClass: InsVehicleClass): string {
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
function getExcessMileageRateFromTerms(
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
type MaintenancePackage = 'self' | 'oil_only' | 'basic' | 'full'

const MAINTENANCE_PACKAGES: Record<MaintenancePackage, {
  label: string; desc: string; icon: string; monthly: number
}> = {
  self:     { label: '자가정비', desc: '고객 직접 정비 (정비비 미포함)', icon: '🙋', monthly: 0 },
  oil_only: { label: '엔진오일', desc: '엔진오일+필터 교환만 포함', icon: '🛢️', monthly: 15000 },
  basic:    { label: '기본정비', desc: '오일+점검+순회정비 포함', icon: '🔧', monthly: 40000 },
  full:     { label: '종합정비', desc: '전 항목 관리 (타이어·배터리 포함)', icon: '🏥', monthly: 80000 },
}

// 차량 유형별 정비비 배수
const MAINT_MULTIPLIER: Record<string, number> = {
  '국산 경차/소형': 0.7,
  '국산 중형': 1.0,
  '국산 대형/SUV': 1.3,
  '수입차': 1.8,
  '전기차': 0.6,
  '하이브리드': 1.0,
}

// 정비 항목별 교체주기(km)와 1회 비용(원) — 국산 중형 기준
// 각 정비 상품에 포함되는 항목이 다름
type MaintItem = { name: string; cycleKm: number; costPer: number; packages: MaintenancePackage[]; evExclude?: boolean }
const MAINT_ITEMS: MaintItem[] = [
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
function getMaintCostPerKm(pkg: MaintenancePackage, multiplier: number = 1.0, isEV: boolean = false): { total: number; items: { name: string; perKm: number }[] } {
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
type DepCurvePreset = 'db_based' | 'conservative' | 'standard' | 'optimistic' | 'custom'

const DEP_CURVE_PRESETS: Record<Exclude<DepCurvePreset, 'custom' | 'db_based'>, {
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
function buildCurveFromDbRates(dbRecord: any): number[] {
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
const DEP_CLASS_MULTIPLIER: Record<string, { label: string; mult: number }> = {
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
function getDepRateFromCurve(curve: number[], age: number, classMultiplier: number = 1.0): number {
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
function calcMonthlyIRR(cashFlows: number[], maxIter = 200, tol = 1e-8): number | null {
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

function calcIRR(initialInvestment: number, monthlyIncome: number, termMonths: number, terminalValue: number, depositReceived: number = 0, prepaymentReceived: number = 0): { monthlyIRR: number; annualIRR: number; totalReturn: number; multiple: number } | null {
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

// ============================================
// 서브 컴포넌트 (렌더 밖에 정의 — 커서 이탈 방지)
// ============================================

// 원가 비중 바
const CostBar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
  const pct = total > 0 ? Math.abs(value) / total * 100 : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-gray-500 text-xs">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="w-24 text-right font-bold text-xs">{f(value)}원</span>
      <span className="w-10 text-right text-gray-400 text-xs">{pct.toFixed(0)}%</span>
    </div>
  )
}

// 섹션 카드 래퍼
const Section = ({ icon, title, children, className = '', defaultOpen = true, summary }: {
  icon: string; title: string; children: React.ReactNode; className?: string; defaultOpen?: boolean; summary?: React.ReactNode
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between hover:bg-gray-100/50 transition-colors gap-2"
      >
        <h3 className="font-bold text-gray-800 flex items-center gap-2 text-xs shrink-0 whitespace-nowrap">
          <span>{icon}</span> {title}
        </h3>
        <div className="flex items-center gap-2 min-w-0">
          {!open && summary && <div className="text-xs text-gray-400 font-medium whitespace-nowrap truncate">{summary}</div>}
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  )
}

// 입력 행
const InputRow = ({ label, value, onChange, suffix = '원', type = 'money', sub = '' }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; type?: string; sub?: string
}) => {
  // percent 타입: 소수점 입력 중간 상태를 보존하기 위해 별도 문자열 상태 사용
  const [localStr, setLocalStr] = useState(type === 'percent' ? String(value) : '')
  const [isFocused, setIsFocused] = useState(false)

  // 외부 value 변경 시 (포커스 아닐 때만) 동기화
  useEffect(() => {
    if (!isFocused && type === 'percent') setLocalStr(String(value))
  }, [value, isFocused, type])

  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <span className="text-gray-600 text-xs">{label}</span>
        {sub && <span className="block text-[11px] text-gray-400">{sub}</span>}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode={type === 'percent' ? 'decimal' : 'numeric'}
          className="w-28 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
          value={type === 'percent' ? (isFocused ? localStr : value) : f(value)}
          onFocus={() => {
            if (type === 'percent') {
              setLocalStr(String(value))
              setIsFocused(true)
            }
          }}
          onBlur={() => {
            if (type === 'percent') {
              setIsFocused(false)
              const parsed = parseFloat(localStr)
              if (!isNaN(parsed)) onChange(parsed)
            }
          }}
          onChange={(e) => {
            if (type === 'percent') {
              const raw = e.target.value
              // 숫자, 소수점만 허용 (예: "4.5", "4.", ".5")
              if (/^-?\d*\.?\d*$/.test(raw)) {
                setLocalStr(raw)
                const parsed = parseFloat(raw)
                if (!isNaN(parsed)) onChange(parsed)
              }
            } else {
              onChange(parseNum(e.target.value))
            }
          }}
        />
        <span className="text-xs text-gray-400 w-8">{suffix}</span>
      </div>
    </div>
  )
}

// 결과 행
const ResultRow = ({ label, value, highlight = false, negative = false }: {
  label: string; value: number; highlight?: boolean; negative?: boolean
}) => (
  highlight ? (
    <div className="flex justify-between items-center py-2 px-2.5 bg-steel-50 rounded-lg">
      <span className="font-bold text-xs text-gray-700">{label}</span>
      <span className={`font-black text-sm ${negative ? 'text-green-600' : 'text-steel-700'}`}>
        {negative ? '-' : ''}{f(Math.abs(value))}원
      </span>
    </div>
  ) : (
    <div className="flex justify-between items-center py-1">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`font-bold text-xs ${negative ? 'text-green-600' : 'text-gray-800'}`}>
        {negative ? '-' : ''}{f(Math.abs(value))}원
      </span>
    </div>
  )
)

// ============================================
// 메인 컴포넌트
// ============================================
export default function RentPricingBuilder() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { company, role, adminSelectedCompanyId } = useApp()
  const effectiveCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
  const printRef = useRef<HTMLDivElement>(null)
  const initialLoadDone = useRef(false)

  // --- 위저드 단계 ---
  type WizardStep = 'analysis' | 'customer' | 'preview'
  const [wizardStep, setWizardStep] = useState<WizardStep>('analysis')

  // --- 견적 수정 모드 ---
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [quoteCompany, setQuoteCompany] = useState<any>(null)

  // --- 고객 정보 (Step 2) ---
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerMode, setCustomerMode] = useState<'select' | 'manual'>('select')
  const [manualCustomer, setManualCustomer] = useState({ name: '', phone: '', email: '', business_number: '' })
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [quoteNote, setQuoteNote] = useState('')
  const [quoteSaving, setQuoteSaving] = useState(false)

  // --- 데이터 로딩 ---
  const [cars, setCars] = useState<CarData[]>([])
  const [selectedCar, setSelectedCar] = useState<CarData | null>(null)
  const [rules, setRules] = useState<BusinessRules>({})
  const [loading, setLoading] = useState(true)
  const [editLoading, setEditLoading] = useState(false) // 견적 수정 모드 로딩
  const [saving, setSaving] = useState(false)
  const [currentWorksheetId, setCurrentWorksheetId] = useState<string | null>(null)

  // --- 가격 분석 입력값 ---
  const [factoryPrice, setFactoryPrice] = useState(0)      // 출고가
  const [purchasePrice, setPurchasePrice] = useState(0)     // 매입가

  // 감가 설정
  const [carAgeMode, setCarAgeMode] = useState<'new' | 'used'>('new')  // 신차 / 연식차량 구분
  const [customCarAge, setCustomCarAge] = useState(0)         // 수동 설정 차령 (연식차량 시)
  const [depCurvePreset, setDepCurvePreset] = useState<DepCurvePreset>('optimistic')  // 감가 곡선 프리셋 (기본: 낙관적 — 실거래 기반)
  const [depCustomCurve, setDepCustomCurve] = useState<number[]>([0, 20, 32, 40, 48, 54, 59, 63, 66.5, 69.5, 72])  // 사용자 정의 곡선
  const [depClassOverride, setDepClassOverride] = useState<string>('')  // 차종 클래스 수동 오버라이드 (빈값 = 자동)
  const [depYear1Rate, setDepYear1Rate] = useState(15)      // 1년차 감가 % (레거시, custom 모드에서만)
  const [depYear2Rate, setDepYear2Rate] = useState(8)        // 2년차~ 감가 % (레거시, custom 모드에서만)
  const [annualMileage, setAnnualMileage] = useState(2)      // 계약 약정 주행거리 (만km/년)
  const [baselineKm, setBaselineKm] = useState(2)            // 0% 감가 기준 주행거리 (만km/년)
  const [excessMileageRate, setExcessMileageRate] = useState(0) // 초과주행 km당 요금 (원)

  // 금융비용
  const [loanAmount, setLoanAmount] = useState(0)            // 대출 원금
  const [loanRate, setLoanRate] = useState(4.5)              // 대출 이자율 %
  const [investmentRate, setInvestmentRate] = useState(0)  // 투자수익률 % (0=기회비용 미반영)

  // 운영비용 — 정비 패키지
  const [maintPackage, setMaintPackage] = useState<MaintenancePackage>('self')
  const [oilChangeFreq, setOilChangeFreq] = useState<1 | 2>(1)
  const [monthlyMaintenance, setMonthlyMaintenance] = useState(0)
  const [monthlyInsuranceCost, setMonthlyInsuranceCost] = useState(0)
  const [driverAgeGroup, setDriverAgeGroup] = useState<DriverAgeGroup>('26세이상')
  const [insEstimate, setInsEstimate] = useState<ReturnType<typeof estimateInsurance> | null>(null)
  const [insAutoMode, setInsAutoMode] = useState(true) // true=추정자동, false=직접입력
  const [annualTax, setAnnualTax] = useState(0)              // 연간 자동차세
  const [engineCC, setEngineCC] = useState(0)                // 배기량

  // 자차보장
  const [ownDamageCoverageRatio, setOwnDamageCoverageRatio] = useState(60)  // 자차보장비율 % (기본 60%, 100%=전액보장)

  // 리스크
  const [deductible, setDeductible] = useState(500000)       // 면책금
  const [riskRate, setRiskRate] = useState(0)              // 리스크 적립률 % (0=보험으로 커버)

  // 보증금/선납금
  const [deposit, setDeposit] = useState(0)
  const [prepayment, setPrepayment] = useState(0)
  const [depositDiscountRate, setDepositDiscountRate] = useState(0.4) // %
  const [prepaymentDiscountRate, setPrepaymentDiscountRate] = useState(0.5)

  // 계약 조건
  const [contractType, setContractType] = useState<'return' | 'buyout'>('return')  // 반납형 / 인수형
  const [residualRate, setResidualRate] = useState(80)  // 잔존가치 설정율 (종료시점 시세 대비 %)
  const [buyoutPremium, setBuyoutPremium] = useState(0) // 인수형 추가 마진 (원/월)
  const [termMonths, setTermMonths] = useState(36)
  const [margin, setMargin] = useState(0)
  const [savedPricesOpen, setSavedPricesOpen] = useState(true)

  // 시장 비교
  const [marketComps, setMarketComps] = useState<MarketComp[]>([])
  const [newComp, setNewComp] = useState<MarketComp>({
    competitor_name: '', vehicle_info: '', monthly_rent: 0,
    deposit: 0, term_months: 36, source: ''
  })

  // 보험 & 금융상품 연동
  const [linkedInsurance, setLinkedInsurance] = useState<any>(null)
  const [linkedFinance, setLinkedFinance] = useState<any>(null)

  // 계약 조건 DB 설정
  const [termsConfig, setTermsConfig] = useState<{
    id: number
    insurance_coverage: any[]
    quote_notices: any[]
    calc_params: Record<string, any>
  } | null>(null)

  // 🆕 기준 테이블 데이터
  const [depreciationDB, setDepreciationDB] = useState<any[]>([])      // legacy 유지 (fallback)
  const [depRates, setDepRates] = useState<any[]>([])                  // 3축 depreciation_rates
  const [depAdjustments, setDepAdjustments] = useState<any[]>([])      // 보정계수 depreciation_adjustments
  const [insuranceRates, setInsuranceRates] = useState<any[]>([])
  const [maintenanceCosts, setMaintenanceCosts] = useState<any[]>([])
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [financeRates, setFinanceRates] = useState<any[]>([])
  const [regCosts, setRegCosts] = useState<any[]>([])
  const [inspectionCosts, setInspectionCosts] = useState<any[]>([])         // inspection_cost_table
  const [inspectionSchedules, setInspectionSchedules] = useState<any[]>([]) // inspection_schedule_table
  const [insBasePremiums, setInsBasePremiums] = useState<any[]>([])         // insurance_base_premium (실데이터 기반)
  const [insOwnRates, setInsOwnRates] = useState<any[]>([])                // insurance_own_vehicle_rate (실데이터 기반)
  // 인기도 등급 선택 (보정계수)
  const [popularityGrade, setPopularityGrade] = useState<string>('B등급 (일반)')
  // 기준표 차종 수동 오버라이드 (3축 각각)
  const [dbOriginOverride, setDbOriginOverride] = useState<string>('')
  const [dbVehicleClassOverride, setDbVehicleClassOverride] = useState<string>('')
  const [dbFuelTypeOverride, setDbFuelTypeOverride] = useState<string>('')

  // 🆕 취득원가 관련
  const [acquisitionTax, setAcquisitionTax] = useState(0)
  const [bondCost, setBondCost] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(350000)
  const [miscFee, setMiscFee] = useState(167000)
  const [totalAcquisitionCost, setTotalAcquisitionCost] = useState(0)
  const [carCostItems, setCarCostItems] = useState<{category: string, item_name: string, amount: number}[]>([])  // 등록 페이지 비용 항목
  const hasCarCostsRef = useRef(false)  // applyReferenceTableMappings에서 totalAcquisitionCost 덮어쓰기 방지용
  // 🆕 차량등록 지역 (공채매입 계산용)
  const [registrationRegion, setRegistrationRegion] = useState('서울')

  // 🆕 자동 매핑 결과 표시
  const [autoCategory, setAutoCategory] = useState('')
  const [autoInsType, setAutoInsType] = useState('')
  const [autoMaintType, setAutoMaintType] = useState('')

  // 🆕 신차 조회 모드
  const [lookupMode, setLookupMode] = useState<'registered' | 'newcar' | 'saved'>('registered')
  const [newCarBrand, setNewCarBrand] = useState('')
  const [newCarModel, setNewCarModel] = useState('')
  const [newCarResult, setNewCarResult] = useState<NewCarResult | null>(null)
  const [newCarSelectedTax, setNewCarSelectedTax] = useState<string>('')       // 개별소비세 구분
  const [newCarSelectedFuel, setNewCarSelectedFuel] = useState<string>('')
  const [newCarSelectedVariant, setNewCarSelectedVariant] = useState<NewCarVariant | null>(null)
  const [newCarSelectedTrim, setNewCarSelectedTrim] = useState<NewCarTrim | null>(null)
  const [newCarSelectedOptions, setNewCarSelectedOptions] = useState<NewCarOption[]>([])
  const [newCarSelectedExterior, setNewCarSelectedExterior] = useState<NewCarColor | null>(null)
  const [newCarSelectedInterior, setNewCarSelectedInterior] = useState<NewCarColor | null>(null)
  const [newCarPurchasePrice, setNewCarPurchasePrice] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupStage, setLookupStage] = useState<string>('')
  const [lookupStartTime, setLookupStartTime] = useState<number>(0)
  const [lookupElapsed, setLookupElapsed] = useState<number>(0)
  const [lookupError, setLookupError] = useState('')
  // brandModels, isLoadingModels 제거됨 — 모델명은 직접 타이핑
  const [isParsingQuote, setIsParsingQuote] = useState(false)
  const [parseStage, setParseStage] = useState<string>('')  // 업로드 단계 표시
  const [parseStartTime, setParseStartTime] = useState<number>(0)
  const [parseElapsed, setParseElapsed] = useState<number>(0)
  const [savedCarPrices, setSavedCarPrices] = useState<any[]>([])
  const [savedWorksheets, setSavedWorksheets] = useState<any[]>([])
  const [isSavingPrice, setIsSavingPrice] = useState(false)
  const [carSearchQuery, setCarSearchQuery] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const dropFileRef = useRef<HTMLInputElement>(null)

  // --- 데이터 로드 ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      try {
        // 비즈니스 규칙
        const { data: rulesData } = await supabase.from('business_rules').select('*')
        if (rulesData) {
          const ruleMap: BusinessRules = {}
          rulesData.forEach((r: any) => { ruleMap[r.key] = Number(r.value) })
          setRules(ruleMap)

          // 기본값 설정 — 최초 로드 시에만 (사용자가 수동 변경한 값 보존)
          if (!initialLoadDone.current) {
            const toPercent = (v: number) => v > 0 && v < 1 ? v * 100 : v
            if (ruleMap.DEP_YEAR_1) setDepYear1Rate(toPercent(ruleMap.DEP_YEAR_1))
            else if (ruleMap.DEP_YEAR) setDepYear1Rate(toPercent(ruleMap.DEP_YEAR))
            if (ruleMap.DEP_YEAR_2PLUS) setDepYear2Rate(toPercent(ruleMap.DEP_YEAR_2PLUS))
            if (ruleMap.LOAN_INTEREST_RATE) setLoanRate(ruleMap.LOAN_INTEREST_RATE)
            if (ruleMap.INVESTMENT_RETURN_RATE) setInvestmentRate(ruleMap.INVESTMENT_RETURN_RATE)
            if (ruleMap.MONTHLY_MAINTENANCE_BASE) setMonthlyMaintenance(ruleMap.MONTHLY_MAINTENANCE_BASE)
            if (ruleMap.DEDUCTIBLE_AMOUNT) setDeductible(ruleMap.DEDUCTIBLE_AMOUNT)
            if (ruleMap.RISK_RESERVE_RATE) setRiskRate(ruleMap.RISK_RESERVE_RATE)
            if (ruleMap.DEPOSIT_DISCOUNT_RATE) setDepositDiscountRate(ruleMap.DEPOSIT_DISCOUNT_RATE)
            if (ruleMap.PREPAYMENT_DISCOUNT_RATE) setPrepaymentDiscountRate(ruleMap.PREPAYMENT_DISCOUNT_RATE)
          }
        }

        // 차량 목록 — god_admin '전체 보기' 시 전체 조회 (보험 페이지와 동일)
        {
          let carQuery = supabase.from('cars').select('*').order('created_at', { ascending: false })
          if (role === 'god_admin') {
            if (adminSelectedCompanyId) carQuery = carQuery.eq('company_id', adminSelectedCompanyId)
            // 전체 보기(미선택) 시 필터 없이 전체 조회
          } else if (company?.id) {
            carQuery = carQuery.eq('company_id', company.id)
          }
          const { data: carsData, error: carsError } = await carQuery
          if (carsError) console.error('차량 목록 로드 실패:', carsError.message)
          setCars(carsData || [])
        }

        // 기준 테이블 일괄 로드 (개별 에러 허용)
        try {
          const [depRes, depRatesRes, depAdjRes, insRes, maintRes, taxRes, finRes, regRes, inspCostRes, inspSchedRes, insBaseRes, insOwnRes] = await Promise.all([
            supabase.from('depreciation_db').select('*').order('category'),
            supabase.from('depreciation_rates').select('*').eq('is_active', true).order('origin').order('vehicle_class'),
            supabase.from('depreciation_adjustments').select('*').order('adjustment_type').order('factor', { ascending: false }),
            supabase.from('insurance_rate_table').select('*'),
            supabase.from('maintenance_cost_table').select('*'),
            supabase.from('vehicle_tax_table').select('*'),
            supabase.from('finance_rate_table').select('*'),
            supabase.from('registration_cost_table').select('*'),
            supabase.from('inspection_cost_table').select('*').eq('is_active', true),
            supabase.from('inspection_schedule_table').select('*').eq('is_active', true),
            supabase.from('insurance_base_premium').select('*').eq('is_active', true),
            supabase.from('insurance_own_vehicle_rate').select('*').eq('is_active', true),
          ])
          setDepreciationDB(depRes.data || [])
          setDepRates(depRatesRes.data || [])
          setDepAdjustments(depAdjRes.data || [])
          setInsuranceRates(insRes.data || [])
          setMaintenanceCosts(maintRes.data || [])
          setTaxRates(taxRes.data || [])
          setFinanceRates(finRes.data || [])
          setRegCosts(regRes.data || [])
          setInspectionCosts(inspCostRes.data || [])
          setInspectionSchedules(inspSchedRes.data || [])
          setInsBasePremiums(insBaseRes.data || [])
          setInsOwnRates(insOwnRes.data || [])
        } catch (refErr) {
          console.warn('기준 테이블 로드 실패 (무시):', refErr)
        }
      } catch (err) {
        console.error('데이터 로드 실패:', err)
      }

      setLoading(false)
      initialLoadDone.current = true
    }
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompanyId])

  // 계약 조건 DB 설정 로드
  useEffect(() => {
    if (!effectiveCompanyId) return
    supabase
      .from('contract_terms')
      .select('id, insurance_coverage, quote_notices, calc_params')
      .eq('company_id', effectiveCompanyId)
      .eq('status', 'active')
      .single()
      .then(({ data, error }) => {
        if (data) setTermsConfig(data)
        if (error) console.warn('계약 조건 로드 실패 (DB 기본값 사용):', error)
      })
  }, [effectiveCompanyId])

  // ============================================
  // 🆕 공통 기준 테이블 매핑 함수
  // ============================================
  const applyReferenceTableMappings = useCallback((carInfo: {
    brand: string, model: string, fuel_type?: string, fuel?: string,
    purchase_price: number, engine_cc?: number, year?: number,
    factory_price?: number, is_commercial?: boolean, displacement?: number, trim?: string
  }, opts?: { skipInsurance?: boolean, skipFinance?: boolean }) => {
    // fuel_type 우선, 없으면 fuel 사용
    const resolvedFuel = carInfo.fuel_type || carInfo.fuel || ''
    // 3축 카테고리 자동 매핑
    const axes = mapToDepAxes(carInfo.brand, carInfo.model, resolvedFuel, carInfo.purchase_price)
    setAutoCategory(axes.label)

    // 3축 기준표 매칭 (depreciation_rates) → DB 기반 동적 곡선 생성
    const depRateRecord = depRates.find(d =>
      d.origin === axes.origin && d.vehicle_class === axes.vehicle_class && d.fuel_type === axes.fuel_type
    )
    if (depRateRecord) {
      // DB 기반 곡선 프리셋을 기본값으로 자동 설정
      setDepCurvePreset('db_based')
      // depYear1Rate/depYear2Rate도 동기화 (하위 호환)
      setDepYear1Rate(100 - Number(depRateRecord.rate_1yr))
      if (Number(depRateRecord.rate_1yr) > Number(depRateRecord.rate_3yr)) {
        setDepYear2Rate(Math.round((Number(depRateRecord.rate_1yr) - Number(depRateRecord.rate_3yr)) / 2))
      }
    } else {
      // 3축 매칭 실패 시 legacy depreciation_db로 fallback
      const category = axes.label
      const depRecord = depreciationDB.find(d => d.category === category)
      if (depRecord) {
        setDepYear1Rate(100 - depRecord.rate_1yr)
        if (depRecord.rate_1yr > depRecord.rate_3yr) {
          setDepYear2Rate(Math.round((depRecord.rate_1yr - depRecord.rate_3yr) / 2))
        }
      }
    }

    // 보험료 자동 조회 — 실데이터 기반 (insurance_base_premium + insurance_own_vehicle_rate)
    const insType = mapToInsuranceType(carInfo.brand, resolvedFuel)
    setAutoInsType(insType)
    if (!opts?.skipInsurance) {
      let annualPremium = 0

      // 1순위: 실데이터 기반 산출 (기본분담금 + 자차요율 × 차량가액)
      const isMultiSeat = (carInfo.model || '').includes('카니발') || (carInfo.model || '').includes('스타리아')
      const baseRec = insBasePremiums.find(r => r.vehicle_usage === (isMultiSeat ? '다인승' : '승용'))
      const fuelKey = (() => {
        const f = resolvedFuel.toLowerCase()
        if (['전기', 'ev', 'electric', 'bev'].some(k => f.includes(k))) return '전기'
        if (['하이브리드', 'hybrid', 'hev', 'phev'].some(k => f.includes(k))) return '하이브리드'
        if (['디젤', 'diesel'].some(k => f.includes(k))) return '디젤'
        if (['lpg', 'lng'].some(k => f.includes(k))) return 'LPG'
        return '가솔린'
      })()
      const isImport = IMPORT_BRANDS.some(ib => (carInfo.brand || '').toUpperCase().includes(ib.toUpperCase()))
      const originKey = isImport ? '수입' : '국산'

      // 자차요율 DB 매칭 (원산지+연료+차량가액)
      const ownRateRec = insOwnRates.find(r =>
        r.origin === originKey && r.fuel_type === fuelKey &&
        carInfo.purchase_price >= r.value_min && carInfo.purchase_price <= r.value_max
      ) || insOwnRates.find(r =>
        r.origin === originKey && r.fuel_type === '전체' &&
        carInfo.purchase_price >= r.value_min && carInfo.purchase_price <= r.value_max
      )

      if (baseRec && ownRateRec) {
        const baseCost = baseRec.base_total
        const ownCost = Math.round(carInfo.purchase_price * (ownRateRec.own_vehicle_rate / 100))
        annualPremium = baseCost + ownCost
      }

      // 2순위 fallback: 기존 insurance_rate_table
      if (!annualPremium) {
        const insRecord = insuranceRates.find(r =>
          r.vehicle_type === insType &&
          carInfo.purchase_price >= r.value_min &&
          carInfo.purchase_price <= r.value_max
        )
        if (insRecord) annualPremium = insRecord.annual_premium
      }

      if (annualPremium > 0) {
        setMonthlyInsuranceCost(Math.round(annualPremium / 12))
      }
    }

    // 정비 유형 자동 매핑 + 패키지 비용 계산
    const maintMapping = mapToMaintenanceType(carInfo.brand, carInfo.model, resolvedFuel, carInfo.purchase_price)
    setAutoMaintType(maintMapping.type)
    // 전기차면 엔진오일 패키지 → 기본정비로 자동 전환
    if (maintMapping.type === '전기차' && maintPackage === 'oil_only') {
      setMaintPackage('basic')
    }
    // 패키지 기반 비용 계산
    const multiplier = MAINT_MULTIPLIER[maintMapping.type] || 1.0
    const baseCost = MAINTENANCE_PACKAGES[maintPackage].monthly
    const oilAdjust = maintPackage === 'oil_only' && oilChangeFreq === 2 ? 1.8 : 1.0
    setMonthlyMaintenance(Math.round(baseCost * multiplier * oilAdjust))

    // 자동차세 계산 (영업용/비영업용 구분)
    const cc = carInfo.engine_cc || 0
    const fuelCat = resolvedFuel.includes('전기') || EV_FUEL_KEYWORDS.some(k => resolvedFuel.toUpperCase().includes(k.toUpperCase())) || EV_MODEL_KEYWORDS.some(k => carInfo.model.toUpperCase().includes(k.toUpperCase())) ? '전기' : '내연기관'
    const isCommercial = carInfo.is_commercial !== false // 기본값 영업용 (렌터카)
    const taxType = isCommercial ? '영업용' : '비영업용'
    const taxRecord = taxRates.find(r =>
      r.tax_type === taxType &&
      r.fuel_category === fuelCat &&
      cc >= r.cc_min && cc <= r.cc_max
    )
    let tax = 0
    if (taxRecord) {
      if (taxRecord.fixed_annual > 0) tax = taxRecord.fixed_annual
      else tax = Math.round(cc * taxRecord.rate_per_cc)
      tax = Math.round(tax * (1 + taxRecord.education_tax_rate / 100))
    } else {
      // fallback: 법정 기본 세율 적용
      if (fuelCat === '전기') {
        // 전기차 고정세액 (지방세법 시행령)
        if (isCommercial) {
          tax = 20000 // 영업용 전기차: 연 2만원, 교육세 비과세
        } else {
          tax = Math.round(130000 * 1.3) // 비영업용 전기차: 연 13만원 + 교육세 30% = 169,000원
        }
      } else if (isCommercial) {
        // 영업용 내연기관 fallback: 18원/cc, 교육세 비과세
        tax = cc * 18
      } else {
        // 비영업용 내연기관 fallback: cc 구간별 세율 + 교육세 30%
        if (cc <= 1000) tax = cc * 80
        else if (cc <= 1600) tax = cc * 140
        else tax = cc * 200
        tax = Math.round(tax * 1.3)
      }
    }
    setAnnualTax(tax)
    setEngineCC(cc)

    // 금리 자동 조회 (finance_rate_table)
    if (!opts?.skipFinance) {
      const rateRecord = financeRates.find(r =>
        r.finance_type === '캐피탈대출' &&
        termMonths >= r.term_months_min && termMonths <= r.term_months_max
      )
      if (rateRecord) setLoanRate(Number(rateRecord.annual_rate))
    }

    // ============================================
    // 취득원가 계산
    // ============================================
    // ★ 취득세: 영업용 4% / 비영업용 승용 7% (지방세법 제12조)
    const acqCategory = isCommercial
      ? (fuelCat === '전기' ? '영업용 전기' : '영업용')
      : (fuelCat === '전기' ? '비영업용 전기' : '비영업용')
    const acqTaxRecord = regCosts.find(r => r.cost_type === '취득세' && r.vehicle_category === acqCategory)
      || regCosts.find(r => r.cost_type === '취득세' && r.vehicle_category === (isCommercial ? '영업용' : '비영업용'))
    const deliveryRecord = regCosts.find(r => r.cost_type === '탁송료')

    // 취득세: 영업용 4%, 비영업용 7% (지방세법 제12조)
    const defaultAcqRate = isCommercial ? 0.04 : 0.07
    let acqTaxAmt = acqTaxRecord ? Math.round(carInfo.purchase_price * acqTaxRecord.rate / 100) : Math.round(carInfo.purchase_price * defaultAcqRate)

    // ★ 경차 취득세 감면 (지방세특례제한법 제75조)
    // 경차(배기량 1,000cc 미만) 취득세 75만원까지 면제
    // 예: 14,900,000 × 4% = 596,000원 < 750,000원 → 전액 면제
    const isLightCar = (carInfo.displacement && carInfo.displacement < 1000)
      || /레이|Ray|모닝|Morning|다마스|라보|마티즈|스파크|Spark/i.test(`${carInfo.model || ''} ${carInfo.trim || ''}`)
    const LIGHT_CAR_TAX_EXEMPT_LIMIT = 750000 // 경차 취득세 면제 한도
    if (isLightCar && acqTaxAmt <= LIGHT_CAR_TAX_EXEMPT_LIMIT) {
      acqTaxAmt = 0 // 전액 면제
    } else if (isLightCar && acqTaxAmt > LIGHT_CAR_TAX_EXEMPT_LIMIT) {
      acqTaxAmt = acqTaxAmt - LIGHT_CAR_TAX_EXEMPT_LIMIT // 초과분만 납부
    }
    setAcquisitionTax(acqTaxAmt)

    // ============================================
    // 공채매입: 지역별 + 영업용 기준
    // ============================================
    // 채권 종류: 서울/부산/대구 = 도시철도채권, 그 외 = 지역개발채권
    // 핵심: 지역개발채권 지역에서는 영업용 등록 시 공채매입 면제!
    //       도시철도채권 지역(서울/부산/대구)에서는 영업용에도 매입 의무
    //
    // [서울 도시철도채권 - 영업용 승용차 매입비율]
    //   배기량 2,000cc 이상: 8%
    //   배기량 1,600cc~2,000cc 미만: 5%
    //   배기량 1,000cc~1,600cc 미만: 면제 (2025.12.31까지)
    //   배기량 1,000cc 미만: 면제
    //   ※ 비영업용: 2000cc↑ 20%, 1600~2000cc 12%
    //
    // [부산 도시철도채권 - 영업용 승용차 매입비율]
    //   배기량 2,000cc 이상: 4%
    //   배기량 1,600cc~2,000cc 미만: 2%
    //   배기량 1,600cc 미만: 면제
    //
    // [대구 도시철도채권 - 영업용 승용차 매입비율]
    //   배기량 2,000cc 이상: 4%
    //   배기량 1,600cc~2,000cc 미만: 2%
    //   배기량 1,600cc 미만: 면제
    //
    // [그 외 지역 - 지역개발채권] → 영업용 전차종 면제
    //
    // 공채할인: 매입 즉시 할인 매도 가능 (할인율 약 4~8%, 시장 금리에 따라 변동)

    const bondCC = carInfo.engine_cc || engineCC || cc || 0

    // ★ 공채매입: DB 연동 (registration_cost_table에서 영업용 데이터 조회)
    // 배기량 기준으로 영업용/영업용 중형/영업용 소형 카테고리 매칭
    const getBondCategoryForCC = (cc: number): string => {
      if (cc >= 2000) return '영업용'       // 대형: 2000cc 이상
      if (cc >= 1600) return '영업용 중형'   // 중형: 1600~2000cc
      return '영업용 소형'                    // 소형: 1600cc 미만
    }
    const bondCategory = getBondCategoryForCC(bondCC)

    // DB에서 해당 지역 + 배기량 카테고리 공채매입 데이터 조회
    let bondRecord = regCosts.find(r =>
      r.cost_type === '공채매입' && r.region === registrationRegion && r.vehicle_category === bondCategory
    )
    // 정확한 배기량 카테고리가 없으면 해당 지역의 기본 '영업용' 카테고리로 폴백
    if (!bondRecord) {
      bondRecord = regCosts.find(r =>
        r.cost_type === '공채매입' && r.region === registrationRegion && r.vehicle_category === '영업용'
      )
    }
    // 지역 데이터 자체가 없으면 '기타' 지역으로 폴백 (영업용 면제)
    if (!bondRecord) {
      bondRecord = regCosts.find(r =>
        r.cost_type === '공채매입' && r.region === '기타' && r.vehicle_category === '영업용'
      )
    }

    const bondRate = bondRecord ? Number(bondRecord.rate) : 0
    const bondGross = Math.round(carInfo.purchase_price * bondRate / 100)
    // 공채할인율: DB에서 조회, 없으면 기본 6%
    const bondDiscountRecord = regCosts.find(r => r.cost_type === '공채할인')
    const bondDiscountRate = bondDiscountRecord ? Number(bondDiscountRecord.rate) / 100 : 0.06
    const bondNet = bondRate > 0 ? Math.round(bondGross * (1 - bondDiscountRate)) : 0
    setBondCost(bondNet)

    const dlvFee = deliveryRecord?.fixed_amount || 350000
    setDeliveryFee(dlvFee)

    const miscItems = regCosts.filter(r => ['번호판', '인지세', '대행료', '검사비'].includes(r.cost_type))
    const miscTotal = miscItems.reduce((s, r) => s + (r.fixed_amount || 0), 0) || 167000
    setMiscFee(miscTotal)

    const totalAcq = carInfo.purchase_price + acqTaxAmt + bondNet + dlvFee + miscTotal
    // car_costs 실데이터가 있으면 해당 합계 유지, 없을 때만 자동계산값 적용
    if (!hasCarCostsRef.current) {
      setTotalAcquisitionCost(totalAcq)
    }
  }, [depreciationDB, depRates, insuranceRates, maintenanceCosts, taxRates, financeRates, regCosts, termMonths, maintPackage, oilChangeFreq, registrationRegion, engineCC])

  // ============================================
  // 등록 차량 선택 시 연관 데이터 로드
  // ============================================
  const handleCarSelect = useCallback(async (carId: string) => {
    if (!carId) {
      setSelectedCar(null)
      return
    }

    const car = cars.find(c => String(c.id) === String(carId))
    if (!car) return

    setSelectedCar(car)
    setFactoryPrice(car.factory_price || Math.round(car.purchase_price * 1.15))
    setPurchasePrice(car.purchase_price)
    setEngineCC(car.engine_cc || 0)
    setLoanAmount(Math.round(car.purchase_price * 0.7))
    // 신차/중고차 구분: DB의 is_used 반영, 없으면 연식 기반 추정
    const thisY = new Date().getFullYear()
    if (car.is_used === false && (car.year || thisY) >= thisY) {
      setCarAgeMode('new')
      setCustomCarAge(0)
    } else {
      setCarAgeMode('used')
      setCustomCarAge(Math.max(0, thisY - (car.year || thisY)))
    }

    // 연동된 보험 조회
    const { data: insData } = await supabase
      .from('insurance_contracts')
      .select('*')
      .eq('car_id', carId)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    setLinkedInsurance(insData)
    if (insData?.premium) {
      setMonthlyInsuranceCost(Math.round(insData.premium / 12))
      setInsAutoMode(false)  // 실제 보험 데이터가 있으면 자동추정 비활성화
    }

    // 연동된 금융상품 조회
    const { data: finData } = await supabase
      .from('financial_products')
      .select('*')
      .eq('car_id', carId)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    setLinkedFinance(finData)
    if (finData) {
      if (finData.loan_amount) setLoanAmount(finData.loan_amount)
      if (finData.interest_rate) setLoanRate(finData.interest_rate)
    }

    // 시장 비교 데이터 조회
    const { data: compData } = await supabase
      .from('market_comparisons')
      .select('*')
      .eq('car_id', carId)
    setMarketComps(compData || [])

    // 등록 페이지 구입비용 상세 (car_costs) 항목별 로드
    const { data: costsData } = await supabase
      .from('car_costs')
      .select('category, item_name, amount')
      .eq('car_id', carId)
      .order('sort_order', { ascending: true })
    const hasCarCosts = costsData && costsData.length > 0
    hasCarCostsRef.current = hasCarCosts
    if (hasCarCosts) {
      setCarCostItems(costsData.map((c: any) => ({ category: c.category, item_name: c.item_name, amount: Number(c.amount) || 0 })))
    } else {
      setCarCostItems([])
    }

    // 공통 기준 테이블 매핑 적용 (먼저 실행 → 자동계산값 세팅)
    applyReferenceTableMappings(
      {
        brand: car.brand,
        model: car.model,
        fuel_type: car.fuel_type || car.fuel,
        purchase_price: car.purchase_price,
        engine_cc: car.engine_cc,
        year: car.year,
        factory_price: car.factory_price,
        is_commercial: car.is_commercial,
      },
      { skipInsurance: !!insData, skipFinance: !!finData }
    )

    // car_costs 실데이터가 있으면 → 자동계산 덮어쓰기 (마지막에 세팅해야 React 배치에서 이 값이 최종 반영됨)
    if (hasCarCosts) {
      const costTotal = costsData.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
      if (costTotal > 0) {
        setTotalAcquisitionCost(costTotal)
      }
    }
  }, [cars, applyReferenceTableMappings])

  // ============================================
  // 🆕 브랜드 선택 → 모델명은 직접 타이핑 (AI 자동조회 비활성화)
  // ============================================

  // ============================================
  // 🆕 신차 AI 조회 (가격표)
  // ============================================
  const handleNewCarLookup = useCallback(async () => {
    if (!newCarBrand.trim() || !newCarModel.trim()) return
    setIsLookingUp(true)
    setLookupStage('🔍 검색 준비 중...')
    setLookupStartTime(Date.now())
    setLookupError('')
    setNewCarResult(null)
    setNewCarSelectedTax('')
    setNewCarSelectedFuel('')
    setNewCarSelectedVariant(null)
    setNewCarSelectedTrim(null)
    setNewCarSelectedOptions([])
    setNewCarSelectedExterior(null)
    setNewCarSelectedInterior(null)
    setNewCarSelectedOptions([])
    setNewCarPurchasePrice('')
    setSelectedCar(null)

    try {
      setLookupStage('🤖 AI가 가격 정보를 검색하고 있습니다...')
      const { data: { session: sess } } = await supabase.auth.getSession()
      const tkn = sess?.access_token
      const res = await fetch('/api/lookup-new-car', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tkn ? { 'Authorization': `Bearer ${tkn}` } : {}) },
        body: JSON.stringify({ brand: newCarBrand.trim(), model: newCarModel.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '조회 실패')
      if (!data.available) {
        setLookupError(data.message || '해당 차종을 찾을 수 없습니다.')
        return
      }
      setNewCarResult(data)
    } catch (err: any) {
      setLookupError(err.message || 'AI 조회 중 오류가 발생했습니다.')
    } finally {
      setIsLookingUp(false)
      setLookupStage('')
      setLookupStartTime(0)
    }
  }, [newCarBrand, newCarModel])

  // 🆕 저장된 신차 가격 데이터 조회
  const fetchSavedPrices = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data } = await supabase
      .from('new_car_prices')
      .select('*')
      .eq('company_id', effectiveCompanyId)
      .order('created_at', { ascending: false })
    // 상세모델명(model)이 다르면 별도 항목으로 유지
    setSavedCarPrices(data || [])
  }, [effectiveCompanyId])

  // 🆕 저장된 산출 워크시트 조회
  const fetchSavedWorksheets = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data } = await supabase
      .from('pricing_worksheets')
      .select('*, cars(id, number, brand, model, trim, year, fuel, is_used, is_commercial)')
      .eq('company_id', effectiveCompanyId)
      .order('updated_at', { ascending: false })
    setSavedWorksheets(data || [])
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) {
      fetchSavedPrices()
      fetchSavedWorksheets()
    }
  }, [effectiveCompanyId, fetchSavedPrices, fetchSavedWorksheets])

  // --- 고객 데이터 로드 (Step 2용) ---
  useEffect(() => {
    if (!effectiveCompanyId) return
    const fetchCustomers = async () => {
      const [custRes, compRes] = await Promise.all([
        supabase.from('customers').select('*').eq('company_id', effectiveCompanyId).order('name'),
        supabase.from('companies').select('*').eq('id', effectiveCompanyId).single(),
      ])
      if (custRes.data) setCustomers(custRes.data)
      if (compRes.data) setQuoteCompany(compRes.data)
      else if (company) setQuoteCompany(company)
    }
    fetchCustomers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompanyId])

  // --- quote_id 파라미터로 기존 견적 로드 (수정 모드) ---
  const quoteLoadedRef = useRef<string | null>(null)
  useEffect(() => {
    const quoteId = searchParams.get('quote_id')
    if (!quoteId) return
    // 이미 로드한 quote_id면 스킵 (searchParams 참조 변경에 의한 중복 실행 방지)
    if (quoteLoadedRef.current === quoteId) return
    quoteLoadedRef.current = quoteId

    const loadQuoteForEdit = async () => {
      setEditLoading(true)
      const { data: q } = await supabase.from('quotes').select('*').eq('id', quoteId).single()
      if (!q) { setEditLoading(false); return }
      setEditingQuoteId(quoteId)
      const d = q.quote_detail || {}
      // 고객 정보 복원
      if (q.customer_id) {
        setSelectedCustomerId(q.customer_id)
        setCustomerMode('select')
      } else if (d.manual_customer) {
        setManualCustomer(d.manual_customer)
        setCustomerMode('manual')
      }
      if (q.start_date) setStartDate(q.start_date)
      if (d.note) setQuoteNote(d.note)
      // 계약 조건 복원
      if (d.term_months) setTermMonths(d.term_months)
      if (d.contract_type) setContractType(d.contract_type)
      if (d.deposit !== undefined) setDeposit(d.deposit)
      if (d.prepayment !== undefined) setPrepayment(d.prepayment)
      if (d.annualMileage) setAnnualMileage(d.annualMileage)
      if (d.baselineKm) setBaselineKm(d.baselineKm)
      if (d.deductible !== undefined) setDeductible(d.deductible)
      if (d.own_damage_coverage_ratio !== undefined) setOwnDamageCoverageRatio(d.own_damage_coverage_ratio)
      if (d.margin !== undefined) setMargin(d.margin)
      if (d.maint_package) setMaintPackage(d.maint_package)
      if (d.driver_age_group) setDriverAgeGroup(d.driver_age_group)
      if (d.dep_curve_preset) setDepCurvePreset(d.dep_curve_preset)
      if (d.residual_rate !== undefined) setResidualRate(d.residual_rate)
      if (d.excess_mileage_rate) setExcessMileageRate(d.excess_mileage_rate)
      // 금융 복원
      if (d.loan_amount !== undefined) setLoanAmount(d.loan_amount)
      if (d.loan_rate !== undefined) setLoanRate(d.loan_rate)
      if (d.investment_rate !== undefined) setInvestmentRate(d.investment_rate)
      // 가격 복원
      if (d.factory_price) setFactoryPrice(d.factory_price)
      if (d.purchase_price) setPurchasePrice(d.purchase_price)
      // 차량 복원: car_id가 있으면 등록차량 선택
      let loadedInsData: any = null
      let loadedFinData: any = null
      if (q.car_id) {
        // cars가 아직 로드되지 않았을 수 있으므로 직접 DB에서 조회
        const { data: carData } = await supabase.from('cars').select('*').eq('id', q.car_id).single()
        if (carData) {
          setSelectedCar(carData)
          setLookupMode('registered')
          if (!d.factory_price) setFactoryPrice(carData.factory_price || Math.round(carData.purchase_price * 1.15))
          if (!d.purchase_price) setPurchasePrice(carData.purchase_price)
          setEngineCC(carData.engine_cc || 0)
          // 신차/중고차 구분
          const thisY = new Date().getFullYear()
          if (carData.is_used === false && (carData.year || thisY) >= thisY) {
            setCarAgeMode('new')
            setCustomCarAge(0)
          } else {
            setCarAgeMode('used')
            setCustomCarAge(Math.max(0, thisY - (carData.year || thisY)))
          }

          // --- 취득원가 구성 항목 로드 (car_costs) ---
          const { data: costsData } = await supabase
            .from('car_costs')
            .select('category, item_name, amount')
            .eq('car_id', q.car_id)
            .order('sort_order', { ascending: true })
          const hasCarCosts = costsData && costsData.length > 0
          hasCarCostsRef.current = hasCarCosts
          if (hasCarCosts) {
            setCarCostItems(costsData.map((c: any) => ({ category: c.category, item_name: c.item_name, amount: Number(c.amount) || 0 })))
            const costTotal = costsData.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
            if (costTotal > 0) setTotalAcquisitionCost(costTotal)
          }
          // quote_detail에 저장된 totalAcquisitionCost가 있으면 우선 사용
          if (d.total_acquisition_cost > 0) {
            setTotalAcquisitionCost(d.total_acquisition_cost)
          }

          // --- 연동 보험/금융 로드 ---
          const { data: insData } = await supabase
            .from('insurance_contracts')
            .select('*')
            .eq('car_id', q.car_id)
            .order('id', { ascending: false })
            .limit(1)
            .single()
          loadedInsData = insData
          setLinkedInsurance(insData)
          if (insData?.premium) {
            setMonthlyInsuranceCost(Math.round(insData.premium / 12))
            setInsAutoMode(false)
          }
          const { data: finData } = await supabase
            .from('financial_products')
            .select('*')
            .eq('car_id', q.car_id)
            .order('id', { ascending: false })
            .limit(1)
            .single()
          loadedFinData = finData
          setLinkedFinance(finData)
          if (finData) {
            if (finData.loan_amount) setLoanAmount(finData.loan_amount)
            if (finData.interest_rate) setLoanRate(finData.interest_rate)
          }

          // 기준 테이블 매핑 적용
          applyReferenceTableMappings(
            {
              brand: carData.brand,
              model: carData.model,
              fuel_type: carData.fuel_type,
              purchase_price: carData.purchase_price,
              engine_cc: carData.engine_cc,
              year: carData.year,
              factory_price: carData.factory_price,
              is_commercial: carData.is_commercial,
            },
            { skipInsurance: !!insData, skipFinance: !!finData }
          )
          // car_costs가 있으면 자동계산된 totalAcquisitionCost를 다시 덮어쓰기
          if (hasCarCosts) {
            const costTotal = costsData!.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
            if (costTotal > 0) setTotalAcquisitionCost(costTotal)
          }
          if (d.total_acquisition_cost > 0) {
            setTotalAcquisitionCost(d.total_acquisition_cost)
          }
        }
      }
      // 신차 견적 (car_id 없음): quote_detail.car_info에서 차량 데이터 복원
      if (!q.car_id && d.car_info) {
        const ci = d.car_info
        const currentYear = new Date().getFullYear()
        const tempCar: CarData = {
          id: `restored-${quoteId}`,
          number: ci.number || '',
          brand: ci.brand || '',
          model: ci.model || '',
          trim: ci.trim || '',
          year: ci.year || currentYear,
          fuel: ci.fuel || '',
          fuel_type: ci.fuel || '',
          mileage: ci.mileage || 0,
          purchase_price: d.purchase_price || ci.purchase_price || 0,
          factory_price: d.factory_price || ci.factory_price || 0,
          engine_cc: ci.engine_cc || 0,
          status: 'new-car-pricing',
        }
        setSelectedCar(tempCar)
        setLookupMode('newcar')
        setFactoryPrice(d.factory_price || tempCar.factory_price || 0)
        setPurchasePrice(d.purchase_price || tempCar.purchase_price || 0)
        setEngineCC(ci.engine_cc || 0)
        setCarAgeMode('new')
        setCustomCarAge(0)
        if (d.total_acquisition_cost > 0) {
          setTotalAcquisitionCost(d.total_acquisition_cost)
        }
        // 기준 테이블 매핑 적용
        applyReferenceTableMappings(
          {
            brand: ci.brand,
            model: ci.model,
            fuel_type: ci.fuel,
            purchase_price: d.purchase_price || tempCar.purchase_price,
            engine_cc: ci.engine_cc,
            year: ci.year || currentYear,
            factory_price: d.factory_price || tempCar.factory_price,
          },
          {}
        )
        if (d.total_acquisition_cost > 0) {
          setTotalAcquisitionCost(d.total_acquisition_cost)
        }
      }

      // worksheet 연결 시 워크시트 데이터 완전 로드
      const wsId = searchParams.get('worksheet_id') || q.worksheet_id || d.worksheet_id
      if (wsId) {
        const { data: ws } = await supabase
          .from('pricing_worksheets')
          .select('*, cars(number, brand, model, trim, year)')
          .eq('id', wsId)
          .single()
        if (ws) {
          // 워크시트 ID 기억
          setCurrentWorksheetId(ws.id)

          // 위에서 로드한 연동 보험/금융 데이터 참조 (덮어쓰기 방지)
          const hasLinkedIns = !!(loadedInsData?.premium)
          const hasLinkedFin = !!(loadedFinData?.loan_amount)

          // 차량 정보는 이미 위에서 복원됨 → 워크시트의 산출 데이터만 복원
          setFactoryPrice(ws.factory_price || d.factory_price || 0)
          setPurchasePrice(ws.purchase_price || d.purchase_price || 0)
          // 금융: 연동 금융이 있으면 워크시트 값으로 덮어쓰지 않음
          if (!hasLinkedFin) {
            setLoanAmount(ws.loan_amount ?? d.loan_amount ?? 0)
            setLoanRate(ws.loan_interest_rate ?? d.loan_rate ?? 4.5)
          }
          setInvestmentRate(ws.investment_rate ?? d.investment_rate ?? 6.0)
          // 보험: 연동 보험이 있으면 워크시트 값으로 덮어쓰지 않음
          if (!hasLinkedIns) {
            setMonthlyInsuranceCost(ws.monthly_insurance || 0)
            if (ws.ins_auto_mode !== undefined) setInsAutoMode(ws.ins_auto_mode)
          }
          if (ws.driver_age_group) setDriverAgeGroup(ws.driver_age_group as DriverAgeGroup)
          setMonthlyMaintenance(ws.monthly_maintenance ?? d.cost_breakdown?.maintenance ?? 0)
          if (ws.maint_package) setMaintPackage(ws.maint_package as MaintenancePackage)
          if (ws.oil_change_freq) setOilChangeFreq(ws.oil_change_freq as 1 | 2)
          setDeductible(ws.deductible ?? d.deductible ?? 500000)
          if (ws.own_damage_coverage_ratio !== undefined) setOwnDamageCoverageRatio(ws.own_damage_coverage_ratio)
          setDeposit(ws.deposit_amount ?? d.deposit ?? 0)
          setPrepayment(ws.prepayment_amount ?? d.prepayment ?? 0)
          if (ws.deposit_discount_rate !== undefined && ws.deposit_discount_rate !== null) setDepositDiscountRate(ws.deposit_discount_rate)
          if (ws.prepayment_discount_rate !== undefined && ws.prepayment_discount_rate !== null) setPrepaymentDiscountRate(ws.prepayment_discount_rate)
          if (ws.registration_region) setRegistrationRegion(ws.registration_region)
          setTermMonths(ws.term_months || d.term_months || 36)
          setMargin(ws.target_margin ?? d.margin ?? 0)
          setAnnualMileage(ws.annual_mileage || d.annualMileage || 2)
          setBaselineKm(ws.baseline_km || d.baselineKm || 2)
          if (ws.excess_mileage_rate) setExcessMileageRate(ws.excess_mileage_rate)
          if (ws.excess_rate_margin_pct !== undefined) setExcessRateMarginPct(ws.excess_rate_margin_pct)
          if (ws.dep_curve_preset) setDepCurvePreset(ws.dep_curve_preset as DepCurvePreset)
          if (ws.dep_custom_curve) setDepCustomCurve(ws.dep_custom_curve)
          if (ws.dep_class_override !== undefined) setDepClassOverride(ws.dep_class_override || '')
          if (ws.contract_type) setContractType(ws.contract_type as 'return' | 'buyout')
          if (ws.residual_rate !== undefined) setResidualRate(ws.residual_rate)
          if (ws.buyout_premium !== undefined) setBuyoutPremium(ws.buyout_premium)
          // 차령 모드 복원
          if (ws.car_age_mode) {
            setCarAgeMode(ws.car_age_mode as 'new' | 'used')
            setCustomCarAge(ws.custom_car_age || 0)
          }
        }
        router.replace(`/quotes/pricing?worksheet_id=${wsId}&car_id=${q.car_id || ''}&quote_id=${quoteId}`)
      }
      setEditLoading(false)
    }
    loadQuoteForEdit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 파일 처리 공통 함수
  const processUploadFile = useCallback(async (file: File) => {
    // 회사 미선택 시 업로드 차단
    if (!effectiveCompanyId) {
      alert('회사를 먼저 선택해주세요. (어드민은 상단에서 회사 선택 필요)')
      return
    }

    setIsParsingQuote(true)
    setParseStage('📤 파일 업로드 중...')
    setParseStartTime(Date.now())

    try {
      setParseStage('🤖 AI 분석 중... (복잡한 가격표는 30초 이상 소요)')
      const formData = new FormData()
      formData.append('file', file)

      // 인증 토큰 가져오기
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/parse-quote', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '가격표 분석 실패')
      if (!data.available) {
        alert(data.message || '가격표에서 차량 정보를 추출할 수 없습니다.')
        return
      }

      if (!data.brand || !data.model || !data.year) {
        alert('가격표에서 브랜드/모델/연식 정보를 추출하지 못했습니다.')
        return
      }

      setParseStage('💾 저장 중...')

      // 저장 목록에 바로 추가 — 상세모델명(model_detail)을 가격표 제목으로 사용
      const displayModel = data.model_detail || data.model
      const payload = {
        company_id: effectiveCompanyId,
        brand: data.brand,
        model: displayModel,
        year: data.year,
        source: data.source || '가격표 업로드',
        price_data: data,
      }
      // brand + model(상세) + year + source(파일명)로 중복 체크
      // → 같은 모델이라도 다른 파일이면 별도 저장
      const { data: existing, error: findErr } = await supabase
        .from('new_car_prices')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('brand', data.brand)
        .eq('model', displayModel)
        .eq('year', data.year)
        .maybeSingle()

      if (findErr) {
        console.error('[가격표저장] 조회 에러:', findErr)
        throw new Error(`DB 조회 실패: ${findErr.message}`)
      }

      let saveError: any = null
      if (existing) {
        const { error } = await supabase.from('new_car_prices')
          .update({ source: payload.source, price_data: payload.price_data, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        saveError = error
      } else {
        const { error } = await supabase.from('new_car_prices').insert([payload])
        saveError = error
      }

      if (saveError) {
        console.error('[가격표저장] DB 에러:', saveError)
        throw new Error(`저장 실패: ${saveError.message}`)
      }

      setParseStage('✅ 완료!')
      await fetchSavedPrices()
      setLookupMode('saved')
      alert(`${data.brand} ${displayModel} 가격표가 저장 목록에 추가되었습니다.`)
    } catch (err: any) {
      console.error('[가격표 업로드] 실패:', err)
      alert(err.message || '가격표 분석/저장 중 오류가 발생했습니다.')
    } finally {
      setIsParsingQuote(false)
      setParseStage('')
      setParseStartTime(0)
    }
  }, [effectiveCompanyId, fetchSavedPrices])

  // 드래그앤드롭 핸들러
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const onDragLeave = useCallback(() => setIsDragging(false), [])
  const onDropFile = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      processUploadFile(file)
    }
  }, [processUploadFile])

  // 파일 input onChange → processUploadFile 호출
  const handleQuoteUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) processUploadFile(file)
  }, [processUploadFile])

  // 🆕 신차 가격 데이터 DB 저장
  const handleSaveCarPrice = useCallback(async () => {
    if (!newCarResult) { alert('저장할 가격 데이터가 없습니다.'); return }
    if (!effectiveCompanyId) { alert('회사 정보를 불러올 수 없습니다. 다시 로그인해주세요.'); return }
    setIsSavingPrice(true)
    try {
      const displayModel = newCarResult.model_detail || newCarResult.model
      const payload = {
        company_id: effectiveCompanyId,
        brand: newCarResult.brand,
        model: displayModel,
        year: newCarResult.year,
        source: newCarResult.source || 'AI 조회',
        price_data: newCarResult,
      }
      // 같은 브랜드+상세모델+연식이면 업데이트, 없으면 신규 등록
      const { data: existing } = await supabase
        .from('new_car_prices')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('brand', newCarResult.brand)
        .eq('model', displayModel)
        .eq('year', newCarResult.year)
        .maybeSingle()

      let error: any = null
      if (existing) {
        const { error: e } = await supabase
          .from('new_car_prices')
          .update({ source: payload.source, price_data: payload.price_data, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        error = e
      } else {
        const { error: e } = await supabase.from('new_car_prices').insert([payload])
        error = e
      }
      if (error) {
        console.error('[가격저장] DB 에러:', error)
        throw error
      }
      await fetchSavedPrices()
      alert('가격 데이터가 저장되었습니다.')
    } catch (err: any) {
      console.error('[가격저장] 실패:', err)
      const msg = err?.message || err?.details || JSON.stringify(err)
      alert(`저장 실패: ${msg}\n\n※ new_car_prices 테이블이 없으면 Supabase SQL Editor에서 supabase_new_car_prices.sql을 실행해주세요.`)
    } finally {
      setIsSavingPrice(false)
    }
  }, [newCarResult, effectiveCompanyId, fetchSavedPrices])

  // 🆕 저장된 가격 데이터 불러오기
  const handleLoadSavedPrice = useCallback((saved: any) => {
    const data = saved.price_data
    if (!data) return
    setNewCarBrand(data.brand || '')
    setNewCarModel(data.model || '')
    setNewCarResult(data)
    setNewCarSelectedTax('')
    setNewCarSelectedFuel('')
    setNewCarSelectedVariant(null)
    setNewCarSelectedTrim(null)
    setNewCarSelectedOptions([])
    setNewCarSelectedExterior(null)
    setNewCarSelectedInterior(null)
    setNewCarPurchasePrice('')
    setLookupError('')
    // 저장목록에서 선택 → 신차 선택 UI 활성화
    setLookupMode('saved')
  }, [])

  // 🆕 저장된 가격 데이터 삭제
  const handleDeleteSavedPrice = useCallback(async (id: string) => {
    if (!confirm('이 가격 데이터를 삭제하시겠습니까?')) return
    await supabase.from('new_car_prices').delete().eq('id', id)
    await fetchSavedPrices()
  }, [fetchSavedPrices])

  // 업로드 경과 시간 타이머
  useEffect(() => {
    if (!isParsingQuote || !parseStartTime) { setParseElapsed(0); return }
    const timer = setInterval(() => {
      setParseElapsed(Math.floor((Date.now() - parseStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [isParsingQuote, parseStartTime])

  // AI 조회 경과 시간 타이머
  useEffect(() => {
    if (!isLookingUp || !lookupStartTime) { setLookupElapsed(0); return }
    const timer = setInterval(() => {
      setLookupElapsed(Math.floor((Date.now() - lookupStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [isLookingUp, lookupStartTime])

  // 🆕 신차 트림 선택 후 분석 시작 (옵션 합산 반영)
  const handleNewCarAnalysis = useCallback(() => {
    if (!newCarResult || !newCarSelectedVariant || !newCarSelectedTrim) return

    // 출고가 = 트림 기본가 + 선택 옵션 합산 + 컬러 추가금
    const optionsTotal = newCarSelectedOptions.reduce((sum, opt) => sum + opt.price, 0)
    const colorExtra = (newCarSelectedExterior?.price || 0) + (newCarSelectedInterior?.price || 0)
    const factoryTotal = newCarSelectedTrim.base_price + optionsTotal + colorExtra
    // 매입가 = 출고가 - 할인금액 (할인 없으면 출고가 그대로)
    const discountAmount = parseNum(newCarPurchasePrice) || 0
    const purchasePrice = factoryTotal - discountAmount

    // 컬러 + 옵션 이름 리스트 (트림 표시에 포함)
    const colorNames = [newCarSelectedExterior?.name, newCarSelectedInterior?.name].filter(Boolean)
    const optionNames = [...colorNames, ...newCarSelectedOptions.map(o => o.name)].length > 0
      ? ` + ${[...colorNames, ...newCarSelectedOptions.map(o => o.name)].join(', ')}`
      : ''

    // selectedCar에 임시 데이터 설정 (기존 산출 로직 호환)
    // 신차 조회이므로 연식은 현재 연도 이상으로 보정 (AI가 과거 연식을 반환할 수 있음)
    const currentYear = new Date().getFullYear()
    const newCarYear = Math.max(newCarResult.year || currentYear, currentYear)
    const tempCar: CarData = {
      id: `newcar-${Date.now()}`,
      number: '',
      brand: newCarResult.brand,
      model: newCarResult.model,
      trim: `${newCarSelectedVariant.variant_name} / ${newCarSelectedTrim.name}${optionNames}`,
      year: newCarYear,
      fuel: newCarSelectedVariant.fuel_type,
      mileage: 0,
      purchase_price: purchasePrice,
      factory_price: factoryTotal,
      engine_cc: newCarSelectedVariant.engine_cc,
      status: 'new-car-pricing',
    }
    setSelectedCar(tempCar)
    setFactoryPrice(factoryTotal)
    setPurchasePrice(purchasePrice)
    setEngineCC(newCarSelectedVariant.engine_cc || 0)
    setLoanAmount(Math.round(purchasePrice * 0.7))
    setCarAgeMode('new')  // 신차 분석이므로 차령 0
    setCustomCarAge(0)

    // 신차는 DB 연동 없음
    setLinkedInsurance(null)
    setLinkedFinance(null)
    setMarketComps([])

    // 공통 기준 테이블 매핑 적용
    applyReferenceTableMappings({
      brand: newCarResult.brand,
      model: newCarResult.model,
      fuel_type: newCarSelectedVariant.fuel_type,
      purchase_price: purchasePrice,
      engine_cc: newCarSelectedVariant.engine_cc,
      year: newCarYear,
      factory_price: factoryTotal,
    })
  }, [newCarResult, newCarSelectedVariant, newCarSelectedTrim, newCarSelectedOptions, newCarPurchasePrice, applyReferenceTableMappings])

  // ============================================
  // 초과주행 km당 요금 자동 산출 (출고가 기반)
  // ============================================
  // 대형 렌터카사 기준:
  //   경차/소형 (~2500만): 100~120원/km
  //   중형 (2500~4000만): 130~150원/km
  //   준대형 (4000~6000만): 180~220원/km
  //   대형/수입 (6000~8000만): 220~280원/km
  //   프리미엄 (8000만~1.2억): 280~350원/km
  //   초과주행 요금 = 감가비 + 정비비 + 마진 (감가 모델 연동)
  const [excessRateMarginPct, setExcessRateMarginPct] = useState(50) // 마진율 %
  // 초과주행 km당 요금: 현재 약정 vs 무제한(5만km) 감가 차이 기반 패널티 산출
  const UNLIMITED_KM = 5  // 무제한 = 5만km/년
  const excessRateBreakdown = useMemo(() => {
    const ZERO = { depCost: 0, maintCost: 0, margin: 0, total: 0, depDiffPct: 0, extraKm: 0, depAmount: 0, tierPenalty: 1, maintItems: [] as { name: string; perKm: number }[], baseCost: 0 }
    // 출고가 없으면 매입가로 대체 (수동 입력 모드 등)
    const basePrice = factoryPrice > 0 ? factoryPrice : purchasePrice
    if (basePrice <= 0) return ZERO
    // 무제한 약정이면 초과주행 자체가 없음 → 전부 0
    if (annualMileage >= UNLIMITED_KM) return ZERO

    // 체감감소 주행감가 함수 (메인 calculations와 동일 로직)
    const _calcMileDep = (excess10k: number): number => {
      if (excess10k === 0) return 0
      const sign = excess10k > 0 ? 1 : -1
      const abs = Math.abs(excess10k)
      let dep = 0
      if (abs <= 5) dep = abs * 2.0
      else if (abs <= 10) dep = 5 * 2.0 + (abs - 5) * 1.5
      else dep = 5 * 2.0 + 5 * 1.5 + (abs - 10) * 1.0
      return sign * dep
    }
    const termYears = termMonths / 12
    const carAge = carAgeMode === 'new' ? 0 : customCarAge > 0 ? customCarAge : 0
    const curMileage10k = (selectedCar?.mileage || 0) / 10000
    const endAge = carAge + termYears
    const avgMileageAtEnd = endAge * baselineKm

    // ① 현재 약정 기준 종료 시점 주행감가
    const projectedAtContract = curMileage10k + (termYears * annualMileage)
    const excessAtContract = projectedAtContract - avgMileageAtEnd
    const mileageDepAtContract = _calcMileDep(excessAtContract)

    // ② 무제한(5만km/년) 기준 종료 시점 주행감가
    const projectedUnlimited = curMileage10k + (termYears * UNLIMITED_KM)
    const excessUnlimited = projectedUnlimited - avgMileageAtEnd
    const mileageDepUnlimited = _calcMileDep(excessUnlimited)

    // ③ 감가율 차이 → 금액 차이 → km당 비용
    const depDiffPct = mileageDepUnlimited - mileageDepAtContract  // %p 차이
    const depAmountDiff = Math.round(basePrice * (depDiffPct / 100))
    const extraKm = (UNLIMITED_KM - annualMileage) * termYears * 10000  // 약정↔무제한 총 km 차이

    // 약정이 낮을수록 초과 시 감가 패널티 가중 (무제한 대비 비율)
    // 무제한(5만)=1.0, 3만=1.67, 2만=2.5, 1.5만=3.33, 1만=5.0
    const tierPenalty = annualMileage > 0 ? UNLIMITED_KM / annualMileage : 1
    const depCostPerKm = extraKm > 0 ? Math.round((depAmountDiff / extraKm) * tierPenalty) : 0

    // km당 정비비: 실제 정비 항목별 교체주기·비용 기반 직접 산출
    const isImport = selectedCar ? IMPORT_BRANDS.some(ib => (selectedCar.brand || '').toUpperCase().includes(ib.toUpperCase())) : false
    const cc = selectedCar?.engine_cc || 0
    const maintMult = isImport ? 1.8
      : cc <= 1000 ? 0.7
      : cc <= 2000 ? 1.0
      : 1.3
    const isEV = selectedCar?.fuel_type === '전기' || selectedCar?.fuel_type === 'EV'
    const maintBreakdown = getMaintCostPerKm(maintPackage, maintMult, isEV)
    const maintCostPerKm = maintBreakdown.total

    // 원가 합계 (감가비 + 정비비)
    const baseCost = depCostPerKm + maintCostPerKm
    // 마진 적용
    const marginPerKm = Math.round(baseCost * (excessRateMarginPct / 100))
    const total = baseCost + marginPerKm
    return { depCost: depCostPerKm, maintCost: maintCostPerKm, margin: marginPerKm, total, depDiffPct, extraKm, depAmount: depAmountDiff, tierPenalty, maintItems: maintBreakdown.items, baseCost }
  }, [factoryPrice, purchasePrice, monthlyMaintenance, baselineKm, excessRateMarginPct, annualMileage, termMonths, selectedCar, carAgeMode, customCarAge, maintPackage])

  // 자동 연동
  useEffect(() => {
    if (excessRateBreakdown.total > 0) {
      setExcessMileageRate(excessRateBreakdown.total)
    }
  }, [excessRateBreakdown.total])

  // 보험료 자동 추정 (공제조합 기준)
  useEffect(() => {
    if (!selectedCar || !insAutoMode) return
    const cc = selectedCar.engine_cc || engineCC || 0
    const carAge = (() => {
      if (carAgeMode === 'manual') return customCarAge
      const year = selectedCar.year || new Date().getFullYear()
      return new Date().getFullYear() - year
    })()
    const est = estimateInsurance({
      cc,
      brand: selectedCar.brand || '',
      purchasePrice: purchasePrice,
      factoryPrice: factoryPrice,
      fuelType: selectedCar.fuel_type,
      driverAge: driverAgeGroup,
      deductible: deductible,
      carAge: carAge,
      isCommercial: selectedCar.is_commercial,
      ownDamageCoverageRatio: ownDamageCoverageRatio,
    })
    setInsEstimate(est)
    setMonthlyInsuranceCost(est.totalMonthly)
  }, [selectedCar, factoryPrice, purchasePrice, engineCC, driverAgeGroup, deductible, carAgeMode, customCarAge, insAutoMode, ownDamageCoverageRatio])

  // 초과주행 요금: 사용자 수동 입력값 → 약관 DB → fallback 순서
  const termsExcessInfo = useMemo(() => {
    const vc = insEstimate?.vehicleClass || getInsVehicleClass(engineCC, selectedCar?.brand || '', factoryPrice || purchasePrice)
    return getExcessMileageRateFromTerms(termsConfig?.calc_params, vc, factoryPrice || purchasePrice)
  }, [termsConfig, insEstimate, engineCC, selectedCar, factoryPrice, purchasePrice])

  // ============================================
  // 자동 계산 로직
  // ============================================
  const calculations = useMemo(() => {
    if (!selectedCar) return null

    const thisYear = new Date().getFullYear()
    // 차령: 신차 모드면 0, 연식차량 모드면 사용자 설정값 또는 연식 기반 자동 계산
    const carAge = carAgeMode === 'new'
      ? 0
      : customCarAge > 0
        ? customCarAge
        : Math.max(0, thisYear - (selectedCar.year || thisYear))
    const mileage10k = (selectedCar.mileage || 0) / 10000

    // 1. 시세하락 / 감가 (비선형 곡선 모델)
    // ── 3축 매핑 + DB 기반 감가 곡선
    const autoAxes = selectedCar
      ? mapToDepAxes(selectedCar.brand, selectedCar.model, selectedCar.fuel, factoryPrice)
      : null
    // 수동 오버라이드 적용: 사용자가 선택한 축이 있으면 그것으로 대체
    const effectiveAxes = autoAxes ? {
      origin: (dbOriginOverride || autoAxes.origin) as DepAxes['origin'],
      vehicle_class: (dbVehicleClassOverride || autoAxes.vehicle_class) as DepAxes['vehicle_class'],
      fuel_type: (dbFuelTypeOverride || autoAxes.fuel_type) as DepAxes['fuel_type'],
      label: `${dbOriginOverride || autoAxes.origin} ${(dbVehicleClassOverride || autoAxes.vehicle_class).replace(/_/g, ' ')} ${(dbFuelTypeOverride || autoAxes.fuel_type) !== '내연기관' ? (dbFuelTypeOverride || autoAxes.fuel_type) : ''}`.trim(),
    } : null
    const autoDepClass = effectiveAxes?.label || ''
    const depClass = depClassOverride || autoDepClass

    // DB 기반 곡선: depreciation_rates 테이블에서 3축 매칭 (오버라이드 반영)
    const matchedDepRate = effectiveAxes
      ? depRates.find(d => d.origin === effectiveAxes.origin && d.vehicle_class === effectiveAxes.vehicle_class && d.fuel_type === effectiveAxes.fuel_type)
      : null
    const dbCurve = matchedDepRate ? buildCurveFromDbRates(matchedDepRate) : null

    // ── 감가 곡선 결정
    const activeCurve = depCurvePreset === 'custom'
      ? depCustomCurve
      : depCurvePreset === 'db_based'
        ? (dbCurve || DEP_CURVE_PRESETS.standard.curve)
        : DEP_CURVE_PRESETS[depCurvePreset as keyof typeof DEP_CURVE_PRESETS]?.curve || DEP_CURVE_PRESETS.standard.curve

    // ── 클래스 보정 승수 결정
    // DB 기반(db_based): rate가 이미 3축(origin×vehicle_class×fuel_type)별로 분리되어 있으므로
    //   추가 보정 불필요 → 1.0 (전기차/하이브리드 포함)
    // 프리셋 기반: DEP_CLASS_MULTIPLIER에서 키 매칭, 없으면 1.0 fallback
    const classMult = depCurvePreset === 'db_based'
      ? 1.0
      : (DEP_CLASS_MULTIPLIER[depClass]?.mult ?? 1.0)

    // ── 보정계수 (depreciation_adjustments) 적용
    // 주행거리 약정 factor
    // ※ calcMileageDep에서 초과주행 감가를 직접 계산하므로,
    //   여기서 주행거리 factor까지 적용하면 이중 차감됨 → 1.0으로 비활성화
    //   (주행거리 영향은 calcMileageDep 한 곳에서만 처리)
    const mileageFactor = 1.0
    // 시장상황 factor (활성화된 것만)
    const marketFactor = (() => {
      const marketAdjs = depAdjustments.filter(a =>
        a.adjustment_type === 'market_condition' && a.is_active && Number(a.factor) !== 1.0
      )
      if (marketAdjs.length === 0) return 1.0
      return marketAdjs.reduce((acc, a) => acc * Number(a.factor), 1.0)
    })()
    // 인기도 factor
    const popularityFactor = (() => {
      const popAdjs = depAdjustments.filter(a => a.adjustment_type === 'popularity' && a.is_active)
      const match = popAdjs.find(a => a.label === popularityGrade)
      if (match) return Number(match.factor)
      // DB에 인기도 데이터 없으면 기본값 사용
      const defaultPop: Record<string, number> = { 'S등급 (인기)': 1.05, 'A등급 (준인기)': 1.02, 'B등급 (일반)': 1.0, 'C등급 (비인기)': 0.97, 'D등급 (저인기)': 0.93 }
      return defaultPop[popularityGrade] ?? 1.0
    })()
    // 종합 보정계수
    const adjustmentFactor = mileageFactor * marketFactor * popularityFactor

    // ── 중고차 여부 판별 & 구입시 주행거리
    const isUsedCar = carAgeMode === 'used' && carAge > 0
    const purchaseMileage10k = isUsedCar ? (selectedCar.purchase_mileage || 0) / 10000 : 0

    // ── 현재 시점 연식 감가율 (비선형 곡선 기반)
    // 잔가율표 곡선에는 이미 "평균 주행거리"가 반영되어 있음
    const yearDepNow = getDepRateFromCurve(activeCurve, carAge, classMult)

    // ── 주행감가: 0% 감가 기준(baselineKm) 대비 초과/미달분만 보정
    // baselineKm = 0% 감가 기준 (만km/년), annualMileage = 계약 약정 주행거리
    // 체감감소(디미니싱) 구간별 감가율: 초과분이 많을수록 만km당 감가율 둔화
    //   0~5만km 초과: 2%/만km, 5~10만km: 1.5%/만km, 10만km~: 1%/만km
    //   저주행(음수)은 동일 구간 역적용 (저주행 프리미엄 체감)
    const calcMileageDep = (excess10k: number): number => {
      if (excess10k === 0) return 0
      const sign = excess10k > 0 ? 1 : -1
      const abs = Math.abs(excess10k)
      let dep = 0
      if (abs <= 5) {
        dep = abs * 2.0
      } else if (abs <= 10) {
        dep = 5 * 2.0 + (abs - 5) * 1.5
      } else {
        dep = 5 * 2.0 + 5 * 1.5 + (abs - 10) * 1.0
      }
      return sign * dep
    }

    const avgMileageNow = carAge * baselineKm  // 0% 감가 기준 누적 주행거리
    const excessMileageNow = mileage10k - avgMileageNow  // 양수=초과, 음수=저주행
    const mileageDepNow = calcMileageDep(excessMileageNow)
    const totalDepRateNow = Math.max(0, Math.min(yearDepNow + mileageDepNow, 90))
    // 보정계수 적용: 현재 시장가에도 반영
    const adjustedNowResidualPct = carAge === 0 ? 1.0
      : Math.max(0, Math.min((1 - totalDepRateNow / 100) * adjustmentFactor, 1.0))
    const currentMarketValue = Math.round(factoryPrice * adjustedNowResidualPct)

    // ── 계약 종료 시점 감가율
    const termYears = termMonths / 12
    const endAge = carAge + termYears
    const yearDepEnd = getDepRateFromCurve(activeCurve, endAge, classMult)

    // 약정 주행거리(annualMileage)로 종료 시점 예상 주행거리 산출
    const projectedMileage10k = mileage10k + (termYears * annualMileage)
    // 0% 감가 기준(baselineKm)으로 초과/미달 판정
    const avgMileageEnd = endAge * baselineKm
    const excessMileageEnd = projectedMileage10k - avgMileageEnd
    const mileageDepEnd = calcMileageDep(excessMileageEnd)
    const totalDepRateEnd = Math.max(0, Math.min(yearDepEnd + mileageDepEnd, 90))
    // 보정계수 적용: 잔존율에 factor 곱셈 (factor>1 → 잔존율↑ → 시장가↑)
    const adjustedEndResidualPct = Math.max(0, Math.min((1 - totalDepRateEnd / 100) * adjustmentFactor, 1.0))
    const endMarketValue = Math.round(factoryPrice * adjustedEndResidualPct)

    // ── 중고차 감가 분리 계산 (회사 부담 / 고객 부담)
    // 구입 시점 주행감가 (회사 부담 = 구입가에 이미 반영)
    const purchaseAvgMileage = carAge * baselineKm                         // 구입차령 기준 표준주행 (만km)
    const purchaseExcessMileage = purchaseMileage10k - purchaseAvgMileage   // 구입시 초과/미달 (만km)
    const purchaseMileageDep = calcMileageDep(purchaseExcessMileage)     // 구입시 주행감가율 (%)
    const purchaseYearDep = yearDepNow                                      // 구입시 연식감가율 (%)
    const purchaseTotalDep = Math.max(0, Math.min(purchaseYearDep + purchaseMileageDep, 90))
    const theoreticalMarketValue = Math.round(factoryPrice * Math.max(0, (1 - purchaseTotalDep / 100) * adjustmentFactor))
    const purchasePremiumPct = theoreticalMarketValue > 0
      ? ((purchasePrice - theoreticalMarketValue) / theoreticalMarketValue * 100)
      : 0

    // ── 고객 귀책 주행감가: 순수하게 계약기간 동안 기준 대비 초과 주행분만
    // 구입시 주행상태(-4% 등)는 회사가 가져간 것이므로 고객과 무관
    // 예: 연3만 약정, 기준2만, 3년계약 → (3-2)×3 = 3만km 초과 → 6% 감가
    const customerDriven10k = termYears * annualMileage          // 고객 계약기간 총주행 (만km)
    const standardAddition10k = termYears * baselineKm           // 계약기간 기준주행 (만km)
    const customerExcessMileage = isUsedCar
      ? (customerDriven10k - standardAddition10k)                // 중고: 계약기간 초과분만
      : excessMileageEnd                                         // 신차: 전체 초과분 (기존 로직)
    const customerMileageDep = calcMileageDep(customerExcessMileage)
    // 고객 적용 연식감가 차이분 (구입차령 → 종료차령)
    const customerYearDep = yearDepEnd - purchaseYearDep
    // 고객 적용 총 감가율 변동분
    const customerTotalDepChange = isUsedCar
      ? (customerYearDep + customerMileageDep)
      : 0  // 신차는 기존 로직 그대로

    // ── 중고차 종료시 감가 (고객 비용 산출용)
    // 연식감가(전체, 신차부터) + 고객 귀책 주행감가만 (구입시 주행상태는 제외)
    const usedCarEndTotalDep = isUsedCar
      ? Math.max(0, Math.min(yearDepEnd + customerMileageDep, 90))
      : totalDepRateEnd
    const usedCarEndResidualPct = isUsedCar
      ? Math.max(0, Math.min((1 - usedCarEndTotalDep / 100) * adjustmentFactor, 1.0))
      : adjustedEndResidualPct
    const usedCarEndMarketValue = isUsedCar
      ? Math.round(factoryPrice * usedCarEndResidualPct)
      : endMarketValue
    // 차량 실제 잔존가 (회사 처분용, 전체 주행감가 포함)
    const carActualEndMarketValue = endMarketValue

    // UI 표시용
    const yearDep = yearDepNow
    const mileageDep = mileageDepNow
    const totalDepRate = totalDepRateNow

    // 취득원가 기준 월 감가비
    // 등록 페이지 구입비용 상세(car_costs) 합계가 있으면 실투자금으로 사용
    // 없으면 매입가(purchasePrice)를 기준으로 사용
    const costBase = totalAcquisitionCost > 0 ? totalAcquisitionCost : purchasePrice
    // 잔존가치 결정
    // 중고차: usedCarEndMarketValue 사용 (전체연식감가 + 고객귀책 주행감가만 반영)
    // 신차: endMarketValue 사용 (전체 감가 반영)
    const effectiveEndMarketValue = isUsedCar ? usedCarEndMarketValue : endMarketValue
    // 반납형: 잔존가치 = 종료 시점 시세 100% (차량 회수 후 처분)
    // 인수형: 잔존가치 = 종료 시점 시세 × residualRate% (고객 인수가격)
    const residualValue = contractType === 'return'
      ? effectiveEndMarketValue
      : Math.round(effectiveEndMarketValue * (residualRate / 100))
    const buyoutPrice = residualValue  // 인수형일 때만 의미 있음
    const monthlyDepreciation = Math.round(Math.max(0, costBase - residualValue) / termMonths)

    // 2. 금융비용 (평균잔액법) — 총취득원가 기준
    // 대출: 차량매입가 한도 내 (담보가치 기준, 부대비용은 대출 불가)
    // 자기자본: 총취득원가 - 대출금 (취득세·공채·탁송 등 부대비용 포함)
    const effectiveLoan = Math.min(loanAmount, purchasePrice) // 대출은 매입가 초과 불가
    const residualRatio = costBase > 0 ? Math.max(0, residualValue / costBase) : 0
    const loanEndBalance = Math.round(effectiveLoan * residualRatio)
    const avgLoanBalance = Math.round((effectiveLoan + loanEndBalance) / 2)

    const equityAmount = costBase - effectiveLoan // 총취득원가 - 대출 = 자기자본 (부대비용 포함)
    const equityEndBalance = Math.round(equityAmount * residualRatio)
    const avgEquityBalance = Math.round((equityAmount + equityEndBalance) / 2)

    const monthlyLoanInterest = Math.round(avgLoanBalance * (loanRate / 100) / 12)
    const monthlyOpportunityCost = Math.round(avgEquityBalance * (investmentRate / 100) / 12)
    const totalMonthlyFinance = monthlyLoanInterest + monthlyOpportunityCost

    // 3. 운영비용
    const monthlyTax = Math.round(annualTax / 12)
    // 자동차 정기검사비 — DB 기준표 연동 (유종별 차등 적용)
    // 유종 매핑 먼저 (차급 판정에서 전기차 분기에 필요)
    const inspFuelType = (() => {
      const rawFuel = (selectedCar?.fuel || selectedCar?.fuel_type || '').toLowerCase()
      // EV 모델명 기반 판별도 추가 (fuel 필드가 비어있는 경우 대비)
      const modelName = (selectedCar?.model || '').toUpperCase()
      const isEVByModel = EV_MODEL_KEYWORDS.some(k => modelName.includes(k.toUpperCase()))
      if (isEVByModel || ['전기', 'ev', 'electric', 'bev'].some(k => rawFuel.includes(k))) return '전기'
      if (['수소', 'hydrogen', 'fcev', 'fuel cell'].some(k => rawFuel.includes(k))) return '수소'
      if (['하이브리드', 'hybrid', 'hev', 'phev'].some(k => rawFuel.includes(k))) return '하이브리드'
      if (['디젤', 'diesel'].some(k => rawFuel.includes(k))) return '디젤'
      if (['lpg', 'lng', 'cng'].some(k => rawFuel.includes(k))) return 'LPG'
      return '가솔린' // 기본값
    })()
    // 차종 매핑: 배기량 기반, 전기차/수소차는 가격 기반
    const inspVehicleClass = (() => {
      const cc = selectedCar?.engine_cc || engineCC || 0
      // 전기차/수소차는 engine_cc가 없으므로 가격 기반 차급 판정
      if (cc === 0 || inspFuelType === '전기' || inspFuelType === '수소') {
        const price = purchasePrice || factoryPrice || 0
        if (price < 20000000) return '경형'
        if (price < 35000000) return '소형'
        if (price < 50000000) return '중형'
        return '대형'
      }
      if (cc <= 1000) return '경형'
      if (cc <= 1600) return '소형'
      if (cc <= 2000) return '중형'
      return '대형'
    })()
    // DB에서 검사비용 조회 (종합검사 + 유종 + 지역 매칭, 단계적 fallback)
    const inspCostRecord =
      // 1순위: 유종 + 지역 정확 매칭
      inspectionCosts.find(r =>
        r.vehicle_class === inspVehicleClass && r.fuel_type === inspFuelType &&
        r.inspection_type === '종합검사' && r.region === registrationRegion
      ) ||
      // 2순위: 유종 + 전국
      inspectionCosts.find(r =>
        r.vehicle_class === inspVehicleClass && r.fuel_type === inspFuelType &&
        r.inspection_type === '종합검사' && r.region === '전국'
      ) ||
      // 3순위: 전체 유종 + 지역
      inspectionCosts.find(r =>
        r.vehicle_class === inspVehicleClass && r.fuel_type === '전체' &&
        r.inspection_type === '종합검사' && r.region === registrationRegion
      ) ||
      // 4순위: 전체 유종 + 전국
      inspectionCosts.find(r =>
        r.vehicle_class === inspVehicleClass && r.fuel_type === '전체' &&
        r.inspection_type === '종합검사' && r.region === '전국'
      )
    const inspectionCostPerTime = inspCostRecord?.total_cost || 65000  // DB fallback

    // DB에서 검사 주기 조회 함수 (차령에 따라 주기가 변하므로)
    const getInspInterval = (ageYr: number): number => {
      const rec =
        inspectionSchedules.find(r =>
          r.vehicle_usage === '사업용_승용' && r.fuel_type === inspFuelType &&
          ageYr >= r.age_from && ageYr <= r.age_to
        ) ||
        inspectionSchedules.find(r =>
          r.vehicle_usage === '사업용_승용' && (r.fuel_type === '전체' || !r.fuel_type) &&
          ageYr >= r.age_from && ageYr <= r.age_to
        ) ||
        inspectionSchedules.find(r =>
          r.vehicle_usage === '사업용' && ageYr >= r.age_from && ageYr <= r.age_to
        )
      return rec?.interval_months || 12  // fallback: 매년
    }
    const firstInspSchedule = inspectionSchedules.find(r =>
      r.vehicle_usage === '사업용_승용' && (r.fuel_type === inspFuelType || r.fuel_type === '전체' || !r.fuel_type) &&
      0 >= r.age_from && 0 <= r.age_to
    )
    const firstInspMonths = firstInspSchedule?.first_inspection_months || 24
    const inspIntervalMonths = getInspInterval(Math.floor(carAge))  // 현재 시점 주기 (표시용)

    // 계약 기간 내 검사 횟수 계산 — 차령 변화에 따른 주기 변동 반영
    // 월 단위로 시뮬레이션하여 정확한 횟수 산출
    const inspectionsInTerm = (() => {
      const startAgeMonths = Math.round(carAge * 12)
      const firstInspAt = carAge === 0 ? firstInspMonths : 0  // 신차면 첫 검사까지 대기
      let count = 0
      let monthSinceLastInsp = 0
      for (let m = 1; m <= termMonths; m++) {
        const currentAgeMonths = startAgeMonths + m
        if (currentAgeMonths < firstInspAt) continue  // 첫 검사 전 기간은 스킵
        const currentAgeYears = Math.floor(currentAgeMonths / 12)
        const interval = getInspInterval(currentAgeYears)
        monthSinceLastInsp++
        if (monthSinceLastInsp >= interval) {
          count++
          monthSinceLastInsp = 0
        }
      }
      return count
    })()
    const totalInspectionCost = inspectionsInTerm * inspectionCostPerTime
    const monthlyInspectionCost = termMonths > 0 ? Math.round(totalInspectionCost / termMonths) : 0
    const totalMonthlyOperation = monthlyInsuranceCost + monthlyMaintenance + monthlyTax + monthlyInspectionCost

    // 4. 리스크 적립
    const monthlyRiskReserve = Math.round(purchasePrice * (riskRate / 100) / 12)

    // 5. 보증금/선납금 할인
    // 보증금: 보증금 × 월할인률%
    const monthlyDepositDiscount = Math.round(deposit * (depositDiscountRate / 100))
    // 선납금: 선납금 ÷ 계약기간 (단순 분할)
    const monthlyPrepaymentDiscount = termMonths > 0 ? Math.round(prepayment / termMonths) : 0
    const totalDiscount = monthlyDepositDiscount + monthlyPrepaymentDiscount

    // 6. 총 원가
    const totalMonthlyCost = Math.max(0,
      monthlyDepreciation +
      totalMonthlyFinance +
      totalMonthlyOperation +
      monthlyRiskReserve -
      totalDiscount
    )

    // 7. 최종 렌트가 (천원단위 반올림)
    const rawSuggestedRent = totalMonthlyCost + margin
    const suggestedRent = Math.round(rawSuggestedRent / 1000) * 1000
    const rentWithVAT = Math.round(suggestedRent * 1.1 / 1000) * 1000

    // 8. 시장 비교
    const validComps = marketComps.filter(c => c.monthly_rent > 0)
    const marketAvg = validComps.length > 0
      ? Math.round(validComps.reduce((sum, c) => sum + c.monthly_rent, 0) / validComps.length)
      : 0
    const marketDiff = marketAvg > 0 ? ((rentWithVAT - marketAvg) / marketAvg * 100) : 0

    // 9. 매입가 대비 출고가 할인율
    const purchaseDiscount = factoryPrice > 0
      ? ((factoryPrice - purchasePrice) / factoryPrice * 100)
      : 0

    // 10. 원가 비중
    const costBreakdown = {
      depreciation: monthlyDepreciation,
      finance: totalMonthlyFinance,
      operation: totalMonthlyOperation,
      risk: monthlyRiskReserve,
      discount: -totalDiscount,
    }

    // 11. IRR (렌트사 투자 수익률)
    // 현금흐름: t0=-취득원가+보증금+선납금, t1~N=월렌트료(공급가), tN+=잔존가치-보증금반환
    const irrResult = calcIRR(costBase, suggestedRent, termMonths, residualValue, deposit, prepayment)

    return {
      carAge, mileage10k, termYears, isUsedCar,
      // 감가 — 현재
      yearDep, mileageDep, totalDepRate,
      excessMileageNow, avgMileageNow,
      currentMarketValue,
      // 감가 — 계약 종료 시점
      yearDepEnd, mileageDepEnd, totalDepRateEnd,
      excessMileageEnd, avgMileageEnd,
      endMarketValue, projectedMileage10k,
      effectiveEndMarketValue,
      monthlyDepreciation,
      // 중고차 감가 분리 분석
      purchaseMileage10k, purchaseAvgMileage, purchaseExcessMileage,
      purchaseMileageDep, purchaseYearDep, purchaseTotalDep,
      theoreticalMarketValue, purchasePremiumPct,
      customerDriven10k, standardAddition10k,
      customerExcessMileage, customerMileageDep, customerYearDep, customerTotalDepChange,
      usedCarEndTotalDep, usedCarEndMarketValue, carActualEndMarketValue,
      // 잔존가치 & 인수
      residualValue, buyoutPrice, costBase,
      // 감가 곡선 참조
      depClass, classMult,
      // 3축 매칭 & 보정계수
      matchedDepRate, autoAxes, effectiveAxes, activeCurve,
      adjustmentFactor, mileageFactor, marketFactor, popularityFactor,
      // 금융
      effectiveLoan, equityAmount, monthlyLoanInterest, monthlyOpportunityCost, totalMonthlyFinance,
      avgLoanBalance, loanEndBalance, avgEquityBalance, equityEndBalance,
      // 운영
      monthlyTax, monthlyInspectionCost, inspectionCostPerTime, inspectionsInTerm, inspIntervalMonths, totalMonthlyOperation,
      // 리스크
      monthlyRiskReserve,
      // 보증금
      monthlyDepositDiscount, monthlyPrepaymentDiscount, totalDiscount,
      // 합계
      totalMonthlyCost, suggestedRent, rentWithVAT,
      // 시장
      marketAvg, marketDiff, purchaseDiscount,
      // 비중
      costBreakdown,
      // IRR
      irrResult,
    }
  }, [
    selectedCar, factoryPrice, purchasePrice, carAgeMode, customCarAge, depCurvePreset, depCustomCurve, depClassOverride, depYear1Rate, depYear2Rate, annualMileage, baselineKm,
    contractType, residualRate, depRates, depAdjustments, popularityGrade, dbOriginOverride, dbVehicleClassOverride, dbFuelTypeOverride,
    loanAmount, loanRate, investmentRate,
    monthlyInsuranceCost, monthlyMaintenance, annualTax,
    riskRate, deposit, prepayment, depositDiscountRate, prepaymentDiscountRate,
    termMonths, margin, marketComps, deductible, totalAcquisitionCost,
    inspectionCosts, inspectionSchedules, registrationRegion, engineCC
  ])

  // 시장비교 추가
  const addMarketComp = async () => {
    if (!newComp.competitor_name || !newComp.monthly_rent) return
    if (!selectedCar || !effectiveCompanyId) return

    const { data, error } = await supabase.from('market_comparisons').insert([{
      company_id: effectiveCompanyId,
      car_id: selectedCar.id,
      ...newComp
    }]).select().single()

    if (!error && data) {
      setMarketComps(prev => [...prev, data])
      setNewComp({ competitor_name: '', vehicle_info: '', monthly_rent: 0, deposit: 0, term_months: 36, source: '' })
    }
  }

  const removeMarketComp = async (id: string) => {
    await supabase.from('market_comparisons').delete().eq('id', id)
    setMarketComps(prev => prev.filter(c => c.id !== id))
  }

  // 워크시트 저장 (등록차량 + 신차 모두 지원)
  const handleSaveWorksheet = async () => {
    if (!selectedCar) { alert('차량을 먼저 선택해주세요.'); return }
    if (!effectiveCompanyId) { alert('회사 정보를 불러올 수 없습니다. 다시 로그인해주세요.'); return }
    if (!calculations) { alert('산출 결과가 없습니다. 차량을 먼저 분석해주세요.'); return }
    setSaving(true)

    const baseData = {
      company_id: effectiveCompanyId,
      factory_price: factoryPrice,
      purchase_price: purchasePrice,
      current_market_value: calculations.currentMarketValue,
      total_depreciation_rate: calculations.totalDepRate,
      monthly_depreciation: calculations.monthlyDepreciation,
      loan_amount: loanAmount,
      loan_interest_rate: loanRate,
      monthly_loan_interest: calculations.monthlyLoanInterest,
      equity_amount: calculations.equityAmount,
      investment_rate: investmentRate,
      monthly_opportunity_cost: calculations.monthlyOpportunityCost,
      monthly_insurance: monthlyInsuranceCost,
      driver_age_group: driverAgeGroup,
      ins_auto_mode: insAutoMode,
      monthly_maintenance: monthlyMaintenance,
      maint_package: maintPackage,
      oil_change_freq: oilChangeFreq,
      car_age_mode: carAgeMode,
      custom_car_age: customCarAge,
      dep_curve_preset: depCurvePreset,
      dep_custom_curve: depCustomCurve,
      dep_class_override: depClassOverride,
      contract_type: contractType,
      residual_rate: residualRate,
      buyout_premium: buyoutPremium,
      monthly_tax: calculations.monthlyTax,
      deductible: deductible,
      monthly_risk_reserve: calculations.monthlyRiskReserve,
      deposit_amount: deposit,
      prepayment_amount: prepayment,
      deposit_discount_rate: depositDiscountRate,
      prepayment_discount_rate: prepaymentDiscountRate,
      registration_region: registrationRegion,
      monthly_deposit_discount: calculations.monthlyDepositDiscount,
      monthly_prepayment_discount: calculations.monthlyPrepaymentDiscount,
      total_monthly_cost: calculations.totalMonthlyCost,
      target_margin: margin,
      suggested_rent: calculations.suggestedRent,
      market_avg_rent: calculations.marketAvg,
      market_position: calculations.marketAvg > 0
        ? (calculations.marketDiff > 5 ? 'premium' : calculations.marketDiff < -5 ? 'economy' : 'average')
        : 'average',
      term_months: termMonths,
      annual_mileage: annualMileage,
      baseline_km: baselineKm,
      excess_mileage_rate: excessMileageRate,
      excess_rate_margin_pct: excessRateMarginPct,
      status: 'draft',
      updated_at: new Date().toISOString(),
    }

    let error: any = null
    let savedWorksheetId: string | null = null

    try {
      if (lookupMode === 'registered') {
        // 등록차량: car_id로 기존 워크시트 조회 후 insert/update
        const { data: existing } = await supabase
          .from('pricing_worksheets')
          .select('id')
          .eq('company_id', effectiveCompanyId)
          .eq('car_id', selectedCar.id)
          .maybeSingle()

        if (existing) {
          const { error: e } = await supabase
            .from('pricing_worksheets')
            .update({ ...baseData, car_id: selectedCar.id })
            .eq('id', existing.id)
          error = e
          savedWorksheetId = existing.id
        } else {
          const { data, error: e } = await supabase
            .from('pricing_worksheets')
            .insert([{ ...baseData, car_id: selectedCar.id }])
            .select('id')
            .single()
          error = e
          savedWorksheetId = data?.id || null
        }
      } else {
        // 신차 분석: car_id 없이 insert + 차량정보 JSONB
        const { data, error: e } = await supabase
          .from('pricing_worksheets')
          .insert([{
            ...baseData,
            car_id: null,
            newcar_info: {
              brand: selectedCar.brand,
              model: selectedCar.model,
              year: selectedCar.year,
              fuel: selectedCar.fuel,
              trim: selectedCar.trim || '',
              exterior_color: newCarSelectedExterior?.name || '',
              interior_color: newCarSelectedInterior?.name || '',
            },
          }])
          .select('id')
          .single()
        error = e
        savedWorksheetId = data?.id || null
      }
    } catch (err: any) {
      error = err
    }

    if (error) alert('저장 실패: ' + (error.message || JSON.stringify(error)))
    else {
      alert(lookupMode === 'registered' ? '산출 워크시트가 저장되었습니다.' : '신차 분석이 저장되었습니다.')
      if (savedWorksheetId) setCurrentWorksheetId(savedWorksheetId)
    }
    setSaving(false)
  }

  // 견적서로 전환 — 워크시트 저장 후 위저드 Step 2로 이동
  const handleGoToCustomerStep = async () => {
    if (!calculations || !selectedCar) return

    // 워크시트가 아직 저장 안 된 경우 먼저 저장
    if (!currentWorksheetId) {
      setSaving(true)
      await handleSaveWorksheet()
      setSaving(false)
    }

    setWizardStep('customer')
  }

  // ============================================
  // 견적서 저장 (Step 3에서 호출)
  // ============================================
  const handleSaveQuote = async (status: 'draft' | 'active') => {
    if (!calculations || !selectedCar) return
    if (customerMode === 'select' && !selectedCustomerId) return alert('고객을 선택해주세요.')
    if (customerMode === 'manual' && !manualCustomer.name.trim()) return alert('고객명을 입력해주세요.')
    setQuoteSaving(true)

    const calc = calculations
    const car = selectedCar
    const resolvedExcessRate = excessMileageRate || termsExcessInfo.rate

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const selectedCustomer = customerMode === 'select'
      ? customers.find((c: any) => String(c.id) === String(selectedCustomerId))
      : manualCustomer.name ? { ...manualCustomer, id: '', type: '직접입력' } : undefined

    // 견적서 종료일
    const endDateObj = new Date(startDate)
    endDateObj.setMonth(endDateObj.getMonth() + termMonths)
    const endDate = endDateObj.toISOString().split('T')[0]

    // 확장 데이터 (quote_detail JSONB)
    const detailData = {
      manual_customer: customerMode === 'manual' ? manualCustomer : null,
      contract_type: contractType,
      residual_rate: residualRate,
      residual_value: calc.residualValue,
      buyout_price: calc.buyoutPrice,
      factory_price: factoryPrice,
      purchase_price: purchasePrice,
      total_acquisition_cost: totalAcquisitionCost,
      car_info: {
        brand: car.brand, model: car.model, trim: car.trim || '',
        year: car.year, fuel: car.fuel || '', engine_cc: car.engine_cc || engineCC,
        mileage: car.mileage || 0,
      },
      cost_breakdown: {
        depreciation: calc.monthlyDepreciation,
        finance: calc.totalMonthlyFinance,
        loan_interest: calc.monthlyLoanInterest,
        opportunity_cost: calc.monthlyOpportunityCost,
        avg_loan_balance: calc.avgLoanBalance,
        avg_equity_balance: calc.avgEquityBalance,
        insurance: monthlyInsuranceCost,
        maintenance: monthlyMaintenance,
        tax: calc.monthlyTax,
        risk: calc.monthlyRiskReserve,
        deposit_discount: calc.monthlyDepositDiscount,
        prepayment_discount: calc.monthlyPrepaymentDiscount,
        discount: calc.totalDiscount,
      },
      loan_amount: loanAmount, loan_rate: loanRate, investment_rate: investmentRate,
      term_months: termMonths, annualMileage, baselineKm,
      deposit, prepayment, deductible, margin, own_damage_coverage_ratio: ownDamageCoverageRatio,
      driver_age_group: driverAgeGroup,
      ins_estimate: insEstimate ? {
        vehicleClass: insEstimate.vehicleClass, basePremium: insEstimate.basePremium,
        ownDamagePremium: insEstimate.ownDamagePremium, totalAnnual: insEstimate.totalAnnual,
      } : null,
      maint_package: maintPackage,
      excess_mileage_rate: resolvedExcessRate,
      excess_mileage_source: excessMileageRate > 0 ? 'manual' : termsExcessInfo.source,
      excess_mileage_terms_key: termsExcessInfo.key || null,
      early_termination_rate: termsConfig?.calc_params?.early_termination_rate || 35,
      early_termination_rates_by_period: termsConfig?.calc_params?.early_termination_rates_by_period || null,
      insurance_coverage: termsConfig?.insurance_coverage || null,
      quote_notices: termsConfig?.quote_notices || null,
      insurance_note: termsConfig?.calc_params?.insurance_note || null,
      terms_id: termsConfig?.id || null,
      dep_curve_preset: depCurvePreset,
      current_market_value: calc.currentMarketValue,
      end_market_value: calc.endMarketValue,
      year_dep: calc.yearDep, year_dep_end: calc.yearDepEnd,
      total_dep_rate: calc.totalDepRate, total_dep_rate_end: calc.totalDepRateEnd,
      cost_base: calc.costBase, purchase_discount: calc.purchaseDiscount,
      note: quoteNote || null,
      worksheet_id: currentWorksheetId || null,
    }

    try {
      // ID 값 정리 유틸 — UUID/숫자형 상관없이 원본값 그대로 전달, 빈값만 null
      const cleanId = (val: any): any => {
        if (val === null || val === undefined || val === '' || val === 0) return null
        const num = Number(val)
        return isNaN(num) ? val : num  // DB bigint 컬럼 호환
      }
      const rawCarId = (car.id && !String(car.id).startsWith('newcar-')) ? car.id : null
      const rawCustomerId = customerMode === 'select' ? selectedCustomerId : null

      const basePayload: Record<string, any> = {
        company_id: cleanId(effectiveCompanyId),
        car_id: cleanId(rawCarId),
        customer_id: cleanId(rawCustomerId),
        start_date: startDate,
        end_date: endDate,
        deposit,
        rent_fee: calc.suggestedRent,
        status,
      }
      const extendedCols: Record<string, any> = {
        customer_name: customerMode === 'select' ? (selectedCustomer?.name || '') : manualCustomer.name.trim(),
        rental_type: contractType === 'buyout' ? '인수형렌트' : '반납형렌트',
        margin,
        memo: quoteNote || null,
        quote_detail: detailData,
        expires_at: expiresAt.toISOString(),
        worksheet_id: cleanId(currentWorksheetId),
      }

      console.log('Quote save payload:', { company_id: basePayload.company_id, car_id: basePayload.car_id, customer_id: basePayload.customer_id })

      // 저장 시도 순서:
      // 1) 풀 페이로드 → 2) _id 컬럼 제거 → 3) 최소 페이로드
      // UUID/BIGINT 타입 불일치 시 _id 컬럼을 제거해서 재시도
      const fullPayload = { ...basePayload, ...extendedCols }
      const noFkPayload = { ...fullPayload }
      delete noFkPayload.car_id
      delete noFkPayload.customer_id
      delete noFkPayload.worksheet_id
      const minPayload = {
        company_id: basePayload.company_id,
        start_date: startDate,
        end_date: endDate,
        deposit,
        rent_fee: calc.suggestedRent,
        status,
        quote_detail: detailData,
        customer_name: extendedCols.customer_name,
      }

      const payloadsToTry = [fullPayload, noFkPayload, minPayload]

      let error: any = null
      let insertData: any = null
      const errors: string[] = []

      for (let i = 0; i < payloadsToTry.length; i++) {
        const payload = payloadsToTry[i]
        if (editingQuoteId) {
          const { data: d, error: e } = await supabase.from('quotes').update(payload).eq('id', editingQuoteId).select()
          error = e; insertData = d
        } else {
          const { data: d, error: e } = await supabase.from('quotes').insert([payload]).select()
          error = e; insertData = d
        }
        if (!error) break
        const msg = error?.message || error?.details || error?.hint || error?.code || JSON.stringify(error)
        errors.push(`시도${i + 1}(${Object.keys(payload).length}cols): ${msg}`)
        console.warn(`Quote save attempt ${i + 1} failed:`, msg)
      }

      setQuoteSaving(false)
      if (error) {
        console.error('Quote save failed:', errors)
        alert('저장 실패:\n' + errors.join('\n'))
      } else {
        const savedId = editingQuoteId || insertData?.[0]?.id
        alert(`견적서가 ${status === 'draft' ? '임시저장' : '확정'}되었습니다.`)
        if (savedId) {
          router.push(`/quotes/${savedId}`)
        } else {
          router.push('/quotes')
        }
      }
    } catch (err: any) {
      setQuoteSaving(false)
      console.error('Unexpected error:', err)
      alert('저장 중 오류 발생: ' + (err?.message || String(err)))
    }
  }

  // ============================================
  // 렌더링
  // ============================================
  if (loading || editLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-steel-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-bold">데이터 불러오는 중...</p>
        </div>
      </div>
    )
  }

  // --- 견적서 미리보기용 파생값 ---
  const quoteSelectedCustomer = customerMode === 'select'
    ? customers.find((c: any) => String(c.id) === String(selectedCustomerId))
    : manualCustomer.name ? { ...manualCustomer, id: '', type: '직접입력' } : undefined
  const quoteEndDate = (() => {
    const d = new Date(startDate); d.setMonth(d.getMonth() + termMonths)
    return d.toISOString().split('T')[0]
  })()
  const quoteExcessRate = excessMileageRate || termsExcessInfo.rate
  const quoteTotalMileage = annualMileage * 10000 * (termMonths / 12)

  // ============================================
  // Step 2: 고객 정보 입력
  // ============================================
  if (wizardStep === 'customer') {
    const calc = calculations
    return (
      <div className="max-w-[800px] mx-auto py-8 px-4 min-h-screen bg-gray-50/50">
        {/* 스텝 인디케이터 */}
        <div className="flex items-center gap-2 mb-8">
          {[
            { key: 'analysis', label: '1. 원가분석', done: true },
            { key: 'customer', label: '2. 고객정보', done: false },
            { key: 'preview', label: '3. 견적서', done: false },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-300" />}
              <div className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors
                ${s.key === 'customer' ? 'bg-steel-600 text-white' : s.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <h1 className="text-2xl font-black text-gray-900 mb-2">견적서 작성</h1>
        <p className="text-gray-500 text-sm mb-8">렌트가 산출 결과를 바탕으로 고객용 견적서를 생성합니다.</p>

        {/* 분석 요약 */}
        {selectedCar && calc && (
          <div className="bg-steel-900 text-white rounded-2xl p-5 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-xs">분석 차량</p>
                <p className="font-black text-lg">{selectedCar.brand} {selectedCar.model}</p>
                <p className="text-gray-400 text-sm">{selectedCar.trim || ''} · {selectedCar.year}년식</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-xs">산출 렌트가 (VAT 포함)</p>
                <p className="text-2xl font-black text-yellow-400">{f(calc.rentWithVAT)}원<span className="text-sm text-gray-400">/월</span></p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold mt-1 inline-block
                  ${contractType === 'return' ? 'bg-steel-600/30 text-steel-300' : 'bg-amber-500/30 text-amber-300'}`}>
                  {contractType === 'return' ? '반납형' : '인수형'} · {termMonths}개월
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 고객 선택 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-700 text-sm">고객 정보</h3>
            <div className="flex gap-1.5">
              <button onClick={() => setCustomerMode('select')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors
                  ${customerMode === 'select' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                등록 고객
              </button>
              <button onClick={() => setCustomerMode('manual')}
                className={`px-3 py-1 text-xs rounded-lg font-bold transition-colors
                  ${customerMode === 'manual' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                직접 입력
              </button>
            </div>
          </div>

          {customerMode === 'select' ? (
            <>
              <select className="w-full p-3 border border-gray-200 rounded-xl font-bold text-base focus:border-steel-500 outline-none mb-3"
                value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
                <option value="">고객을 선택하세요</option>
                {customers.map((cust: any) => (
                  <option key={cust.id} value={cust.id}>{cust.name} ({cust.type}) - {cust.phone}</option>
                ))}
              </select>
              {quoteSelectedCustomer && (
                <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-400">이름</span><span className="font-bold">{quoteSelectedCustomer.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">연락처</span><span className="font-bold">{quoteSelectedCustomer.phone}</span></div>
                  {quoteSelectedCustomer.email && <div className="flex justify-between"><span className="text-gray-400">이메일</span><span className="font-bold">{quoteSelectedCustomer.email}</span></div>}
                  {quoteSelectedCustomer.business_number && <div className="flex justify-between"><span className="text-gray-400">사업자번호</span><span className="font-bold">{quoteSelectedCustomer.business_number}</span></div>}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">고객 등록 전에도 견적서를 작성할 수 있습니다.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">고객명 *</label>
                  <input type="text" placeholder="홍길동 / (주)ABC" value={manualCustomer.name}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">연락처</label>
                  <input type="tel" placeholder="010-0000-0000" value={manualCustomer.phone}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">이메일</label>
                  <input type="email" placeholder="email@example.com" value={manualCustomer.email}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">사업자번호</label>
                  <input type="text" placeholder="000-00-00000" value={manualCustomer.business_number}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, business_number: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 outline-none" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 계약 시작일 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">계약 기간</h3>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">시작일</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 font-bold text-sm focus:border-steel-500 outline-none" />
            </div>
            <span className="text-gray-300 mt-5">&rarr;</span>
            <div>
              <label className="text-xs text-gray-400 block mb-1">종료일 (자동)</label>
              <div className="border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 font-bold text-sm text-gray-600">{fDate(quoteEndDate)}</div>
            </div>
            <div className="mt-5 text-sm text-gray-500 font-bold">{termMonths}개월</div>
          </div>
        </div>

        {/* 비고 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h3 className="font-bold text-gray-700 text-sm mb-3">비고 (선택)</h3>
          <textarea placeholder="견적서에 표시할 특이사항, 프로모션 안내 등..." value={quoteNote}
            onChange={(e) => setQuoteNote(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-3 text-sm h-20 resize-none focus:border-steel-500 outline-none" />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button onClick={() => setWizardStep('analysis')}
            className="flex-1 py-3 text-center border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50">
            &larr; 원가분석으로
          </button>
          <button
            onClick={() => {
              if (customerMode === 'select' && !selectedCustomerId) return alert('고객을 선택해주세요.')
              if (customerMode === 'manual' && !manualCustomer.name.trim()) return alert('고객명을 입력해주세요.')
              setWizardStep('preview')
            }}
            className="flex-[2] py-3 bg-steel-900 text-white rounded-xl font-black hover:bg-steel-800 transition-colors">
            견적서 미리보기 &rarr;
          </button>
        </div>
      </div>
    )
  }

  // ============================================
  // Step 3: 견적서 미리보기 + 저장
  // ============================================
  if (wizardStep === 'preview' && calculations && selectedCar) {
    const calc = calculations
    const car = selectedCar
    const rentVAT = Math.round(calc.suggestedRent * 0.1 / 1000) * 1000  // 천원단위 반올림

    return (
      <div className="min-h-screen bg-gray-100 py-6 px-4 quote-print-wrapper">
        {/* 스텝 인디케이터 */}
        <div className="max-w-[800px] mx-auto flex items-center gap-2 mb-4 print:hidden">
          {[
            { key: 'analysis', label: '1. 원가분석', done: true },
            { key: 'customer', label: '2. 고객정보', done: true },
            { key: 'preview', label: '3. 견적서', done: false },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-300" />}
              <div className={`px-3 py-1.5 rounded-full text-xs font-bold
                ${s.key === 'preview' ? 'bg-steel-600 text-white' : 'bg-green-100 text-green-700'}`}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* 상단 액션 바 */}
        <div className="max-w-[800px] mx-auto mb-4 flex justify-between items-center print:hidden">
          <button onClick={() => setWizardStep('customer')} className="text-sm text-gray-500 hover:text-gray-700 font-bold">
            &larr; 고객정보로 돌아가기
          </button>
          <div className="flex gap-2">
            <button onClick={() => window.print()}
              className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-white">인쇄</button>
            <button onClick={() => handleSaveQuote('draft')} disabled={quoteSaving}
              className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-white disabled:opacity-50">
              {quoteSaving ? '저장중...' : '임시저장'}</button>
            <button onClick={() => handleSaveQuote('active')} disabled={quoteSaving}
              className="px-5 py-2 bg-steel-900 text-white rounded-xl text-sm font-black hover:bg-steel-800 disabled:opacity-50">
              {quoteSaving ? '저장중...' : '견적서 확정'}</button>
          </div>
        </div>

        {/* 견적서 본문 */}
        <div ref={printRef} className="max-w-[800px] mx-auto bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none quote-print-area">

          {/* ========== PAGE 1: 핵심 정보 ========== */}
          <div className="quote-page-1">
            {/* 헤더 */}
            <div className="bg-steel-900 text-white px-6 py-4 print:px-5 print:py-3 quote-header-bg">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-black tracking-tight print:text-xl">장기렌트 견적서</h1>
                  <p className="text-gray-400 text-xs mt-0.5">LONG-TERM RENTAL QUOTATION</p>
                </div>
                <div className="text-right text-sm">
                  <span className="text-gray-400 text-xs">견적일 </span>
                  <span className="font-bold">{fDate(new Date().toISOString())}</span>
                  <span className="text-gray-500 mx-2">|</span>
                  <span className="text-yellow-400 text-xs font-bold">유효기간 30일</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-3 print:px-5 print:py-3 print:space-y-2">
              {/* 1. 임대인 / 임차인 — 컴팩트 2컬럼 */}
              <div className="grid grid-cols-2 gap-4 quote-section">
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">임대인</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                    <p className="font-black text-sm">{quoteCompany?.name || company?.name || '당사'}</p>
                    {(quoteCompany?.business_number || company?.business_number) && <p className="text-gray-500">사업자번호: {quoteCompany?.business_number || company?.business_number}</p>}
                    {(quoteCompany?.address || company?.address) && <p className="text-gray-500">{quoteCompany?.address || company?.address}</p>}
                    {(quoteCompany?.phone || company?.phone) && <p className="text-gray-500">TEL: {quoteCompany?.phone || company?.phone}</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">임차인</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-0.5">
                    <p className="font-black text-sm">{quoteSelectedCustomer?.name || '-'}</p>
                    {quoteSelectedCustomer?.business_number && <p className="text-gray-500">사업자번호: {quoteSelectedCustomer.business_number}</p>}
                    {quoteSelectedCustomer?.phone && <p className="text-gray-500">연락처: {quoteSelectedCustomer.phone}</p>}
                    {quoteSelectedCustomer?.email && <p className="text-gray-500">{quoteSelectedCustomer.email}</p>}
                  </div>
                </div>
              </div>

              {/* 2. 차량 정보 — 컴팩트 */}
              <div className="quote-section">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">차량 정보</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-24">차종</td>
                        <td className="px-3 py-1.5 font-black">{car.brand} {car.model}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-24">트림</td>
                        <td className="px-3 py-1.5 font-bold">{car.trim || '-'}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">연식</td>
                        <td className="px-3 py-1.5">{car.year}년</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">연료</td>
                        <td className="px-3 py-1.5">{car.fuel || '-'}</td>
                      </tr>
                      <tr>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">차량가격</td>
                        <td className="px-3 py-1.5 font-bold">{f(factoryPrice)}원</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">차량번호</td>
                        <td className="px-3 py-1.5">{car.number || '(출고 전)'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. 계약 조건 — 컴팩트 */}
              <div className="quote-section">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">계약 조건</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-24">계약유형</td>
                        <td className="px-3 py-1.5 font-black">{contractType === 'buyout' ? '인수형 장기렌트' : '반납형 장기렌트'}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-24">계약기간</td>
                        <td className="px-3 py-1.5 font-bold">{termMonths}개월</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">시작일</td>
                        <td className="px-3 py-1.5">{fDate(startDate)}</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">종료일</td>
                        <td className="px-3 py-1.5">{fDate(quoteEndDate)}</td>
                      </tr>
                      <tr>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">약정주행</td>
                        <td className="px-3 py-1.5">연 {f(annualMileage * 10000)}km (총 {f(quoteTotalMileage)}km)</td>
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">정비상품</td>
                        <td className="px-3 py-1.5">{MAINT_PACKAGE_LABELS[maintPackage] || maintPackage}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. 월 렌탈료 — 핵심 강조 */}
              <div className="border-2 border-steel-900 rounded-lg overflow-hidden quote-rental-highlight">
                <div className="bg-steel-900 text-white px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-gray-400">월 렌탈료 (VAT 포함)</p>
                    <p className="text-2xl font-black tracking-tight">{f(calc.rentWithVAT)}<span className="text-sm ml-0.5">원</span></p>
                  </div>
                  <div className="text-right text-[10px] text-gray-400 space-y-0.5">
                    <p>공급가 {f(calc.suggestedRent)}원</p>
                    <p>부가세 {f(rentVAT)}원</p>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-b-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    {deposit > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-28">보증금</td>
                        <td className="px-3 py-1.5 font-bold text-gray-800">{f(deposit)}원 <span className="text-[10px] text-gray-400">(계약 시 1회)</span></td>
                      </tr>
                    )}
                    {prepayment > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">선납금</td>
                        <td className="px-3 py-1.5 font-bold text-gray-800">{f(prepayment)}원 <span className="text-[10px] text-gray-400">(계약 시 1회)</span></td>
                      </tr>
                    )}
                    {contractType === 'buyout' && (
                      <tr className="border-b border-gray-100 bg-amber-50">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600">인수가격 (만기)</td>
                        <td className="px-3 py-1.5 font-black text-amber-700">{f(calc.buyoutPrice)}원</td>
                      </tr>
                    )}
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">약정주행</td>
                      <td className="px-3 py-1.5">연 {f(annualMileage * 10000)}km · 초과 시 <span className="font-bold text-red-500">km당 {f(quoteExcessRate)}원</span></td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">자차 면책금</td>
                      <td className="px-3 py-1.5">사고 시 <span className="font-bold">{f(deductible)}원</span>{deductible === 0 && <span className="text-green-500 text-xs ml-1 font-bold">완전면책</span>}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="px-3 py-1.5 text-[10px] text-gray-400">
                        렌탈료 포함: 자동차보험(종합) · 자동차세 · 취득세 · 등록비{maintPackage !== 'self' ? ` · ${MAINT_PACKAGE_LABELS[maintPackage] || '정비'}` : ''}
                      </td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 4-1. 보험 보장항목 상세 */}
              <div className="quote-section">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">자동차보험 보장내역</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td className="px-3 py-1 font-bold text-gray-500 w-36">보장항목</td>
                      <td className="px-3 py-1 font-bold text-gray-500">보장내용</td>
                    </tr>
                    {(termsConfig?.insurance_coverage || DEFAULT_INSURANCE_COVERAGE).map((item: any, idx: number) => (
                      <tr key={idx} className={idx < (termsConfig?.insurance_coverage || DEFAULT_INSURANCE_COVERAGE).length - 1 ? 'border-b border-gray-100' : ''}>
                        <td className="px-3 py-1.5 font-bold text-gray-700">{item.label}</td>
                        <td className="px-3 py-1.5 text-gray-600">
                          {item.description
                            .replace(/\{deductible\}/g, f(deductible))
                          }
                          {item.description.includes('{deductible}') && deductible === 0 && (
                            <span className="text-green-600 font-bold ml-1">(완전면책)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
                <p className="text-[8px] text-gray-400 mt-1">※ {termsConfig?.calc_params?.insurance_note || '렌터카 공제조합 가입 · 보험기간: 계약기간 동안 연단위 자동갱신 · 보험료 렌탈료 포함'}</p>
              </div>

              {/* (주요 약정 → 렌탈료 카드로 통합됨) */}
            </div>
          </div>

          {/* ========== PAGE 2: 상세 안내 + 서명 ========== */}
          <div className="quote-page-2 print:flex print:flex-col" style={{ minHeight: 'auto' }}>
            {/* 상단 콘텐츠 */}
            <div className="px-6 py-4 space-y-3 print:px-5 print:py-3 print:space-y-2 print:flex-1">

              {/* 6. 상세 약정 조건 */}
              <div className="quote-section">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">상세 약정 조건</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-28">약정 주행거리</td>
                      <td className="px-3 py-1.5">연간 {f(annualMileage * 10000)}km (계약기간 총 {f(quoteTotalMileage)}km)</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">초과주행 요금</td>
                      <td className="px-3 py-1.5"><span className="font-bold text-red-500">km당 {f(quoteExcessRate)}원</span><span className="text-gray-400 text-[10px] ml-1">(계약 종료 시점 정산)</span></td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">자차 면책금</td>
                      <td className="px-3 py-1.5">사고 시 자기부담금 <span className="font-bold">{f(deductible)}원</span>{deductible === 0 && <span className="text-green-500 text-[10px] ml-1 font-bold">완전면책</span>}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">중도해지</td>
                      <td className="px-3 py-1.5">
                        {(() => {
                          // 기간별 차등 위약금율 (약관 DB)
                          const periodRates = termsConfig?.calc_params?.early_termination_rates_by_period
                          if (periodRates && Array.isArray(periodRates)) {
                            const matched = periodRates.find((r: any) => termMonths >= r.months_from && termMonths <= r.months_to)
                            const rate = matched?.rate || termsConfig?.calc_params?.early_termination_rate || 35
                            return <>잔여 렌탈료의 <span className="font-bold text-red-500">{rate}%</span> 위약금 발생</>
                          }
                          return <>잔여 렌탈료의 <span className="font-bold text-red-500">{termsConfig?.calc_params?.early_termination_rate || 35}%</span> 위약금 발생</>
                        })()}
                      </td>
                    </tr>
                    <tr>
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">반납 조건</td>
                      <td className="px-3 py-1.5 text-gray-600">{contractType === 'buyout' ? '만기 시 인수 또는 반납 선택 가능' : '만기 시 차량 반납 (차량 상태 평가 후 보증금 정산)'}</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 6-1. 렌탈료 포함 서비스 안내 */}
              <div className="quote-section">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">렌탈료 포함 서비스</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-gray-100">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700 w-28">자동차보험</td>
                      <td className="px-3 py-1 text-blue-600">종합 (대인II·대물1억·자손·무보험차·자차)</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">세금</td>
                      <td className="px-3 py-1 text-blue-600">자동차세·취득세 렌탈료 포함</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">등록비용</td>
                      <td className="px-3 py-1 text-blue-600">번호판·인지세·공채·등록대행</td>
                    </tr>
                    <tr>
                      <td className="bg-blue-50 px-3 py-1 font-bold text-blue-700">{maintPackage !== 'self' ? MAINT_PACKAGE_LABELS[maintPackage] || '정비' : '정기검사'}</td>
                      <td className="px-3 py-1 text-blue-600">{maintPackage !== 'self' ? (MAINT_PACKAGE_DESC[maintPackage] || '정비 포함') : '자동차 정기검사(종합검사) 포함'}</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 7. 인수 안내 (인수형만) */}
              {contractType === 'buyout' && (
                <div className="quote-section">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">인수 안내</p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs"><tbody>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600 w-28">인수가격</td>
                        <td className="px-3 py-1.5 font-black text-amber-700 text-sm">{f(calc.buyoutPrice)}원 <span className="text-[10px] font-normal text-gray-400">(VAT 별도)</span></td>
                      </tr>
                      <tr className="border-b border-amber-100">
                        <td className="bg-amber-50 px-3 py-1.5 font-bold text-amber-600">추가 비용</td>
                        <td className="px-3 py-1.5 text-gray-700">취득세 + 이전등록비 별도 (임차인 부담)</td>
                      </tr>
                      <tr>
                        <td colSpan={2} className="px-3 py-1 text-[10px] text-amber-600 bg-amber-50/50">
                          * 만기 시 상기 가격으로 소유권 이전 가능 · 인수 미희망 시 반납 가능
                        </td>
                      </tr>
                    </tbody></table>
                  </div>
                </div>
              )}

              {/* 8. 비고 */}
              {quoteNote && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-yellow-700 mb-0.5">비고</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{quoteNote}</p>
                </div>
              )}

              {/* 9. 유의사항 */}
              <div className="border-t border-gray-200 pt-3 quote-section">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">유의사항 및 특약</p>
                <div className="text-[10px] text-gray-500 space-y-1 quote-notices">
                  {(termsConfig?.quote_notices || DEFAULT_QUOTE_NOTICES).map((item: any, idx: number) => {
                    // Handle conditional items (e.g., show only for buyout)
                    if (item.condition === 'buyout' && contractType !== 'buyout') {
                      return null
                    }

                    // Replace placeholders with actual values
                    let text = item.text || item
                    if (typeof text === 'string') {
                      text = text
                        .replace(/\{deductible\}/g, f(deductible))
                        .replace(/\{excessRate\}/g, f(quoteExcessRate))
                        .replace(/\{earlyTerminationRate\}/g, (termsConfig?.calc_params?.early_termination_rate || 35).toString())
                    }

                    return <p key={idx}>{idx + 1}. {text}</p>
                  })}
                </div>
              </div>
            </div>


            {/* 서명란 + 푸터 — 마지막 페이지 하단 고정 */}
            <div className="print:mt-auto">
              <div className="px-6 print:px-5">
                <div className="grid grid-cols-2 gap-8 pt-6 pb-4 quote-signature">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 mb-10">임대인 (서명/인)</p>
                    <div className="border-t border-gray-300 pt-2">
                      <p className="text-xs font-bold text-gray-700">{quoteCompany?.name || company?.name || '당사'}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 mb-10">임차인 (서명/인)</p>
                    <div className="border-t border-gray-300 pt-2">
                      <p className="text-xs font-bold text-gray-700">{quoteSelectedCustomer?.name || '고객명'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-2 border-t border-gray-200 text-center">
                <p className="text-[9px] text-gray-400">
                  본 견적서는 {quoteCompany?.name || company?.name || '당사'}에서 발행한 공식 견적서입니다. 문의: {quoteCompany?.phone || company?.phone || '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="max-w-[800px] mx-auto mt-4 flex gap-3 print:hidden">
          <button onClick={() => setWizardStep('customer')}
            className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-white">&larr; 수정</button>
          <button onClick={() => window.print()}
            className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-white">인쇄 / PDF</button>
          <button onClick={() => handleSaveQuote('draft')} disabled={quoteSaving}
            className="flex-1 py-3 bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 disabled:opacity-50">임시저장</button>
          <button onClick={() => handleSaveQuote('active')} disabled={quoteSaving}
            className="flex-[2] py-3 bg-steel-900 text-white rounded-xl font-black hover:bg-steel-800 disabled:opacity-50">
            {quoteSaving ? '저장 중...' : '견적서 확정'}</button>
        </div>
      </div>
    )
  }

  // ============================================
  // Step 1: 원가분석 (기존 UI)
  // ============================================
  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">

      {/* ===== 헤더 ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">🧮 장기렌터카 견적</h1>
          <p className="text-gray-500 text-sm mt-1">렌트가 산출 및 견적서 생성</p>
        </div>
        <div className="flex gap-2">
          <Link href="/quotes" className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50">
            목록으로
          </Link>
          {selectedCar && calculations && (
            <button onClick={handleSaveWorksheet} disabled={saving}
              className="px-4 py-2 text-sm bg-steel-600 text-white rounded-xl font-bold hover:bg-steel-700 disabled:opacity-50">
              {saving ? '저장 중...' : '워크시트 저장'}
            </button>
          )}
        </div>
      </div>


      {/* ===== 가격표 드래그앤드롭 업로드 영역 ===== */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDropFile}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center mb-6 transition-all duration-300 ${
          isParsingQuote
            ? 'border-amber-400 bg-amber-50'
            : isDragging
              ? 'border-steel-500 bg-steel-50 scale-[1.01]'
              : 'border-gray-300 bg-white hover:border-steel-300'
        }`}
      >
        <input
          ref={dropFileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleQuoteUpload}
          disabled={isParsingQuote}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        {isParsingQuote ? (
          <div className="pointer-events-none">
            <span className="inline-block w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-amber-700 font-bold text-sm">{parseStage || '분석 중...'}</p>
            {parseElapsed > 0 && <p className="text-xs text-amber-500 mt-1">{parseElapsed}초 경과</p>}
            {parseElapsed >= 15 && <p className="text-xs text-gray-400 mt-1">복잡한 가격표는 시간이 더 소요될 수 있습니다</p>}
          </div>
        ) : (
          <div className="pointer-events-none">
            <span className="text-4xl mb-2 block">📄</span>
            <p className="text-gray-600 font-bold text-sm">가격표를 여기에 놓거나 클릭하세요</p>
            <p className="text-xs text-gray-400 mt-2">PDF · 이미지(JPG, PNG) → AI 자동 분석 후 저장 목록에 추가</p>
          </div>
        )}
      </div>

      {/* ===== 저장 목록 (워크시트 + 가격표 통합, Collapsible) ===== */}
      {(savedWorksheets.length > 0 || savedCarPrices.length > 0) && (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setSavedPricesOpen(!savedPricesOpen)}
          className="w-full px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            <span className="font-black text-gray-800 text-sm shrink-0">📋 저장 목록</span>
            <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">
              {savedWorksheets.length + savedCarPrices.length}
            </span>
          </div>
          <span className={`text-gray-400 transition-transform shrink-0 ${savedPricesOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {/* 접힌 상태: 브랜드별 모델 요약 */}
        {!savedPricesOpen && (
          <div className="px-6 py-3 bg-gray-50/50">
            {(() => {
              const grouped: Record<string, string[]> = {}
              savedWorksheets.forEach((ws: any) => {
                const brand = ws.cars?.brand || ws.newcar_info?.brand || '기타'
                const model = ws.cars?.model || ws.newcar_info?.model || ''
                if (!grouped[brand]) grouped[brand] = []
                if (model && !grouped[brand].includes(model)) grouped[brand].push(model)
              })
              savedCarPrices.forEach((sp: any) => {
                const brand = sp.brand || '기타'
                if (!grouped[brand]) grouped[brand] = []
                if (!grouped[brand].includes(sp.model)) grouped[brand].push(sp.model)
              })
              return (
                <div className="space-y-1.5">
                  {Object.entries(grouped).map(([brand, models]) => (
                    <div key={brand} className="flex items-center gap-2">
                      <span className="text-xs font-black text-gray-700 w-14 shrink-0">{brand}</span>
                      <div className="flex flex-wrap gap-1">
                        {models.map(m => (
                          <span key={m} className="text-[11px] font-bold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-lg">{m}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {/* Body */}
        {savedPricesOpen && (
        <div className="p-6 space-y-6">

          {/* ── 산출 워크시트 (브랜드별 그룹) ── */}
          {savedWorksheets.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-black text-steel-600">🧮 산출 워크시트</span>
              <span className="bg-steel-100 text-steel-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{savedWorksheets.length}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            {(() => {
              const grouped: Record<string, any[]> = {}
              savedWorksheets.forEach((ws: any) => {
                const brand = ws.cars?.brand || ws.newcar_info?.brand || '기타'
                if (!grouped[brand]) grouped[brand] = []
                grouped[brand].push(ws)
              })
              return Object.entries(grouped).map(([brand, items]) => (
                <div key={`ws-${brand}`} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-[11px] font-black text-gray-500">{brand}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[10px] text-gray-400">{items.length}건</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map((ws: any) => {
                      const car = ws.cars
                      const ncInfo = ws.newcar_info
                      const model = car?.model || ncInfo?.model || '미지정'
                      const number = car?.number || ''
                      const year = car?.year || ncInfo?.year || ''
                      const trim = car?.trim || ncInfo?.trim || ''
                      const rent = ws.suggested_rent ? Math.round(ws.suggested_rent).toLocaleString() : null
                      const isUsed = car?.is_used
                      return (
                        <div
                          key={`ws-${ws.id}`}
                          onClick={() => {
                            // 워크시트 로드: car_id가 있으면 등록차량 선택, 아니면 신차정보 표시
                            if (car?.id) {
                              handleCarSelect(String(car.id))
                            }
                            // 워크시트 ID 기억하고 페이지 이동
                            router.push(`/quotes/pricing?worksheet_id=${ws.id}&car_id=${car?.id || ''}`)
                          }}
                          className="flex items-center gap-3 px-4 py-3 border border-gray-150 rounded-xl group cursor-pointer hover:border-steel-400 hover:shadow-sm transition-all bg-white"
                        >
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-steel-50 border border-steel-200">
                            <span className="text-steel-600 text-sm">🧮</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-800 text-sm truncate">{model}</span>
                              {trim && <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{trim}</span>}
                              {number && <span className="text-[10px] font-bold text-steel-600">[{number}]</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {year && <span className="text-[10px] text-gray-400">{year}년</span>}
                              {isUsed !== undefined && (
                                <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${isUsed ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                                  {isUsed ? '중고' : '신차'}
                                </span>
                              )}
                              {rent && <span className="text-[10px] font-bold text-emerald-600">렌트가 {rent}원</span>}
                              <span className="text-[10px] text-gray-300">
                                {new Date(ws.updated_at || ws.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                          <span className="text-gray-300 text-sm shrink-0">→</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>
          )}

          {/* ── 신차 가격표 (브랜드별 그룹) ── */}
          {savedCarPrices.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-black text-indigo-600">🚘 신차 가격표</span>
              <span className="bg-indigo-100 text-indigo-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{savedCarPrices.length}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            {(() => {
              const grouped: Record<string, any[]> = {}
              savedCarPrices.forEach((sp: any) => {
                const brand = sp.brand || '기타'
                if (!grouped[brand]) grouped[brand] = []
                grouped[brand].push(sp)
              })
              return Object.entries(grouped).map(([brand, items]) => (
                <div key={`sp-${brand}`} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-[11px] font-black text-gray-500">{brand}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[10px] text-gray-400">{items.length}개 모델</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map((sp: any) => {
                      const isSelected = newCarResult && newCarResult.brand === sp.brand && (
                        newCarResult.model === sp.model ||
                        (newCarResult.model_detail || newCarResult.model) === sp.model ||
                        sp.model?.startsWith(newCarResult.model)
                      )
                      return (
                        <div key={`sp-${sp.id}`}
                          className={`flex items-center gap-3 px-4 py-3 border rounded-xl group cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-400 shadow-sm'
                              : 'bg-white border-gray-150 hover:border-indigo-400 hover:shadow-sm'
                          }`}
                          onClick={() => handleLoadSavedPrice(sp)}
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-indigo-100 border border-indigo-300' : 'bg-indigo-50 border border-indigo-200'
                          }`}>
                            <span className="text-indigo-600 text-sm">🚘</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-800 text-sm truncate">{sp.model}</span>
                              <span className="text-[10px] text-gray-400">{sp.year}년</span>
                              <span className="text-[9px] bg-steel-50 text-steel-600 px-1 py-0.5 rounded font-bold shrink-0">{sp.price_data?.variants?.length || 0}차종</span>
                              {sp.source?.includes('견적서') ? (
                                <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1 py-0.5 rounded font-bold shrink-0">견적서</span>
                              ) : (
                                <span className="text-[9px] bg-violet-50 text-violet-600 px-1 py-0.5 rounded font-bold shrink-0">AI</span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400 mt-0.5 block">
                              {new Date(sp.updated_at || sp.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} 저장
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isSelected && <span className="text-[10px] text-indigo-600 font-bold">선택됨</span>}
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteSavedPrice(sp.id) }}
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1 text-xs">✕</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>
          )}

        </div>
        )}
      </div>
      )}

      {/* ===== 등록차량 선택 (보험/가입 페이지 디자인 기준) ===== */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2d5fa8' }} />
          <h3 style={{ fontWeight: 900, color: '#1f2937', fontSize: 14, margin: 0 }}>🚗 등록차량 선택</h3>
        </div>

        {/* 선택된 차량 표시 */}
        {selectedCar && (
          <div style={{ margin: '16px 24px', padding: 16, background: '#eff6ff', border: '2px solid #60a5fa', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, color: '#1e3a5f', fontSize: 18 }}>{selectedCar.brand} {selectedCar.model}</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{selectedCar.trim || ''}</span>
              {selectedCar.number && <span style={{ fontSize: 13, fontWeight: 700, color: '#2d5fa8' }}>[{selectedCar.number}]</span>}
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{selectedCar.year}년식</span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: selectedCar.is_used ? '#fff7ed' : '#eff6ff', color: selectedCar.is_used ? '#c2410c' : '#1d4ed8' }}>
                {selectedCar.is_used ? '중고' : '신차'}
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 800, background: selectedCar.is_commercial === false ? '#f0fdfa' : '#f1f5f9', color: selectedCar.is_commercial === false ? '#0f766e' : '#475569' }}>
                {selectedCar.is_commercial === false ? '비영업' : '영업'}
              </span>
              {selectedCar.is_used && selectedCar.purchase_mileage ? (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>구입시 {(selectedCar.purchase_mileage / 10000).toFixed(1)}만km</span>
              ) : null}
            </div>
            <button onClick={() => { setSelectedCar(null); setCarSearchQuery('') }}
              style={{ fontSize: 13, color: '#9ca3af', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>변경</button>
          </div>
        )}

        {/* 차량 미선택 시: KPI + 필터 + 테이블 */}
        {!selectedCar && (
          <div style={{ padding: '16px 24px 24px' }}>
            {/* KPI 카드 */}
            {cars.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 100px', background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, margin: 0 }}>전체 차량</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '4px 0 0' }}>{cars.length}<span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 2 }}>대</span></p>
                </div>
                <div style={{ flex: '1 1 100px', background: '#f0fdf4', padding: '12px 16px', borderRadius: 12, border: '1px solid #dcfce7' }}>
                  <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, margin: 0 }}>대기</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#15803d', margin: '4px 0 0' }}>{cars.filter(c => c.status === 'available' || !c.status).length}<span style={{ fontSize: 12, color: '#86efac', marginLeft: 2 }}>대</span></p>
                </div>
                <div style={{ flex: '1 1 100px', background: '#eff6ff', padding: '12px 16px', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                  <p style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, margin: 0 }}>렌트중</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', margin: '4px 0 0' }}>{cars.filter(c => c.status === 'rented').length}<span style={{ fontSize: 12, color: '#93c5fd', marginLeft: 2 }}>대</span></p>
                </div>
              </div>
            )}

            {/* 검색 바 */}
            <input
              type="text"
              placeholder="차량번호, 브랜드, 모델명으로 검색..."
              value={carSearchQuery}
              onChange={(e) => setCarSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, fontWeight: 600, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            />

            {/* 차량 테이블 */}
            <div style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>차량번호</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>브랜드/모델</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>트림</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>연식</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>구분</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>출고가</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>매입가</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {cars
                    .filter(car => {
                      if (!carSearchQuery.trim()) return true
                      const q = carSearchQuery.toLowerCase()
                      return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
                    })
                    .map(car => (
                      <tr
                        key={String(car.id)}
                        onClick={() => { handleCarSelect(String(car.id)); setCarSearchQuery('') }}
                        style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 900, fontSize: 15, color: '#111827', whiteSpace: 'nowrap', letterSpacing: 1 }}>{car.number || '-'}</td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 800, color: '#2d5fa8' }}>{car.brand}</span>
                          <span style={{ marginLeft: 4, fontWeight: 600, color: '#374151' }}>{car.model}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12 }}>{car.trim || '-'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280', fontFamily: 'monospace' }}>{car.year}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, marginRight: 2, background: car.is_used ? '#fff7ed' : '#eff6ff', color: car.is_used ? '#ea580c' : '#2563eb' }}>
                            {car.is_used ? '중고' : '신차'}
                          </span>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, background: car.is_commercial === false ? '#f0fdfa' : '#f1f5f9', color: car.is_commercial === false ? '#0d9488' : '#64748b' }}>
                            {car.is_commercial === false ? '비영업' : '영업'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {car.factory_price ? `${Math.round(car.factory_price / 10000).toLocaleString()}만` : '-'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#2d5fa8', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {car.purchase_price ? `${Math.round(car.purchase_price / 10000).toLocaleString()}만` : '-'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {car.status === 'rented'
                            ? <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#fef3c7', color: '#d97706' }}>렌트중</span>
                            : <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, background: '#dcfce7', color: '#16a34a' }}>대기</span>
                          }
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              {cars.filter(car => {
                if (!carSearchQuery.trim()) return true
                const q = carSearchQuery.toLowerCase()
                return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
              }).length === 0 && (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '48px 0', fontSize: 13 }}>
                  {carSearchQuery ? '검색 결과가 없습니다' : '등록된 차량이 없습니다'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

        {/* ====== 공통 계층형 선택 UI: 개별소비세 → 유종 → 차종 그룹 → 트림 → 컬러 → 옵션 ====== */}
        {/* 저장목록에서 차량 데이터 선택 시 표시 */}
        {(lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult && newCarResult.variants?.length > 0 && (() => {
          // 개별소비세 그룹 추출 (중복 제거)
          const taxTypes = [...new Set(
            newCarResult.variants
              .map(v => v.consumption_tax || '')
              .filter(t => t !== '')
          )]
          const hasTaxGroups = taxTypes.length > 1

          // 개별소비세 필터링
          const taxFilteredVariants = hasTaxGroups && newCarSelectedTax
            ? newCarResult.variants.filter(v => v.consumption_tax === newCarSelectedTax)
            : newCarResult.variants

          // 유종 리스트 추출 (개별소비세 필터 적용 후, 중복 제거)
          const fuelTypes = [...new Set(taxFilteredVariants.map(v => v.fuel_type))]
          // 유종 필터링된 차종 그룹
          const filteredVariants = newCarSelectedFuel
            ? taxFilteredVariants.filter(v => v.fuel_type === newCarSelectedFuel)
            : taxFilteredVariants

          // 단계 번호 계산 (개별소비세 있으면 +1)
          const stepOffset = hasTaxGroups ? 1 : 0
          const stepIcons = ['①', '②', '③', '④', '⑤', '⑥']

          return (
          <div className="mt-4 p-5 bg-white border border-steel-200 rounded-2xl shadow-sm space-y-4">
            {/* 모델 헤더 + 저장 버튼 */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-gray-700">
                {newCarResult.brand} {newCarResult.model} — {newCarResult.year}년식
              </span>
              <span className="text-xs px-2 py-0.5 bg-steel-100 text-steel-700 rounded-full font-bold">
                차종 {newCarResult.variants.length}개
              </span>
              {newCarResult.source?.includes('견적서') && (
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                  📄 견적서 추출
                </span>
              )}
              {lookupMode === 'saved' && (
                <button
                  onClick={() => { setNewCarResult(null); setSelectedCar(null) }}
                  className="ml-auto text-xs px-3 py-1 bg-gray-100 text-gray-500 border border-gray-200 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                >
                  ✕ 선택 해제
                </button>
              )}
              {lookupMode === 'newcar' && (
                <button
                  onClick={handleSaveCarPrice}
                  disabled={isSavingPrice}
                  className="ml-auto text-xs px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                  {isSavingPrice ? '저장 중...' : '💾 가격 저장'}
                </button>
              )}
            </div>

            {/* ── STEP 0 (조건부): 개별소비세 선택 ── */}
            {hasTaxGroups && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">① 개별소비세 선택</label>
                <div className="flex flex-wrap gap-2">
                  {taxTypes.map(tax => (
                    <button
                      key={tax}
                      onClick={() => {
                        setNewCarSelectedTax(tax)
                        setNewCarSelectedFuel('')
                        setNewCarSelectedVariant(null)
                        setNewCarSelectedTrim(null)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                        // 해당 세율의 유종이 1개뿐이면 자동 선택
                        const matchedFuels = [...new Set(
                          newCarResult.variants
                            .filter(v => v.consumption_tax === tax)
                            .map(v => v.fuel_type)
                        )]
                        if (matchedFuels.length === 1) {
                          setNewCarSelectedFuel(matchedFuels[0])
                          const matched = newCarResult.variants.filter(v => v.consumption_tax === tax && v.fuel_type === matchedFuels[0])
                          if (matched.length === 1) setNewCarSelectedVariant(matched[0])
                        }
                      }}
                      className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                        newCarSelectedTax === tax
                          ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-md'
                          : 'border-gray-200 hover:border-amber-300 bg-white text-gray-700'
                      }`}
                    >
                      <span>🏷️ {tax}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 유종(연료) 선택 ── */}
            {(!hasTaxGroups || newCarSelectedTax) && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2">{stepIcons[stepOffset]} 유종 선택</label>
              <div className="flex flex-wrap gap-2">
                {fuelTypes.map(fuel => {
                  const fuelIcon: Record<string, string> = { '휘발유': '⛽', '경유': '🛢️', 'LPG': '🔵', '전기': '⚡', '하이브리드': '🔋' }
                  return (
                    <button
                      key={fuel}
                      onClick={() => {
                        setNewCarSelectedFuel(fuel)
                        setNewCarSelectedVariant(null)
                        setNewCarSelectedTrim(null)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                        const matched = taxFilteredVariants.filter(v => v.fuel_type === fuel)
                        if (matched.length === 1) setNewCarSelectedVariant(matched[0])
                      }}
                      className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                        newCarSelectedFuel === fuel
                          ? 'border-steel-500 bg-steel-50 text-steel-700 shadow-md'
                          : 'border-gray-200 hover:border-steel-300 bg-white text-gray-700'
                      }`}
                    >
                      <span>{fuelIcon[fuel] || '🚗'} {fuel}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            )}

            {/* ── STEP: 차종 그룹 선택 ── */}
            {newCarSelectedFuel && filteredVariants.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">{stepIcons[1 + stepOffset]} 차종 그룹 선택</label>
                <div className="flex flex-wrap gap-2">
                  {filteredVariants.map((v, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setNewCarSelectedVariant(v)
                        setNewCarSelectedTrim(null)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                      }}
                      className={`px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-bold ${
                        newCarSelectedVariant?.variant_name === v.variant_name
                          ? 'border-steel-500 bg-steel-50 text-steel-700 shadow-md'
                          : 'border-gray-200 hover:border-steel-300 bg-white text-gray-700'
                      }`}
                    >
                      <span>{v.variant_name}</span>
                      <span className="ml-2 text-xs opacity-60">{v.engine_cc > 0 ? `${f(v.engine_cc)}cc` : '전기'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 트림 선택 ── */}
            {newCarSelectedVariant && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">
                  {stepIcons[2 + stepOffset]} 트림 선택 — {newCarSelectedVariant.variant_name}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {newCarSelectedVariant.trims.map((trim, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setNewCarSelectedTrim(trim)
                        setNewCarSelectedOptions([])
                        setNewCarSelectedExterior(null)
                        setNewCarSelectedInterior(null)
                        setNewCarPurchasePrice('')
                        setSelectedCar(null)
                        // 트림 선택 시 출고가/매입가 즉시 반영
                        setFactoryPrice(trim.base_price)
                        setPurchasePrice(trim.base_price)
                      }}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        newCarSelectedTrim?.name === trim.name
                          ? 'border-steel-500 bg-steel-50 shadow-md'
                          : 'border-gray-200 hover:border-steel-300 bg-white'
                      }`}
                    >
                      <p className="font-bold text-gray-800">{trim.name}</p>
                      <p className="text-steel-600 font-bold mt-1">{f(trim.base_price)}원</p>
                      {trim.note && <p className="text-xs text-gray-400 mt-1">{trim.note}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 외장 컬러 선택 ── */}
            {newCarSelectedTrim && (newCarSelectedTrim.exterior_colors?.length ?? 0) > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">{stepIcons[3 + stepOffset]} 외장 컬러</label>
                <div className="flex flex-wrap gap-2">
                  {newCarSelectedTrim.exterior_colors!.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => setNewCarSelectedExterior(
                        newCarSelectedExterior?.name === color.name ? null : color
                      )}
                      className={`px-3 py-2 text-xs rounded-xl border font-bold transition-colors ${
                        newCarSelectedExterior?.name === color.name
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {color.name}
                      {color.code && <span className="ml-1 opacity-60">({color.code})</span>}
                      {color.price > 0 && <span className="ml-1 text-steel-400">+{(color.price).toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP: 내장 컬러 선택 ── */}
            {newCarSelectedTrim && (newCarSelectedTrim.interior_colors?.length ?? 0) > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">{stepIcons[4 + stepOffset]} 내장 컬러</label>
                <div className="flex flex-wrap gap-2">
                  {newCarSelectedTrim.interior_colors!.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => setNewCarSelectedInterior(
                        newCarSelectedInterior?.name === color.name ? null : color
                      )}
                      className={`px-3 py-2 text-xs rounded-xl border font-bold transition-colors ${
                        newCarSelectedInterior?.name === color.name
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {color.name}
                      {color.code && <span className="ml-1 opacity-60">({color.code})</span>}
                      {color.price > 0 && <span className="ml-1 text-steel-400">+{(color.price).toLocaleString()}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {newCarSelectedTrim && (!newCarSelectedTrim.exterior_colors || newCarSelectedTrim.exterior_colors.length === 0) && (!newCarSelectedTrim.interior_colors || newCarSelectedTrim.interior_colors.length === 0) && (
              <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                이 가격표에 컬러 정보가 포함되지 않았습니다. 신차 선택 탭에서 AI 조회하면 컬러가 표시될 수 있습니다.
              </div>
            )}

            {/* ── STEP: 선택 옵션 ── */}
            {newCarSelectedTrim && newCarSelectedTrim.options?.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">
                  {stepIcons[5 + stepOffset]} 선택 옵션/패키지 <span className="text-gray-400 font-normal">(복수 선택 가능)</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {newCarSelectedTrim.options.map((opt, idx) => {
                    const isChecked = newCarSelectedOptions.some(o => o.name === opt.name)
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setNewCarSelectedOptions(prev =>
                            isChecked
                              ? prev.filter(o => o.name !== opt.name)
                              : [...prev, opt]
                          )
                          setNewCarPurchasePrice('')
                          setSelectedCar(null)
                        }}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          isChecked
                            ? 'border-steel-500 bg-steel-50'
                            : 'border-gray-200 hover:border-steel-300 bg-white'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                          isChecked ? 'bg-steel-600 text-white' : 'bg-gray-100 border border-gray-300'
                        }`}>
                          {isChecked && <span className="text-xs">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-800">{opt.name}</p>
                          <p className="text-steel-600 font-bold text-sm">+{f(opt.price)}원</p>
                          {opt.description && <p className="text-xs text-gray-400 mt-0.5">{opt.description}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── 최종 가격 요약 + 매입가 + 분석 시작 ── */}
            {newCarSelectedTrim && (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                {/* 가격 요약 */}
                <div className="mb-3 pb-3 border-b border-gray-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">기본 출고가</span>
                    <span className="font-bold text-gray-700">{f(newCarSelectedTrim.base_price)}원</span>
                  </div>
                  {(newCarSelectedExterior?.price || 0) > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-400">+ 외장 {newCarSelectedExterior!.name}</span>
                      <span className="font-bold text-steel-600">+{f(newCarSelectedExterior!.price)}원</span>
                    </div>
                  )}
                  {(newCarSelectedInterior?.price || 0) > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-400">+ 내장 {newCarSelectedInterior!.name}</span>
                      <span className="font-bold text-steel-600">+{f(newCarSelectedInterior!.price)}원</span>
                    </div>
                  )}
                  {newCarSelectedOptions.length > 0 && (
                    <>
                      {newCarSelectedOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm mt-1">
                          <span className="text-gray-400">+ {opt.name}</span>
                          <span className="font-bold text-steel-600">+{f(opt.price)}원</span>
                        </div>
                      ))}
                    </>
                  )}
                  {(newCarSelectedOptions.length > 0 || (newCarSelectedExterior?.price || 0) > 0 || (newCarSelectedInterior?.price || 0) > 0) && (
                    <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-200">
                      <span className="font-bold text-gray-700">최종 출고가</span>
                      <span className="font-bold text-lg text-gray-900">
                        {f(newCarSelectedTrim.base_price + newCarSelectedOptions.reduce((s, o) => s + o.price, 0) + (newCarSelectedExterior?.price || 0) + (newCarSelectedInterior?.price || 0))}원
                      </span>
                    </div>
                  )}
                </div>

                {/* 매입 할인 입력 + 분석 시작 */}
                {(() => {
                  const colorExtra = (newCarSelectedExterior?.price || 0) + (newCarSelectedInterior?.price || 0)
                  const totalFactory = newCarSelectedTrim.base_price + newCarSelectedOptions.reduce((s, o) => s + o.price, 0) + colorExtra
                  const discountAmt = parseNum(newCarPurchasePrice)
                  const finalPurchase = discountAmt > 0 ? totalFactory - discountAmt : totalFactory
                  return (
                    <>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-bold text-gray-700">예상 매입가</span>
                        <span className="font-black text-lg text-gray-900">{f(finalPurchase)}원</span>
                      </div>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-gray-500 mb-1">
                            할인 금액
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="0"
                              value={newCarPurchasePrice}
                              onChange={(e) => setNewCarPurchasePrice(e.target.value.replace(/[^0-9,]/g, ''))}
                              className="w-full p-3 pr-8 border border-gray-200 rounded-lg font-bold text-base focus:border-steel-400 outline-none"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">원</span>
                          </div>
                          {discountAmt > 0 && (
                            <span className="text-[11px] text-steel-600 font-bold mt-1 block">
                              출고가 대비 {(discountAmt / totalFactory * 100).toFixed(1)}% 할인
                            </span>
                          )}
                        </div>
                        <button
                          onClick={handleNewCarAnalysis}
                          className="px-6 py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          분석 시작
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        * 할인 없으면 비워두세요. 매입가 = 출고가 그대로 적용됩니다.
                      </p>
                    </>
                  )
                })()}
              </div>
            )}

            <p className="text-xs text-gray-400 text-right">
              * AI 자동 조회 결과입니다. 실제 출고가와 차이가 있을 수 있습니다.
            </p>
          </div>
          )
        })()}

        {/* 선택된 차량 요약 */}
        {selectedCar && (
          <div className="mt-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-steel-500" />
                <span className="text-xs font-bold text-gray-600">분석 차량 정보</span>
                {(lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult && (
                  <span className="text-[10px] px-2 py-0.5 bg-steel-100 text-steel-700 rounded-full font-bold ml-auto">✨ 신차 시뮬레이션</span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
                {((lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult ? [
                  { label: '구분', value: '🆕 신차', accent: false },
                  { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}`, accent: true },
                  { label: '트림', value: selectedCar.trim || '-', accent: false },
                  { label: '출고가', value: `${f(selectedCar.factory_price || 0)}원`, accent: true },
                ] : [
                  { label: '차량번호', value: selectedCar.number, accent: true },
                  { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}`, accent: true },
                  { label: '구분', value: `${selectedCar.is_used ? '중고' : '신차'} / ${selectedCar.is_commercial === false ? '비영업' : '영업'}`, accent: false },
                  { label: '연식', value: `${selectedCar.year}년`, accent: false },
                  { label: '주행거리', value: `${f(selectedCar.mileage || 0)}km`, accent: false },
                  ...(selectedCar.is_used && selectedCar.purchase_mileage ? [
                    { label: '구입시 주행', value: `${f(selectedCar.purchase_mileage)}km`, accent: false },
                  ] : []),
                  { label: '매입가', value: `${f(selectedCar.purchase_price)}원`, accent: true },
                ]).map((item: any, i: number) => (
                  <div key={i} className="bg-white px-4 py-3">
                    <span className="text-[10px] text-gray-400 block mb-0.5">{item.label}</span>
                    <span className={`font-bold text-sm ${item.accent ? 'text-gray-900' : 'text-gray-600'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      {!selectedCar ? (
        <div className="text-center py-20 text-gray-400">
          <span className="text-6xl block mb-4">🏗️</span>
          <p className="text-lg font-bold">차량을 선택하면 렌트가 산출 분석이 시작됩니다</p>
        </div>
      ) : calculations && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ===== 왼쪽: 입력/분석 영역 ===== */}
          <div className="lg:col-span-8 space-y-4">


            {/* 🆕 0. AI 자동분류 결과 */}
            {autoCategory && (
              <div className="bg-gradient-to-r from-steel-50 to-steel-50 border border-steel-200 rounded-xl p-3 flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold text-steel-800">🤖 기준표 자동 매핑:</span>
                <span className="bg-steel-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">잔가: {autoCategory}</span>
                <span className="bg-steel-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">보험: {autoInsType}</span>
                <span className="bg-amber-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">정비: {autoMaintType}</span>
              </div>
            )}

            {/* 1. 차량 취득원가 (3단계: 기준가 → 매입가 → 취득원가) */}
            <Section icon="💰" title={`차량 취득원가 — ${carAgeMode === 'used' ? '중고차' : '신차'}`}>
              {/* ── STEP 1: 기준가 (가격표/시세) ── */}
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-black">1</span>
                  <span className="text-xs font-bold text-gray-700">{carAgeMode === 'used' ? '시세 (이론적 시장가)' : '가격표 금액 (출고가)'}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{carAgeMode === 'used' ? '연식·주행거리 기반 이론가' : '옵션 포함 정가'}</span>
                </div>
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <InputRow label={carAgeMode === 'used' ? '신차 출고가 (감가 기준)' : '출고가 (가격표)'} value={factoryPrice} onChange={setFactoryPrice} />
                    </div>
                    <div className="text-right pl-4 shrink-0">
                      {carAgeMode === 'used' && calculations.theoreticalMarketValue > 0 ? (
                        <>
                          <p className="text-[10px] text-gray-400">차령 {customCarAge}년 이론 시세</p>
                          <p className="text-base font-black text-blue-700">{f(calculations.theoreticalMarketValue)}원</p>
                          <p className="text-[10px] text-gray-400">감가율 {calculations.purchaseTotalDep.toFixed(1)}%</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] text-gray-400">정가 기준</p>
                          <p className="text-base font-black text-blue-700">{f(factoryPrice)}원</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── STEP 2: 매입가 (실구매가) ── */}
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-2 mt-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-black">2</span>
                  <span className="text-xs font-bold text-gray-700">{carAgeMode === 'used' ? '매입가 (실구매가)' : '매입가 (실구매가)'}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{carAgeMode === 'used' ? '실제 협상/낙찰가' : '할인 반영 실제 결제가'}</span>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <InputRow label={carAgeMode === 'used' ? '중고 매입가' : '매입가 (실 구매가)'} value={purchasePrice} onChange={setPurchasePrice} />
                    </div>
                    <div className="text-right pl-4 shrink-0">
                      {carAgeMode === 'used' ? (
                        calculations.theoreticalMarketValue > 0 ? (
                          <>
                            <p className="text-[10px] text-gray-400">시세 대비 매입</p>
                            <p className={`text-xl font-black ${calculations.purchasePremiumPct <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {calculations.purchasePremiumPct > 0 ? '+' : ''}{calculations.purchasePremiumPct.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {calculations.purchasePremiumPct <= 0 ? '시세 이하 매입 👍' : '시세 대비 프리미엄'}
                            </p>
                          </>
                        ) : null
                      ) : (
                        factoryPrice > 0 ? (
                          <>
                            <p className="text-[10px] text-gray-400">출고가 대비</p>
                            <p className="text-base font-black text-emerald-600">
                              -{calculations.purchaseDiscount.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-gray-400">{f(factoryPrice - purchasePrice)}원 할인</p>
                          </>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── STEP 3: 취득원가 (매입가 + 부대비용) ── */}
              <div>
                <div className="flex items-center gap-2 mb-2 mt-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-black">3</span>
                  <span className="text-xs font-bold text-gray-700">취득원가 (매입가 + 부대비용)</span>
                  <span className="text-[10px] text-gray-400 ml-auto">렌트가 산정 원가 기준</span>
                </div>

                {/* 등록 지역 선택 */}
                <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-600">차량 등록 지역</p>
                    <span className="text-[10px] text-gray-400">
                      {['서울', '부산', '대구'].includes(registrationRegion)
                        ? `${registrationRegion}: 도시철도채권 · 영업용 매입 의무`
                        : `${registrationRegion}: 지역개발채권 · 영업용 매입 면제`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
                      '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].map(region => (
                      <button
                        key={region}
                        onClick={() => setRegistrationRegion(region)}
                        className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-colors
                          ${registrationRegion === region
                            ? ['서울', '부산', '대구'].includes(region)
                              ? 'bg-red-500 text-white'
                              : 'bg-green-500 text-white'
                            : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                          }`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                  {bondCost === 0 && (
                    <p className="text-xs text-green-600 font-bold mt-2">
                      {['서울', '부산', '대구'].includes(registrationRegion)
                        ? `배기량 ${engineCC || 0}cc → 면제 대상`
                        : `${registrationRegion} 지역 영업용(렌터카) → 공채매입 면제`}
                    </p>
                  )}
                  {bondCost > 0 && (
                    <p className="text-xs text-red-500 font-bold mt-2">
                      {registrationRegion} 도시철도채권: 영업용 {engineCC >= 2000 ? (registrationRegion === '서울' ? '8%' : '4%') : (registrationRegion === '서울' ? '5%' : '2%')} × 할인매도 후 실부담 {f(bondCost)}원
                    </p>
                  )}
                </div>

                {/* 등록 차량: car_costs 실데이터 / 신차 가격표: 수동 입력 */}
                {carCostItems.length > 0 ? (
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold text-emerald-700">등록 페이지 비용 데이터 연동</span>
                      </div>
                      <span className="text-[10px] text-emerald-500 font-bold">{carCostItems.length}개 항목</span>
                    </div>
                    {/* 항목별 리스트 */}
                    <div className="space-y-1.5">
                      {carCostItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-gray-100 text-gray-500 w-8 text-center">{item.category}</span>
                            <span className={`font-medium ${item.amount > 0 ? 'text-gray-700' : 'text-gray-300'}`}>{item.item_name}</span>
                          </div>
                          {item.amount > 0 ? (
                            <span className="font-bold text-gray-800">{f(item.amount)}원</span>
                          ) : (
                            <span className="text-[11px] text-gray-300">미입력</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* 합계 */}
                    <div className="pt-3 mt-3 border-t-2 border-emerald-300">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-800">취득원가 합계</span>
                        <span className="text-base font-black text-emerald-800">{f(totalAcquisitionCost)}원</span>
                      </div>
                      {purchasePrice > 0 && totalAcquisitionCost > purchasePrice && (
                        <p className="text-[11px] text-emerald-600 text-right mt-1">
                          매입가 대비 부대비용 +{f(totalAcquisitionCost - purchasePrice)}원 ({((totalAcquisitionCost - purchasePrice) / purchasePrice * 100).toFixed(1)}%)
                        </p>
                      )}
                      {carCostItems.filter(c => c.amount === 0).length > 0 && (
                        <p className="text-[11px] text-amber-500 text-right mt-1">
                          {carCostItems.filter(c => c.amount === 0).length}개 항목 미입력 — 등록 상세에서 입력하세요
                        </p>
                      )}
                    </div>
                    {/* 등록 상세 바로가기 */}
                    {selectedCar && selectedCar.id && !String(selectedCar.id).startsWith('newcar-') && (
                      <button
                        onClick={() => window.open(`/registration/${selectedCar.id}`, '_blank')}
                        className="w-full mt-3 py-2.5 px-4 bg-steel-600 hover:bg-steel-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2"
                      >
                        📋 등록 상세에서 비용 수정 →
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* 데이터 없음 안내 */}
                    {selectedCar && selectedCar.id && !String(selectedCar.id).startsWith('newcar-') && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-start gap-2">
                        <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
                        <div>
                          <p className="text-xs font-bold text-amber-700">등록 페이지에 비용 데이터가 없습니다</p>
                          <p className="text-[11px] text-amber-600 mt-0.5">아래 수동 입력값으로 산정됩니다. 등록 상세에서 비용을 입력하면 자동 연동됩니다.</p>
                          <button
                            onClick={() => window.open(`/registration/${selectedCar.id}`, '_blank')}
                            className="mt-2 text-xs font-bold text-steel-600 hover:text-steel-800 underline underline-offset-2"
                          >
                            등록 상세에서 비용 입력하기 →
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <ResultRow label="차량 매입가" value={purchasePrice} />
                        <InputRow label={acquisitionTax === 0 && factoryPrice > 0 ? '취득세 (경차 면제)' : `취득세 (${selectedCar?.is_commercial === false ? '비영업용 7%' : '영업용 4%'})`} value={acquisitionTax} onChange={setAcquisitionTax} sub={acquisitionTax === 0 && factoryPrice > 0 ? '경차 취득세 감면' : selectedCar?.is_commercial === false ? '비영업용(일반) 승용차 기준' : '렌터카 대여업 영업용 기준'} />
                        <InputRow
                          label={bondCost > 0 ? `공채 실부담 (${registrationRegion})` : `공채 (${registrationRegion})`}
                          value={bondCost}
                          onChange={setBondCost}
                          sub={bondCost > 0
                            ? `${registrationRegion} 도시철도채권 영업용 · 할인매도 후`
                            : `영업용 매입 면제`}
                        />
                        <InputRow label="탁송료" value={deliveryFee} onChange={setDeliveryFee} />
                        <InputRow label="기타 (번호판/인지/대행/검사)" value={miscFee} onChange={setMiscFee} />
                      </div>
                      <div>
                        <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-3 h-full flex flex-col justify-center">
                          <div className="text-center">
                            <span className="text-xs text-red-500 font-bold block mb-1">실제 취득원가</span>
                            <span className="text-base font-black text-red-700">{f(totalAcquisitionCost)}원</span>
                            <span className="text-xs text-red-400 block mt-1">
                              매입가 대비 <b>+{f(totalAcquisitionCost - purchasePrice)}원</b> ({purchasePrice > 0 ? ((totalAcquisitionCost - purchasePrice) / purchasePrice * 100).toFixed(1) : 0}%)
                            </span>
                            <p className="text-[11px] text-gray-400 mt-1.5 bg-white/60 rounded-lg p-1.5">
                              수동 입력 기준 산정
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* 2. 시세하락 분석 */}
            <Section icon="📉" title={`시세하락 / 감가 분석 (${termMonths}개월 계약)`} defaultOpen={false} summary={calculations ? <span className="flex items-center gap-2"><span className="text-gray-400">감가율 {calculations.totalDepRateEnd.toFixed(1)}%</span><span className="text-red-500 font-bold">월 {f(calculations.monthlyDepreciation)}원</span></span> : undefined}>
              {/* 차량 구분: 신차 / 연식차량 */}
              <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-bold text-gray-500 mb-2.5">차량 구분</p>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => { setCarAgeMode('new'); setCustomCarAge(0) }}
                    className={`flex-1 py-2 px-3 rounded-xl border-2 font-bold text-xs transition-all ${
                      carAgeMode === 'new'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-emerald-300'
                    }`}
                  >
                    🆕 신차 <span className="text-xs font-normal ml-1">(차령 0년, 감가 0%에서 시작)</span>
                  </button>
                  <button
                    onClick={() => {
                      setCarAgeMode('used')
                      // 연식 기반 자동 차령 계산
                      if (selectedCar) {
                        const autoAge = Math.max(0, new Date().getFullYear() - (selectedCar.year || new Date().getFullYear()))
                        setCustomCarAge(autoAge)
                      }
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl border-2 font-bold text-xs transition-all ${
                      carAgeMode === 'used'
                        ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300'
                    }`}
                  >
                    🚗 연식차량 <span className="text-xs font-normal ml-1">(차령만큼 이미 감가됨)</span>
                  </button>
                </div>
                {carAgeMode === 'used' && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-gray-500 whitespace-nowrap">현재 차령</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="1"
                        value={customCarAge}
                        onChange={(e) => setCustomCarAge(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:border-amber-500 outline-none"
                      />
                      <span className="text-xs text-gray-400">년</span>
                    </div>
                    {selectedCar && (
                      <span className="text-[11px] text-gray-400">
                        ({selectedCar.year}년식 기준 자동계산: {Math.max(0, new Date().getFullYear() - (selectedCar.year || new Date().getFullYear()))}년)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 감가 기준 설정 (3축 분류 + 곡선 + 보정 통합) */}
              <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
                {/* ① 차종 분류 + 곡선 선택 — 한 줄씩 */}
                {calculations?.autoAxes && (
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-xs font-bold text-gray-600 shrink-0">차종</span>
                    <select value={dbOriginOverride || calculations.autoAxes.origin}
                      onChange={(e) => setDbOriginOverride(e.target.value === calculations.autoAxes?.origin ? '' : e.target.value)}
                      className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white focus:border-steel-500 outline-none font-bold">
                      {['국산', '수입'].map(v => (
                        <option key={v} value={v}>{v}{v === calculations.autoAxes?.origin && !dbOriginOverride ? ' (자동)' : ''}</option>
                      ))}
                    </select>
                    <select value={dbVehicleClassOverride || calculations.autoAxes.vehicle_class}
                      onChange={(e) => setDbVehicleClassOverride(e.target.value === calculations.autoAxes?.vehicle_class ? '' : e.target.value)}
                      className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white focus:border-steel-500 outline-none font-bold">
                      {['경차', '소형_세단', '준중형_세단', '중형_세단', '대형_세단', '소형_SUV', '중형_SUV', '대형_SUV', 'MPV', '프리미엄'].map(v => (
                        <option key={v} value={v}>{v.replace(/_/g, ' ')}{v === calculations.autoAxes?.vehicle_class && !dbVehicleClassOverride ? ' (자동)' : ''}</option>
                      ))}
                    </select>
                    <select value={dbFuelTypeOverride || calculations.autoAxes.fuel_type}
                      onChange={(e) => setDbFuelTypeOverride(e.target.value === calculations.autoAxes?.fuel_type ? '' : e.target.value)}
                      className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white focus:border-steel-500 outline-none font-bold">
                      {['내연기관', '하이브리드', '전기'].map(v => (
                        <option key={v} value={v}>{v}{v === calculations.autoAxes?.fuel_type && !dbFuelTypeOverride ? ' (자동)' : ''}</option>
                      ))}
                    </select>
                    {calculations.matchedDepRate ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-md">DB 매칭</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-md">매칭 없음</span>
                    )}
                    {(dbOriginOverride || dbVehicleClassOverride || dbFuelTypeOverride) && (
                      <button onClick={() => { setDbOriginOverride(''); setDbVehicleClassOverride(''); setDbFuelTypeOverride('') }}
                        className="px-1.5 py-0.5 text-[9px] bg-gray-200 text-gray-600 rounded font-bold hover:bg-gray-300">초기화</button>
                    )}
                  </div>
                )}

                {/* 곡선 프리셋 선택 */}
                <div className="flex gap-1.5 flex-wrap mb-3">
                  <button onClick={() => setDepCurvePreset('db_based')}
                    className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                      ${depCurvePreset === 'db_based' ? 'bg-steel-600 text-white border-steel-600' : 'border-gray-200 bg-white text-gray-500 hover:border-steel-300'}`}>
                    기준표
                  </button>
                  {(Object.entries(DEP_CURVE_PRESETS) as [string, { label: string; desc: string; curve: number[] }][]).map(([key, preset]) => (
                    <button key={key} onClick={() => setDepCurvePreset(key as DepCurvePreset)}
                      className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                        ${depCurvePreset === key ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300'}`}>
                      {preset.label}
                    </button>
                  ))}
                  <button onClick={() => {
                      setDepCurvePreset('custom')
                      if (depCurvePreset !== 'custom' && depCurvePreset !== 'db_based') {
                        setDepCustomCurve([...DEP_CURVE_PRESETS[depCurvePreset as keyof typeof DEP_CURVE_PRESETS].curve])
                      } else if (depCurvePreset === 'db_based' && calculations?.activeCurve) {
                        setDepCustomCurve([...calculations.activeCurve])
                      }
                    }}
                    className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                      ${depCurvePreset === 'custom' ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300'}`}>
                    직접입력
                  </button>
                </div>

                {/* ② 감가율 표 (DB 잔존율 + 곡선 통합) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left py-1 pr-2">연차</th>
                        {Array.from({ length: 8 }, (_, i) => (
                          <th key={i} className="text-center py-1 px-1">{i}년</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-gray-600">
                        <td className="py-1 pr-2 text-gray-400 font-bold whitespace-nowrap">
                          누적감가{calculations && calculations.classMult !== 1.0 ? ` ×${calculations.classMult.toFixed(2)}` : ''}
                        </td>
                        {Array.from({ length: 8 }, (_, i) => {
                          const activeCurve = depCurvePreset === 'custom'
                            ? depCustomCurve
                            : calculations?.activeCurve || DEP_CURVE_PRESETS.standard.curve
                          const rate = getDepRateFromCurve(activeCurve, i, calculations?.classMult ?? 1.0)
                          return (
                            <td key={i} className={`text-center py-1 px-1 font-bold
                              ${i === 0 ? 'text-gray-300' : rate > 50 ? 'text-red-500' : 'text-amber-600'}`}>
                              {depCurvePreset === 'custom' && i > 0 ? (
                                <input type="number" step="0.5" min="0" max="95"
                                  value={depCustomCurve[i] ?? ''}
                                  onChange={(e) => { const c = [...depCustomCurve]; c[i] = parseFloat(e.target.value) || 0; setDepCustomCurve(c) }}
                                  className="w-12 text-center border border-amber-200 rounded px-0.5 py-0.5 text-[11px] font-bold focus:border-amber-500 outline-none" />
                              ) : `${rate.toFixed(1)}%`}
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="text-gray-400 border-t border-gray-100">
                        <td className="py-1 pr-2 font-bold whitespace-nowrap">잔가율</td>
                        {Array.from({ length: 8 }, (_, i) => {
                          const activeCurve = depCurvePreset === 'custom'
                            ? depCustomCurve
                            : calculations?.activeCurve || DEP_CURVE_PRESETS.standard.curve
                          const rate = getDepRateFromCurve(activeCurve, i, calculations?.classMult ?? 1.0)
                          return <td key={i} className="text-center py-1 px-1">{(100 - rate).toFixed(1)}%</td>
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* ③ 보정 설정 — 인기도 + 차종클래스 + 보정계수 통합 한 줄 */}
                <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-2 flex-wrap">
                  {calculations?.autoAxes && (
                    <>
                      <span className="text-xs font-bold text-gray-600 shrink-0">인기도</span>
                      <select value={popularityGrade} onChange={(e) => setPopularityGrade(e.target.value)}
                        className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white focus:border-steel-500 outline-none">
                        {depAdjustments.filter(a => a.adjustment_type === 'popularity' && a.is_active).length > 0
                          ? depAdjustments.filter(a => a.adjustment_type === 'popularity' && a.is_active).map(a => (
                              <option key={a.id} value={a.label}>{a.label} (×{Number(a.factor).toFixed(3)})</option>
                            ))
                          : [
                              { label: 'S등급 (인기)', factor: 1.05 },
                              { label: 'A등급 (준인기)', factor: 1.02 },
                              { label: 'B등급 (일반)', factor: 1.0 },
                              { label: 'C등급 (비인기)', factor: 0.97 },
                              { label: 'D등급 (저인기)', factor: 0.93 },
                            ].map(a => (
                              <option key={a.label} value={a.label}>{a.label} (×{a.factor.toFixed(3)})</option>
                            ))
                        }
                      </select>
                    </>
                  )}
                  {calculations && (
                    <>
                      <span className="w-px h-4 bg-gray-200 mx-0.5" />
                      <span className="text-xs font-bold text-gray-600 shrink-0">차종클래스</span>
                      {depCurvePreset === 'db_based' ? (
                        <span className="text-[11px] text-steel-600 font-bold">{calculations.depClass} (기준표 직접)</span>
                      ) : (
                        <select value={depClassOverride} onChange={(e) => setDepClassOverride(e.target.value)}
                          className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white focus:border-amber-500 outline-none">
                          <option value="">자동 ({calculations.depClass})</option>
                          {Object.entries(DEP_CLASS_MULTIPLIER).map(([key, { label, mult }]) => (
                            <option key={key} value={key}>{label} (×{mult.toFixed(2)})</option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                  {calculations && calculations.adjustmentFactor !== 1.0 && (
                    <>
                      <span className="w-px h-4 bg-gray-200 mx-0.5" />
                      <span className="text-[10px] text-gray-500">
                        보정 ×{calculations.adjustmentFactor.toFixed(3)}
                        {calculations.popularityFactor !== 1.0 && <span className="text-purple-600 ml-1">인기도×{calculations.popularityFactor.toFixed(3)}</span>}
                        {calculations.mileageFactor !== 1.0 && <span className="text-blue-600 ml-1">주행×{calculations.mileageFactor.toFixed(3)}</span>}
                        {calculations.marketFactor !== 1.0 && <span className="text-orange-600 ml-1">시장×{calculations.marketFactor.toFixed(3)}</span>}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* ── 중고차 감가 분석 카드 ── */}
              {calculations?.isUsedCar && (
                <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-300">
                  <p className="text-xs font-bold text-amber-700 mb-3">🔄 중고차 감가 분석 (회사/고객 부담 분리)</p>

                  {/* 매입 분석 */}
                  <div className="mb-3 p-3 bg-white rounded-lg border border-amber-200">
                    <p className="text-[11px] font-bold text-gray-600 mb-2">■ 매입 분석</p>
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td className="text-gray-400 py-0.5 pr-2">출고가 (신차)</td><td className="text-right font-bold py-0.5">{factoryPrice.toLocaleString()}원</td></tr>
                        <tr><td className="text-gray-400 py-0.5 pr-2">중고 매입가</td><td className="text-right font-bold text-blue-600 py-0.5">{purchasePrice.toLocaleString()}원</td></tr>
                        {totalAcquisitionCost > 0 && totalAcquisitionCost !== purchasePrice && (
                          <tr><td className="text-gray-400 py-0.5 pr-2">구입비용 합계 (부대비용 포함)</td><td className="text-right font-bold text-blue-700 py-0.5">{totalAcquisitionCost.toLocaleString()}원</td></tr>
                        )}
                        <tr className="border-t border-amber-100"><td className="text-gray-400 py-0.5 pr-2 pt-1">구입 시 차령</td><td className="text-right font-bold py-0.5 pt-1">{calculations.carAge}년</td></tr>
                        <tr><td className="text-gray-400 py-0.5 pr-2">구입 시 연식감가율</td><td className="text-right font-bold text-amber-600 py-0.5">{calculations.purchaseYearDep.toFixed(1)}%</td></tr>
                        <tr><td className="text-gray-400 py-0.5 pr-2">구입 시 주행거리</td><td className="text-right font-bold py-0.5">{(calculations.purchaseMileage10k * 10000).toLocaleString()}km</td></tr>
                        <tr><td className="text-gray-400 py-0.5 pr-2">구입차령 기준주행</td><td className="text-right font-bold py-0.5">{(calculations.purchaseAvgMileage * 10000).toLocaleString()}km</td></tr>
                        <tr>
                          <td className="text-gray-400 py-0.5 pr-2">구입 시 주행감가</td>
                          <td className={`text-right font-bold py-0.5 ${calculations.purchaseMileageDep > 0 ? 'text-red-500' : calculations.purchaseMileageDep < 0 ? 'text-blue-500' : 'text-gray-500'}`}>
                            {calculations.purchaseMileageDep > 0 ? '+' : ''}{calculations.purchaseMileageDep.toFixed(1)}%
                            {calculations.purchaseExcessMileage < 0 ? ' (저주행)' : calculations.purchaseExcessMileage > 0 ? ' (과주행)' : ''}
                          </td>
                        </tr>
                        <tr><td className="text-gray-400 py-0.5 pr-2">구입시점 총감가율</td><td className="text-right font-bold text-amber-600 py-0.5">{calculations.purchaseTotalDep.toFixed(1)}%</td></tr>
                        <tr className="border-t border-amber-100">
                          <td className="text-gray-400 py-0.5 pr-2 pt-1">이론 시장가</td>
                          <td className="text-right font-bold py-0.5 pt-1">{calculations.theoreticalMarketValue.toLocaleString()}원</td>
                        </tr>
                        <tr>
                          <td className="text-gray-500 font-bold py-0.5 pr-2">시세 대비</td>
                          <td className={`text-right font-bold py-0.5 ${calculations.purchasePremiumPct < 0 ? 'text-green-600' : calculations.purchasePremiumPct > 0 ? 'text-red-500' : 'text-gray-600'}`}>
                            {calculations.theoreticalMarketValue > 0 ? `${(purchasePrice / calculations.theoreticalMarketValue * 100).toFixed(1)}%` : '-'}
                            {calculations.purchasePremiumPct < -1 ? ` (${Math.abs(calculations.purchasePremiumPct).toFixed(1)}% 절감)` : calculations.purchasePremiumPct > 1 ? ` (${calculations.purchasePremiumPct.toFixed(1)}% 프리미엄)` : ' (적정)'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 고객 적용 감가 */}
                  <div className="mb-3 p-3 bg-white rounded-lg border border-amber-200">
                    <p className="text-[11px] font-bold text-gray-600 mb-2">■ 고객 적용 감가 ({termMonths}개월 후)</p>
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td colSpan={2} className="text-gray-500 font-bold pt-1 pb-0.5">연식감가</td></tr>
                        <tr><td className="text-gray-400 pl-2 py-0.5">구입시 → 종료시</td><td className="text-right font-bold py-0.5">{calculations.purchaseYearDep.toFixed(1)}% → {calculations.yearDepEnd.toFixed(1)}%</td></tr>
                        <tr><td className="text-gray-400 pl-2 py-0.5">고객 적용분</td><td className="text-right font-bold text-amber-600 py-0.5">+{calculations.customerYearDep.toFixed(1)}%p</td></tr>

                        <tr><td colSpan={2} className="text-gray-500 font-bold pt-2 pb-0.5">주행감가 (계약기간 기준초과분만)</td></tr>
                        <tr><td className="text-gray-400 pl-2 py-0.5">계약기간 고객주행</td><td className="text-right font-bold py-0.5 whitespace-nowrap">{(calculations.customerDriven10k * 10000).toLocaleString()}km</td></tr>
                        <tr><td className="text-gray-400 pl-2 py-0.5">계약기간 기준주행</td><td className="text-right font-bold py-0.5 whitespace-nowrap">{(calculations.standardAddition10k * 10000).toLocaleString()}km</td></tr>
                        <tr>
                          <td className="text-gray-400 pl-2 py-0.5 font-bold">고객 초과주행</td>
                          <td className={`text-right font-bold py-0.5 whitespace-nowrap ${calculations.customerExcessMileage > 0 ? 'text-red-500' : calculations.customerExcessMileage < 0 ? 'text-blue-500' : 'text-gray-500'}`}>
                            {calculations.customerExcessMileage > 0 ? '+' : ''}{(calculations.customerExcessMileage * 10000).toLocaleString()}km
                          </td>
                        </tr>
                        <tr>
                          <td className="text-gray-400 pl-2 py-0.5">고객 주행감가율</td>
                          <td className={`text-right font-bold py-0.5 ${calculations.customerMileageDep > 0 ? 'text-red-500' : calculations.customerMileageDep < 0 ? 'text-blue-500' : 'text-gray-500'}`}>
                            {calculations.customerMileageDep > 0 ? '+' : ''}{calculations.customerMileageDep.toFixed(1)}%
                          </td>
                        </tr>
                        <tr className="border-t border-amber-100">
                          <td colSpan={2} className="text-gray-400 text-[10px] pt-1 pl-2">
                            종료시 총 {((calculations.purchaseMileage10k + calculations.customerDriven10k) * 10000).toLocaleString()}km
                            (구입시 {(calculations.purchaseMileage10k * 10000).toLocaleString()} + 계약 {(calculations.customerDriven10k * 10000).toLocaleString()})
                            {' '}· 추가부담: {((calculations.purchaseMileage10k + calculations.standardAddition10k) * 10000).toLocaleString()}km 초과시
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 종합 월감가비 */}
                  <div className="p-3 bg-amber-100/50 rounded-lg border border-amber-300">
                    <p className="text-[11px] font-bold text-gray-600 mb-2">■ 종합</p>
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td className="text-gray-400 py-0.5">고객 적용 감가율</td><td className="text-right font-bold py-0.5 whitespace-nowrap">연식 {calculations.yearDepEnd.toFixed(1)}% + 주행 {calculations.customerMileageDep > 0 ? '+' : ''}{calculations.customerMileageDep.toFixed(1)}% = {calculations.usedCarEndTotalDep.toFixed(1)}%</td></tr>
                        <tr><td className="text-gray-400 py-0.5">종료시 잔존가 (고객기준)</td><td className="text-right font-bold py-0.5">{calculations.usedCarEndMarketValue.toLocaleString()}원</td></tr>
                        <tr><td className="text-gray-400 py-0.5">차량 실제 잔존가 (처분용)</td><td className="text-right font-bold text-gray-500 py-0.5">{calculations.carActualEndMarketValue.toLocaleString()}원</td></tr>
                        {calculations.usedCarEndMarketValue !== calculations.carActualEndMarketValue && (
                          <tr>
                            <td className="text-gray-400 pl-2 py-0.5">회사 손익 (주행상태)</td>
                            <td className={`text-right font-bold py-0.5 ${calculations.carActualEndMarketValue > calculations.usedCarEndMarketValue ? 'text-green-600' : 'text-red-500'}`}>
                              {calculations.carActualEndMarketValue > calculations.usedCarEndMarketValue ? '+' : ''}{(calculations.carActualEndMarketValue - calculations.usedCarEndMarketValue).toLocaleString()}원
                            </td>
                          </tr>
                        )}
                        <tr className="border-t border-amber-200"><td className="text-gray-400 pt-1 py-0.5">원가 ({totalAcquisitionCost > 0 ? '구입비용 합계' : '구입가'})</td><td className="text-right font-bold text-blue-600 pt-1 py-0.5">{calculations.costBase.toLocaleString()}원</td></tr>
                        {totalAcquisitionCost > 0 && totalAcquisitionCost !== purchasePrice && (
                          <>
                            <tr><td className="text-gray-400 pl-2 py-0.5">순수 매입가</td><td className="text-right text-gray-500 py-0.5">{purchasePrice.toLocaleString()}원</td></tr>
                            <tr><td className="text-gray-400 pl-2 py-0.5">부대비용</td><td className="text-right text-gray-500 py-0.5">+{(totalAcquisitionCost - purchasePrice).toLocaleString()}원</td></tr>
                          </>
                        )}
                        <tr><td className="text-gray-500 font-bold py-0.5">계약기간 감가액</td><td className="text-right font-bold text-red-500 py-0.5">{(calculations.costBase - calculations.effectiveEndMarketValue).toLocaleString()}원</td></tr>
                        <tr><td className="text-gray-500 font-bold py-0.5">월 감가비</td><td className="text-right font-bold text-red-600 text-sm py-0.5">{calculations.monthlyDepreciation.toLocaleString()}원</td></tr>
                      </tbody>
                    </table>
                    <p className="mt-2 text-[10px] text-gray-400">
                      ※ 주행감가는 구입시 주행상태(회사부담)를 제외하고, 고객이 계약기간 동안 기준 대비 추가 주행한 부분만 적용
                    </p>
                  </div>
                </div>
              )}

              {/* ── ① 선택: 주행 설정 ── */}
              <div className="border-t mt-3 pt-2">
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-600 shrink-0">약정주행</span>
                  {[
                    { val: 1, label: '1만' },
                    { val: 1.5, label: '1.5만' },
                    { val: 2, label: '2만' },
                    { val: 3, label: '3만' },
                    { val: 5, label: '무제한' },
                  ].map(opt => {
                    const adjPct = (opt.val - baselineKm) * 2
                    return (
                      <button key={opt.val}
                        onClick={() => setAnnualMileage(opt.val)}
                        className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors
                          ${annualMileage === opt.val ? 'bg-steel-600 text-white border-steel-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                      >
                        {opt.label}
                        {opt.val < 5 && <span className={`text-[9px] ml-0.5 ${annualMileage === opt.val ? 'text-white/70' : adjPct > 0 ? 'text-red-400' : adjPct < 0 ? 'text-green-500' : 'text-gray-400'}`}>{adjPct === 0 ? '(기준)' : `(${adjPct > 0 ? '+' : ''}${adjPct.toFixed(0)}%)`}</span>}
                      </button>
                    )
                  })}
                  <span className="w-px h-4 bg-gray-200 mx-0.5" />
                  <span className="text-xs font-bold text-gray-600 shrink-0">0%기준</span>
                  <input type="number" step="0.5" min="0.5"
                    className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={baselineKm} onChange={(e) => setBaselineKm(parseFloat(e.target.value) || 2)} />
                  <span className="text-[11px] text-gray-400">만km/년</span>
                </div>
                {annualMileage < 5 && (() => {
                  const yearlyAdj = (annualMileage - baselineKm) * 2
                  const totalAdj = yearlyAdj * (termMonths / 12)
                  return yearlyAdj !== 0 ? (
                    <p className={`text-[10px] font-bold mb-2 ${yearlyAdj > 0 ? 'text-red-500' : 'text-green-600'}`}>
                      기준대비 {yearlyAdj > 0 ? '+' : ''}{yearlyAdj.toFixed(1)}%p/년 → {termMonths}개월 총 {totalAdj > 0 ? '+' : ''}{totalAdj.toFixed(1)}%p {yearlyAdj > 0 ? '증가' : '감소'}
                    </p>
                  ) : null
                })()}
              </div>

              {/* ── 초과주행 요금 선택 ── */}
              <div className="border-t mt-3 pt-2">
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-600 shrink-0">초과요금</span>
                  <input type="number" step="10" min="0"
                    className="w-20 text-right border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    value={excessMileageRate} onChange={(e) => setExcessMileageRate(parseInt(e.target.value) || 0)} />
                  <span className="text-[11px] text-gray-400">원/km</span>
                  <span className="w-px h-4 bg-gray-200 mx-0.5" />
                  <span className="text-xs font-bold text-gray-600 shrink-0">마진</span>
                  {[
                    { val: 30, label: '30%' },
                    { val: 50, label: '50%' },
                    { val: 80, label: '80%' },
                    { val: 100, label: '100%' },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => setExcessRateMarginPct(opt.val)}
                      className={`py-0.5 px-2 text-[11px] rounded-lg border font-bold transition-colors
                        ${excessRateMarginPct === opt.val ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >{opt.label}</button>
                  ))}
                </div>

                {/* 약관 DB 기준값 안내 */}
                {termsExcessInfo.source === 'terms_db' && (
                  <div className="flex items-center gap-1.5 mb-2 text-[10px]">
                    <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 font-bold">
                      약관 기준
                    </span>
                    <span className="text-gray-500">
                      {termsExcessInfo.key}: <strong className="text-blue-700">{termsExcessInfo.rate.toLocaleString()}원/km</strong>
                    </span>
                    {excessMileageRate > 0 && excessMileageRate !== termsExcessInfo.rate && (
                      <span className="text-amber-600 font-bold">
                        (수동 {excessMileageRate.toLocaleString()}원 적용 중 · 약관과 {excessMileageRate > termsExcessInfo.rate ? '+' : ''}{excessMileageRate - termsExcessInfo.rate}원 차이)
                      </span>
                    )}
                    {!excessMileageRate && (
                      <span className="text-green-600 font-bold">(약관 자동적용)</span>
                    )}
                  </div>
                )}
                {termsExcessInfo.source === 'fallback' && (
                  <div className="flex items-center gap-1.5 mb-2 text-[10px]">
                    <span className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 font-bold">
                      기본값
                    </span>
                    <span className="text-gray-400">약관 DB 미설정 — 출고가 기반 자동산출 {termsExcessInfo.rate.toLocaleString()}원/km</span>
                  </div>
                )}

                {/* 원가 분석 상세 */}
                <div className="bg-orange-50 rounded-lg p-3 space-y-0.5 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">감가율차이 +{excessRateBreakdown.depDiffPct.toFixed(1)}%p {excessRateBreakdown.tierPenalty !== 1 ? `(패널티 ×${excessRateBreakdown.tierPenalty.toFixed(2)})` : ''}</span>
                    <span className="font-bold text-gray-700">감가비 {f(excessRateBreakdown.depCost)}원/km</span>
                  </div>
                  {excessRateBreakdown.maintItems.length > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">정비비 ({MAINTENANCE_PACKAGES[maintPackage].label})</span>
                      <span className="font-bold text-gray-700">{f(excessRateBreakdown.maintCost)}원/km</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs border-t border-orange-200 pt-1 mt-1">
                    <span className="font-bold text-gray-700">원가 소계</span>
                    <span className="font-bold text-gray-700">{f(excessRateBreakdown.baseCost)}원/km</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-orange-600 font-bold">마진 {excessRateMarginPct}%</span>
                    <span className="font-bold text-orange-600">+{f(excessRateBreakdown.margin)}원/km</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-orange-300 pt-1 mt-1">
                    <span className="font-bold text-gray-700">산출 합계</span>
                    <span className="font-black text-red-600">{f(excessRateBreakdown.total)}원/km</span>
                  </div>
                </div>
              </div>

              {/* ── ② 상세: 현재 vs 종료 시점 비교 ── */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-gray-50/80 rounded-lg p-3 space-y-0.5">
                  <div className="flex justify-between text-[10px] mb-1"><span className="font-bold text-gray-400">현재 {calculations.carAge === 0 ? '(신차)' : `(${calculations.carAge}년)`}</span><span className="text-gray-500">시세 {f(calculations.currentMarketValue)}원</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">연식 {calculations.yearDep.toFixed(1)}% + 주행 {calculations.mileageDep === 0 ? '0' : `${calculations.mileageDep > 0 ? '+' : ''}${calculations.mileageDep.toFixed(1)}`}%</span><span className="font-black text-red-600">= {calculations.totalDepRate.toFixed(1)}%</span></div>
                </div>
                <div className="bg-steel-50/80 rounded-lg p-3 space-y-0.5">
                  <div className="flex justify-between text-[10px] mb-1"><span className="font-bold text-steel-400">{termMonths}개월 후 ({(calculations.carAge + calculations.termYears).toFixed(1)}년)</span><span className="text-steel-500">시세 {f(calculations.endMarketValue)}원</span></div>
                  <div className="flex justify-between text-xs"><span className="text-steel-500">연식 {calculations.yearDepEnd.toFixed(1)}% + 주행 {calculations.mileageDepEnd === 0 ? '0' : `${calculations.mileageDepEnd > 0 ? '+' : ''}${calculations.mileageDepEnd.toFixed(1)}`}%</span><span className="font-black text-steel-700">= {calculations.totalDepRateEnd.toFixed(1)}%</span></div>
                </div>
              </div>

              {/* 차량정보 밴드 */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 px-1 text-[10px] text-gray-400">
                <span>{carAgeMode === 'new' ? '신차' : '연식'} · {calculations.carAge}년 · {calculations.mileage10k.toFixed(1)}만km</span>
                <span className="text-steel-500">→ {(calculations.carAge + calculations.termYears).toFixed(1)}년 / {calculations.projectedMileage10k.toFixed(1)}만km</span>
              </div>

              {/* ── ③ 결과 ── */}
              <div className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-lg mt-3">
                <span className="font-bold text-xs text-red-700">월 감가비용 <span className="text-[10px] font-normal text-red-400">시세하락 {f(calculations.currentMarketValue - calculations.endMarketValue)}원 ÷ {termMonths}개월</span></span>
                <span className="font-black text-sm text-red-600">{f(calculations.monthlyDepreciation)}원</span>
              </div>
            </Section>

            {/* 3. 금융비용 분석 */}
            <Section icon="🏦" title="금융비용 분석" defaultOpen={false} summary={calculations ? <span className="flex items-center gap-2"><span className="text-gray-400">대출 {f(calculations.effectiveLoan)}원 · 자기자본 {f(calculations.equityAmount)}원</span><span className="text-blue-600 font-bold">월 {f(calculations.totalMonthlyFinance)}원</span></span> : undefined}>
              {/* 투자 기준 안내 */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">총취득원가</span>
                  <span className="font-black text-gray-800">{f(totalAcquisitionCost || purchasePrice)}원</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">대출한도 (매입가)</span>
                  <span className="font-bold text-gray-700">{f(purchasePrice)}원</span>
                </div>
              </div>

              {/* ① 선택: 조달방식 + LTV */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-bold text-gray-600 shrink-0">조달방식</span>
                {[
                  { val: 'loan', label: '대출100%' },
                  { val: 'equity', label: '자기자본100%' },
                  { val: 'mixed', label: '혼합' },
                ].map(opt => {
                  const current = loanAmount <= 0 ? 'equity' : loanAmount >= purchasePrice ? 'loan' : 'mixed'
                  return (
                    <button key={opt.val}
                      onClick={() => {
                        if (opt.val === 'loan') setLoanAmount(purchasePrice) // 매입가 한도까지
                        else if (opt.val === 'equity') setLoanAmount(0)
                        else setLoanAmount(Math.round(purchasePrice * 0.7))
                      }}
                      className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors
                        ${current === opt.val
                          ? 'bg-steel-600 text-white border-steel-600'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
                {loanAmount > 0 && (
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-xs font-bold text-gray-600 shrink-0">대출비율</span>
                    {[30, 50, 70, 80, 90, 100].map(pct => (
                      <button key={pct}
                        onClick={() => setLoanAmount(Math.round(purchasePrice * pct / 100))}
                        className={`py-0.5 px-2 text-[11px] rounded-lg border font-bold transition-colors
                          ${purchasePrice > 0 && Math.round(loanAmount / purchasePrice * 100) === pct
                            ? 'bg-steel-600 text-white border-steel-600'
                            : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ② 설정 입력 */}
              <div className="space-y-1 mb-3">
                {loanAmount > 0 && (
                  <>
                    <InputRow label="대출 원금" value={loanAmount} onChange={(v: number) => setLoanAmount(Math.min(v, purchasePrice))} sub={`매입가의 ${purchasePrice > 0 ? (loanAmount/purchasePrice*100).toFixed(0) : 0}% (한도: ${f(purchasePrice)}원)`} />
                    <InputRow label="대출 이자율 (연)" value={loanRate} onChange={setLoanRate} suffix="%" type="percent" />
                  </>
                )}
                {calculations && calculations.equityAmount > 0 && (
                  <>
                    <InputRow label="자기자본" value={calculations.equityAmount} onChange={(v: number) => setLoanAmount(Math.max(0, Math.min((totalAcquisitionCost || purchasePrice) - v, purchasePrice)))} sub={`총취득원가의 ${(totalAcquisitionCost || purchasePrice) > 0 ? (calculations.equityAmount / (totalAcquisitionCost || purchasePrice) * 100).toFixed(0) : 0}%${loanAmount < purchasePrice && totalAcquisitionCost > purchasePrice ? ' (부대비용 포함)' : ''}`} />
                    <InputRow label="투자수익률 (연)" value={investmentRate} onChange={setInvestmentRate} suffix="%" type="percent" sub="자기자본 기회비용" />
                  </>
                )}
              </div>

              {/* ③ 상세: 산출 내역 */}
              <div className="bg-gray-50/80 rounded-lg p-3 space-y-0.5 mb-3">
                <div className="flex justify-between text-xs py-0.5 text-gray-400 mb-1">
                  <span>투자 기준: 총취득원가 {f(calculations.costBase)}원</span>
                  <span>대출 한도: 매입가 {f(purchasePrice)}원</span>
                </div>
                {calculations.effectiveLoan > 0 && (
                  <>
                    <div className="flex justify-between text-xs py-0.5"><span className="text-gray-500">대출잔액</span><span className="font-bold text-gray-700">{f(calculations.effectiveLoan)} → {f(calculations.loanEndBalance)} (평균 {f(calculations.avgLoanBalance)})</span></div>
                    <ResultRow label="월 대출이자" value={calculations.monthlyLoanInterest} />
                  </>
                )}
                {calculations.equityAmount > 0 && (
                  <>
                    {calculations.effectiveLoan > 0 && <div className="border-t border-gray-200 my-1" />}
                    <div className="flex justify-between text-xs py-0.5"><span className="text-gray-500">자기자본{totalAcquisitionCost > purchasePrice && loanAmount >= purchasePrice ? ' (부대비용 포함)' : ''}</span><span className="font-bold text-gray-700">{f(calculations.equityAmount)} → {f(calculations.equityEndBalance)} (평균 {f(calculations.avgEquityBalance)})</span></div>
                    <ResultRow label="월 기회비용" value={calculations.monthlyOpportunityCost} />
                  </>
                )}
                <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-200 mt-1">평균잔액법 · 총취득원가 기준 · 대출은 매입가 한도</p>
              </div>

              {/* ④ 결과 */}
              <ResultRow label="총 월 금융비용" value={calculations.totalMonthlyFinance} highlight />
            </Section>

            {/* 4. 보험료 (공제조합) */}
            <Section icon="🛡️" title="보험료 (공제조합)" defaultOpen={false} summary={<span className="flex items-center gap-2">{linkedInsurance ? <span className="text-gray-400">연동</span> : <span className="text-gray-400">자동산출</span>}<span className="text-green-600 font-bold">월 {f(monthlyInsuranceCost)}원</span></span>}>
              {/* ① 선택: 모드 + 연령 — 한 줄 */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs font-bold text-gray-600 shrink-0">산출</span>
                <button onClick={() => setInsAutoMode(true)}
                  className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors ${insAutoMode ? 'bg-steel-600 text-white border-steel-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>🤖 추정</button>
                <button onClick={() => setInsAutoMode(false)}
                  className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors ${!insAutoMode ? 'bg-steel-600 text-white border-steel-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>✏️ 직접</button>
                {linkedInsurance && <span className="text-[11px] text-green-600 font-bold">✅ 연동</span>}
                <span className="w-px h-4 bg-gray-200 mx-0.5" />
                <span className="text-xs font-bold text-gray-600 shrink-0">연령</span>
                {(Object.entries(DRIVER_AGE_FACTORS) as [DriverAgeGroup, typeof DRIVER_AGE_FACTORS[DriverAgeGroup]][]).map(([key, info]) => (
                  <button key={key} onClick={() => setDriverAgeGroup(key)}
                    className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors
                      ${driverAgeGroup === key
                        ? key === '26세이상' ? 'bg-steel-600 text-white border-steel-600'
                          : key === '21세이상' ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-red-500 text-white border-red-500'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    {info.label} <span className="text-[9px] opacity-70">{info.factor > 1.0 ? `+${((info.factor - 1) * 100).toFixed(0)}%` : '기준'}</span>
                  </button>
                ))}
              </div>

              {/* ①-2 자차보장비율 선택 */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs font-bold text-gray-600 shrink-0">자차보장</span>
                {[60, 70, 80, 90, 100].map(v => (
                  <button key={v} onClick={() => setOwnDamageCoverageRatio(v)}
                    className={`py-0.5 px-2 text-[11px] rounded-lg border font-bold transition-colors
                      ${ownDamageCoverageRatio === v
                        ? v <= 70 ? 'bg-green-600 text-white border-green-600'
                          : v <= 90 ? 'bg-steel-600 text-white border-steel-600'
                          : 'bg-orange-500 text-white border-orange-500'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >{v}%</button>
                ))}
                <span className="text-[10px] text-gray-400 ml-1">
                  {ownDamageCoverageRatio < 100 ? `차량가액의 ${ownDamageCoverageRatio}%만 보장 → 보험료 절감` : '전액보장'}
                </span>
              </div>

              {/* ② 직접입력 시 */}
              {!insAutoMode && (
                <div className="mb-3">
                  <InputRow label="월 보험료" value={monthlyInsuranceCost} onChange={setMonthlyInsuranceCost} sub={`연 ${f(monthlyInsuranceCost * 12)}원`} />
                </div>
              )}

              {/* ③ 상세: 산출 내역 */}
              {insAutoMode && insEstimate ? (
                <div className="bg-gray-50/80 rounded-lg p-3 space-y-0.5 mb-3">
                  {insEstimate.breakdown.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-500">{item.label}</span>
                      <span className="font-bold text-gray-700">{f(item.monthly)}원</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 mt-1 pt-1 flex justify-between text-xs">
                    <span className="text-gray-500">기본공제 {f(Math.round(insEstimate.basePremium / 12))}원 + 자차 {f(Math.round(insEstimate.ownDamagePremium / 12))}원</span>
                    <span className="text-[10px] text-gray-400">{insEstimate.vehicleClass} · 연 {f(insEstimate.totalAnnual)}원</span>
                  </div>
                </div>
              ) : insAutoMode ? (
                <div className="bg-gray-50/80 rounded-lg p-3 mb-3">
                  <div className="flex justify-between text-xs"><span className="text-gray-500">{linkedInsurance ? `연동 · 연 ${f(linkedInsurance.premium || 0)}원` : autoInsType ? `기준표 (${autoInsType})` : '직접 입력'}</span></div>
                </div>
              ) : null}

              {/* 면책금 & 리스크 — 선택 영역 (보험료 산출에 영향) */}
              <div className="border-t mt-3 pt-2 mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-gray-600 shrink-0">면책금</span>
                  {[0, 300000, 500000, 1000000, 1500000, 2000000].map(v => (
                    <button key={v} onClick={() => setDeductible(v)}
                      className={`py-0.5 px-1.5 text-[11px] rounded-lg border font-bold transition-colors
                        ${deductible === v ? v === 0 ? 'bg-steel-500 text-white border-steel-500' : 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >{v === 0 ? '완전자차' : `${v / 10000}만`}</button>
                  ))}
                  <span className="w-px h-4 bg-gray-200 mx-0.5" />
                  <span className="text-xs font-bold text-gray-600 shrink-0">리스크 적립</span>
                  {[{ val: 0, label: '0%' }, { val: 0.3, label: '0.3%' }, { val: 0.5, label: '0.5%' }, { val: 0.8, label: '0.8%' }, { val: 1.0, label: '1.0%' }].map(opt => (
                    <button key={opt.val} onClick={() => setRiskRate(opt.val)}
                      className={`py-0.5 px-1.5 text-[11px] rounded-lg border font-bold transition-colors
                        ${riskRate === opt.val ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* ④ 결과: 리스크 적립 → 월 보험료(최종) */}
              <div className="space-y-1.5 mt-3">
                <div className="flex justify-between items-center py-2 px-3 bg-red-50 rounded-lg">
                  <span className="text-xs text-red-600">면책 {f(deductible)}원 · 적립률 {riskRate}%</span>
                  <span className="font-black text-sm text-red-600">월 적립 {f(calculations.monthlyRiskReserve)}원</span>
                </div>
                <ResultRow label="월 보험료" value={monthlyInsuranceCost} highlight />
              </div>
            </Section>

            {/* 4-2. 자동차세 */}
            <Section icon="🏛️" title={`자동차세 (${selectedCar?.is_commercial === false ? '비영업용' : '영업용'})`} defaultOpen={false} summary={calculations ? <span className="flex items-center gap-2"><span className="text-gray-400">{engineCC || 0}cc</span><span className="text-purple-600 font-bold">월 {f(calculations.monthlyTax)}원</span></span> : undefined}>
              {/* ① 입력 */}
              <div className="space-y-1 mb-3">
                <InputRow label="배기량" value={engineCC} onChange={(v) => {
                  setEngineCC(v)
                  const fuelCat = selectedCar?.fuel_type?.includes('전기') ? '전기' : '내연기관'
                  const isComm = selectedCar?.is_commercial !== false
                  const taxTypeKey = isComm ? '영업용' : '비영업용'
                  const tr = taxRates.find(r => r.tax_type === taxTypeKey && r.fuel_category === fuelCat && v >= r.cc_min && v <= r.cc_max)
                  let tax = 0
                  if (tr) {
                    tax = tr.fixed_annual > 0 ? tr.fixed_annual : Math.round(v * tr.rate_per_cc)
                    tax = Math.round(tax * (1 + tr.education_tax_rate / 100))
                  } else if (fuelCat === '전기') {
                    tax = isComm ? 20000 : Math.round(130000 * 1.3) // 전기차 고정세액
                  } else if (isComm) {
                    tax = v * 18 // 영업용 내연기관 fallback
                  } else {
                    if (v <= 1000) tax = v * 80; else if (v <= 1600) tax = v * 140; else tax = v * 200
                    tax = Math.round(tax * 1.3) // 비영업용 내연기관 + 교육세 30%
                  }
                  setAnnualTax(tax)
                }} suffix="cc" />
                <InputRow label="연간 자동차세" value={annualTax} onChange={setAnnualTax} sub={`${selectedCar?.is_commercial === false ? '비영업용' : '영업용'} 세율`} />
              </div>
              {/* ② 결과 */}
              <ResultRow label="월 자동차세" value={calculations.monthlyTax} highlight />
            </Section>

            {/* 5. 정비 상품 */}
            <Section icon="🔧" title="정비 상품" defaultOpen={false} summary={<span className="flex items-center gap-2"><span className="text-gray-400">{MAINTENANCE_PACKAGES[maintPackage].icon} {MAINTENANCE_PACKAGES[maintPackage].label}</span><span className="text-amber-600 font-bold">월 {f(monthlyMaintenance)}원</span></span>}>
              {/* ① 선택: 패키지 + 오일교환 */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs font-bold text-gray-600 shrink-0">상품</span>
                {(Object.entries(MAINTENANCE_PACKAGES) as [MaintenancePackage, typeof MAINTENANCE_PACKAGES[MaintenancePackage]][]).map(([key, pkg]) => {
                  const isEV = autoMaintType === '전기차'
                  const disabled = isEV && key === 'oil_only'
                  return (
                    <button key={key}
                      onClick={() => {
                        if (disabled) return
                        setMaintPackage(key)
                        const multiplier = MAINT_MULTIPLIER[autoMaintType] || 1.0
                        const oilAdj = key === 'oil_only' && oilChangeFreq === 2 ? 1.8 : 1.0
                        setMonthlyMaintenance(Math.round(pkg.monthly * multiplier * oilAdj))
                      }}
                      className={`py-1 px-2.5 rounded-lg border font-bold text-xs transition-all ${
                        disabled ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : maintPackage === key ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-gray-200 text-gray-500 hover:border-amber-300 bg-white'
                      }`}
                    >
                      <span>{pkg.icon}</span>
                      <span className="ml-0.5">{pkg.label}</span>
                      {disabled && <span className="text-[9px] text-red-400 ml-1">불가</span>}
                    </button>
                  )
                })}
                {maintPackage === 'oil_only' && (
                  <>
                    <span className="w-px h-4 bg-gray-200 mx-0.5" />
                    <span className="text-xs font-bold text-gray-600 shrink-0">교환주기</span>
                    {([1, 2] as const).map(freq => (
                      <button key={freq}
                        onClick={() => {
                          setOilChangeFreq(freq)
                          const multiplier = MAINT_MULTIPLIER[autoMaintType] || 1.0
                          const oilAdj = freq === 2 ? 1.8 : 1.0
                          setMonthlyMaintenance(Math.round(MAINTENANCE_PACKAGES.oil_only.monthly * multiplier * oilAdj))
                        }}
                        className={`py-1 px-2.5 rounded-lg border font-bold text-xs transition-all ${
                          oilChangeFreq === freq ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:border-amber-300'
                        }`}
                      >연 {freq}회</button>
                    ))}
                  </>
                )}
              </div>

              {/* ② 상세: 포함 항목 + 수동입력 */}
              <div className="bg-gray-50/80 rounded-lg p-3 mb-3">
                {maintPackage !== 'self' ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                    {MAINT_ITEMS.map((item, idx) => {
                      const isEV = autoMaintType === '전기차'
                      if (isEV && item.evExclude) return null
                      const included = item.packages.includes(maintPackage)
                      return (
                        <span key={idx} className={`text-[11px] ${included ? 'text-green-700 font-medium' : 'text-gray-300'}`}>
                          {included ? '✓' : '·'} {item.name}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 mb-2">🙋 고객 직접 정비 · 렌트가 미포함</p>
                )}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                  <InputRow label="월 정비비" value={monthlyMaintenance} onChange={setMonthlyMaintenance} />
                  {autoMaintType && <span className="text-[10px] text-gray-400 shrink-0">{autoMaintType} ×{MAINT_MULTIPLIER[autoMaintType] || 1.0}</span>}
                </div>
              </div>

              {/* ③ 결과 */}
              <div className="flex items-center justify-between py-2 px-3 bg-amber-50 rounded-lg">
                <span className="font-bold text-xs text-amber-700">{MAINTENANCE_PACKAGES[maintPackage].icon} {MAINTENANCE_PACKAGES[maintPackage].label}</span>
                <span className="font-black text-sm text-amber-700">{f(monthlyMaintenance)}원<span className="text-[10px] font-normal text-amber-500">/월</span> <span className="text-[10px] text-gray-400 font-normal">{termMonths}개월 = {f(monthlyMaintenance * termMonths)}원</span></span>
              </div>
            </Section>

            {/* 면책금 & 리스크 → 보험 섹션으로 이동됨 */}

            {/* 7. 보증금 & 선납금 */}
            <Section icon="💰" title="보증금 & 선납금 효과" defaultOpen={false} summary={calculations && calculations.totalDiscount > 0 ? <span className="text-green-600 font-bold">월 -{f(calculations.totalDiscount)}원</span> : <span className="text-gray-400">미설정</span>}>
              {/* ① 선택: 보증금 */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-600 shrink-0 w-12">보증금</span>
                  <input type="text" inputMode="numeric"
                    className="w-12 text-center border border-gray-200 rounded-lg px-1 py-1 text-xs font-bold focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                    value={purchasePrice > 0 ? Math.round(deposit / purchasePrice * 100) : 0}
                    onChange={(e) => { setDeposit(Math.round(purchasePrice * (parseInt(e.target.value) || 0) / 100)) }}
                  />
                  <span className="text-[11px] text-gray-400">%</span>
                  <input type="text"
                    className="flex-1 text-right border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                    value={f(deposit)} onChange={(e) => setDeposit(parseNum(e.target.value))}
                  />
                  <span className="text-[11px] text-gray-400">원</span>
                  {deposit > 0 && <span className="text-[10px] text-green-600 font-bold ml-1">→ 월 -{f(calculations.monthlyDepositDiscount)}원</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-600 shrink-0 w-12">할인률</span>
                  {[0.3, 0.4, 0.5, 0.6, 0.8].map(r => (
                    <button key={r} onClick={() => setDepositDiscountRate(r)}
                      className={`py-0.5 px-2 text-[11px] rounded-lg border font-bold transition-colors
                        ${depositDiscountRate === r ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                    >{r}%</button>
                  ))}
                </div>
              </div>
              {/* ② 선택: 선납금 */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-xs font-bold text-gray-600 shrink-0 w-12">선납금</span>
                <input type="text"
                  className="flex-1 text-right border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                  value={f(prepayment)} onChange={(e) => setPrepayment(parseNum(e.target.value))}
                />
                <span className="text-[11px] text-gray-400">원</span>
                {prepayment > 0 && <span className="text-[10px] text-green-600 font-bold ml-1">→ 월 -{f(calculations.monthlyPrepaymentDiscount)}원 ({termMonths}개월)</span>}
              </div>
              {/* ② 결과 */}
              {calculations.totalDiscount > 0 && (
                <div className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-lg">
                  <span className="font-bold text-xs text-green-700">총 월 할인</span>
                  <span className="font-black text-sm text-green-700">-{f(calculations.totalDiscount)}원</span>
                </div>
              )}
            </Section>

            {/* 8. 시장 비교 */}
            <Section icon="📊" title="시중 동일유형 렌트가 비교" defaultOpen={false} summary={calculations && calculations.marketAvg > 0 ? <span className="flex items-center gap-2"><span className="text-gray-400">시장평균 {f(calculations.marketAvg)}원</span><span className={`font-bold ${calculations.marketDiff > 0 ? 'text-red-500' : 'text-green-600'}`}>{calculations.marketDiff > 0 ? '+' : ''}{calculations.marketDiff.toFixed(1)}%</span></span> : <span className="text-gray-400">{marketComps.length}건</span>}>
              <div className="space-y-3">
                {/* 등록된 비교 데이터 */}
                {marketComps.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="p-2 text-left">경쟁사</th>
                          <th className="p-2 text-left">차량정보</th>
                          <th className="p-2 text-right">월 렌트</th>
                          <th className="p-2 text-right">보증금</th>
                          <th className="p-2 text-center">기간</th>
                          <th className="p-2 text-center">삭제</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {marketComps.map((comp, idx) => (
                          <tr key={comp.id || idx} className="hover:bg-gray-50">
                            <td className="p-2 font-bold">{comp.competitor_name}</td>
                            <td className="p-2 text-gray-600">{comp.vehicle_info}</td>
                            <td className="p-2 text-right font-bold">{f(comp.monthly_rent)}원</td>
                            <td className="p-2 text-right text-gray-500">{f(comp.deposit)}원</td>
                            <td className="p-2 text-center text-gray-500">{comp.term_months}개월</td>
                            <td className="p-2 text-center">
                              <button onClick={() => comp.id && removeMarketComp(comp.id)}
                                className="text-red-400 hover:text-red-600 text-xs font-bold">삭제</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 새 비교 추가 — 인라인 */}
                <div className="flex gap-1.5 items-center flex-wrap">
                  <input placeholder="경쟁사" className="px-2 py-1 border border-gray-200 rounded-lg text-xs w-24 font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                    value={newComp.competitor_name}
                    onChange={e => setNewComp({ ...newComp, competitor_name: e.target.value })} />
                  <input placeholder="차량" className="px-2 py-1 border border-gray-200 rounded-lg text-xs w-28 font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                    value={newComp.vehicle_info}
                    onChange={e => setNewComp({ ...newComp, vehicle_info: e.target.value })} />
                  <input placeholder="월렌트(원)" className="px-2 py-1 border border-gray-200 rounded-lg text-xs text-right w-24 font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                    value={newComp.monthly_rent || ''}
                    onChange={e => setNewComp({ ...newComp, monthly_rent: parseNum(e.target.value) })} />
                  <button onClick={addMarketComp}
                    className="bg-steel-600 text-white rounded-lg font-bold text-xs px-2.5 py-1 hover:bg-steel-700">추가</button>
                </div>

                {/* 시장 평균 비교 — 결과 */}
                {calculations.marketAvg > 0 && (
                  <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${calculations.marketDiff > 10 ? 'bg-red-50' : calculations.marketDiff < -5 ? 'bg-green-50' : 'bg-steel-50'}`}>
                    <span className="text-xs text-gray-500">시장평균 {f(calculations.marketAvg)}원 vs 내 가격 {f(calculations.rentWithVAT)}원</span>
                    <span className={`font-black text-sm ${calculations.marketDiff > 10 ? 'text-red-600' : calculations.marketDiff < -5 ? 'text-green-600' : 'text-steel-600'}`}>
                      {calculations.marketDiff > 0 ? '+' : ''}{calculations.marketDiff.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </Section>

          </div>

          {/* ===== 오른쪽: 계약조건 + 최종 렌트가 산출 ===== */}
          <div className="lg:col-span-4">
            <div className="sticky top-2 space-y-2">

              {/* 계약 조건 설정 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-3 py-2.5">
                {/* 견적 프리셋 */}
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 mb-2">⚡ 빠른 설정</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: '💰 최저가', desc: '원가 수준',
                        preset: { termMonths: 60, margin: 0, contractType: 'return' as const, maintPackage: 'self' as any, annualMileage: 2, deposit: 0, prepayment: 0 } },
                      { label: '⭐ 표준', desc: '소폭 마진',
                        preset: { termMonths: 36, margin: 50000, contractType: 'return' as const, maintPackage: 'self' as any, annualMileage: 2, deposit: 0, prepayment: 0 } },
                      { label: '🏢 법인', desc: '정비포함',
                        preset: { termMonths: 48, margin: 50000, contractType: 'return' as const, maintPackage: 'basic' as any, annualMileage: 2.5, deposit: 0, prepayment: 0 } },
                      { label: '🔑 인수형', desc: '소유권 확보',
                        preset: { termMonths: 48, margin: 0, contractType: 'buyout' as const, maintPackage: 'self' as any, annualMileage: 2, deposit: 0, prepayment: 0 } },
                    ].map(p => (
                      <button key={p.label}
                        onClick={() => {
                          setTermMonths(p.preset.termMonths)
                          setMargin(p.preset.margin)
                          setContractType(p.preset.contractType)
                          setMaintPackage(p.preset.maintPackage)
                          // 정비 패키지에 맞는 월 정비비 동기화
                          const multiplier = MAINT_MULTIPLIER[autoMaintType] || 1.0
                          const oilAdj = p.preset.maintPackage === 'oil_only' && oilChangeFreq === 2 ? 1.8 : 1.0
                          setMonthlyMaintenance(Math.round(MAINTENANCE_PACKAGES[p.preset.maintPackage as MaintenancePackage]?.monthly * multiplier * oilAdj || 0))
                          setAnnualMileage(p.preset.annualMileage)
                          setDeposit(p.preset.deposit)
                          setPrepayment(p.preset.prepayment)
                        }}
                        className="text-left px-2.5 py-2 rounded-xl border border-gray-200 hover:border-steel-300 hover:bg-steel-50/50 transition-colors group">
                        <span className="text-xs font-bold text-gray-700 group-hover:text-steel-700">{p.label}</span>
                        <span className="block text-[10px] text-gray-400">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 계약기간 */}
                <div className="mb-2">
                  <p className="text-[11px] font-bold text-gray-400 mb-1">계약기간</p>
                  <div className="flex gap-1">
                    {[12, 24, 36, 48, 60].map(t => (
                      <button key={t}
                        onClick={() => {
                          setTermMonths(t)
                          const rateRecord = financeRates.find(r =>
                            r.finance_type === '캐피탈대출' &&
                            t >= r.term_months_min && t <= r.term_months_max
                          )
                          if (rateRecord) setLoanRate(Number(rateRecord.annual_rate))
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                          ${termMonths === t
                            ? 'bg-steel-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >
                        {t}개월
                      </button>
                    ))}
                  </div>
                </div>
                {/* 계약유형 + 목표마진 — 2열 */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 mb-1">계약유형</p>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setContractType('return')}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors
                          ${contractType === 'return'
                            ? 'bg-steel-600 text-white border-steel-600'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-steel-300'}`}
                      >
                        반납형
                      </button>
                      <button
                        onClick={() => setContractType('buyout')}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors
                          ${contractType === 'buyout'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300'}`}
                      >
                        인수형
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 mb-1">목표마진</p>
                    <div className="flex gap-1">
                      {[10, 15, 20, 30].map(m => (
                        <button key={m}
                          onClick={() => setMargin(m * 10000)}
                          className={`flex-1 py-1.5 text-xs rounded-lg border font-bold transition-colors
                            ${margin === m * 10000
                              ? 'bg-steel-600 text-white border-steel-600'
                              : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                        >
                          {m}만
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* 마진 직접입력 */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 shrink-0">직접입력</span>
                  <input
                    type="number"
                    value={margin}
                    onChange={(e) => setMargin(Math.max(0, parseInt(e.target.value) || 0))}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-right focus:border-steel-500 outline-none"
                  />
                  <span className="text-xs text-gray-400 shrink-0">원</span>
                </div>
                {/* 인수형 전용 */}
                {contractType === 'buyout' && (
                  <div className="mt-2 p-2 rounded-xl border bg-amber-50/50 border-amber-200/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-gray-500">🏷️ 인수가격</span>
                      <div className="flex gap-1">
                        {[90, 100, 110, 120, 130].map(r => (
                          <button key={r}
                            onClick={() => setResidualRate(r)}
                            className={`px-1.5 py-0.5 text-[11px] rounded border font-bold
                              ${residualRate === r
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'border-gray-200 text-gray-400 hover:bg-gray-100'}`}
                          >
                            {r}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400 shrink-0">직접입력</span>
                      <input
                        type="number"
                        min="50" max={150} step="1"
                        value={residualRate}
                        onChange={(e) => setResidualRate(Math.max(50, Math.min(150, parseInt(e.target.value) || 100)))}
                        className="w-14 text-center border border-gray-200 rounded px-1 py-1 text-xs font-bold focus:border-amber-500 outline-none"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                    {calculations && (
                      <div className="mt-1.5 pt-1.5 border-t border-amber-100 space-y-0.5 text-xs">
                        <div className="flex justify-between"><span className="text-gray-400">추정시세</span><span className="font-bold text-gray-600">{f(calculations.endMarketValue)}원</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">인수가</span><span className="font-bold text-amber-600">{f(calculations.residualValue)}원</span></div>
                        <div className="flex justify-between"><span className="text-gray-400">감가대상</span><span className="font-bold text-red-500">{f(Math.max(0, calculations.costBase - calculations.residualValue))}원</span></div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 선택 차량 정보 */}
              {selectedCar && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
                  <div className="flex items-center gap-3">
                    {selectedCar.image_url ? (
                      <img src={selectedCar.image_url} alt="" className="w-16 h-12 object-cover rounded-lg bg-gray-100" />
                    ) : (
                      <div className="w-16 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300 text-lg">🚗</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-900 truncate">{selectedCar.brand} {selectedCar.model}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {selectedCar.trim && <span>{selectedCar.trim} · </span>}
                        {selectedCar.year && <span>{selectedCar.year}년 · </span>}
                        {selectedCar.fuel && <span>{selectedCar.fuel} · </span>}
                        {selectedCar.engine_cc ? `${selectedCar.engine_cc.toLocaleString()}cc` : ''}
                      </p>
                    </div>
                    {selectedCar.number && (
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md shrink-0">{selectedCar.number}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-100">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">출고가</p>
                      <p className="text-xs font-bold text-gray-700">{f(factoryPrice)}원</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">매입가</p>
                      <p className="text-xs font-bold text-gray-700">{f(purchasePrice)}원</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">할인율</p>
                      <p className="text-xs font-bold text-green-600">{factoryPrice > 0 ? ((factoryPrice - purchasePrice) / factoryPrice * 100).toFixed(1) : 0}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 렌트가 산출 결과 */}
              <div className="bg-gray-950 text-white rounded-2xl shadow-2xl px-4 py-3 flex flex-col">
                {/* 헤더 */}
                <div className="flex items-center justify-between border-b border-gray-700 pb-2 mb-2.5">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">렌트가 산출</p>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold
                    ${contractType === 'return' ? 'bg-steel-600/30 text-steel-300' : 'bg-amber-500/30 text-amber-300'}`}>
                    {contractType === 'return' ? '반납' : '인수'} {termMonths}개월
                  </span>
                </div>

                {/* 원가 기준 */}
                <div className="pb-2 mb-2 border-b border-gray-800">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">{calculations.isUsedCar ? '중고차 원가' : '취득원가'}</span>
                    <span className="font-bold text-gray-300">{f(calculations.costBase)}원</span>
                  </div>
                  {calculations.isUsedCar && (
                    <div className="flex justify-between text-xs mt-0.5">
                      <span className="text-gray-600">잔존가</span>
                      <span className="font-bold text-gray-400">{f(calculations.effectiveEndMarketValue)}원</span>
                    </div>
                  )}
                </div>

                {/* 원가 항목 — 2컬럼 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
                  <div className="flex justify-between"><span className="text-gray-500">감가</span><span className="font-bold">{f(calculations.monthlyDepreciation)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">금융</span><span className="font-bold">{f(calculations.totalMonthlyFinance)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">보험</span><span className="font-bold">{f(monthlyInsuranceCost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">세금</span><span className="font-bold">{f(calculations.monthlyTax)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">정비</span><span className="font-bold">{f(monthlyMaintenance)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">리스크</span><span className="font-bold">{f(calculations.monthlyRiskReserve)}</span></div>
                  {calculations.monthlyInspectionCost > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">검사</span><span className="font-bold">{f(calculations.monthlyInspectionCost)}</span></div>
                  )}
                  {calculations.totalDiscount > 0 && (
                    <div className="flex justify-between text-green-400"><span>할인</span><span className="font-bold">-{f(calculations.totalDiscount)}</span></div>
                  )}
                </div>

                {/* 원가 비중 바 */}
                <div className="h-1.5 rounded-full overflow-hidden flex mb-2">
                  {(() => {
                    const total = calculations.totalMonthlyCost + calculations.totalDiscount
                    if (total <= 0) return null
                    const items = [
                      { v: calculations.monthlyDepreciation, c: 'bg-red-500' },
                      { v: calculations.totalMonthlyFinance, c: 'bg-steel-500' },
                      { v: monthlyInsuranceCost + calculations.monthlyTax, c: 'bg-purple-500' },
                      { v: monthlyMaintenance, c: 'bg-amber-500' },
                      { v: calculations.monthlyRiskReserve, c: 'bg-red-400' },
                    ]
                    return items.map((it, i) => (
                      <div key={i} className={`${it.c}`} style={{ width: `${Math.max(it.v / total * 100, 0)}%` }} />
                    ))
                  })()}
                </div>

                {/* 합계 */}
                <div className="border-t border-gray-700 pt-2 mb-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-red-400 font-bold">월 원가</span>
                    <span className="text-red-400 font-bold">{f(calculations.totalMonthlyCost)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-400 font-bold">+ 마진</span>
                    <span className="text-yellow-400 font-bold">{f(margin)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">공급가액</span>
                    <span className="font-bold text-gray-200">{f(calculations.suggestedRent)}원</span>
                  </div>
                </div>

                {/* 최종가 */}
                <div className="bg-gray-900 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-yellow-400 font-bold mb-0.5">최종 월 렌트가 (VAT 포함)</p>
                  <p className="text-xl font-black tracking-tight">
                    {f(calculations.rentWithVAT)}<span className="text-sm ml-1">원</span>
                  </p>
                  {contractType === 'buyout' && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-700 space-y-0.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-amber-400">인수가</span>
                        <span className="font-bold text-amber-400">{f(calculations.buyoutPrice)}원</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">총납입+인수</span>
                        <span className="font-bold text-gray-400">{f(calculations.rentWithVAT * termMonths + deposit + calculations.buyoutPrice)}원</span>
                      </div>
                    </div>
                  )}
                  {contractType === 'return' && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex justify-between text-xs text-gray-500">
                      <span>반납 시 회수가</span>
                      <span className="font-bold text-gray-400">{f(calculations.residualValue)}원</span>
                    </div>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700">
                  <button onClick={handleGoToCustomerStep}
                    className="flex-1 bg-white text-black font-black py-1.5 rounded-lg hover:bg-gray-200 transition-colors text-xs whitespace-nowrap">
                    견적서 작성 →
                  </button>
                  <button onClick={handleSaveWorksheet} disabled={saving}
                    className="flex-1 bg-gray-800 text-gray-300 font-bold py-1.5 rounded-lg hover:bg-gray-700 transition-colors text-xs disabled:opacity-50 whitespace-nowrap">
                    {saving ? '저장 중...' : '워크시트 저장'}
                  </button>
                </div>
              </div>

              {/* 수익성 요약 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-3 py-2.5">
                <h3 className="font-bold text-gray-700 mb-2 text-xs flex items-center gap-2">
                  <span className="w-1 h-3 bg-green-500 rounded-full"></span>
                  수익성 요약
                </h3>
                {/* 핵심 지표 */}
                <div className="space-y-1 mb-2">
                  <div className="bg-green-50 rounded px-2.5 py-1 border border-green-100 flex items-center justify-between">
                    <span className="text-xs text-green-600 font-bold">월 순이익</span>
                    <span className="text-xs font-black text-green-700">{f(margin)}원</span>
                  </div>
                  <div className="bg-green-50 rounded px-2.5 py-1 border border-green-100 flex items-center justify-between">
                    <span className="text-xs text-green-600 font-bold">계약기간 총이익</span>
                    <span className="text-xs font-black text-green-800">{f(margin * termMonths)}원</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="bg-steel-50 rounded px-2.5 py-1 border border-steel-100 flex items-center justify-between">
                      <span className="text-xs text-steel-500 font-bold">마진율</span>
                      <span className="text-xs font-black text-steel-700">{calculations.suggestedRent > 0 ? (margin / calculations.suggestedRent * 100).toFixed(1) : 0}%</span>
                    </div>
                    <div className="bg-steel-50 rounded px-2.5 py-1 border border-steel-100 flex items-center justify-between">
                      <span className="text-xs text-steel-500 font-bold">연 ROI</span>
                      <span className="text-xs font-black text-steel-700">{purchasePrice > 0 ? ((margin * 12) / purchasePrice * 100).toFixed(1) : 0}%</span>
                    </div>
                  </div>
                  {/* IRR 투자수익률 분석 */}
                  {calculations.irrResult && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)', border: '1px solid #bfdbfe' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 13 }}>📈</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#1e40af' }}>투자 IRR 분석</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #dbeafe', textAlign: 'center' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', margin: 0 }}>연 IRR</p>
                          <p style={{ fontSize: 18, fontWeight: 900, color: calculations.irrResult.annualIRR >= 0 ? '#059669' : '#dc2626', margin: '2px 0 0', lineHeight: 1.1 }}>
                            {calculations.irrResult.annualIRR.toFixed(1)}%
                          </p>
                        </div>
                        <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #dbeafe', textAlign: 'center' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', margin: 0 }}>투자배수</p>
                          <p style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8', margin: '2px 0 0', lineHeight: 1.1 }}>
                            {calculations.irrResult.multiple.toFixed(2)}x
                          </p>
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>월 IRR</span>
                          <span style={{ fontWeight: 700, color: '#374151' }}>{calculations.irrResult.monthlyIRR.toFixed(3)}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>총 투자수익</span>
                          <span style={{ fontWeight: 700, color: calculations.irrResult.totalReturn >= 0 ? '#059669' : '#dc2626' }}>{calculations.irrResult.totalReturn >= 0 ? '+' : ''}{f(calculations.irrResult.totalReturn)}원</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 계약 유형별 수익 분석 */}
                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100 space-y-1 text-xs">
                  <p className="text-[11px] font-bold text-gray-400 mb-0.5">
                    {contractType === 'return' ? '🔄 반납형' : '🏷️ 인수형'} 수익 분석
                  </p>
                  {contractType === 'return' ? (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">렌트료 수입</span><span className="font-bold text-gray-700">{f(calculations.rentWithVAT * termMonths)}원</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">반납 회수가</span><span className="font-bold text-steel-600">{f(calculations.residualValue)}원</span></div>
                      <div className="flex justify-between border-t border-gray-200 pt-1"><span className="text-gray-700 font-bold">총 회수</span><span className="font-black text-green-600">{f(calculations.rentWithVAT * termMonths + calculations.residualValue)}원</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">원가대비</span><span className="font-bold text-steel-600">{calculations.costBase > 0 ? (((calculations.rentWithVAT * termMonths + calculations.residualValue) / calculations.costBase) * 100).toFixed(1) : 0}%</span></div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between"><span className="text-amber-500">인수가격</span><span className="font-bold text-amber-600">{f(calculations.buyoutPrice)}원</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">렌트료 수입</span><span className="font-bold text-gray-700">{f(calculations.rentWithVAT * termMonths)}원</span></div>
                      <div className="flex justify-between border-t border-gray-200 pt-1"><span className="text-gray-700 font-bold">고객 총 지불</span><span className="font-bold text-gray-700">{f(calculations.rentWithVAT * termMonths + deposit + calculations.buyoutPrice)}원</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">인수 차익</span><span className={`font-bold ${calculations.buyoutPrice >= calculations.endMarketValue ? 'text-green-600' : 'text-red-500'}`}>{calculations.buyoutPrice >= calculations.endMarketValue ? '+' : ''}{f(calculations.buyoutPrice - calculations.endMarketValue)}원</span></div>
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  )
}
