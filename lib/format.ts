// ═══════════════════════════════════════════════════════════════════
// 공통 포매터 — 모든 페이지에서 일관된 금액/숫자 표출
// ═══════════════════════════════════════════════════════════════════
//
// 배경: Prisma Decimal 타입은 raw query 응답에서 문자열로 반환됨
//       JavaScript "62500000" + 0 = "625000000" (문자열 연결)
//       String.toLocaleString() 은 콤마 안 찍음
// 해결: 표시 직전 항상 Number() 캐스팅 + toLocaleString()
//
// 사용:
//   import { fmtMoney, fmtNumber, fmtDate, sumNumbers } from '@/lib/format'
//   <span>{fmtMoney(car.purchase_price)}원</span>
//
// 모든 페이지에서 이 모듈만 쓰도록 통일 (knowledge/common-errors.md 참조)
// ═══════════════════════════════════════════════════════════════════

/**
 * 금액 표출 — null/undefined/string/Decimal 모두 안전 처리
 * 예: fmtMoney("62500000") → "62,500,000"
 *     fmtMoney(null)       → "0"
 *     fmtMoney(undefined)  → "0"
 */
export function fmtMoney(v: any): string {
  return (Number(v) || 0).toLocaleString()
}

/** 금액 + "원" 단위 (헬퍼) */
export function fmtWon(v: any): string {
  return `${fmtMoney(v)}원`
}

/**
 * 일반 숫자 (콤마 표시) — fmtMoney 와 동일 로직
 * 예: fmtNumber(16568) → "16,568"
 */
export function fmtNumber(v: any): string {
  return fmtMoney(v)
}

/**
 * 날짜 표출 — Date / ISO 문자열 / null 모두 처리
 * 예: fmtDate("2026-04-29T00:00:00Z") → "2026-04-29"
 *     fmtDate(null)                   → "-"
 */
export function fmtDate(v: any, fallback = '-'): string {
  if (!v) return fallback
  const s = v instanceof Date ? v.toISOString() : String(v)
  return s.slice(0, 10)
}

/**
 * 다수 값 합산 — Decimal 문자열 안전 합산
 * 예: sumNumbers([car.a, car.b, car.c]) → 정확한 number 합
 */
export function sumNumbers(values: any[]): number {
  return values.reduce((s, v) => s + (Number(v) || 0), 0)
}

/**
 * 비율 (0~1) → 퍼센트 문자열
 * 예: fmtPercent(0.876) → "87.6%"
 */
export function fmtPercent(v: any, decimals = 1): string {
  const n = Number(v) || 0
  return `${(n * 100).toFixed(decimals)}%`
}

/**
 * 차종 라벨 조합 — brand + model + trim
 * null 안전, 빈값 자동 제거
 */
export function fmtCarLabel(car: { brand?: any; model?: any; trim?: any }): string {
  return [car.brand, car.model, car.trim].filter(Boolean).join(' ')
}
