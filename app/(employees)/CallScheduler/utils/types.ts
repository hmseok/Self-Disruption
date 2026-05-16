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
  // PR-2SS-b — 안전 가드 (graceful — 마이그 미적용 시 undefined)
  next_day_blocking_hours?: number       // 종료 후 N시간 안 다른 슬롯 시작 금지 (0=제약 X, 야간 디폴트 16)
  max_consecutive_days?: number | null   // 연속 N일 한도 (PR-2SS-c 활용, 야간 디폴트 3)
  // PR-2SS-d revert — min_seniority_months 폐기 (매니저 직접 판단)
  // PR-2SS-e — 시간 분해 + 가산율 (KPI 보조용, 현재 가산율 0)
  night_period_start?: string | null     // "HH:MM:SS" 가산 시간대 시작 (NULL=가산 없음)
  night_period_end?: string | null       // "HH:MM:SS" 가산 시간대 종료
  night_premium_rate?: number            // 0.50 = 50% 가산
}

// Phase K (2026-05-09) — Worker 정체성만 (글로벌 속성)
//   그룹 안 역할 (priority/dow/한도/일수/슬롯거부/패턴) → GroupMemberSettings 로 이동
export interface Worker {
  id: string
  name: string
  profile_id: string | null
  color_tone: ColorTone
  group_label: GroupLabel
  phone: string | null
  email: string | null
  is_active: boolean
  // PR-2QQ-b — 외부 직원 표식 (시각적, 글로벌)
  is_external?: boolean
  external_pattern?: string | null  // 외부 일정 패턴 메모 (deprecated)
  // PR-2QQ-d-revert — 외부 근무 cycle (정동민 같은 외부 일정 워커, 글로벌 — 모든 그룹 공통)
  // cycle on phase = 외부 근무 (당사 X) / cycle off phase = 외부 휴무 (당사 가능)
  cycle_days_on?: number | null        // 외부 연속 근무일
  cycle_days_off?: number | null       // 외부 연속 휴무일
  cycle_start_date?: string | null     // 'YYYY-MM-DD' 사이클 1일차 (외부 근무 첫째 날)
}

// Phase K — 그룹 안에서의 멤버 설정 (cs_group_members 행)
//   같은 워커가 그룹 A 와 B 에서 다른 우선순위/요일/한도 가능
export interface GroupMemberSettings {
  id: string
  group_id: string
  worker_id: string
  // 로테이션 순서 (이미 있던 컬럼)
  priority?: number
  // Phase K 신규 — 멤버 단위 제약/선호
  priority_level?: number              // 1=P1 / 2=P2 / 3=P3 (이 그룹 안)
  preferred_dow_prefer?: string | null // CSV '1,3,5'
  preferred_dow_avoid?: string | null  // CSV '0,6'
  max_consecutive_work_days?: number | null
  required_days_per_month?: number | null
  max_days_per_month?: number | null
  blocked_slot_ids?: string[] | null   // ['L01','L02']
  work_pattern_text?: string | null    // '2-on-2-off' 자유 메모
  // join 결과 (UI 표출용)
  worker_name?: string
  worker_color_tone?: ColorTone
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
  // N-25 — 그룹 필터용 (cs_assignments.group_id)
  group_id?: string | null
  // PR-2QQ-b — 수동 lock (외부 직원 일정 등 자동 생성이 보존)
  manual_lock?: boolean
  // PR-2SS-e — 시간 분해 (KPI 보조)
  day_hours?: number | null      // 일반 시간
  night_hours?: number | null    // 가산 시간대 시간
  premium_hours?: number | null  // 가산 적용 후 (= night_hours × rate)
}

// PR-2SS-h-1 — 그룹 차원 회피일 (cs_group_member_skip_dates)
export type SkipStatus = 'requested' | 'approved' | 'rejected' | 'canceled'

export interface GroupMemberSkipDate {
  id: string
  group_id: string
  worker_id: string
  start_date: string  // 'YYYY-MM-DD'
  end_date: string
  reason: string | null
  status: SkipStatus
  requested_by: string | null
  requested_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  // join 컬럼
  worker_name?: string
  worker_tone?: ColorTone
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
  // PR-2QQ-c — 균형도 상세
  fri_overnight: number   // 금요일 야간 횟수
  sun_overnight: number   // 일요일 야간 횟수
  weekend_count: number   // 주말 (토+일) 근무 횟수
  weekday_count: number   // 평일 근무 횟수
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
