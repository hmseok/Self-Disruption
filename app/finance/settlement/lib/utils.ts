// ============================================
// 투자자 정산 시스템 — 공통 유틸리티
// Prisma Raw SQL이 Decimal을 문자열로 리턴 → Number 강제 변환
// ============================================

/** 안전한 숫자 변환 (Decimal 문자열 대응) */
export const N = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 콤마 포맷 (예: 1,234,567) */
export const nf = (v: any): string => {
  const num = N(v)
  return num ? num.toLocaleString() : '0'
}

/** 부호 포맷 (예: +1,234 / -1,234) */
export const nfSign = (v: any): string => {
  const num = N(v)
  return num > 0 ? `+${nf(num)}` : nf(num)
}

/** 축약 포맷 (예: 1.2억, 340만) */
export const nfShort = (v: any): string => {
  const num = N(v)
  if (Math.abs(num) >= 100_000_000) return `${(num / 100_000_000).toFixed(1)}억`
  if (Math.abs(num) >= 10_000) return `${Math.floor(num / 10_000)}만`
  return nf(num)
}

/** 카테고리 그룹 매칭 */
export function categorizeAmount(category: string, groups: Record<string, string[]>): string {
  for (const [groupName, keywords] of Object.entries(groups)) {
    if (keywords.some(k => category.includes(k) || k.includes(category))) {
      return groupName
    }
  }
  return '기타'
}
