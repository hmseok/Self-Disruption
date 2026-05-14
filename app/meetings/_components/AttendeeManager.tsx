'use client'
import { useMemo } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════
// AttendeeManager — V2 참석자 관리 (PR-V2-A → PR-V2-Ride-2)
//   · 데이터 소스: ride_employees (인사 마스터)
//   · controlled component (state는 부모)
//
// 변경 이력:
//   · 2026-05-13 V2-A: profiles 기반 시작
//   · 2026-05-13 V2-Ride-2: ride_employees 기반 + profile_id 옵션 + external_name fallback
// ═══════════════════════════════════════════════════════════════

interface Attendee {
  /** profiles.id — ride_employees.profile_id 가 있을 때만 채워짐 */
  profile_id: string | null
  profile_name?: string | null
  profile_department?: string | null
  /** profile_id 가 null 일 때 ride_employees.name 또는 외부인 이름 */
  external_name?: string | null
  role?: string
  attendance?: string
  note?: string | null
}

interface Employee {
  /** ride_employees.id (UUID) — UI 선택 key 용 */
  id: string
  /** profiles.id 옵션 FK — 인증 계정 있는 직원만 */
  profile_id?: string | null
  name: string
  department?: string | null
  position?: string | null
  employment_type?: string | null
  color_tone?: string | null
  group_label?: string | null
  is_active?: boolean | null
}

interface Props {
  attendees: Attendee[]
  onChange: (next: Attendee[]) => void
  employees: Employee[]
  /** 부서별 회의 자동 채우기 — department 선택 시 활성 */
  department?: string | null
  showAutoFill?: boolean
  editable?: boolean
}

/** ride_employees row → 새 Attendee (profile_id 있으면 그걸, 없으면 external_name) */
function rideToAttendee(e: Employee, role = 'attendee', attendance = 'present'): Attendee {
  const pid = e.profile_id || null
  return {
    profile_id: pid,
    profile_name: pid ? e.name : undefined,
    external_name: pid ? undefined : e.name,
    profile_department: e.department,
    role, attendance,
  }
}

/** 이미 참석자에 들어있는지 — profile_id 있으면 그걸로 / 없으면 external_name 으로 */
function isAlreadyAttending(e: Employee, attendees: Attendee[]): boolean {
  if (e.profile_id) return attendees.some(a => a.profile_id === e.profile_id)
  return attendees.some(a => !a.profile_id && a.external_name === e.name)
}

export default function AttendeeManager({
  attendees, onChange, employees, department, showAutoFill, editable = true,
}: Props) {
  const remainingEmployees = useMemo(
    () => employees.filter(e => !isAlreadyAttending(e, attendees)),
    [employees, attendees]
  )

  const add = (rideId: string) => {
    if (!rideId) return
    const e = employees.find(x => x.id === rideId)
    if (!e) return
    if (isAlreadyAttending(e, attendees)) return
    onChange([...attendees, rideToAttendee(e)])
  }
  const remove = (i: number) => onChange(attendees.filter((_, idx) => idx !== i))
  const update = (i: number, patch: Partial<Attendee>) =>
    onChange(attendees.map((a, idx) => idx === i ? { ...a, ...patch } : a))

  const autoFillDept = () => {
    if (!department) return
    const members = employees.filter(e => e.department === department)
    onChange(members.map(e => rideToAttendee(e)))
  }

  return (
    <div style={{ ...GLASS.L3, padding: 14, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
          👥 참석자 ({attendees.length})
        </h3>
        {editable && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {showAutoFill && department && (
              <button onClick={autoFillDept}
                title={`부서 「${department}」 전원 자동 추가 (ride_employees)`}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                  background: 'rgba(245,158,11,0.10)', color: '#b45309',
                  border: '1px solid rgba(245,158,11,0.35)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                🏢 {department} 자동
              </button>
            )}
            <select onChange={(e) => { if (e.target.value) { add(e.target.value); e.target.value = '' } }}
              style={{
                padding: '4px 10px', fontSize: 12, borderRadius: 6,
                border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
                color: COLORS.textPrimary, cursor: 'pointer', minWidth: 220,
              }}>
              <option value="">+ 직원 추가 (인사마스터)</option>
              {remainingEmployees.map(e => {
                const meta = [e.department, e.position || e.group_label, e.employment_type].filter(Boolean).join(' · ')
                const noProfile = !e.profile_id
                return (
                  <option key={e.id} value={e.id}>
                    {e.name}{meta ? ` (${meta})` : ''}{noProfile ? ' — 외부' : ''}
                  </option>
                )
              })}
            </select>
          </div>
        )}
      </div>

      {attendees.length === 0 && (
        <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
          참석자 없음 — 우측 「+ 직원 추가 (인사마스터)」 에서 선택
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {attendees.map((a, i) => (
          <div key={`${a.profile_id || a.external_name}-${i}`}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 110px 110px 32px',
              gap: 6, alignItems: 'center', fontSize: 12,
              padding: '4px 0',
            }}>
            <span style={{ color: COLORS.textPrimary, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {a.profile_name || a.external_name || '(이름 없음)'}
              {a.profile_department && (
                <span style={{ fontWeight: 400, color: COLORS.textMuted, marginLeft: 6 }}>
                  ({a.profile_department})
                </span>
              )}
              {!a.profile_id && a.external_name && (
                <span style={{ fontWeight: 400, color: COLORS.textMuted, marginLeft: 4, fontSize: 10 }}>
                  · 외부/인증無
                </span>
              )}
            </span>
            {editable ? (
              <>
                <select value={a.role || 'attendee'} onChange={(e) => update(i, { role: e.target.value })}
                  style={inlineCell}>
                  <option value="organizer">주관</option>
                  <option value="attendee">참석</option>
                  <option value="observer">참관</option>
                </select>
                <select value={a.attendance || 'present'} onChange={(e) => update(i, { attendance: e.target.value })}
                  style={inlineCell}>
                  <option value="present">출석</option>
                  <option value="absent">불참</option>
                  <option value="excused">결석</option>
                </select>
                <button onClick={() => remove(i)} title="제거"
                  style={{
                    padding: '3px 8px', fontSize: 11, borderRadius: 4,
                    background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
                    border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>×</button>
              </>
            ) : (
              <>
                <span style={inlineReadonly}>{roleLabel(a.role)}</span>
                <span style={inlineReadonly}>{attendanceLabel(a.attendance)}</span>
                <span />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const inlineCell: React.CSSProperties = {
  padding: '3px 8px', fontSize: 12, borderRadius: 4,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background, color: COLORS.textPrimary,
  outline: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
}
const inlineReadonly: React.CSSProperties = {
  padding: '3px 8px', fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap',
}
function roleLabel(r?: string) {
  if (r === 'organizer') return '주관'
  if (r === 'observer') return '참관'
  return '참석'
}
function attendanceLabel(a?: string) {
  if (a === 'absent') return '불참'
  if (a === 'excused') return '결석'
  return '출석'
}
