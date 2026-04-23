/**
 * 크롤러 공통 타입 — Phase A (2026-04-23)
 *
 * KB차차차 / 엔카 / 제조사 공식 3개 소스 통합
 */

// ── 크롤링 대상 ──
export interface CrawlTarget {
  id?: number
  brand: string
  model: string
  yearFrom: number
  yearTo: number
  fuelType?: string
  origin: string          // '국산' | '수입'
  manufacturerUrl?: string
  isActive: boolean
}

// ── 크롤링 결과 (1건) ──
export interface CrawlResult {
  brand: string
  model: string
  trimName?: string
  year: number
  fuelType: string
  origin: string
  vehicleClass?: string
  mileageKm?: number
  marketPrice: number     // 대표 시세 (원)
  minPrice?: number
  maxPrice?: number
  sampleCount: number     // 표본/매물 수
  sourceSite: string      // 'kb_chacha' | 'encar' | 'manufacturer'
  sourceUrl?: string
  note?: string
}

// ── 소스별 크롤러 인터페이스 ──
export interface CrawlerAdapter {
  sourceSite: string
  crawl(targets: CrawlTarget[]): Promise<CrawlResult[]>
}

// ── 크롤링 로그 ──
export interface CrawlLogEntry {
  sourceSite: string
  totalTargets: number
  successCount: number
  failCount: number
  durationMs: number
  errorSummary?: string
  triggeredBy: 'manual' | 'cron'
}

// ── 인기 차종 시드 (26종) ──
export const POPULAR_TARGETS: CrawlTarget[] = [
  // 국산 — 현대
  { brand: '현대', model: '아반떼', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '쏘나타', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '그랜저', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '투싼', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '싼타페', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '코나', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '셀토스', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '스타리아', yearFrom: 2021, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '아이오닉5', yearFrom: 2021, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '현대', model: '아이오닉6', yearFrom: 2023, yearTo: 2026, origin: '국산', isActive: true },
  // 국산 — 기아
  { brand: '기아', model: 'K3', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '기아', model: 'K5', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '기아', model: 'K8', yearFrom: 2021, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '기아', model: '스포티지', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '기아', model: '쏘렌토', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '기아', model: '카니발', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '기아', model: 'EV6', yearFrom: 2022, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '기아', model: 'EV9', yearFrom: 2023, yearTo: 2026, origin: '국산', isActive: true },
  // 국산 — 기타
  { brand: '기아', model: '모닝', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  { brand: '기아', model: '레이', yearFrom: 2020, yearTo: 2026, origin: '국산', isActive: true },
  // 수입
  { brand: 'BMW', model: '3시리즈', yearFrom: 2020, yearTo: 2026, origin: '수입', isActive: true },
  { brand: 'BMW', model: '5시리즈', yearFrom: 2020, yearTo: 2026, origin: '수입', isActive: true },
  { brand: '벤츠', model: 'C클래스', yearFrom: 2020, yearTo: 2026, origin: '수입', isActive: true },
  { brand: '벤츠', model: 'E클래스', yearFrom: 2020, yearTo: 2026, origin: '수입', isActive: true },
  { brand: '테슬라', model: '모델3', yearFrom: 2020, yearTo: 2026, origin: '수입', isActive: true },
  { brand: '테슬라', model: '모델Y', yearFrom: 2021, yearTo: 2026, origin: '수입', isActive: true },
]
