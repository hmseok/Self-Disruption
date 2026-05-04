// ═══════════════════════════════════════════════════════════════════
// 휴가 종류별 default 값 (회사 정책)
// 본 회사 (Ride Inc. 콜센터) 정책 — 추후 회사 마스터 테이블로 분리 가능
//
// 기록: _docs/OPERATIONS.md §4 휴가 발급 정책
// ═══════════════════════════════════════════════════════════════════

export type LeaveType = 'annual' | 'familyday' | 'sick' | 'unpaid' | 'family' | 'holiday' | 'other'
export type AmPm = 'full' | 'am' | 'pm' | 'custom'

interface LeaveDefault {
  am_pm: AmPm
  hours: number  // am_pm='custom' 일 때 적용
  description: string
}

/**
 * 종류 선택 시 자동 적용되는 시간 단위 + 시간 default
 *
 * 본 회사 정책:
 *   - 연차: 종일 8시간 (1일)
 *   - 패밀리데이: 3시간 일찍 퇴근 (custom 3h, 월 1회)
 *   - 반차: 4시간 일찍 퇴근 (am/pm) — 종류 = 연차 또는 별도
 *   - 병가: 종일 (의사 진단 시)
 */
export const LEAVE_DEFAULTS: Record<LeaveType, LeaveDefault> = {
  annual:    { am_pm: 'full',   hours: 8, description: '연차 — 종일 (8h)' },
  familyday: { am_pm: 'custom', hours: 3, description: '패밀리데이 — 3시간 일찍 퇴근' },
  sick:      { am_pm: 'full',   hours: 8, description: '병가 — 종일' },
  unpaid:    { am_pm: 'full',   hours: 8, description: '무급 — 종일 또는 사용자 지정' },
  family:    { am_pm: 'full',   hours: 8, description: '경조 — 회사 규정 일수' },
  holiday:   { am_pm: 'full',   hours: 8, description: '공휴일 휴무 — 종일' },
  other:     { am_pm: 'full',   hours: 8, description: '기타 — 사용자 지정' },
}

/**
 * 빠른 프리셋 (회사 정책 — 회사마다 다를 수 있음)
 */
export const QUICK_PRESETS = [
  { label: '⏰ 반차 (오전 4h)', am_pm: 'am' as AmPm, hours: 4 },
  { label: '⏰ 반차 (오후 4h)', am_pm: 'pm' as AmPm, hours: 4 },
  { label: '🏃 패밀리데이 (3h)', am_pm: 'custom' as AmPm, hours: 3 },
  { label: '☀ 종일 (8h)', am_pm: 'full' as AmPm, hours: 8 },
]
