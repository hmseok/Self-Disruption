'use client'

// ═══════════════════════════════════════════════════════════════
// 인사 마스터 공용 — 타입 / 상수 / 스타일 / 토스트 (2026-08-08 재작성)
// 데이터: profiles / departments / positions (FMI 단독)
// ═══════════════════════════════════════════════════════════════

import { useCallback, useState } from 'react'
import { COLORS } from '@/app/utils/ui-tokens'

// ───────────────────────── 타입 ─────────────────────────

export type Employee = {
  id: string
  email: string
  name?: string | null
  employee_name?: string | null
  display_name?: string | null
  phone?: string | null
  role: 'admin' | 'master' | 'user' | string
  is_active: boolean | number
  position_id?: string | null
  department_id?: string | null
  hire_date?: string | null
  resign_date?: string | null
  resign_reason?: string | null
  emp_status?: string | null
  created_at?: string | null
  position?: { id: string; name: string; level?: number } | null
  department?: { id: string; name: string } | null
}

export type Department = { id: string; name: string; sort_order?: number | null }
export type Position = { id: string; name: string; level?: number | null }

export type EmpStatus = 'active' | 'on_leave' | 'resigned'

// ───────────────────────── 헬퍼 ─────────────────────────

export const empName = (e: Employee) => e.display_name || e.employee_name || e.name || e.email

export const getEmpStatus = (e: Employee): EmpStatus => {
  const s = e.emp_status as EmpStatus | null | undefined
  // 계정 차단(is_active=0)인데 emp_status='active' 로 남은 행(과거 비활성 처리 잔재)은
  // 재직 집계에서 제외 — 휴직은 그대로 휴직으로 둔다
  if (s === 'on_leave') return 'on_leave'
  if (s === 'resigned' || e.resign_date || !e.is_active) return 'resigned'
  if (s === 'active') return 'active'
  return e.is_active ? 'active' : 'resigned'
}

export const d10 = (s: any) => (s ? String(s).slice(0, 10) : '')

// ───────────────────────── 메타 ─────────────────────────

export const ROLE_META: Record<string, { label: string; bg: string; fg: string }> = {
  admin:  { label: '최고 관리자', bg: COLORS.bgViolet, fg: '#7c3aed' },
  master: { label: '관리자',     bg: COLORS.bgBlue,   fg: COLORS.primary },
  user:   { label: '직원',       bg: COLORS.bgGray,   fg: COLORS.textSecondary },
}

export const EMP_STATUS_META: Record<EmpStatus, { label: string; bg: string; fg: string }> = {
  active:   { label: '재직', bg: COLORS.bgGreen,     fg: COLORS.success },
  on_leave: { label: '휴직', bg: COLORS.bgAmber,     fg: COLORS.warning },
  resigned: { label: '퇴사', bg: COLORS.borderFaint, fg: COLORS.textDim },
}

// 부서 표시 색 — sort_order 순서 기반 고정 팔레트 (DB 저장 없음, 표시 전용)
const DEPT_PALETTE = [COLORS.primary, '#d97706', '#16a34a', '#7c3aed', '#dc2626', '#64748b']
export const deptColor = (departments: Department[], deptId?: string | null): string => {
  const idx = departments.findIndex(d => d.id === deptId)
  return idx >= 0 ? DEPT_PALETTE[idx % DEPT_PALETTE.length] : COLORS.textDim
}

export const DATA_SCOPES = [
  { value: 'all', label: '전체 데이터' },
  { value: 'department', label: '부서만' },
  { value: 'own', label: '본인만' },
]

// 급여 — 동적 수당 옵션 (구 화면 승계)
export const ALLOWANCE_OPTIONS = [
  { key: 'meal_allowance', label: '식대', defaultAmount: 200000, hint: '비과세 한도 월 20만원' },
  { key: 'transport_allowance', label: '교통비', defaultAmount: 0, hint: '과세' },
  { key: 'self_drive_allowance', label: '자가운전보조금', defaultAmount: 0, hint: '비과세 한도 월 20만원' },
  { key: 'position_allowance', label: '직책수당', defaultAmount: 0, hint: '직급별 수당' },
  { key: 'family_allowance', label: '가족수당', defaultAmount: 0, hint: '부양가족 수당' },
  { key: 'night_allowance', label: '야간수당', defaultAmount: 0, hint: '22:00~06:00 150%' },
  { key: 'overtime_allowance', label: '연장수당', defaultAmount: 0, hint: '주 40시간 초과 150%' },
  { key: 'annual_leave_allowance', label: '연차수당', defaultAmount: 0, hint: '미사용 연차 보상' },
  { key: 'bonus', label: '상여금', defaultAmount: 0, hint: '성과·명절' },
]
export const ALLOWANCE_LABELS: Record<string, string> = Object.fromEntries(
  ALLOWANCE_OPTIONS.map(o => [o.key, o.label])
)
// 과거 한글 키 → 영문 키 (allowances JSON 하위 호환)
export const LEGACY_ALLOWANCE_MAP: Record<string, string> = {
  '교통비': 'transport_allowance', '자가운전보조금': 'self_drive_allowance',
  '직책수당': 'position_allowance', '가족수당': 'family_allowance',
  '야간수당': 'night_allowance', '연장수당': 'overtime_allowance',
  '연차수당': 'annual_leave_allowance', '상여금': 'bonus',
}

// ───────────────────────── 스타일 ─────────────────────────

export const cardS: React.CSSProperties = {
  background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
  boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden',
}
export const inputS: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
  fontSize: 13, outline: 'none', background: '#f6f7f9', boxSizing: 'border-box', color: COLORS.textPrimary,
}
export const lblS: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4, display: 'block',
}
export const btnPrimaryS: React.CSSProperties = {
  background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 9,
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
export const btnGhostS: React.CSSProperties = {
  background: '#fff', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderSubtle}`,
  borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

export function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 8px', borderRadius: 6, background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

// ───────────────────────── 토스트 ─────────────────────────
// 결과 알림은 상단 토스트로 통일 (브라우저 알림창 금지)

export type ToastState = { text: string; tone: 'success' | 'error' } | null

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null)
  const show = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    setToast({ text, tone })
    window.setTimeout(() => setToast(null), 3200)
  }, [])
  return { toast, show }
}

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null
  const good = toast.tone === 'success'
  return (
    <div style={{
      position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 400,
      background: good ? '#1a1d23' : COLORS.danger, color: '#fff', borderRadius: 10,
      padding: '10px 18px', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(16,24,40,0.25)',
      maxWidth: '90vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {toast.text}
    </div>
  )
}
