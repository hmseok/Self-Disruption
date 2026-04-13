// ============================================
// 투자자 정산 시스템 — 날짜 유틸리티
// N월 마감 → N+1월 지급 기준
// ============================================

/** N월 → N+1월 문자열 (지급월 계산) */
export function nextMonthStr(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo, 1) // JS 0-indexed → mo(1-indexed)가 다음 달
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** N월 → N-1월 문자열 (기준월 역산) */
export function prevMonthStr(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1) // mo-2: 이전 달
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 해당 월의 일수 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * 기준월 목록 생성 (계약시작월 ~ 선택월의 전월)
 * 선택월 = 지급월, 기준월 = 지급월 - 1 이하
 * 예: 선택월 2026-03 → 기준월은 2026-02 이하 (2월 마감분이 3월에 지급)
 */
export function getBaseMonths(
  contractStartMonth: string | undefined,
  selYear: number,
  selMonth: number
): string[] {
  const months: string[] = []
  const limitStart = new Date(selYear - 1, selMonth - 1, 1) // 최대 12개월 전
  let start = contractStartMonth ? new Date(contractStartMonth + '-01') : limitStart
  if (start < limitStart) start = limitStart

  // 기준월 상한: 선택월의 전월 (지급기준)
  const end = new Date(selYear, selMonth - 2, 1) // selMonth-2: 전월 (JS 0-indexed)
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur <= end) {
    months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

/**
 * 일할계산: 초기 계약월의 지입비를 계약일 기준으로 일할계산
 */
export function calcProrataFee(
  fee: number,
  contractStartDate: string | undefined,
  baseMonth: string
): number {
  if (!contractStartDate) return fee
  const startMonth = contractStartDate.slice(0, 7)
  if (baseMonth !== startMonth) return fee // 첫 월이 아니면 전액

  const startDay = parseInt(contractStartDate.slice(8, 10)) || 1
  const [y, mo] = baseMonth.split('-').map(Number)
  const dim = daysInMonth(y, mo)
  const remainingDays = dim - startDay + 1
  return Math.floor(fee * remainingDays / dim)
}
