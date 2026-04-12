/**
 * rent-calc-types.ts
 * Type definitions and constants for rental car pricing calculations
 * Extracted from RentPricingBuilder.tsx
 */

// ============================================
// 타입 정의
// ============================================
export interface CarData {
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

export interface MarketComp {
  id?: string
  competitor_name: string
  vehicle_info: string
  monthly_rent: number
  deposit: number
  term_months: number
  source: string
}

export interface NewCarOption {
  name: string
  price: number
  description?: string
}

export interface NewCarColor {
  name: string
  code?: string
  price: number
}

export interface NewCarTrim {
  name: string
  base_price: number
  note?: string
  exterior_colors?: NewCarColor[]
  interior_colors?: NewCarColor[]
  options: NewCarOption[]
}

export interface NewCarVariant {
  variant_name: string
  fuel_type: string
  engine_cc: number
  consumption_tax?: string    // 개별소비세 구분 (예: "개별소비세 5%", "개별소비세 3.5%")
  trims: NewCarTrim[]
}

export interface NewCarResult {
  brand: string
  model: string
  model_detail?: string   // 상세모델명 (트림 포함, 예: "520i (Base, M Sport)")
  year: number
  variants: NewCarVariant[]
  available: boolean
  message?: string
  source?: string
}

export interface BusinessRules {
  [key: string]: number
}

// ============================================
// 3축 감가 분류 매핑 (depreciation_rates 테이블과 1:1 매칭)
// ============================================
export interface DepAxes {
  origin: '국산' | '수입'
  vehicle_class: '경차' | '소형_세단' | '준중형_세단' | '중형_세단' | '대형_세단' | '소형_SUV' | '중형_SUV' | '대형_SUV' | 'MPV' | '프리미엄'
  fuel_type: '내연기관' | '하이브리드' | '전기'
  /** 하위 호환용 flat 카테고리 라벨 */
  label: string
}

// 차종 분류 (공제조합 기준 5분류)
export type InsVehicleClass = '경형' | '소형' | '중형' | '대형' | '수입'

// 운전자 연령 기준 (렌터카 공제조합 실무)
// 실무: 26세이상이 표준, 21세이상은 할증, 전연령은 최대 할증
export type DriverAgeGroup = '26세이상' | '21세이상' | '전연령'

// ============================================
// 🏭 브랜드 프리셋 (국내 / 수입)
// ============================================
export const DOMESTIC_BRANDS = ['기아', '현대', '제네시스', '쉐보레', '르노코리아', 'KG모빌리티']
export const IMPORT_BRAND_PRESETS = ['BMW', '벤츠', '아우디', '폭스바겐', '볼보', '테슬라', '토요타', '렉서스', '포르쉐', '미니', '랜드로버', '푸조', '혼다']

// ============================================
// 🆕 기준 테이블 차종 매핑 유틸
// ============================================
export const IMPORT_BRANDS = ['벤츠', 'BMW', 'BENZ', 'Mercedes', '아우디', 'Audi', '폭스바겐', 'VW', '렉서스', 'Lexus',
  '포르쉐', 'Porsche', '볼보', 'Volvo', '재규어', 'Jaguar', '랜드로버', '링컨', 'Lincoln', '캐딜락',
  '인피니티', '미니', 'MINI', '마세라티', '페라리', '람보르기니', '벤틀리', '롤스로이스', '맥라렌',
  '테슬라', 'Tesla', '리비안', 'Rivian', '폴스타', 'Polestar']

export const PREMIUM_MODELS = ['S-Class', 'S클래스', '7시리즈', 'A8', 'LS', 'G80', 'G90', 'GV80', 'GV70',
  '카이엔', '파나메라', 'Cayenne', 'Panamera', 'X7', 'GLS', 'Q8', 'Range Rover']

// 전기차 판별: fuel 기반 키워드 (연료 타입에서 판별)
export const EV_FUEL_KEYWORDS = ['전기', 'EV', 'Electric', 'BEV', 'ELECTRIC', '배터리', 'Battery']
// 전기차 판별: 모델명 기반 키워드 (정확한 모델명만)
export const EV_MODEL_KEYWORDS = ['EV3', 'EV4', 'EV5', 'EV6', 'EV9', '아이오닉', 'IONIQ', 'EQE', 'EQS', 'EQA', 'EQB',
  'iX', 'i4', 'i5', 'i7', 'iX1', 'iX3', 'E-TRON', 'Q4 E-TRON', 'Q6 E-TRON', 'Q8 E-TRON', 'ID.3', 'ID.4', 'ID.7',
  'MODEL 3', 'MODEL Y', 'MODEL S', 'MODEL X', '모델3', '모델Y', '모델S', '모델X',
  'KONA ELECTRIC', '코나 일렉트릭', 'NIRO EV', '니로 EV', 'NIRO PLUS', '니로 플러스',
  'BOLT', '볼트', 'MACH-E', '머스탱 마하', 'ENYAQ', 'BORN', 'ARIYA', '아리아',
  'e-2008', 'e-208', 'E-C4', 'DOLPHIN', 'SEAL', 'ATTO', '돌핀', '씰', '아토']
export const HEV_KEYWORDS = ['하이브리드', 'HEV', 'PHEV', 'Hybrid']
