'use client'

import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

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
  mileage?: number
  purchase_price: number
  factory_price?: number
  engine_cc?: number
  image_url?: string
  status: string
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
const EV_FUEL_KEYWORDS = ['전기', 'EV', 'Electric', 'BEV']
// 전기차 판별: 모델명 기반 키워드 (정확한 모델명만)
const EV_MODEL_KEYWORDS = ['EV6', 'EV9', '아이오닉', 'IONIQ', 'EQE', 'EQS', 'EQA', 'EQB',
  'iX', 'i4', 'i5', 'i7', 'E-TRON', 'Q8 E-TRON', 'ID.3', 'ID.4',
  'MODEL 3', 'MODEL Y', 'MODEL S', 'MODEL X', '모델3', '모델Y', '모델S', '모델X',
  'KONA ELECTRIC', '코나 일렉트릭', 'NIRO EV', '니로 EV', 'BOLT', '볼트']
const HEV_KEYWORDS = ['하이브리드', 'HEV', 'PHEV', 'Hybrid']

// 차량 데이터 → 잔가율 카테고리 자동 매핑
function mapToDepCategory(brand: string, model: string, fuelType?: string, purchasePrice?: number): string {
  const b = (brand || '').toUpperCase()
  const m = (model || '').toUpperCase()
  const f = (fuelType || '').toUpperCase()
  const isImport = IMPORT_BRANDS.some(ib => b.includes(ib.toUpperCase()))
  const isEV = EV_FUEL_KEYWORDS.some(k => f.includes(k.toUpperCase())) || EV_MODEL_KEYWORDS.some(k => m.includes(k.toUpperCase()))
  const isHEV = HEV_KEYWORDS.some(k => m.includes(k.toUpperCase()) || f.includes(k.toUpperCase()))
  const isPremium = PREMIUM_MODELS.some(pm => m.includes(pm.toUpperCase()))

  if (isEV && isImport) return '전기차 수입'
  if (isEV) return '전기차 국산'
  if (isHEV) return '하이브리드'
  if (isImport && isPremium) return '수입 프리미엄'
  if (isImport) {
    const price = purchasePrice || 0
    if (price >= 80000000) return '수입 대형 세단'
    if (m.includes('SUV') || m.includes('GLC') || m.includes('X3') || m.includes('X5') || m.includes('Q5') || m.includes('Q7'))
      return '수입 중형 SUV'
    return '수입 중형 세단'
  }
  // 국산차
  if (m.includes('팰리세이드') || m.includes('쏘렌토') || m.includes('모하비') || m.includes('EV9'))
    return '국산 대형 SUV'
  if (m.includes('투싼') || m.includes('스포티지') || m.includes('싼타페') || m.includes('SANTA'))
    return '국산 중형 SUV'
  if (m.includes('셀토스') || m.includes('코나') || m.includes('XM3') || m.includes('트랙스'))
    return '국산 소형 SUV'
  if (m.includes('카니발') || m.includes('스타리아') || m.includes('CARNIVAL') || m.includes('STARIA'))
    return '국산 MPV/미니밴'
  if (m.includes('모닝') || m.includes('레이') || m.includes('캐스퍼') || m.includes('MORNING') || m.includes('RAY'))
    return '국산 경차'
  if (m.includes('그랜저') || m.includes('K8') || m.includes('GRANDEUR'))
    return '국산 중형 세단'
  if (m.includes('제네시스') || m.includes('GENESIS'))
    return '국산 대형 세단'
  if (m.includes('쏘나타') || m.includes('K5') || m.includes('SONATA'))
    return '국산 준중형 세단'
  if (m.includes('아반떼') || m.includes('K3') || m.includes('AVANTE'))
    return '국산 소형 세단'
  // 폴백: 가격 기준
  const price = purchasePrice || 0
  if (price < 20000000) return '국산 경차'
  if (price < 35000000) return '국산 준중형 세단'
  if (price < 50000000) return '국산 중형 세단'
  return '국산 대형 SUV'
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

// 연간 기본 공제료 (공제조합 영업용 기준, 대인II+대물1억+자손+무보험)
// 렌터카 공제조합은 일반 보험사 대비 30~40% 저렴 (영업용 단체요율)
const INS_BASE_ANNUAL: Record<InsVehicleClass, number> = {
  '경형': 350000,   // 월 ~2.9만
  '소형': 480000,   // 월 ~4만
  '중형': 620000,   // 월 ~5.2만
  '대형': 780000,   // 월 ~6.5만
  '수입': 980000,   // 월 ~8.2만
}

// 자차보험 연간 요율 (차량가 대비 %)
// 공제조합 영업용 자차 실무 요율 (일반 보험사 대비 약 40% 저렴)
const INS_OWN_DAMAGE_RATE: Record<InsVehicleClass, number> = {
  '경형': 2.0,   // 차량가 × 2.0%
  '소형': 2.3,
  '중형': 2.6,
  '대형': 3.0,
  '수입': 4.2,   // 수입차 부품비 반영
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

  // 기본 공제료 = 기본요율 × 연령계수 × 차령계수
  const basePremium = Math.round(INS_BASE_ANNUAL[vehicleClass] * ageFactor * carAgeFactor)

  // 자차보험 = 출고가 × 차종별 요율% × 면책금할인 × 연령계수 × 차령계수
  const ownDamageRate = INS_OWN_DAMAGE_RATE[vehicleClass] / 100
  const vehicleValue = params.factoryPrice > 0 ? params.factoryPrice : params.purchasePrice
  const ownDamagePremium = Math.round(
    vehicleValue * ownDamageRate * deductibleDiscount * ageFactor * carAgeFactor
  )

  const totalAnnual = basePremium + ownDamagePremium
  const totalMonthly = Math.round(totalAnnual / 12)

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
      { label: '대인배상 II', annual: Math.round(basePremium * 0.35), monthly: Math.round(basePremium * 0.35 / 12) },
      { label: '대물배상 (1억)', annual: Math.round(basePremium * 0.30), monthly: Math.round(basePremium * 0.30 / 12) },
      { label: '자기신체사고', annual: Math.round(basePremium * 0.20), monthly: Math.round(basePremium * 0.20 / 12) },
      { label: '무보험차상해', annual: Math.round(basePremium * 0.15), monthly: Math.round(basePremium * 0.15 / 12) },
      { label: `자차손해 (면책 ${(params.deductible / 10000).toFixed(0)}만)`, annual: ownDamagePremium, monthly: Math.round(ownDamagePremium / 12) },
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
// 초과주행 km당 추가요금 fallback
const getExcessMileageRateFallback = (fp: number): number => {
  if (fp < 25000000) return 110; if (fp < 40000000) return 150
  if (fp < 60000000) return 200; if (fp < 80000000) return 250
  if (fp < 120000000) return 320; return 450
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
type DepCurvePreset = 'conservative' | 'standard' | 'optimistic' | 'custom'

const DEP_CURVE_PRESETS: Record<Exclude<DepCurvePreset, 'custom'>, {
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

// 차종 클래스별 감가 보정 계수 (1.0 = 표준 기준)
const DEP_CLASS_MULTIPLIER: Record<string, { label: string; mult: number }> = {
  '국산 경차':        { label: '국산 경차', mult: 1.05 },
  '국산 소형 세단':    { label: '국산 소형 세단', mult: 0.95 },
  '국산 준중형 세단':   { label: '국산 준중형 세단', mult: 0.90 },
  '국산 중형 세단':    { label: '국산 중형 세단', mult: 1.0 },
  '국산 대형 세단':    { label: '국산 대형 세단', mult: 1.10 },
  '국산 소형 SUV':    { label: '국산 소형 SUV', mult: 0.85 },
  '국산 중형 SUV':    { label: '국산 중형 SUV', mult: 0.85 },
  '국산 대형 SUV':    { label: '국산 대형 SUV', mult: 0.90 },
  '국산 MPV/미니밴':   { label: '국산 MPV/미니밴', mult: 0.95 },
  '수입 중형 세단':    { label: '수입 중형 세단', mult: 1.15 },
  '수입 대형 세단':    { label: '수입 대형 세단', mult: 1.25 },
  '수입 중형 SUV':    { label: '수입 중형 SUV', mult: 1.0 },
  '수입 프리미엄':     { label: '수입 프리미엄', mult: 1.20 },
  '전기차 국산':      { label: '전기차 국산', mult: 1.15 },
  '전기차 수입':      { label: '전기차 수입', mult: 1.25 },
  '하이브리드':       { label: '하이브리드', mult: 0.85 },
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
const Section = ({ icon, title, children, className = '' }: {
  icon: string; title: string; children: React.ReactNode; className?: string
}) => (
  <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
      <h3 className="font-bold text-gray-800 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
)

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
    <div className="flex items-center justify-between py-2">
      <div>
        <span className="text-gray-600 text-sm">{label}</span>
        {sub && <span className="block text-xs text-gray-400">{sub}</span>}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode={type === 'percent' ? 'decimal' : 'numeric'}
          className="w-32 text-right border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
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
  <div className={`flex justify-between items-center py-2 ${highlight ? 'text-lg' : 'text-sm'}`}>
    <span className={highlight ? 'font-bold text-gray-800' : 'text-gray-500'}>{label}</span>
    <span className={`font-bold ${highlight ? 'text-xl' : ''} ${negative ? 'text-green-600' : highlight ? 'text-steel-600' : 'text-gray-800'}`}>
      {negative ? '-' : ''}{f(Math.abs(value))}원
    </span>
  </div>
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
  const [saving, setSaving] = useState(false)
  const [currentWorksheetId, setCurrentWorksheetId] = useState<string | null>(null)

  // --- 가격 분석 입력값 ---
  const [factoryPrice, setFactoryPrice] = useState(0)      // 출고가
  const [purchasePrice, setPurchasePrice] = useState(0)     // 매입가

  // 감가 설정
  const [carAgeMode, setCarAgeMode] = useState<'new' | 'used'>('new')  // 신차 / 연식차량 구분
  const [customCarAge, setCustomCarAge] = useState(0)         // 수동 설정 차령 (연식차량 시)
  const [depCurvePreset, setDepCurvePreset] = useState<DepCurvePreset>('standard')  // 감가 곡선 프리셋
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
  const [investmentRate, setInvestmentRate] = useState(6.0)  // 투자수익률 %

  // 운영비용 — 정비 패키지
  const [maintPackage, setMaintPackage] = useState<MaintenancePackage>('basic')
  const [oilChangeFreq, setOilChangeFreq] = useState<1 | 2>(1)
  const [monthlyMaintenance, setMonthlyMaintenance] = useState(40000)
  const [monthlyInsuranceCost, setMonthlyInsuranceCost] = useState(0)
  const [driverAgeGroup, setDriverAgeGroup] = useState<DriverAgeGroup>('26세이상')
  const [insEstimate, setInsEstimate] = useState<ReturnType<typeof estimateInsurance> | null>(null)
  const [insAutoMode, setInsAutoMode] = useState(true) // true=추정자동, false=직접입력
  const [annualTax, setAnnualTax] = useState(0)              // 연간 자동차세
  const [engineCC, setEngineCC] = useState(0)                // 배기량

  // 리스크
  const [deductible, setDeductible] = useState(500000)       // 면책금
  const [riskRate, setRiskRate] = useState(0.5)              // 리스크 적립률 %

  // 보증금/선납금
  const [deposit, setDeposit] = useState(3000000)
  const [prepayment, setPrepayment] = useState(0)
  const [depositDiscountRate, setDepositDiscountRate] = useState(0.4) // %
  const [prepaymentDiscountRate, setPrepaymentDiscountRate] = useState(0.5)

  // 계약 조건
  const [contractType, setContractType] = useState<'return' | 'buyout'>('return')  // 반납형 / 인수형
  const [residualRate, setResidualRate] = useState(80)  // 잔존가치 설정율 (종료시점 시세 대비 %)
  const [buyoutPremium, setBuyoutPremium] = useState(0) // 인수형 추가 마진 (원/월)
  const [termMonths, setTermMonths] = useState(36)
  const [margin, setMargin] = useState(150000)

  // 시장 비교
  const [marketComps, setMarketComps] = useState<MarketComp[]>([])
  const [newComp, setNewComp] = useState<MarketComp>({
    competitor_name: '', vehicle_info: '', monthly_rent: 0,
    deposit: 0, term_months: 36, source: ''
  })

  // 보험 & 금융상품 연동
  const [linkedInsurance, setLinkedInsurance] = useState<any>(null)
  const [linkedFinance, setLinkedFinance] = useState<any>(null)

  // 🆕 기준 테이블 데이터
  const [depreciationDB, setDepreciationDB] = useState<any[]>([])
  const [insuranceRates, setInsuranceRates] = useState<any[]>([])
  const [maintenanceCosts, setMaintenanceCosts] = useState<any[]>([])
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [financeRates, setFinanceRates] = useState<any[]>([])
  const [regCosts, setRegCosts] = useState<any[]>([])

  // 🆕 취득원가 관련
  const [acquisitionTax, setAcquisitionTax] = useState(0)
  const [bondCost, setBondCost] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(350000)
  const [miscFee, setMiscFee] = useState(167000)
  const [totalAcquisitionCost, setTotalAcquisitionCost] = useState(0)
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
  const [isSavingPrice, setIsSavingPrice] = useState(false)
  const [carSearchQuery, setCarSearchQuery] = useState('')

  // 저장된 워크시트 목록
  const [worksheets, setWorksheets] = useState<any[]>([])

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

        // 차량 목록 — 반드시 company_id 필터 적용 (타사 차량 표출 방지)
        const filterCompanyId = role === 'god_admin' ? adminSelectedCompanyId : company?.id
        if (filterCompanyId) {
          const { data: carsData } = await supabase
            .from('cars')
            .select('*')
            .eq('company_id', filterCompanyId)
            .in('status', ['available', 'rented'])
            .order('created_at', { ascending: false })
          setCars(carsData || [])
        } else {
          setCars([]) // 회사 미선택 시 차량 미표시
        }

        // 기준 테이블 일괄 로드 (개별 에러 허용)
        try {
          const [depRes, insRes, maintRes, taxRes, finRes, regRes] = await Promise.all([
            supabase.from('depreciation_db').select('*').order('category'),
            supabase.from('insurance_rate_table').select('*'),
            supabase.from('maintenance_cost_table').select('*'),
            supabase.from('vehicle_tax_table').select('*'),
            supabase.from('finance_rate_table').select('*'),
            supabase.from('registration_cost_table').select('*'),
          ])
          setDepreciationDB(depRes.data || [])
          setInsuranceRates(insRes.data || [])
          setMaintenanceCosts(maintRes.data || [])
          setTaxRates(taxRes.data || [])
          setFinanceRates(finRes.data || [])
          setRegCosts(regRes.data || [])
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

  // ============================================
  // 🆕 공통 기준 테이블 매핑 함수
  // ============================================
  const applyReferenceTableMappings = useCallback((carInfo: {
    brand: string, model: string, fuel_type?: string,
    purchase_price: number, engine_cc?: number, year?: number,
    factory_price?: number
  }, opts?: { skipInsurance?: boolean, skipFinance?: boolean }) => {
    // 차종 카테고리 자동 매핑
    const category = mapToDepCategory(carInfo.brand, carInfo.model, carInfo.fuel_type, carInfo.purchase_price)
    setAutoCategory(category)

    // 잔존가치율 자동 적용 (depreciation_db)
    const depRecord = depreciationDB.find(d => d.category === category)
    if (depRecord) {
      const thisYear = new Date().getFullYear()
      const carAge = thisYear - (carInfo.year || thisYear)
      setDepYear1Rate(100 - depRecord.rate_1yr)
      if (depRecord.rate_1yr > depRecord.rate_3yr) {
        setDepYear2Rate(Math.round((depRecord.rate_1yr - depRecord.rate_3yr) / 2))
      }
    }

    // 보험료 자동 조회 (insurance_rate_table)
    const insType = mapToInsuranceType(carInfo.brand, carInfo.fuel_type)
    setAutoInsType(insType)
    if (!opts?.skipInsurance) {
      const insRecord = insuranceRates.find(r =>
        r.vehicle_type === insType &&
        carInfo.purchase_price >= r.value_min &&
        carInfo.purchase_price <= r.value_max
      )
      if (insRecord) {
        setMonthlyInsuranceCost(Math.round(insRecord.annual_premium / 12))
      }
    }

    // 정비 유형 자동 매핑 + 패키지 비용 계산
    const maintMapping = mapToMaintenanceType(carInfo.brand, carInfo.model, carInfo.fuel_type, carInfo.purchase_price)
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

    // 자동차세 계산 (vehicle_tax_table — 영업용!)
    const cc = carInfo.engine_cc || 0
    const fuelCat = (carInfo.fuel_type || '').includes('전기') ? '전기' : '내연기관'
    const taxRecord = taxRates.find(r =>
      r.tax_type === '영업용' &&
      r.fuel_category === fuelCat &&
      cc >= r.cc_min && cc <= r.cc_max
    )
    let tax = 0
    if (taxRecord) {
      if (taxRecord.fixed_annual > 0) tax = taxRecord.fixed_annual
      else tax = Math.round(cc * taxRecord.rate_per_cc)
      tax = Math.round(tax * (1 + taxRecord.education_tax_rate / 100))
    } else {
      if (cc <= 1000) tax = cc * 80
      else if (cc <= 1600) tax = cc * 140
      else tax = cc * 200
      tax = Math.round(tax * 1.3)
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
    // ★ 렌터카(자동차대여업) = 영업용 → 취득세 4% (비영업용 승용 7%와 다름)
    const acqTaxRecord = regCosts.find(r => r.cost_type === '취득세' && r.vehicle_category === (fuelCat === '전기' ? '영업용 전기' : '영업용'))
      || regCosts.find(r => r.cost_type === '취득세' && r.vehicle_category === '영업용')
    const deliveryRecord = regCosts.find(r => r.cost_type === '탁송료')

    // 영업용 취득세: 4% (지방세법 제12조제1항제2호)
    let acqTaxAmt = acqTaxRecord ? Math.round(carInfo.purchase_price * acqTaxRecord.rate / 100) : Math.round(carInfo.purchase_price * 0.04)

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
    setTotalAcquisitionCost(totalAcq)
  }, [depreciationDB, insuranceRates, maintenanceCosts, taxRates, financeRates, regCosts, termMonths, maintPackage, oilChangeFreq, registrationRegion, engineCC])

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
    // 등록차량은 연식차량 모드, 차령 자동 계산
    const thisY = new Date().getFullYear()
    setCarAgeMode('used')
    setCustomCarAge(Math.max(0, thisY - (car.year || thisY)))

    // 연동된 보험 조회
    const { data: insData } = await supabase
      .from('insurance_contracts')
      .select('*')
      .eq('car_id', carId)
      .order('id', { ascending: false })
      .limit(1)
      .single()
    setLinkedInsurance(insData)
    if (insData?.total_premium) {
      setMonthlyInsuranceCost(Math.round(insData.total_premium / 12))
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

    // 공통 기준 테이블 매핑 적용
    applyReferenceTableMappings(
      {
        brand: car.brand,
        model: car.model,
        fuel_type: car.fuel_type || car.fuel,
        purchase_price: car.purchase_price,
        engine_cc: car.engine_cc,
        year: car.year,
        factory_price: car.factory_price,
      },
      { skipInsurance: !!insData, skipFinance: !!finData }
    )
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
      const res = await fetch('/api/lookup-new-car', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    setSavedCarPrices(data || [])
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) {
      fetchSavedPrices()
    }
  }, [effectiveCompanyId, fetchSavedPrices])

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
      const { data: q } = await supabase.from('quotes').select('*').eq('id', quoteId).single()
      if (!q) return
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
      // worksheet 연결 시 worksheet 로드
      if (q.worksheet_id || d.worksheet_id) {
        const wsId = q.worksheet_id || d.worksheet_id
        router.replace(`/quotes/pricing?worksheet_id=${wsId}&car_id=${q.car_id || ''}&quote_id=${quoteId}`)
      }
    }
    loadQuoteForEdit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 🆕 견적서(가격표) 업로드 → AI 파싱 → 자동 저장
  const handleQuoteUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

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

      const res = await fetch('/api/parse-quote', {
        method: 'POST',
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

      // 저장 목록에 바로 추가
      const payload = {
        company_id: effectiveCompanyId,
        brand: data.brand,
        model: data.model,
        year: data.year,
        source: data.source || '가격표 업로드',
        price_data: data,
      }
      const { data: existing, error: findErr } = await supabase
        .from('new_car_prices')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('brand', data.brand)
        .eq('model', data.model)
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
      alert(`${data.brand} ${data.model} 가격표가 저장 목록에 추가되었습니다.`)
    } catch (err: any) {
      console.error('[가격표 업로드] 실패:', err)
      alert(err.message || '가격표 분석/저장 중 오류가 발생했습니다.')
    } finally {
      setIsParsingQuote(false)
      setParseStage('')
      setParseStartTime(0)
    }
  }, [effectiveCompanyId, fetchSavedPrices])

  // 🆕 신차 가격 데이터 DB 저장
  const handleSaveCarPrice = useCallback(async () => {
    if (!newCarResult) { alert('저장할 가격 데이터가 없습니다.'); return }
    if (!effectiveCompanyId) { alert('회사 정보를 불러올 수 없습니다. 다시 로그인해주세요.'); return }
    setIsSavingPrice(true)
    try {
      const payload = {
        company_id: effectiveCompanyId,
        brand: newCarResult.brand,
        model: newCarResult.model,
        year: newCarResult.year,
        source: newCarResult.source || 'AI 조회',
        price_data: newCarResult,
      }
      // 같은 브랜드+모델+연식이면 업데이트, 없으면 신규 등록
      const { data: existing } = await supabase
        .from('new_car_prices')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('brand', newCarResult.brand)
        .eq('model', newCarResult.model)
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
    // 저장목록 탭에서 바로 선택 UI 표시 (탭 전환 안 함)
  }, [])

  // 🆕 저장된 가격 데이터 삭제
  const handleDeleteSavedPrice = useCallback(async (id: string) => {
    if (!confirm('이 가격 데이터를 삭제하시겠습니까?')) return
    await supabase.from('new_car_prices').delete().eq('id', id)
    await fetchSavedPrices()
  }, [fetchSavedPrices])

  // 저장된 워크시트 조회
  const fetchWorksheets = useCallback(async () => {
    if (!effectiveCompanyId) return
    const { data } = await supabase
      .from('pricing_worksheets')
      .select('*, cars(number, brand, model, trim, year)')
      .eq('company_id', effectiveCompanyId)
      .order('updated_at', { ascending: false })
      .limit(50)
    setWorksheets(data || [])
  }, [effectiveCompanyId])

  useEffect(() => {
    if (effectiveCompanyId) fetchWorksheets()
  }, [effectiveCompanyId, fetchWorksheets])

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

  // 저장된 워크시트 삭제
  const handleDeleteWorksheet = async (id: string) => {
    if (!confirm('이 워크시트를 삭제하시겠습니까?')) return
    await supabase.from('pricing_worksheets').delete().eq('id', id)
    fetchWorksheets()
  }

  // 저장된 워크시트 로드
  const handleLoadWorksheet = (ws: any) => {
    // 워크시트 ID 기억
    setCurrentWorksheetId(ws.id || null)
    // 차량 정보 복원
    if (ws.car_id && ws.cars) {
      const car: CarData = {
        id: ws.car_id,
        number: ws.cars.number || '',
        brand: ws.cars.brand || '',
        model: ws.cars.model || '',
        trim: ws.cars.trim || '',
        year: ws.cars.year || new Date().getFullYear(),
        fuel: '',
        mileage: 0,
        purchase_price: ws.purchase_price || 0,
        factory_price: ws.factory_price || 0,
        engine_cc: 0,
        status: 'active',
      }
      setSelectedCar(car)
      setLookupMode('registered')
      setCarAgeMode('used')
      const thisY = new Date().getFullYear()
      setCustomCarAge(Math.max(0, thisY - (ws.cars.year || thisY)))
    } else if (ws.newcar_info) {
      const info = ws.newcar_info
      const tempCar: CarData = {
        id: `newcar-loaded-${ws.id}`,
        number: '',
        brand: info.brand || '',
        model: info.model || '',
        trim: info.trim || '',
        year: info.year || new Date().getFullYear(),
        fuel: info.fuel || '',
        mileage: 0,
        purchase_price: ws.purchase_price || 0,
        factory_price: ws.factory_price || 0,
        engine_cc: 0,
        status: 'new-car-pricing',
      }
      setSelectedCar(tempCar)
      setLookupMode('newcar')
    }
    // 차령 모드 복원
    if (ws.car_age_mode) {
      setCarAgeMode(ws.car_age_mode as 'new' | 'used')
      setCustomCarAge(ws.custom_car_age || 0)
    } else {
      // 기존 워크시트 호환: newcar_info 있으면 신차, 아니면 연식차량
      setCarAgeMode(ws.newcar_info ? 'new' : 'used')
    }
    // 모든 값 복원
    setFactoryPrice(ws.factory_price || 0)
    setPurchasePrice(ws.purchase_price || 0)
    setLoanAmount(ws.loan_amount || 0)
    setLoanRate(ws.loan_interest_rate || 4.5)
    setInvestmentRate(ws.investment_rate || 6.0)
    setMonthlyInsuranceCost(ws.monthly_insurance || 0)
    if (ws.driver_age_group) setDriverAgeGroup(ws.driver_age_group as DriverAgeGroup)
    if (ws.ins_auto_mode !== undefined) setInsAutoMode(ws.ins_auto_mode)
    setMonthlyMaintenance(ws.monthly_maintenance || 40000)
    if (ws.maint_package) setMaintPackage(ws.maint_package as MaintenancePackage)
    if (ws.oil_change_freq) setOilChangeFreq(ws.oil_change_freq as 1 | 2)
    setDeductible(ws.deductible || 500000)
    setDeposit(ws.deposit_amount || 3000000)
    setPrepayment(ws.prepayment_amount || 0)
    setTermMonths(ws.term_months || 36)
    setMargin(ws.target_margin || 150000)
    setAnnualMileage(ws.annual_mileage || 2)
    setBaselineKm(ws.baseline_km || 2)
    if (ws.excess_mileage_rate) setExcessMileageRate(ws.excess_mileage_rate)
    if (ws.excess_rate_margin_pct !== undefined) setExcessRateMarginPct(ws.excess_rate_margin_pct)
    if (ws.dep_curve_preset) setDepCurvePreset(ws.dep_curve_preset as DepCurvePreset)
    if (ws.dep_custom_curve) setDepCustomCurve(ws.dep_custom_curve)
    if (ws.dep_class_override !== undefined) setDepClassOverride(ws.dep_class_override || '')
    if (ws.contract_type) setContractType(ws.contract_type as 'return' | 'buyout')
    if (ws.residual_rate !== undefined) setResidualRate(ws.residual_rate)
    if (ws.buyout_premium !== undefined) setBuyoutPremium(ws.buyout_premium)
  }

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
    const tempCar: CarData = {
      id: `newcar-${Date.now()}`,
      number: '',
      brand: newCarResult.brand,
      model: newCarResult.model,
      trim: `${newCarSelectedVariant.variant_name} / ${newCarSelectedTrim.name}${optionNames}`,
      year: newCarResult.year,
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
      year: newCarResult.year,
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
    const ZERO = { depCost: 0, maintCost: 0, margin: 0, total: 0, depDiffPct: 0, extraKm: 0, depAmount: 0, tierPenalty: 1, maintItems: [] as { name: string; perKm: number }[] }
    // 출고가 없으면 매입가로 대체 (수동 입력 모드 등)
    const basePrice = factoryPrice > 0 ? factoryPrice : purchasePrice
    if (basePrice <= 0) return ZERO
    // 무제한 약정이면 초과주행 자체가 없음 → 전부 0
    if (annualMileage >= UNLIMITED_KM) return ZERO

    const MILEAGE_DEP_RATE = 2  // %/만km
    const termYears = termMonths / 12
    const carAge = carAgeMode === 'new' ? 0 : customCarAge > 0 ? customCarAge : 0
    const curMileage10k = (selectedCar?.mileage || 0) / 10000
    const endAge = carAge + termYears
    const avgMileageAtEnd = endAge * baselineKm

    // ① 현재 약정 기준 종료 시점 주행감가
    const projectedAtContract = curMileage10k + (termYears * annualMileage)
    const excessAtContract = projectedAtContract - avgMileageAtEnd
    const mileageDepAtContract = excessAtContract * MILEAGE_DEP_RATE

    // ② 무제한(5만km/년) 기준 종료 시점 주행감가
    const projectedUnlimited = curMileage10k + (termYears * UNLIMITED_KM)
    const excessUnlimited = projectedUnlimited - avgMileageAtEnd
    const mileageDepUnlimited = excessUnlimited * MILEAGE_DEP_RATE

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

    // 마진
    const marginPerKm = Math.round((depCostPerKm + maintCostPerKm) * (excessRateMarginPct / 100))
    const total = depCostPerKm + maintCostPerKm + marginPerKm
    return { depCost: depCostPerKm, maintCost: maintCostPerKm, margin: marginPerKm, total, depDiffPct, extraKm, depAmount: depAmountDiff, tierPenalty, maintItems: maintBreakdown.items }
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
    })
    setInsEstimate(est)
    setMonthlyInsuranceCost(est.totalMonthly)
  }, [selectedCar, factoryPrice, purchasePrice, engineCC, driverAgeGroup, deductible, carAgeMode, customCarAge, insAutoMode])

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
    // ── 감가 곡선 결정
    const activeCurve = depCurvePreset === 'custom'
      ? depCustomCurve
      : DEP_CURVE_PRESETS[depCurvePreset].curve

    // ── 차종 클래스 보정 계수
    const autoDepClass = selectedCar
      ? mapToDepCategory(selectedCar.brand, selectedCar.model, selectedCar.fuel, factoryPrice)
      : ''
    const depClass = depClassOverride || autoDepClass
    const classMult = DEP_CLASS_MULTIPLIER[depClass]?.mult ?? 1.0

    // ── 현재 시점 연식 감가율 (비선형 곡선 기반)
    // 잔가율표 곡선에는 이미 "평균 주행거리"가 반영되어 있음
    const yearDepNow = getDepRateFromCurve(activeCurve, carAge, classMult)

    // ── 주행감가: 0% 감가 기준(baselineKm) 대비 초과/미달분만 보정
    // baselineKm = 0% 감가 기준 (만km/년), annualMileage = 계약 약정 주행거리
    const MILEAGE_DEP_RATE = 2      // 초과/미달 만km당 감가 보정 (%)

    const avgMileageNow = carAge * baselineKm  // 0% 감가 기준 누적 주행거리
    const excessMileageNow = mileage10k - avgMileageNow  // 양수=초과, 음수=저주행
    const mileageDepNow = excessMileageNow * MILEAGE_DEP_RATE
    const totalDepRateNow = Math.max(0, Math.min(yearDepNow + mileageDepNow, 90))
    const currentMarketValue = carAge === 0
      ? factoryPrice
      : Math.round(factoryPrice * (1 - totalDepRateNow / 100))

    // ── 계약 종료 시점 감가율
    const termYears = termMonths / 12
    const endAge = carAge + termYears
    const yearDepEnd = getDepRateFromCurve(activeCurve, endAge, classMult)

    // 약정 주행거리(annualMileage)로 종료 시점 예상 주행거리 산출
    const projectedMileage10k = mileage10k + (termYears * annualMileage)
    // 0% 감가 기준(baselineKm)으로 초과/미달 판정
    const avgMileageEnd = endAge * baselineKm
    const excessMileageEnd = projectedMileage10k - avgMileageEnd
    const mileageDepEnd = excessMileageEnd * MILEAGE_DEP_RATE
    const totalDepRateEnd = Math.max(0, Math.min(yearDepEnd + mileageDepEnd, 90))
    const endMarketValue = Math.round(factoryPrice * (1 - totalDepRateEnd / 100))

    // UI 표시용
    const yearDep = yearDepNow
    const mileageDep = mileageDepNow
    const totalDepRate = totalDepRateNow

    // 취득원가 기준 월 감가비
    const costBase = totalAcquisitionCost > 0 ? totalAcquisitionCost : purchasePrice
    // 반납형: 잔존가치 = 종료 시점 시세 100% (차량 회수 후 처분)
    // 인수형: 잔존가치 = 종료 시점 시세 × residualRate% (고객 인수가격)
    const residualValue = contractType === 'return'
      ? endMarketValue
      : Math.round(endMarketValue * (residualRate / 100))
    const buyoutPrice = residualValue  // 인수형일 때만 의미 있음
    const monthlyDepreciation = Math.round(Math.max(0, costBase - residualValue) / termMonths)

    // 2. 금융비용 (평균잔액법)
    // 감가비로 원금이 매월 회수되므로, 대출잔액 & 자기자본 묶인 금액이 점차 줄어듦
    // 초기잔액 = 투입금, 종료잔액 = 투입금 × (잔존가치/매입가) 비율
    const residualRatio = purchasePrice > 0 ? Math.max(0, residualValue / purchasePrice) : 0
    const loanEndBalance = Math.round(loanAmount * residualRatio)
    const avgLoanBalance = Math.round((loanAmount + loanEndBalance) / 2)

    const equityAmount = purchasePrice - loanAmount
    const equityEndBalance = Math.round(equityAmount * residualRatio)
    const avgEquityBalance = Math.round((equityAmount + equityEndBalance) / 2)

    const monthlyLoanInterest = Math.round(avgLoanBalance * (loanRate / 100) / 12)
    const monthlyOpportunityCost = Math.round(avgEquityBalance * (investmentRate / 100) / 12)
    const totalMonthlyFinance = monthlyLoanInterest + monthlyOpportunityCost

    // 3. 운영비용
    const monthlyTax = Math.round(annualTax / 12)
    const totalMonthlyOperation = monthlyInsuranceCost + monthlyMaintenance + monthlyTax

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

    // 7. 최종 렌트가
    const suggestedRent = totalMonthlyCost + margin
    const rentWithVAT = Math.round(suggestedRent * 1.1)

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

    return {
      carAge, mileage10k, termYears,
      // 감가 — 현재
      yearDep, mileageDep, totalDepRate,
      excessMileageNow, avgMileageNow,
      currentMarketValue,
      // 감가 — 계약 종료 시점
      yearDepEnd, mileageDepEnd, totalDepRateEnd,
      excessMileageEnd, avgMileageEnd,
      endMarketValue, projectedMileage10k,
      monthlyDepreciation,
      // 잔존가치 & 인수
      residualValue, buyoutPrice, costBase,
      // 감가 곡선 참조
      depClass, classMult,
      // 금융
      equityAmount, monthlyLoanInterest, monthlyOpportunityCost, totalMonthlyFinance,
      avgLoanBalance, loanEndBalance, avgEquityBalance, equityEndBalance,
      // 운영
      monthlyTax, totalMonthlyOperation,
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
    }
  }, [
    selectedCar, factoryPrice, purchasePrice, carAgeMode, customCarAge, depCurvePreset, depCustomCurve, depClassOverride, depYear1Rate, depYear2Rate, annualMileage, baselineKm,
    contractType, residualRate,
    loanAmount, loanRate, investmentRate,
    monthlyInsuranceCost, monthlyMaintenance, annualTax,
    riskRate, deposit, prepayment, depositDiscountRate, prepaymentDiscountRate,
    termMonths, margin, marketComps, deductible, totalAcquisitionCost
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
      fetchWorksheets()
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
    const resolvedExcessRate = excessMileageRate || getExcessMileageRateFallback(factoryPrice)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const selectedCustomer = customerMode === 'select'
      ? customers.find((c: any) => c.id === selectedCustomerId)
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
      deposit, prepayment, deductible, margin,
      driver_age_group: driverAgeGroup,
      ins_estimate: insEstimate ? {
        vehicleClass: insEstimate.vehicleClass, basePremium: insEstimate.basePremium,
        ownDamagePremium: insEstimate.ownDamagePremium, totalAnnual: insEstimate.totalAnnual,
      } : null,
      maint_package: maintPackage,
      excess_mileage_rate: resolvedExcessRate,
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
      const basePayload: Record<string, any> = {
        company_id: effectiveCompanyId,
        car_id: (!car.id || String(car.id).startsWith('newcar-')) ? null : Number(car.id) || car.id,
        customer_id: customerMode === 'select' ? selectedCustomerId : null,
        start_date: startDate,
        end_date: endDate,
        deposit,
        rent_fee: calc.suggestedRent,
        status,
      }
      const extendedCols: Record<string, any> = {
        term: termMonths,
        customer_name: customerMode === 'select' ? (selectedCustomer?.name || '') : manualCustomer.name.trim(),
        rental_type: contractType === 'buyout' ? '인수형렌트' : '반납형렌트',
        margin,
        memo: quoteNote || null,
        quote_detail: detailData,
        expires_at: expiresAt.toISOString(),
        worksheet_id: currentWorksheetId || null,
      }

      let fullPayload = { ...basePayload, ...extendedCols }
      let error: any = null
      let insertData: any = null

      if (editingQuoteId) {
        // 수정 모드: UPDATE
        const { data: d, error: e } = await supabase.from('quotes').update(fullPayload).eq('id', editingQuoteId).select()
        error = e; insertData = d
      } else {
        // 신규: INSERT
        const { data: d, error: e } = await supabase.from('quotes').insert([fullPayload]).select()
        error = e; insertData = d
        // term 컬럼 없으면 재시도
        if (error && error.message?.includes('term')) {
          delete fullPayload.term
          const r2 = await supabase.from('quotes').insert([fullPayload]).select()
          error = r2.error; insertData = r2.data
        }
        // 확장 컬럼 없으면 base만 재시도
        if (error && error.message?.includes('column')) {
          const r3 = await supabase.from('quotes').insert([basePayload]).select()
          error = r3.error; insertData = r3.data
        }
      }

      setQuoteSaving(false)
      if (error) {
        console.error('Quote save error:', error)
        alert('저장 실패: ' + error.message)
      } else {
        alert(`견적서가 ${status === 'draft' ? '임시저장' : '확정'}되었습니다.`)
        router.push('/quotes')
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
  if (loading) {
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
    ? customers.find((c: any) => c.id === selectedCustomerId)
    : manualCustomer.name ? { ...manualCustomer, id: '', type: '직접입력' } : undefined
  const quoteEndDate = (() => {
    const d = new Date(startDate); d.setMonth(d.getMonth() + termMonths)
    return d.toISOString().split('T')[0]
  })()
  const quoteExcessRate = excessMileageRate || getExcessMileageRateFallback(factoryPrice)
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
            className="flex-1 py-3 text-center border border-gray-300 rounded-xl font-bold text-gray-500 hover:bg-gray-50">
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
    const rentVAT = Math.round(calc.suggestedRent * 0.1)
    const totalPayments = calc.rentWithVAT * termMonths
    const totalWithDeposit = totalPayments + deposit
    const totalWithBuyout = contractType === 'buyout' ? totalWithDeposit + calc.buyoutPrice : totalWithDeposit

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
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-white">인쇄</button>
            <button onClick={() => handleSaveQuote('draft')} disabled={quoteSaving}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-white disabled:opacity-50">
              {quoteSaving ? '저장중...' : '임시저장'}</button>
            <button onClick={() => handleSaveQuote('active')} disabled={quoteSaving}
              className="px-5 py-2 bg-steel-900 text-white rounded-lg text-sm font-black hover:bg-steel-800 disabled:opacity-50">
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

              {/* 4. 월 렌탈료 — 핵심만 (컴팩트) */}
              <div className="border-2 border-steel-900 rounded-xl overflow-hidden quote-rental-highlight">
                <div className="bg-steel-900 text-white px-4 py-1.5"><p className="font-black text-xs">월 렌탈료 안내</p></div>
                <div className="px-3 py-2">
                  <div className={`grid ${contractType === 'buyout' ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                    <div className="text-center py-2 px-2 bg-gray-50 rounded-lg">
                      <p className="text-[9px] text-gray-400 font-bold">보증금{deposit === 0 ? '' : ' (계약 시 1회)'}</p>
                      <p className="text-base font-black text-gray-800">{deposit === 0 ? '없음' : <>{f(deposit)}<span className="text-[10px] font-bold">원</span></>}</p>
                    </div>
                    <div className="text-center py-2 px-2 bg-steel-50 rounded-lg border-2 border-steel-300">
                      <p className="text-[9px] text-steel-500 font-bold">월 렌탈료 (VAT 포함)</p>
                      <p className="text-xl font-black text-steel-700">{f(calc.rentWithVAT)}<span className="text-[10px] font-bold">원</span></p>
                      <p className="text-[9px] text-steel-400">공급가 {f(calc.suggestedRent)} + VAT {f(rentVAT)}</p>
                    </div>
                    {contractType === 'buyout' && (
                      <div className="text-center py-2 px-2 bg-amber-50 rounded-lg border-2 border-amber-200">
                        <p className="text-[9px] text-amber-600 font-bold">인수가격 (만기 시)</p>
                        <p className="text-base font-black text-amber-700">{f(calc.buyoutPrice)}<span className="text-[10px] font-bold">원</span></p>
                      </div>
                    )}
                  </div>
                  {prepayment > 0 && (
                    <div className="bg-gray-50 rounded px-2 py-1 mt-2 flex justify-between items-center text-[10px]">
                      <span className="text-gray-500">선납금 (계약 시 1회)</span><span className="font-bold">{f(prepayment)}원</span>
                    </div>
                  )}
                  <p className="text-[9px] text-gray-400 mt-2 text-center">
                    렌탈료 포함: 자동차보험(종합) · 자동차세 · 취득세 · 등록비{maintPackage !== 'self' ? ' · 정비' : ''}
                  </p>
                </div>
              </div>

              {/* 5. 주요 약정 요약 — 1페이지 하단에 핵심만 */}
              <div className="quote-section">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">주요 약정 요약</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500 w-28">약정 주행거리</td>
                      <td className="px-3 py-1.5">연간 {f(annualMileage * 10000)}km · 초과 시 <span className="font-bold text-red-500">km당 {f(quoteExcessRate)}원</span></td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">자차 면책금</td>
                      <td className="px-3 py-1.5">사고 시 <span className="font-bold">{f(deductible)}원</span>{deductible === 0 && <span className="text-green-500 text-xs ml-1 font-bold">완전면책</span>}</td>
                    </tr>
                    <tr>
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">중도해지</td>
                      <td className="px-3 py-1.5">잔여 렌탈료의 <span className="font-bold text-red-500">35%</span> 위약금</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>
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
                      <td className="px-3 py-1.5">잔여 렌탈료의 <span className="font-bold text-red-500">35%</span> 위약금 발생</td>
                    </tr>
                    <tr>
                      <td className="bg-gray-50 px-3 py-1.5 font-bold text-gray-500">반납 조건</td>
                      <td className="px-3 py-1.5 text-gray-600">{contractType === 'buyout' ? '만기 시 인수 또는 반납 선택 가능' : '만기 시 차량 반납 (차량 상태 평가 후 보증금 정산)'}</td>
                    </tr>
                  </tbody></table>
                </div>
              </div>

              {/* 7. 인수 안내 (인수형만) */}
              {contractType === 'buyout' && (
                <div className="quote-section">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">인수 안내</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-3 text-xs mb-2">
                      <div>
                        <p className="text-amber-600 text-[10px] font-bold mb-0.5">인수가격 (VAT 별도)</p>
                        <p className="font-black text-amber-700 text-lg">{f(calc.buyoutPrice)}원</p>
                      </div>
                      <div>
                        <p className="text-amber-600 text-[10px] font-bold mb-0.5">인수 시 추가 비용</p>
                        <p className="font-bold text-gray-700 text-xs">취득세 + 이전등록비 별도</p>
                      </div>
                    </div>
                    <div className="text-[10px] text-amber-700 space-y-0.5">
                      <p>* 만기 시 상기 가격으로 소유권 이전 가능 · 인수 미희망 시 반납 가능 · 인수 시 취득세/이전등록비 임차인 부담</p>
                    </div>
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
                  <p>1. 본 견적서는 발행일로부터 30일간 유효하며, 차량 재고 및 시장 상황에 따라 변동될 수 있습니다.</p>
                  <p>2. 보증금은 계약 종료 시 차량 상태 확인 후 손해액을 공제한 잔액을 환불합니다.</p>
                  <p>3. 약정주행거리 초과 시 계약 종료 시점에 km당 {f(quoteExcessRate)}원의 추가 요금이 정산됩니다.</p>
                  <p>4. 사고 발생 시 자차 면책금 {f(deductible)}원은 임차인 부담이며, 면책금 초과 수리비는 보험 처리됩니다.</p>
                  <p>5. 중도해지 시 잔여 렌탈료의 35%에 해당하는 위약금이 발생합니다.</p>
                  <p>6. 렌탈 차량은 타인에게 전대·양도할 수 없으며 임대인의 사전 동의 없이 차량 개조 불가합니다.</p>
                  {contractType === 'buyout' && <p>7. 인수 시 소유권 이전에 필요한 취득세 및 수수료는 임차인 부담입니다.</p>}
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
            className="flex-1 py-3 border border-gray-300 rounded-xl font-bold text-gray-500 hover:bg-white">&larr; 수정</button>
          <button onClick={() => window.print()}
            className="flex-1 py-3 border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-white">인쇄 / PDF</button>
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
    <div className="max-w-[1400px] mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">

      {/* ===== 헤더 ===== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/quotes" className="text-gray-400 hover:text-gray-600 text-sm">견적 관리</Link>
            <span className="text-gray-300">/</span>
            <span className="text-steel-600 font-bold text-sm">렌트가 산출</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900">
            렌트가 산출 빌더
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            견적 작성 전 모든 비용 요소를 분석하여 적정 렌트가를 산출합니다
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/quotes" className="px-4 py-2 text-sm border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50">
            목록으로
          </Link>
          {selectedCar && calculations && (
            <button onClick={handleSaveWorksheet} disabled={saving}
              className="px-4 py-2 text-sm bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 disabled:opacity-50">
              {saving ? '저장 중...' : '워크시트 저장'}
            </button>
          )}
        </div>
      </div>


      {/* ===== 가격표 등록 (탭 바깥) ===== */}
      <div className="flex items-center gap-3 mb-4">
        <label className={`px-5 py-3 rounded-xl font-bold text-sm transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
          isParsingQuote
            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
        }`}>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={handleQuoteUpload}
            disabled={isParsingQuote}
            className="hidden"
          />
          {isParsingQuote ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              {parseStage || '분석 중...'}
              {parseElapsed > 0 && <span className="text-gray-400 font-normal">{parseElapsed}초</span>}
            </span>
          ) : '📄 가격표 등록'}
        </label>
        {!isParsingQuote && (
          <span className="text-xs text-gray-400">가격표(PDF/이미지)를 업로드하면 자동 분석 후 저장 목록에 추가됩니다</span>
        )}
      </div>

      {/* ===== 차량 선택 ===== */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
        {/* 모드 탭 */}
        <div className="flex border-b border-gray-200">
          {[
            { key: 'registered', label: '등록차량', icon: '🚗' },
            { key: 'newcar', label: '신차 선택', icon: '✨' },
            { key: 'saved', label: '저장 목록', icon: '📋', count: worksheets.length + savedCarPrices.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setLookupMode(tab.key as any)
                if (tab.key === 'registered') {
                  setSelectedCar(null)
                  setNewCarResult(null)
                  setNewCarSelectedTax('')
                  setNewCarSelectedFuel('')
                  setNewCarSelectedVariant(null)
                  setNewCarSelectedTrim(null)
                  setNewCarSelectedOptions([])
                  setNewCarSelectedExterior(null)
                  setNewCarSelectedInterior(null)
                  setLookupError('')
                } else if (tab.key === 'newcar') {
                  setSelectedCar(null)
                }
              }}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
                lookupMode === tab.key
                  ? 'border-steel-600 text-steel-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="bg-gray-100 text-gray-600 text-[11px] font-bold px-1.5 py-0.5 rounded-full ml-1">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">

        {/* === 등록차량 모드 === */}
        {lookupMode === 'registered' && (
          <div>
            <label className="block text-sm font-bold text-gray-500 mb-3">분석 대상 차량 선택</label>
            {/* 선택된 차량 표시 */}
            {selectedCar && (
              <div className="flex items-center justify-between p-4 bg-steel-50 border-2 border-steel-400 rounded-xl mb-3">
                <div>
                  <span className="font-black text-steel-800 text-lg">{selectedCar.brand} {selectedCar.model}</span>
                  <span className="ml-2 text-sm text-gray-500">{selectedCar.trim || ''}</span>
                  {selectedCar.number && <span className="ml-3 text-sm font-bold text-steel-600">[{selectedCar.number}]</span>}
                  <span className="ml-2 text-xs text-gray-400">{selectedCar.year}년식</span>
                </div>
                <button onClick={() => { setSelectedCar(null); setCarSearchQuery('') }}
                  className="text-sm text-gray-400 hover:text-red-500 font-bold">변경</button>
              </div>
            )}
            {/* 차량 검색 + 리스트 */}
            {!selectedCar && (
              <>
                <input
                  type="text"
                  placeholder="차량번호, 브랜드, 모델명으로 검색..."
                  value={carSearchQuery}
                  onChange={(e) => setCarSearchQuery(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl font-bold text-sm bg-white focus:border-steel-500 outline-none mb-3"
                />
                {/* 데스크톱: 테이블 형태 */}
                <div className="hidden md:block max-h-[400px] overflow-y-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-[1]">
                      <tr className="text-gray-400 text-xs font-bold border-b border-gray-200">
                        <th className="text-left px-4 py-2.5">차량번호</th>
                        <th className="text-left px-4 py-2.5">브랜드 / 모델</th>
                        <th className="text-left px-4 py-2.5">트림</th>
                        <th className="text-center px-4 py-2.5">연식</th>
                        <th className="text-right px-4 py-2.5">출고가</th>
                        <th className="text-right px-4 py-2.5">매입가</th>
                        <th className="text-center px-4 py-2.5">상태</th>
                        <th className="px-2 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
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
                            className="hover:bg-steel-50 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-2.5 font-bold text-steel-600 whitespace-nowrap">{car.number || '-'}</td>
                            <td className="px-4 py-2.5 font-bold text-gray-800 whitespace-nowrap">{car.brand} {car.model}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{car.trim || '-'}</td>
                            <td className="px-4 py-2.5 text-center text-gray-500">{car.year}년</td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-700 whitespace-nowrap">
                              {car.factory_price ? `${Math.round(car.factory_price / 10000).toLocaleString()}만` : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-steel-600 whitespace-nowrap">
                              {car.purchase_price ? `${Math.round(car.purchase_price / 10000).toLocaleString()}만` : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {car.status === 'rented'
                                ? <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">렌트중</span>
                                : <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded font-bold">대기</span>
                              }
                            </td>
                            <td className="px-2 py-2.5 text-gray-300">→</td>
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
                    <p className="text-center text-gray-400 py-6 text-sm">
                      {carSearchQuery ? '검색 결과가 없습니다' : '등록된 차량이 없습니다'}
                    </p>
                  )}
                </div>
                {/* 모바일: 카드 형태 */}
                <div className="md:hidden max-h-[320px] overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {cars
                    .filter(car => {
                      if (!carSearchQuery.trim()) return true
                      const q = carSearchQuery.toLowerCase()
                      return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
                    })
                    .map(car => (
                      <button
                        key={String(car.id)}
                        onClick={() => { handleCarSelect(String(car.id)); setCarSearchQuery('') }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-steel-50 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800">{car.brand} {car.model}</span>
                            <span className="text-xs text-gray-400">{car.trim || ''}</span>
                            {car.status === 'rented' && (
                              <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">렌트중</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {car.number && <span className="text-xs font-bold text-steel-600">{car.number}</span>}
                            <span className="text-xs text-gray-400">{car.year}년식</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {car.purchase_price ? <span className="text-xs text-gray-500">매입가 <b className="text-steel-600">{Math.round(car.purchase_price / 10000).toLocaleString()}만원</b></span> : <span className="text-xs text-gray-400">가격 미등록</span>}
                          </div>
                        </div>
                        <span className="text-gray-300 text-sm ml-2">→</span>
                      </button>
                    ))
                  }
                  {cars.filter(car => {
                    if (!carSearchQuery.trim()) return true
                    const q = carSearchQuery.toLowerCase()
                    return (car.number || '').toLowerCase().includes(q) || (car.brand || '').toLowerCase().includes(q) || (car.model || '').toLowerCase().includes(q) || (car.trim || '').toLowerCase().includes(q)
                  }).length === 0 && (
                    <p className="text-center text-gray-400 py-6 text-sm">
                      {carSearchQuery ? '검색 결과가 없습니다' : '등록된 차량이 없습니다'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* === 신차 선택 모드 === */}
        {lookupMode === 'newcar' && (
          <div>
            {/* ── 브랜드(드롭다운) + 모델명 + AI 조회 ── */}
            <div className="flex gap-3 mb-4 items-end flex-wrap">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 mb-1">브랜드</label>
                <select
                  value={[...DOMESTIC_BRANDS, ...IMPORT_BRAND_PRESETS].includes(newCarBrand) ? newCarBrand : (newCarBrand ? '__custom__' : '')}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '__custom__') {
                      setNewCarBrand('')
                    } else {
                      setNewCarBrand(val)
                    }
                    setNewCarModel(''); setNewCarResult(null); setNewCarSelectedTax(''); setNewCarSelectedFuel(''); setNewCarSelectedVariant(null); setNewCarSelectedTrim(null); setNewCarSelectedOptions([]); setLookupError('')
                  }}
                  className="w-40 p-3 border border-gray-200 rounded-xl font-bold text-base bg-white focus:border-steel-400 outline-none"
                >
                  <option value="">선택</option>
                  <optgroup label="국내">
                    {DOMESTIC_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </optgroup>
                  <optgroup label="수입">
                    {IMPORT_BRAND_PRESETS.map(b => <option key={b} value={b}>{b}</option>)}
                  </optgroup>
                  <option value="__custom__">직접 입력</option>
                </select>
              </div>
              {(() => {
                const isCustom = newCarBrand !== '' && ![...DOMESTIC_BRANDS, ...IMPORT_BRAND_PRESETS].includes(newCarBrand)
                if (!isCustom) return null
                return (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1">브랜드명</label>
                    <input
                      type="text"
                      placeholder="브랜드 입력"
                      value={newCarBrand}
                      onChange={(e) => setNewCarBrand(e.target.value)}
                      className="w-32 p-3 border border-gray-200 rounded-xl font-bold text-base focus:border-steel-400 outline-none"
                    />
                  </div>
                )
              })()}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-bold text-gray-400 mb-1">모델명</label>
                <input
                  type="text"
                  placeholder="모델명 입력 (예: K5, 아반떼, 싼타페)"
                  value={newCarModel}
                  onChange={(e) => {
                    setNewCarModel(e.target.value)
                    setNewCarResult(null); setNewCarSelectedTax(''); setNewCarSelectedFuel(''); setNewCarSelectedVariant(null); setNewCarSelectedTrim(null); setNewCarSelectedOptions([]); setLookupError('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleNewCarLookup()}
                  className="w-full p-3 border border-gray-200 rounded-xl font-bold text-base focus:border-steel-400 outline-none"
                />
              </div>
              <button
                onClick={handleNewCarLookup}
                disabled={isLookingUp || isParsingQuote || !newCarBrand.trim() || !newCarModel.trim()}
                className="px-6 py-3 bg-steel-600 text-white rounded-xl font-bold text-sm hover:bg-steel-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {isLookingUp ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    조회 중...
                    {lookupElapsed > 0 && <span className="font-normal opacity-80">{lookupElapsed}초</span>}
                  </span>
                ) : '🔍 AI 조회'}
              </button>
            </div>

            {/* AI 조회 진행 상태 */}
            {isLookingUp && lookupStage && (
              <div className="p-4 bg-steel-50 border border-steel-200 rounded-xl mb-4">
                <div className="flex items-center gap-3">
                  <div className="inline-block w-5 h-5 border-2 border-steel-500 border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="text-sm font-bold text-steel-700">{lookupStage}</p>
                    {lookupElapsed > 0 && (
                      <p className="text-xs text-steel-500 mt-0.5">경과 시간: {lookupElapsed}초 {lookupElapsed >= 15 && '· 웹 검색 중이라 시간이 걸릴 수 있습니다'}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 에러 메시지 */}
            {lookupError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium mb-4">
                {lookupError}
              </div>
            )}

          </div>
        )}

        {/* === 저장 목록 탭 === */}
        {lookupMode === 'saved' && (
          <div className="space-y-6">
            {/* 저장된 워크시트 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-black text-gray-700">산출 워크시트</span>
                <span className="bg-steel-100 text-steel-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{worksheets.length}</span>
              </div>
              {worksheets.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm bg-gray-50 rounded-xl">저장된 워크시트가 없습니다</p>
              ) : (
                <div className="space-y-1.5">
                  {worksheets.map((ws: any) => {
                    const carLabel = ws.cars
                      ? `${ws.cars.brand} ${ws.cars.model} ${ws.cars.trim || ''}`.trim()
                      : ws.newcar_info
                        ? `[신차] ${ws.newcar_info.brand} ${ws.newcar_info.model}`.trim()
                        : '차량 정보 없음'
                    const dateStr = ws.updated_at
                      ? new Date(ws.updated_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                      : '-'
                    return (
                      <div key={ws.id} className="flex items-center justify-between px-4 py-3 bg-white border border-gray-150 rounded-xl hover:border-steel-300 group cursor-pointer"
                        onClick={() => handleLoadWorksheet(ws)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800 text-sm">{carLabel}</span>
                            {ws.status === 'draft' && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold">임시</span>}
                            {ws.status === 'confirmed' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">확정</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-gray-400">{dateStr}</span>
                            <span className="text-[11px] text-gray-500">렌트가 {(ws.suggested_rent || 0).toLocaleString()}원</span>
                            <span className="text-[11px] text-gray-400">{ws.term_months}개월</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-[11px] text-steel-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">불러오기</span>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteWorksheet(ws.id) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs p-0.5">✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 저장된 가격표 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-black text-gray-700">신차 가격표</span>
                <span className="bg-indigo-100 text-indigo-600 text-[11px] font-bold px-2 py-0.5 rounded-full">{savedCarPrices.length}</span>
              </div>
              {savedCarPrices.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm bg-gray-50 rounded-xl">저장된 가격표가 없습니다. 상단 '가격표 등록'에서 AI 조회 또는 견적서 업로드 후 저장하세요.</p>
              ) : (
                <div>
                  {(() => {
                    const grouped: Record<string, any[]> = {}
                    savedCarPrices.forEach((sp: any) => {
                      const brand = sp.brand || '기타'
                      if (!grouped[brand]) grouped[brand] = []
                      grouped[brand].push(sp)
                    })
                    return Object.entries(grouped).map(([brand, items]) => (
                      <div key={brand} className="mb-3 last:mb-0">
                        <div className="flex items-center gap-2 mb-1.5 px-1">
                          <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{brand}</span>
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-[10px] text-gray-400">{items.length}개 모델</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                          {items.map((sp: any) => (
                            <div
                              key={sp.id}
                              className={`flex items-center justify-between px-3 py-2.5 border rounded-xl transition-all group cursor-pointer ${
                                newCarResult && newCarResult.brand === sp.brand && newCarResult.model === sp.model
                                  ? 'bg-indigo-50 border-indigo-400 shadow-sm'
                                  : 'bg-white border-gray-150 hover:border-indigo-300 hover:bg-indigo-50/40'
                              }`}
                              onClick={() => handleLoadSavedPrice(sp)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-800 text-sm">{sp.model}</span>
                                  <span className="text-[11px] text-gray-400">{sp.year}년</span>
                                  <span className="text-[10px] bg-steel-50 text-steel-600 px-1.5 py-0.5 rounded font-bold">{sp.price_data?.variants?.length || 0}차종</span>
                                  {sp.source?.includes('견적서') ? (
                                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold">견적서</span>
                                  ) : (
                                    <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-bold">AI</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-gray-400 mt-0.5 block">
                                  {new Date(sp.updated_at || sp.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} 저장
                                </span>
                              </div>
                              <div className="flex items-center gap-1 ml-2 shrink-0">
                                {newCarResult && newCarResult.brand === sp.brand && newCarResult.model === sp.model
                                  ? <span className="text-[11px] text-indigo-600 font-bold">선택됨</span>
                                  : <span className="text-[11px] text-indigo-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">선택</span>
                                }
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteSavedPrice(sp.id) }}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-0.5 text-xs">✕</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====== 공통 계층형 선택 UI: 개별소비세 → 유종 → 차종 그룹 → 트림 → 컬러 → 옵션 ====== */}
        {/* 신차선택 탭 또는 저장목록 탭에서 차량 데이터 선택 시 표시 */}
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
                  <div className="flex items-center justify-between text-sm">
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
                          className="px-6 py-3 bg-steel-700 text-white rounded-xl font-bold text-sm hover:bg-steel-800 transition-colors whitespace-nowrap cursor-pointer"
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
            {(lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs px-2 py-1 bg-steel-100 text-steel-700 rounded-full font-bold">✨ 신차 시뮬레이션</span>
                <span className="text-xs text-gray-400">임시 분석 — 정식 등록 전 참고용</span>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {((lookupMode === 'newcar' || lookupMode === 'saved') && newCarResult ? [
                { label: '구분', value: '🆕 신차' },
                { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}` },
                { label: '트림', value: selectedCar.trim || '-' },
                { label: '출고가', value: `${f(selectedCar.factory_price || 0)}원` },
                { label: '예상 매입가', value: `${f(selectedCar.purchase_price)}원` },
              ] : [
                { label: '차량번호', value: selectedCar.number },
                { label: '모델', value: `${selectedCar.brand} ${selectedCar.model}` },
                { label: '연식', value: `${selectedCar.year}년` },
                { label: '주행거리', value: `${f(selectedCar.mileage || 0)}km` },
                { label: '매입가', value: `${f(selectedCar.purchase_price)}원` },
              ]).map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 text-center">
                  <span className="text-xs text-gray-400 block">{item.label}</span>
                  <span className="font-bold text-gray-800 text-sm">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        </div>
      </div>

      {!selectedCar ? (
        <div className="text-center py-20 text-gray-400">
          <span className="text-6xl block mb-4">🏗️</span>
          <p className="text-lg font-bold">차량을 선택하면 렌트가 산출 분석이 시작됩니다</p>
        </div>
      ) : calculations && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ===== 왼쪽: 입력/분석 영역 ===== */}
          <div className="lg:col-span-8 space-y-6">

            {/* 🆕 0. AI 자동분류 결과 */}
            {autoCategory && (
              <div className="bg-gradient-to-r from-steel-50 to-steel-50 border border-steel-200 rounded-2xl p-4 flex flex-wrap gap-3 items-center">
                <span className="text-sm font-bold text-steel-800">🤖 기준표 자동 매핑:</span>
                <span className="bg-steel-600 text-white text-xs font-bold px-3 py-1 rounded-full">잔가: {autoCategory}</span>
                <span className="bg-steel-600 text-white text-xs font-bold px-3 py-1 rounded-full">보험: {autoInsType}</span>
                <span className="bg-amber-600 text-white text-xs font-bold px-3 py-1 rounded-full">정비: {autoMaintType}</span>
              </div>
            )}

            {/* 1. 출고가 & 매입가 관계 */}
            <Section icon="🏭" title="출고가 & 매입가 관계">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <InputRow label="출고가 (신차가)" value={factoryPrice} onChange={setFactoryPrice} />
                  <InputRow label="매입가 (실 구매가)" value={purchasePrice} onChange={setPurchasePrice} />
                </div>
                <div className="bg-gradient-to-br from-steel-50 to-steel-100/50 rounded-xl p-5 flex flex-col justify-center">
                  <div className="text-center">
                    <span className="text-xs text-steel-600 font-bold block mb-1">매입 할인율</span>
                    <span className="text-4xl font-black text-steel-700">
                      {calculations.purchaseDiscount.toFixed(1)}%
                    </span>
                    <span className="text-sm text-steel-500 block mt-1">
                      출고가 대비 {f(factoryPrice - purchasePrice)}원 할인
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 🆕 1.5 취득원가 분석 */}
            <Section icon="📋" title="취득원가 분석 (차량가 + 등록비)">
              {/* 등록 지역 선택 */}
              <div className="mb-4 p-4 bg-steel-50/50 rounded-xl border border-steel-100">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <ResultRow label="차량 매입가" value={purchasePrice} />
                  <InputRow label={acquisitionTax === 0 && factoryPrice > 0 ? '취득세 (경차 면제)' : '취득세 (영업용 4%)'} value={acquisitionTax} onChange={setAcquisitionTax} sub={acquisitionTax === 0 && factoryPrice > 0 ? '경차 취득세 감면 (지방세특례제한법 제75조)' : '렌터카 대여업 영업용 기준'} />
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
                  <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-5">
                    <div className="text-center">
                      <span className="text-xs text-red-500 font-bold block mb-1">실제 취득원가</span>
                      <span className="text-3xl font-black text-red-700">{f(totalAcquisitionCost)}원</span>
                      <span className="text-sm text-red-400 block mt-2">
                        차량가 대비 <b>+{f(totalAcquisitionCost - purchasePrice)}원</b> ({purchasePrice > 0 ? ((totalAcquisitionCost - purchasePrice) / purchasePrice * 100).toFixed(1) : 0}%)
                      </span>
                      <p className="text-xs text-gray-500 mt-3 bg-white/60 rounded-lg p-2">
                        이 금액이 렌트가 산정의 진짜 원가 기준입니다.<br/>
                        차량가만 기준하면 등록비용분 손실 발생!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* 2. 시세하락 분석 */}
            <Section icon="📉" title={`시세하락 / 감가 분석 (${termMonths}개월 계약)`}>
              {/* 차량 구분: 신차 / 연식차량 */}
              <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-bold text-gray-500 mb-2.5">차량 구분</p>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => { setCarAgeMode('new'); setCustomCarAge(0) }}
                    className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all ${
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
                    className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all ${
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

              {/* 감가 곡선 프리셋 선택 */}
              <div className="mb-5 p-4 bg-amber-50/50 rounded-xl border border-amber-200/50">
                <p className="text-xs font-bold text-gray-500 mb-2.5">📉 감가 곡선 기준</p>
                <div className="flex gap-2 flex-wrap mb-3">
                  {(Object.entries(DEP_CURVE_PRESETS) as [Exclude<DepCurvePreset, 'custom'>, typeof DEP_CURVE_PRESETS[keyof typeof DEP_CURVE_PRESETS]][]).map(([key, preset]) => (
                    <button key={key}
                      onClick={() => setDepCurvePreset(key)}
                      className={`py-2 px-3.5 text-xs rounded-lg border font-bold transition-colors
                        ${depCurvePreset === key
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300'
                        }`}
                    >
                      {preset.label}
                      <span className="text-[10px] font-normal ml-1 opacity-75">{preset.desc.split('(')[0]}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setDepCurvePreset('custom')
                      // custom으로 전환 시 현재 활성 곡선을 복사
                      if (depCurvePreset !== 'custom') {
                        setDepCustomCurve([...DEP_CURVE_PRESETS[depCurvePreset].curve])
                      }
                    }}
                    className={`py-2 px-3.5 text-xs rounded-lg border font-bold transition-colors
                      ${depCurvePreset === 'custom'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300'
                      }`}
                  >
                    직접입력
                  </button>
                </div>

                {/* 곡선 미리보기 (연도별 감가율 표) */}
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
                          누적 감가{calculations && calculations.classMult !== 1.0 ? ` (×${calculations.classMult.toFixed(2)})` : ''}
                        </td>
                        {Array.from({ length: 8 }, (_, i) => {
                          const activeCurve = depCurvePreset === 'custom'
                            ? depCustomCurve
                            : DEP_CURVE_PRESETS[depCurvePreset].curve
                          const rate = getDepRateFromCurve(activeCurve, i, calculations?.classMult ?? 1.0)
                          return (
                            <td key={i} className={`text-center py-1 px-1 font-bold
                              ${i === 0 ? 'text-gray-300' : rate > 50 ? 'text-red-500' : 'text-amber-600'}`}>
                              {depCurvePreset === 'custom' && i > 0 ? (
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  max="95"
                                  value={depCustomCurve[i] ?? ''}
                                  onChange={(e) => {
                                    const newCurve = [...depCustomCurve]
                                    newCurve[i] = parseFloat(e.target.value) || 0
                                    setDepCustomCurve(newCurve)
                                  }}
                                  className="w-12 text-center border border-amber-200 rounded px-0.5 py-0.5 text-[11px] font-bold focus:border-amber-500 outline-none"
                                />
                              ) : (
                                `${rate.toFixed(1)}%`
                              )}
                            </td>
                          )
                        })}
                      </tr>
                      <tr className="text-gray-400 border-t border-gray-100">
                        <td className="py-1 pr-2 font-bold whitespace-nowrap">잔가율</td>
                        {Array.from({ length: 8 }, (_, i) => {
                          const activeCurve = depCurvePreset === 'custom'
                            ? depCustomCurve
                            : DEP_CURVE_PRESETS[depCurvePreset].curve
                          const rate = getDepRateFromCurve(activeCurve, i, calculations?.classMult ?? 1.0)
                          return (
                            <td key={i} className="text-center py-1 px-1">
                              {(100 - rate).toFixed(1)}%
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 차종 클래스 보정 */}
                {calculations && (
                  <div className="mt-3 pt-3 border-t border-amber-200/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-gray-400 font-bold">차종 클래스:</span>
                      <select
                        value={depClassOverride}
                        onChange={(e) => setDepClassOverride(e.target.value)}
                        className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white focus:border-amber-500 outline-none"
                      >
                        <option value="">자동감지 ({calculations.depClass})</option>
                        {Object.entries(DEP_CLASS_MULTIPLIER).map(([key, { label, mult }]) => (
                          <option key={key} value={key}>{label} (×{mult.toFixed(2)})</option>
                        ))}
                      </select>
                      <span className="text-[10px] text-gray-400">
                        보정계수 ×{calculations.classMult.toFixed(2)}
                        {calculations.classMult > 1 ? ' (감가 빠름)' : calculations.classMult < 1 ? ' (감가 느림)' : ' (기준)'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  {/* 계약 약정 주행거리 */}
                  <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-bold text-gray-500 mb-2">계약 약정 주행거리</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { val: 1, label: '1만' },
                        { val: 1.5, label: '1.5만' },
                        { val: 2, label: '2만' },
                        { val: 3, label: '3만' },
                        { val: 5, label: '무제한' },
                      ].map(opt => (
                        <button key={opt.val}
                          onClick={() => setAnnualMileage(opt.val)}
                          className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                            ${annualMileage === opt.val
                              ? 'bg-steel-600 text-white border-steel-600'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 0% 감가 기준 주행거리 */}
                  <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-bold text-gray-500 mb-2">0% 감가 기준 주행거리</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">연간</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        className="w-24 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        value={baselineKm}
                        onChange={(e) => setBaselineKm(parseFloat(e.target.value) || 2)}
                      />
                      <span className="text-xs text-gray-400">만km 이하 = 추가감가 없음</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      이 기준 초과 시 만km당 +2% 감가, 미달 시 -2% 감가 감소
                    </p>
                  </div>

                  {/* 초과주행 km당 요금 (감가모델 연동) */}
                  <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-bold text-gray-500 mb-2">초과주행 km당 요금</p>

                    {/* 원가 분석 — 약정 티어 간 감가 차이 기반 */}
                    <div className="bg-orange-50 rounded-lg p-3 mb-2 space-y-1">
                      <p className="text-[10px] text-orange-600 font-bold mb-1">
                        약정 {annualMileage}만km → 무제한({UNLIMITED_KM}만km) 감가 차이 기반
                      </p>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">감가율 차이</span>
                        <span className="font-bold text-gray-700">+{excessRateBreakdown.depDiffPct.toFixed(1)}%p</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">감가액 차이</span>
                        <span className="font-bold text-gray-700">{f(excessRateBreakdown.depAmount)}원 ÷ {f(excessRateBreakdown.extraKm)}km</span>
                      </div>
                      {excessRateBreakdown.tierPenalty !== 1 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">약정 패널티</span>
                          <span className={`font-bold ${excessRateBreakdown.tierPenalty > 1 ? 'text-red-500' : 'text-green-500'}`}>
                            ×{excessRateBreakdown.tierPenalty.toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs border-t border-orange-200 pt-1 mt-1">
                        <span className="text-gray-500">km당 감가비</span>
                        <span className="font-bold text-gray-700">{f(excessRateBreakdown.depCost)}원</span>
                      </div>
                      {excessRateBreakdown.maintItems.length > 0 && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">km당 정비비 ({MAINTENANCE_PACKAGES[maintPackage].label})</span>
                            <span className="font-bold text-gray-700">{f(excessRateBreakdown.maintCost)}원</span>
                          </div>
                          <div className="pl-2 space-y-0.5">
                            {excessRateBreakdown.maintItems.map(item => (
                              <div key={item.name} className="flex justify-between text-[10px] text-gray-400">
                                <span>ㄴ {item.name}</span>
                                <span>{f(item.perKm)}원/km</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">마진 ({excessRateMarginPct}%)</span>
                        <span className="font-bold text-gray-700">{f(excessRateBreakdown.margin)}원</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-orange-300 pt-1">
                        <span className="font-bold text-gray-700">합계</span>
                        <span className="font-black text-red-600">{f(excessRateBreakdown.total)}원/km</span>
                      </div>
                    </div>

                    {/* 마진율 조절 */}
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {[
                        { val: 30, label: '30%', desc: '최저' },
                        { val: 50, label: '50%', desc: '표준' },
                        { val: 80, label: '80%', desc: '수익형' },
                        { val: 100, label: '100%', desc: '고마진' },
                      ].map(opt => (
                        <button key={opt.val}
                          onClick={() => setExcessRateMarginPct(opt.val)}
                          className={`py-1 px-2.5 text-xs rounded-lg border font-bold transition-colors
                            ${excessRateMarginPct === opt.val
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          {opt.label}
                          <span className="block text-[9px] opacity-80">{opt.desc}</span>
                        </button>
                      ))}
                    </div>

                    {/* 최종 요금 (수동 오버라이드 가능) */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">최종</span>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        className="w-24 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                        value={excessMileageRate}
                        onChange={(e) => setExcessMileageRate(parseInt(e.target.value) || 0)}
                      />
                      <span className="text-xs text-gray-400">원/km</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      약정 {annualMileage}만km/년 초과 시 적용 · 계약 종료 시점 정산
                    </p>
                  </div>

                  <div className="border-t mt-3 pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">차량 구분</span>
                      <span className="font-bold">{carAgeMode === 'new' ? '🆕 신차' : '🚗 연식차량'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">현재 차령</span>
                      <span className="font-bold">{calculations.carAge}년{calculations.carAge === 0 && ' (감가 없음)'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">현재 주행거리</span>
                      <span className="font-bold">{calculations.mileage10k.toFixed(1)}만km</span>
                    </div>
                    <div className="flex justify-between text-sm text-steel-600">
                      <span>종료 시 차령</span>
                      <span className="font-bold">{(calculations.carAge + calculations.termYears).toFixed(1)}년</span>
                    </div>
                    <div className="flex justify-between text-sm text-steel-600">
                      <span>종료 시 주행 (추정)</span>
                      <span className="font-bold">{calculations.projectedMileage10k.toFixed(1)}만km</span>
                    </div>
                  </div>
                </div>
                <div>
                  {/* 현재 시점 */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-3">
                    <p className="text-xs font-bold text-gray-400 mb-2">
                      현재 시점 {calculations.carAge === 0 ? '(신차 — 감가 없음)' : `(차령 ${calculations.carAge}년)`}
                    </p>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-500">연식 감가</span>
                      <span className="font-bold text-red-500">{calculations.yearDep.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-500">
                        주행 보정
                        <span className="text-[10px] text-gray-400 ml-1">
                          (기준{calculations.avgMileageNow.toFixed(1)}만 대비 {calculations.excessMileageNow >= 0 ? '+' : ''}{calculations.excessMileageNow.toFixed(1)}만km)
                        </span>
                      </span>
                      <span className={`font-bold ${calculations.mileageDep >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {calculations.mileageDep >= 0 ? '+' : ''}{calculations.mileageDep.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-sm font-bold text-gray-700">총 감가율</span>
                      <span className="font-black text-red-600">{calculations.totalDepRate.toFixed(1)}%</span>
                    </div>
                    <div className="text-right text-sm text-gray-600 mt-1">
                      추정 시세: <b>{f(calculations.currentMarketValue)}원</b>
                    </div>
                  </div>
                  {/* 계약 종료 시점 */}
                  <div className="bg-steel-50 rounded-xl p-4 mb-3">
                    <p className="text-xs font-bold text-steel-400 mb-2">
                      {termMonths}개월 후 (차령 {(calculations.carAge + calculations.termYears).toFixed(1)}년)
                    </p>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-steel-500">연식 감가</span>
                      <span className="font-bold text-steel-600">{calculations.yearDepEnd.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-steel-500">
                        주행 보정
                        <span className="text-[10px] text-steel-400 ml-1">
                          (기준{calculations.avgMileageEnd.toFixed(1)}만 대비 {calculations.excessMileageEnd >= 0 ? '+' : ''}{calculations.excessMileageEnd.toFixed(1)}만km)
                        </span>
                      </span>
                      <span className={`font-bold ${calculations.mileageDepEnd >= 0 ? 'text-steel-600' : 'text-green-500'}`}>
                        {calculations.mileageDepEnd >= 0 ? '+' : ''}{calculations.mileageDepEnd.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-steel-200">
                      <span className="text-sm font-bold text-steel-700">총 감가율</span>
                      <span className="font-black text-steel-700">{calculations.totalDepRateEnd.toFixed(1)}%</span>
                    </div>
                    <div className="text-right text-sm text-steel-600 mt-1">
                      추정 시세: <b>{f(calculations.endMarketValue)}원</b>
                    </div>
                  </div>
                  {/* 월 감가비용 */}
                  <div className="bg-red-50 rounded-xl p-4 text-center">
                    <span className="text-xs text-red-400 block">계약기간 중 시세 하락</span>
                    <span className="text-lg font-black text-red-600">
                      {f(calculations.currentMarketValue - calculations.endMarketValue)}원
                    </span>
                    <span className="text-xs text-gray-500 block mt-1">
                      월 감가비용: <b className="text-red-500">{f(calculations.monthlyDepreciation)}원</b>
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 3. 금융비용 분석 */}
            <Section icon="🏦" title="금융비용 분석">
              {/* 조달방식 선택 */}
              <div className="flex gap-2 mb-4">
                {[
                  { val: 'loan', label: '대출', desc: '캐피탈/은행 대출' },
                  { val: 'equity', label: '자기자본', desc: '전액 현금 투자' },
                  { val: 'mixed', label: '혼합', desc: '대출 + 자기자본' },
                ].map(opt => {
                  const current = loanAmount <= 0 ? 'equity'
                    : loanAmount >= purchasePrice ? 'loan'
                    : 'mixed'
                  return (
                    <button key={opt.val}
                      onClick={() => {
                        if (opt.val === 'loan') setLoanAmount(purchasePrice)
                        else if (opt.val === 'equity') setLoanAmount(0)
                        else setLoanAmount(Math.round(purchasePrice * 0.7))
                      }}
                      className={`flex-1 py-2 text-xs rounded-lg border font-bold transition-colors
                        ${current === opt.val
                          ? 'bg-steel-600 text-white border-steel-600'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      {opt.label}
                      <span className="block text-[9px] opacity-80">{opt.desc}</span>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  {/* 대출 설정: 대출 or 혼합일 때만 */}
                  {loanAmount > 0 && (
                    <>
                      <InputRow label="대출 원금" value={loanAmount} onChange={setLoanAmount} sub={`매입가의 ${purchasePrice > 0 ? (loanAmount/purchasePrice*100).toFixed(0) : 0}%`} />
                      <InputRow label="대출 이자율 (연)" value={loanRate} onChange={setLoanRate} suffix="%" type="percent" />
                      {loanAmount < purchasePrice && (
                        <div className="mt-2 flex gap-2">
                          {[50, 60, 70, 80].map(pct => (
                            <button key={pct}
                              onClick={() => setLoanAmount(Math.round(purchasePrice * pct / 100))}
                              className={`flex-1 py-1.5 text-xs rounded-lg border font-bold transition-colors
                                ${purchasePrice > 0 && Math.round(loanAmount / purchasePrice * 100) === pct
                                  ? 'bg-steel-600 text-white border-steel-600'
                                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* 기회비용: 자기자본 or 혼합일 때만 */}
                  {loanAmount < purchasePrice && (
                    <div className={loanAmount > 0 ? 'border-t mt-3 pt-3' : ''}>
                      <InputRow label="투자수익률 (기회비용)" value={investmentRate} onChange={setInvestmentRate} suffix="%" type="percent" />
                      <p className="text-[10px] text-gray-400 mt-1">
                        자기자본 {f(purchasePrice - loanAmount)}원에 대한 기회비용
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    {loanAmount > 0 && (
                      <>
                        <ResultRow label="대출 초기" value={loanAmount} />
                        <ResultRow label="대출 종료시" value={calculations.loanEndBalance} />
                        <ResultRow label="평균 대출잔액" value={calculations.avgLoanBalance} />
                        <ResultRow label="월 대출이자 (평균)" value={calculations.monthlyLoanInterest} />
                      </>
                    )}
                    {loanAmount < purchasePrice && (
                      <>
                        {loanAmount > 0 && <div className="border-t pt-2" />}
                        <ResultRow label="자기자본 초기" value={calculations.equityAmount} />
                        <ResultRow label="자기자본 종료시" value={calculations.equityEndBalance} />
                        <ResultRow label="평균 묶인자본" value={calculations.avgEquityBalance} />
                        <ResultRow label="월 기회비용 (평균)" value={calculations.monthlyOpportunityCost} />
                      </>
                    )}
                    <div className="border-t pt-3">
                      <ResultRow label="총 월 금융비용" value={calculations.totalMonthlyFinance} highlight />
                    </div>
                    <p className="text-[10px] text-gray-400">
                      감가 회수에 따라 잔액이 줄어드는 평균잔액법 적용
                    </p>
                  </div>
                </div>
              </div>
            </Section>

            {/* 4. 보험료 (공제조합) */}
            <Section icon="🛡️" title="보험료 (공제조합)">
              {/* 보험료 모드 전환 */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => { setInsAutoMode(true) }}
                  className={`py-1.5 px-4 text-xs rounded-lg border font-bold transition-colors
                    ${insAutoMode ? 'bg-steel-600 text-white border-steel-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  🤖 공제조합 추정
                </button>
                <button
                  onClick={() => { setInsAutoMode(false) }}
                  className={`py-1.5 px-4 text-xs rounded-lg border font-bold transition-colors
                    ${!insAutoMode ? 'bg-steel-600 text-white border-steel-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  ✏️ 직접 입력
                </button>
                {linkedInsurance && (
                  <span className="text-xs text-green-600 font-bold">✅ 보험계약 연동중</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  {/* 운전자 연령 기준 */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-2">운전자 연령 기준</p>
                    <div className="flex gap-2 flex-wrap">
                      {(Object.entries(DRIVER_AGE_FACTORS) as [DriverAgeGroup, typeof DRIVER_AGE_FACTORS[DriverAgeGroup]][]).map(([key, info]) => (
                        <button key={key}
                          onClick={() => setDriverAgeGroup(key)}
                          className={`py-2 px-4 text-xs rounded-lg border font-bold transition-colors
                            ${driverAgeGroup === key
                              ? key === '26세이상' ? 'bg-steel-600 text-white border-steel-600'
                                : key === '21세이상' ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-red-500 text-white border-red-500'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          <span>{info.label}</span>
                          <span className="block text-[9px] opacity-80 mt-0.5">
                            {info.factor > 1.0 ? `할증 +${((info.factor - 1) * 100).toFixed(0)}%` : '표준'}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {DRIVER_AGE_FACTORS[driverAgeGroup].desc}
                    </p>
                  </div>

                  {/* 직접입력 모드 */}
                  {!insAutoMode && (
                    <InputRow label="월 보험료 (직접입력)" value={monthlyInsuranceCost} onChange={setMonthlyInsuranceCost}
                      sub={`연 ${f(monthlyInsuranceCost * 12)}원`} />
                  )}
                </div>

                {/* 오른쪽: 보험료 산출 결과 */}
                <div className="space-y-3">
                  {insAutoMode && insEstimate ? (
                    <>
                      {/* 담보별 내역 */}
                      <div className="bg-steel-50 rounded-xl p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold text-steel-600">
                            공제조합 추정 · {insEstimate.vehicleClass}
                          </span>
                          <span className="text-[10px] text-steel-400">
                            연령 ×{insEstimate.ageFactor.toFixed(2)} · 차령 ×{insEstimate.carAgeFactor.toFixed(2)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {insEstimate.breakdown.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-gray-500">{item.label}</span>
                              <span className="font-bold text-gray-700">{f(item.monthly)}원/월</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 합계 */}
                      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">기본공제 (대인/대물/자손/무보험)</span>
                          <span className="font-bold">{f(Math.round(insEstimate.basePremium / 12))}원/월</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">자차손해 (면책 {f(deductible)}원, {((1 - insEstimate.deductibleDiscount) * 100).toFixed(0)}%↓)</span>
                          <span className="font-bold">{f(Math.round(insEstimate.ownDamagePremium / 12))}원/월</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between items-center">
                          <span className="font-bold text-gray-700">월 공제료 합계</span>
                          <span className="font-black text-lg text-steel-600">{f(insEstimate.totalMonthly)}원</span>
                        </div>
                        <p className="text-[10px] text-gray-400">연간 {f(insEstimate.totalAnnual)}원 · 공제조합 영업용 추정치</p>
                      </div>
                    </>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <ResultRow label="월 보험료" value={monthlyInsuranceCost} />
                      <p className="text-[10px] text-gray-400">
                        {linkedInsurance ? `보험계약 연동 (연 ${f(linkedInsurance.total_premium || 0)}원)` :
                         autoInsType ? `기준표 (${autoInsType}) · 연 ${f(monthlyInsuranceCost * 12)}원` :
                         '직접 입력'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 면책금 & 리스크 적립 */}
              <div className="border-t mt-5 pt-5">
                <p className="text-xs font-bold text-gray-500 mb-3">사고 면책금 & 리스크 적립</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-2">자기부담금 (면책금)</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[0, 300000, 500000, 1000000, 1500000, 2000000].map(v => (
                          <button key={v}
                            onClick={() => setDeductible(v)}
                            className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                              ${deductible === v
                                ? v === 0 ? 'bg-steel-500 text-white border-steel-500' : 'bg-red-500 text-white border-red-500'
                                : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                          >
                            {v === 0 ? '완전자차' : `${v / 10000}만`}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        면책금 ↑ → 자차보험료 ↓ (현재 {f(deductible)}원 → 자차 {insEstimate ? ((1 - insEstimate.deductibleDiscount) * 100).toFixed(0) : 0}% 할인)
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">사고위험 적립률 (차량가 대비)</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { val: 0.3, label: '0.3%', desc: '최소' },
                          { val: 0.5, label: '0.5%', desc: '표준' },
                          { val: 0.8, label: '0.8%', desc: '보수적' },
                          { val: 1.0, label: '1.0%', desc: '고위험' },
                        ].map(opt => (
                          <button key={opt.val}
                            onClick={() => setRiskRate(opt.val)}
                            className={`py-1.5 px-3 text-xs rounded-lg border font-bold transition-colors
                              ${riskRate === opt.val
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                          >
                            {opt.label}
                            <span className="block text-[9px] opacity-80">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">면책금 (고객 부담)</span>
                      <span className="font-bold text-gray-800">{f(deductible)}원/건</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">월 리스크 적립금</span>
                      <span className="font-bold text-red-600">{f(calculations.monthlyRiskReserve)}원</span>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      차량가 {f(purchasePrice)}원 × {riskRate}% ÷ 12 · 사고/수리 예비비
                    </p>
                  </div>
                </div>
              </div>
            </Section>

            {/* 4-2. 자동차세 */}
            <Section icon="🏛️" title="자동차세 (영업용)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <InputRow label="배기량" value={engineCC} onChange={(v) => {
                    setEngineCC(v)
                    const fuelCat = selectedCar?.fuel_type?.includes('전기') ? '전기' : '내연기관'
                    const tr = taxRates.find(r => r.tax_type === '영업용' && r.fuel_category === fuelCat && v >= r.cc_min && v <= r.cc_max)
                    let tax = 0
                    if (tr) {
                      tax = tr.fixed_annual > 0 ? tr.fixed_annual : Math.round(v * tr.rate_per_cc)
                      tax = Math.round(tax * (1 + tr.education_tax_rate / 100))
                    } else {
                      if (v <= 1000) tax = v * 18; else if (v <= 1600) tax = v * 18; else tax = v * 19
                      tax = Math.round(tax * 1.3)
                    }
                    setAnnualTax(tax)
                  }} suffix="cc" />
                  <InputRow label="연간 자동차세" value={annualTax} onChange={setAnnualTax}
                    sub="영업용 세율 적용 (비영업용 대비 대폭 할인)" />
                </div>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <ResultRow label="연간 자동차세" value={annualTax} />
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-700 text-sm">월 자동차세</span>
                      <span className="font-black text-lg text-gray-800">
                        {f(calculations.monthlyTax)}원
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* 5. 정비 상품 */}
            <Section icon="🔧" title="정비 상품">
              {/* 패키지 선택 버튼 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
                {(Object.entries(MAINTENANCE_PACKAGES) as [MaintenancePackage, typeof MAINTENANCE_PACKAGES[MaintenancePackage]][]).map(([key, pkg]) => {
                  const isEV = autoMaintType === '전기차'
                  const disabled = isEV && key === 'oil_only'
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        if (disabled) return
                        setMaintPackage(key)
                        // 패키지 변경 시 비용 자동 계산
                        const multiplier = MAINT_MULTIPLIER[autoMaintType] || 1.0
                        const oilAdj = key === 'oil_only' && oilChangeFreq === 2 ? 1.8 : 1.0
                        setMonthlyMaintenance(Math.round(pkg.monthly * multiplier * oilAdj))
                      }}
                      className={`relative p-3 rounded-xl border-2 transition-all text-center ${
                        disabled
                          ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : maintPackage === key
                            ? 'border-amber-500 bg-amber-50 shadow-md'
                            : 'border-gray-200 hover:border-amber-300 bg-white'
                      }`}
                    >
                      <span className="text-xl block">{pkg.icon}</span>
                      <span className="font-black text-sm block mt-1">{pkg.label}</span>
                      <span className="text-[11px] text-gray-400 block mt-0.5">{pkg.desc}</span>
                      {disabled && (
                        <span className="text-[10px] text-red-400 block mt-1">전기차 불가</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  {/* 엔진오일 교환 주기 (oil_only 선택 시) */}
                  {maintPackage === 'oil_only' && (
                    <div className="mb-4">
                      <label className="block text-xs font-bold text-gray-500 mb-2">엔진오일 교환 주기</label>
                      <div className="flex gap-2">
                        {([1, 2] as const).map(freq => (
                          <button
                            key={freq}
                            onClick={() => {
                              setOilChangeFreq(freq)
                              const multiplier = MAINT_MULTIPLIER[autoMaintType] || 1.0
                              const oilAdj = freq === 2 ? 1.8 : 1.0
                              setMonthlyMaintenance(Math.round(MAINTENANCE_PACKAGES.oil_only.monthly * multiplier * oilAdj))
                            }}
                            className={`flex-1 py-2.5 rounded-xl border-2 font-bold text-sm transition-all ${
                              oilChangeFreq === freq
                                ? 'border-amber-500 bg-amber-50 text-amber-700'
                                : 'border-gray-200 text-gray-500 hover:border-amber-300'
                            }`}
                          >
                            연 {freq}회
                            <span className="block text-[10px] text-gray-400 font-normal mt-0.5">
                              {freq === 1 ? '연 1만km 이하' : '연 2만km 이상'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 포함 항목 리스트 */}
                  {maintPackage !== 'self' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-500 mb-1">포함 항목</label>
                      {MAINT_ITEMS.map((item, idx) => {
                        const isEV = autoMaintType === '전기차'
                        if (isEV && item.evExclude) return null
                        const included = item.packages.includes(maintPackage)
                        return (
                          <div key={idx} className={`flex items-center gap-2 text-xs px-2 py-1 rounded-lg ${
                            included ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-300'
                          }`}>
                            <span>{included ? '✅' : '—'}</span>
                            <span className={included ? 'font-bold' : ''}>{item.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {maintPackage === 'self' && (
                    <div className="bg-gray-50 rounded-xl p-4 text-center">
                      <span className="text-2xl block mb-2">🙋</span>
                      <p className="text-sm font-bold text-gray-600">고객 직접 정비</p>
                      <p className="text-xs text-gray-400 mt-1">정비 비용이 렌트가에 포함되지 않습니다.<br/>고객이 직접 정비소를 이용합니다.</p>
                    </div>
                  )}

                  {/* 수동 금액 조정 */}
                  <div className="mt-4">
                    <InputRow label="월 정비비" value={monthlyMaintenance} onChange={setMonthlyMaintenance} />
                    {autoMaintType && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        차량유형: {autoMaintType} (배수 ×{MAINT_MULTIPLIER[autoMaintType] || 1.0})
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-amber-50 rounded-xl p-5 flex flex-col justify-center items-center">
                  <span className="text-xs text-amber-600 font-bold mb-1">계약기간 총 정비 예산</span>
                  <span className="text-3xl font-black text-amber-700">{f(monthlyMaintenance * termMonths)}원</span>
                  <span className="text-xs text-gray-500 mt-1">{termMonths}개월 × {f(monthlyMaintenance)}원/월</span>
                  <div className="mt-3 px-3 py-1.5 bg-white rounded-lg border border-amber-200">
                    <span className="text-xs font-bold text-amber-700">
                      {MAINTENANCE_PACKAGES[maintPackage].icon} {MAINTENANCE_PACKAGES[maintPackage].label}
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 면책금 & 리스크 → 보험 섹션으로 이동됨 */}

            {/* 7. 보증금 & 선납금 */}
            <Section icon="💰" title="보증금 & 선납금 효과">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-600 text-sm">보증금</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-16 text-center border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                        value={purchasePrice > 0 ? Math.round(deposit / purchasePrice * 100) : 0}
                        onChange={(e) => {
                          const pct = parseInt(e.target.value) || 0
                          setDeposit(Math.round(purchasePrice * pct / 100))
                        }}
                      />
                      <span className="text-xs text-gray-400">%</span>
                      <input
                        type="text"
                        className="w-32 text-right border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                        value={f(deposit)}
                        onChange={(e) => setDeposit(parseNum(e.target.value))}
                      />
                      <span className="text-xs text-gray-400 w-8">원</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-600 text-sm">보증금 월할인률</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-32 text-right border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:border-steel-500 focus:ring-1 focus:ring-steel-500 outline-none"
                        value={depositDiscountRate}
                        onChange={(e) => {
                          const raw = e.target.value
                          // 소수점 입력 중간 상태 허용 (예: "0.", "0.4")
                          if (raw === '' || raw === '0' || raw === '0.' || /^\d*\.?\d*$/.test(raw)) {
                            setDepositDiscountRate(raw === '' || raw === '0.' ? raw as any : parseFloat(raw) || 0)
                          }
                        }}
                      />
                      <span className="text-xs text-gray-400 w-8">%</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    {[0.3, 0.4, 0.5, 0.6, 0.8].map(r => (
                      <button key={r}
                        onClick={() => setDepositDiscountRate(r)}
                        className={`flex-1 py-1 text-[10px] rounded border font-bold
                          ${depositDiscountRate === r
                            ? 'bg-green-600 text-white border-green-600'
                            : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                      >
                        {r}%
                      </button>
                    ))}
                  </div>
                  <div className="border-t my-3" />
                  <InputRow label="선납금" value={prepayment} onChange={setPrepayment} />
                  <p className="text-[10px] text-gray-400">선납금 ÷ 계약기간({termMonths}개월) = 월 {f(termMonths > 0 ? Math.round(prepayment / termMonths) : 0)}원 차감</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 space-y-4">
                  {deposit > 0 && (
                    <div>
                      <span className="text-xs text-green-600 block">보증금 효과</span>
                      <span className="text-lg font-bold text-green-700">
                        월 -{f(calculations.monthlyDepositDiscount)}원 할인
                      </span>
                      <span className="text-xs text-gray-500 block">
                        {f(deposit)}원 × {depositDiscountRate}%
                      </span>
                    </div>
                  )}
                  {prepayment > 0 && (
                    <div>
                      <span className="text-xs text-green-600 block">선납금 효과</span>
                      <span className="text-lg font-bold text-green-700">
                        월 -{f(calculations.monthlyPrepaymentDiscount)}원 차감
                      </span>
                      <span className="text-xs text-gray-500 block">
                        {f(prepayment)}원 ÷ {termMonths}개월
                      </span>
                    </div>
                  )}
                  <div className="border-t pt-3">
                    <span className="text-xs text-green-700 font-bold block">총 월 할인</span>
                    <span className="text-2xl font-black text-green-700">
                      -{f(calculations.totalDiscount)}원
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 8. 시장 비교 */}
            <Section icon="📊" title="시중 동일유형 렌트가 비교">
              <div className="space-y-4">
                {/* 등록된 비교 데이터 */}
                {marketComps.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="p-3 text-left">경쟁사</th>
                          <th className="p-3 text-left">차량정보</th>
                          <th className="p-3 text-right">월 렌트</th>
                          <th className="p-3 text-right">보증금</th>
                          <th className="p-3 text-center">기간</th>
                          <th className="p-3 text-center">삭제</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {marketComps.map((comp, idx) => (
                          <tr key={comp.id || idx} className="hover:bg-gray-50">
                            <td className="p-3 font-bold">{comp.competitor_name}</td>
                            <td className="p-3 text-gray-600">{comp.vehicle_info}</td>
                            <td className="p-3 text-right font-bold">{f(comp.monthly_rent)}원</td>
                            <td className="p-3 text-right text-gray-500">{f(comp.deposit)}원</td>
                            <td className="p-3 text-center text-gray-500">{comp.term_months}개월</td>
                            <td className="p-3 text-center">
                              <button onClick={() => comp.id && removeMarketComp(comp.id)}
                                className="text-red-400 hover:text-red-600 text-xs font-bold">삭제</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 시장 평균 비교 */}
                {calculations.marketAvg > 0 && (
                  <div className={`rounded-xl p-4 text-center ${calculations.marketDiff > 10 ? 'bg-red-50' : calculations.marketDiff < -5 ? 'bg-green-50' : 'bg-steel-50'}`}>
                    <span className="text-xs text-gray-500 block">시장 평균 대비</span>
                    <span className={`text-3xl font-black ${calculations.marketDiff > 10 ? 'text-red-600' : calculations.marketDiff < -5 ? 'text-green-600' : 'text-steel-600'}`}>
                      {calculations.marketDiff > 0 ? '+' : ''}{calculations.marketDiff.toFixed(1)}%
                    </span>
                    <span className="text-sm text-gray-500 block mt-1">
                      시장 평균: {f(calculations.marketAvg)}원 / 내 가격: {f(calculations.rentWithVAT)}원
                    </span>
                  </div>
                )}

                {/* 새 비교 추가 */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 mb-3">시장 데이터 추가</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <input placeholder="경쟁사명" className="px-3 py-2 border rounded-lg text-sm"
                      value={newComp.competitor_name}
                      onChange={e => setNewComp({ ...newComp, competitor_name: e.target.value })} />
                    <input placeholder="차량정보" className="px-3 py-2 border rounded-lg text-sm"
                      value={newComp.vehicle_info}
                      onChange={e => setNewComp({ ...newComp, vehicle_info: e.target.value })} />
                    <input placeholder="월 렌트 (원)" className="px-3 py-2 border rounded-lg text-sm text-right"
                      value={newComp.monthly_rent || ''}
                      onChange={e => setNewComp({ ...newComp, monthly_rent: parseNum(e.target.value) })} />
                    <button onClick={addMarketComp}
                      className="bg-steel-600 text-white rounded-lg font-bold text-sm hover:bg-steel-700">
                      추가
                    </button>
                  </div>
                </div>
              </div>
            </Section>

          </div>

          {/* ===== 오른쪽: 최종 산출 요약 (Sticky) ===== */}
          <div className="lg:col-span-4">
            <div className="sticky top-6 space-y-6">

              {/* 계약 조건 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h3 className="font-bold text-gray-700 mb-4 text-sm">계약 조건 설정</h3>
                <div className="flex gap-2 mb-4">
                  {[12, 24, 36, 48, 60].map(t => (
                    <button key={t}
                      onClick={() => {
                        setTermMonths(t)
                        // 🆕 기간 변경 시 금리 자동 연동
                        const rateRecord = financeRates.find(r =>
                          r.finance_type === '캐피탈대출' &&
                          t >= r.term_months_min && t <= r.term_months_max
                        )
                        if (rateRecord) setLoanRate(Number(rateRecord.annual_rate))
                      }}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors
                        ${termMonths === t
                          ? 'bg-steel-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      {t}개월
                    </button>
                  ))}
                </div>
                {/* 계약 유형 선택 */}
                <div className="mb-4">
                  <p className="text-xs font-bold text-gray-500 mb-2">계약 유형</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setContractType('return')}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold transition-colors
                        ${contractType === 'return'
                          ? 'bg-steel-600 text-white border-steel-600 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-steel-300'}`}
                    >
                      🔄 반납형
                      <span className="block text-[10px] font-normal mt-0.5 opacity-75">계약 종료 시 차량 반납</span>
                    </button>
                    <button
                      onClick={() => setContractType('buyout')}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-xs font-bold transition-colors
                        ${contractType === 'buyout'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300'}`}
                    >
                      🏷️ 인수형
                      <span className="block text-[10px] font-normal mt-0.5 opacity-75">계약 종료 시 고객 인수</span>
                    </button>
                  </div>
                </div>

                {/* 인수형 전용: 인수가격(잔존가치) 설정 */}
                {contractType === 'buyout' && (
                  <div className="mb-4 p-3 rounded-xl border bg-amber-50/50 border-amber-200/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-500">🏷️ 인수가격 설정</p>
                      <div className="flex gap-1.5">
                        {[90, 100, 110, 120, 130].map(r => (
                          <button key={r}
                            onClick={() => setResidualRate(r)}
                            className={`px-2 py-1 text-[10px] rounded border font-bold
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
                      <span className="text-[11px] text-gray-400">종료시점 추정시세 대비</span>
                      <input
                        type="number"
                        min="50" max={150} step="1"
                        value={residualRate}
                        onChange={(e) => setResidualRate(Math.max(50, Math.min(150, parseInt(e.target.value) || 100)))}
                        className="w-14 text-center border border-gray-200 rounded px-1 py-0.5 text-xs font-bold focus:border-amber-500 outline-none"
                      />
                      <span className="text-[11px] text-gray-400">%</span>
                    </div>

                    {residualRate > 100 && (
                      <div className="mt-2 p-2 bg-amber-100/50 rounded-lg">
                        <p className="text-[11px] text-amber-700">
                          인수가격을 시세보다 <b>{residualRate - 100}%</b> 높게 설정 → 월 렌탈료가 낮아져 가격 경쟁력 확보.
                          고객은 낮은 월납입 대신 계약 종료 시 인수가격으로 차량을 구매합니다.
                        </p>
                      </div>
                    )}

                    {calculations && (
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-400">종료시점 추정시세</span>
                          <span className="font-bold text-gray-600">{f(calculations.endMarketValue)}원</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-400">인수가격 (시세 × {residualRate}%)</span>
                          <span className="font-bold text-amber-600">{f(calculations.residualValue)}원</span>
                        </div>
                        {residualRate > 100 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-amber-500">인수 프리미엄 (시세 초과분)</span>
                            <span className="font-bold text-amber-500">+{f(calculations.buyoutPrice - calculations.endMarketValue)}원</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-400">감가 대상금액 (취득원가 - 인수가)</span>
                          <span className="font-bold text-red-500">{f(Math.max(0, calculations.costBase - calculations.residualValue))}원</span>
                        </div>
                        {calculations.costBase > 0 && (
                          <div className="mt-1 pt-1 border-t border-gray-100">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">월 감가비 절감 효과</span>
                              <span className="font-bold text-green-600">
                                잔존 80% 대비 월 -{f(Math.round((Math.max(0, calculations.costBase - calculations.endMarketValue * 0.8) - Math.max(0, calculations.costBase - calculations.residualValue)) / termMonths))}원
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}


                <InputRow label="목표 마진" value={margin} onChange={setMargin} />
                <div className="mt-2 flex gap-2">
                  {[100000, 150000, 200000, 300000].map(m => (
                    <button key={m}
                      onClick={() => setMargin(m)}
                      className={`flex-1 py-1 text-xs rounded border font-bold
                        ${margin === m
                          ? 'bg-steel-600 text-white border-steel-600'
                          : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                    >
                      {m / 10000}만
                    </button>
                  ))}
                </div>
              </div>

              {/* 최종 산출 영수증 */}
              <div className="bg-gray-950 text-white rounded-2xl shadow-2xl p-6">
                <div className="text-center border-b border-gray-700 pb-4 mb-4">
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">PRICING ANALYSIS</p>
                  <h2 className="text-2xl font-black mt-1">렌트가 산출 결과</h2>
                  <div className="flex justify-center gap-3 mt-2">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold
                      ${contractType === 'return'
                        ? 'bg-steel-600/30 text-steel-300'
                        : 'bg-amber-500/30 text-amber-300'
                      }`}>
                      {contractType === 'return' ? '🔄 반납형' : '🏷️ 인수형'}
                    </span>
                    <span className="text-[11px] text-gray-500">{termMonths}개월</span>
                    {contractType === 'buyout' && (
                      <span className="text-[11px] text-gray-500">인수 {residualRate}%</span>
                    )}
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  {totalAcquisitionCost > 0 && (
                    <div className="flex justify-between text-xs text-gray-500 pb-2 border-b border-gray-800">
                      <span>취득원가 기준</span>
                      <span className="font-bold text-gray-400">{f(totalAcquisitionCost)}원</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 감가비용</span>
                    <span className="font-bold">{f(calculations.monthlyDepreciation)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 금융비용</span>
                    <span className="font-bold">{f(calculations.totalMonthlyFinance)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 보험료</span>
                    <span className="font-bold">{f(monthlyInsuranceCost)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 세금</span>
                    <span className="font-bold">{f(calculations.monthlyTax)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 정비비</span>
                    <span className="font-bold">{f(monthlyMaintenance)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">월 리스크적립</span>
                    <span className="font-bold">{f(calculations.monthlyRiskReserve)}원</span>
                  </div>
                  <div className="flex justify-between text-green-400">
                    <span>보증금/선납 할인</span>
                    <span className="font-bold">-{f(calculations.totalDiscount)}원</span>
                  </div>

                  <div className="border-t border-gray-700 my-4" />

                  <div className="flex justify-between text-red-400">
                    <span className="font-bold">총 월 원가</span>
                    <span className="font-black text-lg">{f(calculations.totalMonthlyCost)}원</span>
                  </div>
                  <div className="flex justify-between text-yellow-400">
                    <span className="font-bold">+ 마진</span>
                    <span className="font-bold">{f(margin)}원</span>
                  </div>

                  <div className="border-t border-gray-500 my-4" />

                  <div className="flex justify-between items-end">
                    <span className="text-gray-300">공급가액 (월)</span>
                    <span className="text-xl font-bold">{f(calculations.suggestedRent)}원</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>부가세 (10%)</span>
                    <span>{f(calculations.suggestedRent * 0.1)}원</span>
                  </div>

                  <div className="border-t border-gray-500 my-4" />

                  <div className="text-right">
                    <p className="text-sm text-yellow-400 font-bold mb-1">최종 렌트가 (VAT 포함)</p>
                    <p className="text-4xl font-black tracking-tight">
                      {f(calculations.rentWithVAT)}<span className="text-lg ml-1">원</span>
                    </p>
                  </div>

                  {/* 인수형: 인수가격 표시 */}
                  {contractType === 'buyout' && (
                    <div className="mt-4 pt-4 border-t border-amber-500/30">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[11px] text-amber-400/70">계약 종료 시</p>
                          <p className="text-sm text-amber-300 font-bold">인수가격 (잔존가치)</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-amber-400">
                            {f(calculations.buyoutPrice)}<span className="text-sm ml-1">원</span>
                          </p>
                          <p className="text-[10px] text-gray-500">
                            출고가 대비 {factoryPrice > 0 ? (calculations.buyoutPrice / factoryPrice * 100).toFixed(1) : 0}%
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-gray-500 text-right">
                        총 납입액 {f(calculations.rentWithVAT * termMonths + deposit)} + 인수 {f(calculations.buyoutPrice)}
                        = <b className="text-gray-300">{f(calculations.rentWithVAT * termMonths + deposit + calculations.buyoutPrice)}원</b>
                      </div>
                    </div>
                  )}

                  {/* 반납형: 잔존가치 참고 */}
                  {contractType === 'return' && (
                    <div className="mt-4 pt-3 border-t border-gray-700">
                      <div className="flex justify-between text-[11px] text-gray-500">
                        <span>반납 시 잔존가치 (회수 예상)</span>
                        <span className="font-bold text-gray-400">{f(calculations.residualValue)}원</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 원가 비중 차트 */}
                <div className="mt-6 pt-4 border-t border-gray-700">
                  <p className="text-xs text-gray-400 mb-3 font-bold">원가 비중 분석</p>
                  <div className="space-y-2">
                    <CostBar label="감가" value={calculations.monthlyDepreciation} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-red-500" />
                    <CostBar label="금융" value={calculations.totalMonthlyFinance} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-steel-500" />
                    <CostBar label="보험+세금" value={monthlyInsuranceCost + calculations.monthlyTax} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-purple-500" />
                    <CostBar label="정비" value={monthlyMaintenance} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-amber-500" />
                    <CostBar label="리스크" value={calculations.monthlyRiskReserve} total={calculations.totalMonthlyCost + calculations.totalDiscount} color="bg-red-400" />
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="mt-6 space-y-3">
                  <button onClick={handleGoToCustomerStep}
                    className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-gray-200 transition-colors text-base">
                    이 분석으로 견적서 작성 →
                  </button>
                  <button onClick={handleSaveWorksheet} disabled={saving}
                    className="w-full bg-gray-800 text-gray-300 font-bold py-3 rounded-xl hover:bg-gray-700 transition-colors text-sm disabled:opacity-50">
                    {saving ? '저장 중...' : '워크시트 저장'}
                  </button>
                </div>
              </div>

              {/* 수익성 요약 */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h3 className="font-bold text-gray-700 mb-4 text-sm">수익성 요약</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">월 순이익</span>
                    <span className="font-bold text-green-600">{f(margin)}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">연 순이익</span>
                    <span className="font-bold text-green-600">{f(margin * 12)}원</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">계약기간 총이익</span>
                    <span className="font-black text-green-700 text-lg">{f(margin * termMonths)}원</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">마진율</span>
                      <span className="font-bold text-steel-600">
                        {calculations.suggestedRent > 0 ? (margin / calculations.suggestedRent * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">투자수익률 (ROI)</span>
                      <span className="font-bold text-steel-600">
                        {purchasePrice > 0 ? ((margin * 12) / purchasePrice * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>

                  {/* 계약 유형별 추가 수익성 분석 */}
                  <div className="border-t pt-3 mt-3">
                    <p className="text-[11px] text-gray-400 font-bold mb-2">
                      {contractType === 'return' ? '🔄 반납형 수익성' : '🏷️ 인수형 수익성'}
                    </p>
                    {contractType === 'return' ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">반납 차량 회수가</span>
                          <span className="font-bold text-steel-600">{f(calculations.residualValue)}원</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">렌트료 수입 합계</span>
                          <span className="font-bold text-gray-700">{f(calculations.rentWithVAT * termMonths)}원</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">총 회수 (렌트+잔존)</span>
                          <span className="font-black text-green-600">{f(calculations.rentWithVAT * termMonths + calculations.residualValue)}원</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>취득원가 대비</span>
                          <span className="font-bold">
                            {calculations.costBase > 0
                              ? (((calculations.rentWithVAT * termMonths + calculations.residualValue) / calculations.costBase) * 100).toFixed(1)
                              : 0}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600">인수가격 (고객)</span>
                          <span className="font-bold text-amber-600">{f(calculations.buyoutPrice)}원</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">고객 총 지불액</span>
                          <span className="font-bold text-gray-700">
                            {f(calculations.rentWithVAT * termMonths + deposit + calculations.buyoutPrice)}원
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>렌트료 수입 합계</span>
                          <span className="font-bold">{f(calculations.rentWithVAT * termMonths)}원</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>인수 수익 (잔존 - 예상시세)</span>
                          <span className={`font-bold ${calculations.buyoutPrice >= calculations.endMarketValue ? 'text-green-500' : 'text-red-500'}`}>
                            {calculations.buyoutPrice >= calculations.endMarketValue ? '+' : ''}{f(calculations.buyoutPrice - calculations.endMarketValue)}원
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  )
}
