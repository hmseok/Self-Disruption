'use client'
import { useState, useEffect, useMemo } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import AddressSearchModal from './AddressSearchModal'

// ═══════════════════════════════════════════════════════════════
// MeetingHeaderBar — V2 본문 영역 상단 (PR-V2-A)
//   · 제목 inline edit (큰 input, blur 시 저장)
//   · 메타 (유형 / 일시 / 장소 / 주관자 / 상태) inline
//   · 우측: 자동 저장 인디케이터 영역 (placeholder)
// ═══════════════════════════════════════════════════════════════

const TYPE_META: Record<string, { emoji: string; label: string }> = {
  regular:    { emoji: '📅', label: '정기 회의' },
  specific:   { emoji: '📋', label: '특정 회의' },
  one_on_one: { emoji: '👥', label: '1:1 면담' },
  department: { emoji: '🏢', label: '부서별 회의' },
}
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: '✏️ 작성중', color: '#b91c1c', bg: 'rgba(239,68,68,0.10)' },
  published: { label: '✓ 공개',   color: '#15803d', bg: 'rgba(34,197,94,0.10)' },
  archived:  { label: '📦 보관',  color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
}

export interface MeetingMeta {
  title: string
  type: string                          // regular | specific | one_on_one | department
  meeting_date: string | null           // datetime-local form
  duration_min: number | null
  location: string | null
  organizer_id: string | null
  department: string | null
  status: string                        // draft | published | archived
  visibility?: string                   // public | department | attendees | private (PR-V2-Visibility)
}

interface EmployeeOption {
  /** ride_employees.id */
  id: string
  /** profiles.id 옵션 FK */
  profile_id?: string | null
  name: string
  department?: string | null
  position?: string | null
  group_label?: string | null
}

interface Props {
  meta: MeetingMeta
  onMetaChange: (patch: Partial<MeetingMeta>) => void
  /** 우측 슬롯 — AutoSaveIndicator + 액션 버튼 (삭제 등) */
  trailing?: React.ReactNode
  /** 편집 가능 */
  editable?: boolean
  /** organizer 선택용 직원 목록 (ride_employees) */
  employees?: EmployeeOption[]
}

export default function MeetingHeaderBar({ meta, onMetaChange, trailing, editable = true, employees = [] }: Props) {
  const [title, setTitle] = useState(meta.title)
  const [addressOpen, setAddressOpen] = useState(false)
  useEffect(() => { setTitle(meta.title) }, [meta.title])

  // PR-V2-Dept — ride_employees 의 unique 부서 목록 (자동완성용)
  const departmentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of employees) {
      if (e.department && e.department.trim()) set.add(e.department.trim())
    }
    return Array.from(set).sort()
  }, [employees])

  const isDeptMeeting = meta.type === 'department'
  const deptMissing = isDeptMeeting && !meta.department?.trim()

  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== meta.title) onMetaChange({ title: t })
    else if (!t) setTitle(meta.title) // 빈 제목 reject
  }

  const status = STATUS_META[meta.status] || STATUS_META.draft

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editable ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
              placeholder="회의 제목 (필수)"
              style={{
                width: '100%', fontSize: 26, fontWeight: 800,
                color: COLORS.textPrimary, background: 'transparent',
                border: 'none', outline: 'none', padding: '4px 0',
                whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <h1 style={{ fontSize: 26, fontWeight: 800, color: COLORS.textPrimary, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta.title || '(제목 없음)'}
            </h1>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {trailing}
        </div>
      </div>

      {/* 메타 line — type / date / location / status — inline select */}
      <div style={{
        marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        fontSize: 12, color: COLORS.textSecondary,
      }}>
        {/* 유형 */}
        {editable ? (
          <select value={meta.type} onChange={(e) => onMetaChange({ type: e.target.value })}
            style={inlineSelect}>
            {Object.entries(TYPE_META).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        ) : (
          <span style={inlineTag}>{TYPE_META[meta.type]?.emoji} {TYPE_META[meta.type]?.label}</span>
        )}

        {/* 일시 */}
        {editable ? (
          <input type="datetime-local" value={meta.meeting_date || ''}
            onChange={(e) => onMetaChange({ meeting_date: e.target.value })}
            style={{ ...inlineSelect, padding: '4px 8px' }} />
        ) : (
          <span style={inlineTag}>📆 {meta.meeting_date || '미정'}</span>
        )}

        {/* 시간 (분 단위) */}
        {editable ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>⏱</span>
            <input type="number" value={meta.duration_min || ''}
              onChange={(e) => onMetaChange({ duration_min: Number(e.target.value) || null })}
              placeholder="60"
              title="회의 진행 시간 (분)"
              style={{ ...inlineSelect, width: 64, padding: '4px 8px', textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>분</span>
          </span>
        ) : (
          meta.duration_min && <span style={inlineTag}>⏱ {meta.duration_min}분</span>
        )}

        {/* 장소 (오프라인 주소 또는 화상 링크) + 주소 검색 버튼 */}
        {editable ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input value={meta.location || ''}
              onChange={(e) => onMetaChange({ location: e.target.value })}
              placeholder="📍 회의 장소 또는 화상 링크 (예: 본사 회의실 / Zoom URL)"
              title="자유 입력 가능 — 또는 우측 「🔍 주소」 버튼으로 주소 검색"
              style={{ ...inlineSelect, padding: '4px 8px', minWidth: 240 }} />
            <button onClick={() => setAddressOpen(true)}
              title="Daum 우편번호로 정식 주소 검색"
              style={{
                padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                background: `${COLORS.primary}1A`, color: COLORS.primary,
                border: `1px solid ${COLORS.primary}40`, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>🔍 주소</button>
          </span>
        ) : (
          meta.location && <span style={inlineTag}>📍 {meta.location}</span>
        )}

        {/* 부서 (PR-V2-Dept — datalist 자동완성 + 부서별 회의 시 의무) */}
        {editable ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: deptMissing ? '0' : undefined,
            border: deptMissing ? '1px solid rgba(239,68,68,0.5)' : 'none',
            borderRadius: deptMissing ? 8 : 0,
            background: deptMissing ? 'rgba(239,68,68,0.06)' : 'transparent',
          }}>
            <input list="dept-options"
              value={meta.department || ''}
              onChange={(e) => onMetaChange({ department: e.target.value || null })}
              placeholder={isDeptMeeting ? '🏢 부서 (필수 — 부서별 회의)' : '🏢 부서 (선택)'}
              title={
                isDeptMeeting
                  ? '부서별 회의 — 부서 입력 시 「부서원 자동」 가능'
                  : '회의 부서 — 인사마스터 부서 자동완성 (자유 입력 가능)'
              }
              style={{ ...inlineSelect, padding: '4px 8px', minWidth: 180 }} />
            <datalist id="dept-options">
              {departmentOptions.map(d => <option key={d} value={d} />)}
            </datalist>
            {deptMissing && (
              <span style={{ fontSize: 10, color: '#b91c1c', fontWeight: 700, padding: '0 6px', whiteSpace: 'nowrap' }}>
                ⚠ 필수
              </span>
            )}
          </span>
        ) : meta.department ? (
          <span style={inlineTag}>🏢 {meta.department}</span>
        ) : null}

        {/* 주관자 (organizer) — ride_employees 기반 */}
        {editable && employees.length > 0 ? (
          <select
            value={
              meta.organizer_id
                ? (employees.find(e => e.profile_id === meta.organizer_id)?.id || `pid:${meta.organizer_id}`)
                : ''
            }
            onChange={(e) => {
              const v = e.target.value
              if (!v) { onMetaChange({ organizer_id: null }); return }
              if (v.startsWith('pid:')) {
                onMetaChange({ organizer_id: v.slice(4) })
                return
              }
              const emp = employees.find(x => x.id === v)
              if (emp?.profile_id) onMetaChange({ organizer_id: emp.profile_id })
              else onMetaChange({ organizer_id: null })  // 외부 직원은 organizer 불가 (profile_id 필수)
            }}
            title="회의 주관자 — 인증 계정 있는 직원만 선택 가능"
            style={{ ...inlineSelect, minWidth: 180 }}>
            <option value="">👤 주관자 미정</option>
            {employees.filter(e => e.profile_id).map(e => {
              const meta = [e.department, e.position || e.group_label].filter(Boolean).join(' · ')
              return (
                <option key={e.id} value={e.id}>
                  👤 {e.name}{meta ? ` (${meta})` : ''}
                </option>
              )
            })}
            {meta.organizer_id && !employees.find(e => e.profile_id === meta.organizer_id) && (
              <option value={`pid:${meta.organizer_id}`}>
                ⚠ 주관자 (인사마스터에 없음 — ID: {meta.organizer_id.slice(0, 8)})
              </option>
            )}
          </select>
        ) : meta.organizer_id ? (
          <span style={inlineTag}>
            👤 {employees.find(e => e.profile_id === meta.organizer_id)?.name || '주관자'}
          </span>
        ) : null}

        {/* 공개 범위 (visibility) — PR-V2-Visibility */}
        {editable ? (
          <select value={meta.visibility || 'attendees'}
            onChange={(e) => onMetaChange({ visibility: e.target.value })}
            title="회의록 공개 범위 — 참석자만 / 부서원 / 전사 / 비공개"
            style={inlineSelect}>
            <option value="attendees">🔒 참석자만 (기본)</option>
            <option value="department">🏢 부서 공개</option>
            <option value="public">🌐 전사 공개</option>
            <option value="private">🔐 비공개 (편집자만)</option>
          </select>
        ) : meta.visibility ? (
          <span style={inlineTag}>
            {meta.visibility === 'public' ? '🌐 전사' :
              meta.visibility === 'department' ? '🏢 부서' :
              meta.visibility === 'private' ? '🔐 비공개' : '🔒 참석자만'}
          </span>
        ) : null}

        {/* 상태 */}
        {editable ? (
          <select value={meta.status} onChange={(e) => onMetaChange({ status: e.target.value })}
            style={inlineSelect}>
            <option value="draft">✏️ 작성중</option>
            <option value="published">✓ 공개</option>
            <option value="archived">📦 보관</option>
          </select>
        ) : (
          <span style={{
            ...inlineTag, background: status.bg, color: status.color, border: 'none',
          }}>{status.label}</span>
        )}
      </div>

      {/* 주소 검색 모달 (V2-Address) */}
      <AddressSearchModal
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        onSelect={(addr) => onMetaChange({ location: addr })}
      />
    </div>
  )
}

const inlineSelect: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background,
  color: COLORS.textPrimary,
  fontFamily: 'inherit',
  outline: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const inlineTag: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${COLORS.borderSubtle}`,
  background: GLASS.L1.background,
  whiteSpace: 'nowrap',
}
