// ═══════════════════════════════════════════════════════════════════
// CallScheduler — computed_hours 계산 (서버/클라 공용)
// ═══════════════════════════════════════════════════════════════════
import type { SpecialCode, ShiftSlot } from './types'

/** "HH:MM:SS" 또는 "HH:MM" → 분 단위 정수 */
function timeToMinutes(t: string): number {
  const parts = t.split(':')
  const h = Number(parts[0] || 0)
  const m = Number(parts[1] || 0)
  return h * 60 + m
}

/**
 * 슬롯 + special_code 로 실 근무시간(시간 단위) 계산
 * - is_overnight 슬롯은 종료가 익일 → +24h
 * - am_half / pm_half = 절반
 * - am_free / pm_free / off = 0
 */
export function computeHours(
  slot: Pick<ShiftSlot, 'start_time' | 'end_time' | 'is_overnight'>,
  special: SpecialCode,
): number {
  if (special === 'off' || special === 'am_free' || special === 'pm_free') return 0

  let startMin = timeToMinutes(slot.start_time)
  let endMin = timeToMinutes(slot.end_time)
  if (slot.is_overnight) endMin += 24 * 60

  let hours = (endMin - startMin) / 60
  if (hours < 0) hours = 0

  if (special === 'am_half' || special === 'pm_half') {
    hours = hours / 2
  }
  return Math.round(hours * 100) / 100
}

/** Date 인스턴스에서 'YYYY-MM-DD' (KST) 추출 */
export function toIsoDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 한 달 일자 배열 ('YYYY-MM-DD') */
export function monthDays(year: number, month: number): string[] {
  const days: string[] = []
  const last = new Date(year, month, 0).getDate()
  for (let d = 1; d <= last; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

/** 'YYYY-MM-DD' → 요일 인덱스 (0=일 .. 6=토) */
export function dowIndex(isoDate: string): number {
  return new Date(isoDate + 'T00:00:00').getDay()
}

export const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const
