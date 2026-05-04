// ═══════════════════════════════════════════════════════════════════
// CallScheduler — 단일 source of truth 타입 정의
// 모든 컴포넌트/API 응답이 이 파일을 import 한다.
// ═══════════════════════════════════════════════════════════════════

export type ColorTone =
  | 'blue'
  | 'gray'
  | 'green'
  | 'amber'
  | 'violet'
  | 'red'
  | 'none'
  // PR-2QQ-a 확장 (총 14개)
  | 'indigo'
  | 'sky'
  | 'teal'
  | 'lime'
  | 'orange'
  | 'pink'
  | 'slate'

export type SpecialCode =
  | 'none'      // 일반 근무
  | 'am_free'   // 오전F (휴무 자유)
  | 'pm_free'   // 오후F
  | 'am_half'   // 오전반차
  | 'pm_half'   // 오후반차
  | 'off'       // 휴무 (회색 셀)

export type ShiftCategory = 'day' | 'evening' | 'overnight'
export type ScheduleStatus = 'draft' | 'published' | 'archived'
export type DistributionChannel = 'jandi' | 'email' | 'link' | 'manual'
export type DistributionStatus = 'queued' | 'sent' | 'partial' | 'failed'
export type GroupLabel = '주간' | '야간' | '저녁' | null

export interface ShiftSlot {
  id: string
  code: string
  label: string
  start_time: string  // "HH:MM:SS"
  end_time: string
  is_overnight: boolean
  category: ShiftCategory
  sort_order: number
  is_active: boolean
}

export interface Worker {
  id: string
  name: string
  profile_id: string | null
  color_tone: ColorTone
  group_label: GroupLabel
  phone: string | null
  email: string | null
  is_active: boolean
}

export interface Schedule {
  id: string
  year: number
  month: number
  title: string | null
  status: ScheduleStatus
  source: 'manual' | 'excel'
  published_at: string | null
  published_by: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface Assignment {
  id: string
  schedule_id: string
  work_date: string       // "YYYY-MM-DD"
  shift_slot_id: string
  worker_id: string | null
  special_code: SpecialCode
  computed_hours: number
  note: string | null
}

export interface Distribution {
  id: string
  schedule_id: string
  channel: DistributionChannel
  recipient_count: number
  recipients_snapshot: any
  status: DistributionStatus
  response_meta: any
  sent_at: string | null
  sent_by: string | null
  created_at: string
}

// ── 분석 결과 (KPI/AnalyticsPanel) ────────────────────────────────
export interface WorkerKpi {
  worker_id: string
  name: string
  group_label: GroupLabel
  color_tone: ColorTone
  shift_count: number
  total_hours: number
  overnight_count: number
  half_count: number
  free_count: number
  off_count: number
}

export interface SlotFillRate {
  slot_id: string
  code: string
  label: string
  filled: number
  total: number
  fill_rate: number  // 0..1
}

export interface ScheduleKpi {
  schedule_id: string
  worker_count: number
  total_assignments: number
  filled_assignments: number
  fill_rate: number               // 전체 충원율
  avg_hours_per_worker: number
  unfilled_slots: number
  half_count: number
  free_count: number
  off_count: number
  workers: WorkerKpi[]
  slots: SlotFillRate[]
}

// ── 그리드 응답 (상세 페이지) ─────────────────────────────────────
export interface ScheduleDetail {
  schedule: Schedule
  slots: ShiftSlot[]
  workers: Worker[]
  assignments: Assignment[]
  kpi: ScheduleKpi
  distributions: Distribution[]
}

// ── 라벨/도우미 ───────────────────────────────────────────────────
export const SPECIAL_LABEL: Record<SpecialCode, string> = {
  none: '',
  am_free: '오전F',
  pm_free: '오후F',
  am_half: '오전반차',
  pm_half: '오후반차',
  off: '휴무',
}

export const COLOR_TONE_OPTIONS: { value: ColorTone; label: string; hex: string }[] = [
  { value: 'none',   label: '없음',   hex: '#e5e7eb' },
  { value: 'blue',   label: '파랑',   hex: '#3b82f6' },
  { value: 'sky',    label: '하늘',   hex: '#0ea5e9' },
  { value: 'indigo', label: '인디고', hex: '#6366f1' },
  { value: 'violet', label: '보라',   hex: '#7c3aed' },
  { value: 'pink',   label: '핑크',   hex: '#ec4899' },
  { value: 'red',    label: '빨강',   hex: '#ef4444' },
  { value: 'orange', label: '오렌지', hex: '#f97316' },
  { value: 'amber',  label: '노랑',   hex: '#f59e0b' },
  { value: 'lime',   label: '라임',   hex: '#84cc16' },
  { value: 'green',  label: '녹색',   hex: '#22c55e' },
  { value: 'teal',   label: '틸',     hex: '#14b8a6' },
  { value: 'gray',   label: '회색',   hex: '#9ca3af' },
  { value: 'slate',  label: '슬레이트', hex: '#64748b' },
]
