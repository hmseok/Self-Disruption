'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import type { MeetingMeta } from './MeetingHeaderBar'

// ═══════════════════════════════════════════════════════════════
// MeetingPermissionsPanel — 회의 권한 관리 (PR-MTG-V2-Visibility)
//   · visibility (헤더에도 노출 — 본 패널에서 상세 설명 + 변경)
//   · meeting_editors (공동 편집자/조회자) CRUD
//   · graceful (Rule 23): meeting_editors 테이블 미적용 시 배너
// ═══════════════════════════════════════════════════════════════

interface Employee {
  id: string
  profile_id?: string | null
  name: string
  department?: string | null
  position?: string | null
}

interface EditorRow {
  id: string
  profile_id: string
  role: 'editor' | 'viewer'
  added_by?: string | null
  added_at?: string | null
  name?: string | null
  department?: string | null
}

interface Props {
  meetingId: string
  meta: MeetingMeta
  onVisibilityChange: (v: string) => void
  employees: Employee[]
  canManage: boolean
}

const VIS_INFO: Record<string, { icon: string; label: string; desc: string; tint: string }> = {
  public: {
    icon: '🌐', label: '전사 공개', tint: '#10b981',
    desc: '인증된 모든 직원이 회의록을 조회 가능. 외부매니저도 접근 가능 — 민감 정보 주의.',
  },
  department: {
    icon: '🏢', label: '부서 공개', tint: '#3b82f6',
    desc: '회의의 「부서」 와 같은 부서원만 조회 가능 (ride_employees 기준). 부서 미지정 시 organizer/참석자만.',
  },
  attendees: {
    icon: '🔒', label: '참석자만 (기본)', tint: '#f59e0b',
    desc: '👥 참석자 + organizer/created_by 만 조회 가능. 부서/외부 인원 접근 차단. (DEFAULT — 가장 안전)',
  },
  private: {
    icon: '🔐', label: '비공개', tint: '#ef4444',
    desc: 'organizer/created_by + 공동 편집자(editors) 만 조회 가능. 참석자도 접근 X — 비밀 회의용.',
  },
}

export default function MeetingPermissionsPanel({
  meetingId, meta, onVisibilityChange, employees, canManage,
}: Props) {
  const [editors, setEditors] = useState<EditorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingRole, setAddingRole] = useState<'editor' | 'viewer'>('editor')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { json } = await fetchWithAuth(`/api/meetings/${meetingId}/editors`)
      if (json?._migration_pending) {
        setMigrationPending(true)
        setEditors([])
      } else if (json?.data) {
        setEditors(json.data)
        setMigrationPending(false)
      }
    } catch (e: any) {
      setError(e?.message || '로드 실패')
    } finally {
      setLoading(false)
    }
  }, [meetingId])

  useEffect(() => { void load() }, [load])

  const addEditor = async (rideId: string) => {
    if (!rideId) return
    const e = employees.find(x => x.id === rideId)
    if (!e?.profile_id) {
      setError('인증 계정 없는 직원은 편집자 지정 불가 (외부)')
      setTimeout(() => setError(null), 3000)
      return
    }
    if (editors.find(x => x.profile_id === e.profile_id)) return
    try {
      const { ok, json } = await fetchWithAuth(`/api/meetings/${meetingId}/editors`, {
        method: 'POST',
        body: { profile_id: e.profile_id, role: addingRole },
      })
      if (ok) {
        await load()
      } else {
        setError(json?.error || '추가 실패')
      }
    } catch (e: any) {
      setError(e?.message || '네트워크 오류')
    }
  }

  const removeEditor = async (profileId: string) => {
    if (!confirm('편집자에서 제거할까요?')) return
    try {
      const { ok, json } = await fetchWithAuth(
        `/api/meetings/${meetingId}/editors?profile_id=${encodeURIComponent(profileId)}`,
        { method: 'DELETE' }
      )
      if (ok) await load()
      else setError(json?.error || '제거 실패')
    } catch (e: any) {
      setError(e?.message || '네트워크 오류')
    }
  }

  const remainingEmployees = useMemo(
    () => employees.filter(e => e.profile_id && !editors.find(x => x.profile_id === e.profile_id)),
    [employees, editors]
  )

  const vis = meta.visibility || 'attendees'
  const info = VIS_INFO[vis] || VIS_INFO.attendees

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 공개 범위 (visibility) 상세 */}
      <div style={{ ...GLASS.L3, padding: 14, borderRadius: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: 0, marginBottom: 10, whiteSpace: 'nowrap' }}>
          🔒 공개 범위
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(VIS_INFO).map(([k, v]) => {
            const active = vis === k
            return (
              <label key={k} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                cursor: canManage ? 'pointer' : 'default',
                background: active ? `${v.tint}1A` : 'transparent',
                border: `1px solid ${active ? `${v.tint}55` : 'rgba(0,0,0,0.05)'}`,
              }}>
                <input type="radio" name="visibility" checked={active}
                  disabled={!canManage}
                  onChange={() => onVisibilityChange(k)}
                  style={{ marginTop: 2 }} />
                <span style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: v.tint, whiteSpace: 'nowrap' }}>
                    {v.icon} {v.label}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                    {v.desc}
                  </div>
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* 공동 편집자 / 조회자 */}
      <div style={{ ...GLASS.L3, padding: 14, borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
            👤 공동 편집자/조회자 ({editors.length})
          </h3>
          {canManage && !migrationPending && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <select value={addingRole} onChange={(e) => setAddingRole(e.target.value as any)}
                title="추가할 역할 — editor: 본문 편집 가능 / viewer: 조회만"
                style={{
                  padding: '4px 8px', fontSize: 11, borderRadius: 6,
                  border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
                  color: COLORS.textPrimary, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                <option value="editor">✏️ 편집자</option>
                <option value="viewer">👁 조회자</option>
              </select>
              <select onChange={(e) => { if (e.target.value) { void addEditor(e.target.value); e.target.value = '' } }}
                style={{
                  padding: '4px 10px', fontSize: 12, borderRadius: 6,
                  border: `1px solid ${COLORS.borderSubtle}`, background: GLASS.L1.background,
                  color: COLORS.textPrimary, cursor: 'pointer', minWidth: 220,
                }}>
                <option value="">+ 직원 추가 (인증 계정 있는 직원만)</option>
                {remainingEmployees.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name}{e.department ? ` (${e.department})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {migrationPending && (
          <div style={{
            padding: '10px 12px', borderRadius: 8, marginBottom: 8,
            background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
            fontSize: 12, fontWeight: 600,
          }}>
            ⚠ DB 마이그 미적용 — 공동 편집자 기능 사용 불가. 관리자에게 <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 4 }}>migrations/2026-05-16_meetings_visibility.sql</code> 적용 요청.
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 8,
            background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
            fontSize: 12, fontWeight: 600,
          }}>
            ⚠ {error}
          </div>
        )}

        {!migrationPending && loading && (
          <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
            불러오는 중...
          </div>
        )}

        {!migrationPending && !loading && editors.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
            공동 편집자/조회자 없음 — organizer/created_by/admin 만 편집 가능.
          </div>
        )}

        {!migrationPending && editors.map((ed) => (
          <div key={ed.id}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 110px 32px',
              gap: 6, alignItems: 'center', fontSize: 12,
              padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)',
            }}>
            <span style={{ color: COLORS.textPrimary, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ed.role === 'editor' ? '✏️' : '👁'} {ed.name || '(이름 없음)'}
              {ed.department && (
                <span style={{ fontWeight: 400, color: COLORS.textMuted, marginLeft: 6 }}>
                  ({ed.department})
                </span>
              )}
            </span>
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: ed.role === 'editor' ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)',
              color: ed.role === 'editor' ? '#047857' : '#475569',
              textAlign: 'center', whiteSpace: 'nowrap',
            }}>
              {ed.role === 'editor' ? '편집 가능' : '조회만'}
            </span>
            {canManage ? (
              <button onClick={() => removeEditor(ed.profile_id)} title="제거"
                style={{
                  padding: '3px 8px', fontSize: 11, borderRadius: 4,
                  background: 'rgba(239,68,68,0.10)', color: '#b91c1c',
                  border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>×</button>
            ) : <span />}
          </div>
        ))}

        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8,
          background: `${COLORS.primary}0A`, fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5,
        }}>
          💡 <strong>편집자</strong>: 본문/메타/참석자/액션 편집 가능. <strong>조회자</strong>: 비공개 회의에서 명시 공유. organizer / created_by / admin / master 는 항상 모든 권한.
        </div>
      </div>
    </div>
  )
}
