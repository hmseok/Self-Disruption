'use client'
// ═══════════════════════════════════════════════════════════════════
// ShiftsTab — 시프트(시간대) 마스터 CRUD
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { ShiftSlot } from '@/app/CallScheduler/utils/types'

const CATEGORY_OPTIONS: { value: 'day' | 'evening' | 'overnight'; label: string }[] = [
  { value: 'day',       label: '주간' },
  { value: 'evening',   label: '저녁' },
  { value: 'overnight', label: '야간(익일종료)' },
]

interface FormState {
  id?: string  // 있으면 편집 모드
  code: string
  label: string
  start_time: string  // HH:MM
  end_time: string
  is_overnight: boolean
  category: 'day' | 'evening' | 'overnight'
  sort_order: number
}

const EMPTY_FORM: FormState = {
  code: '',
  label: '',
  start_time: '09:00',
  end_time: '18:00',
  is_overnight: false,
  category: 'day',
  sort_order: 0,
}

export default function ShiftsTab() {
  const [slots, setSlots] = useState<ShiftSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-slots?include_inactive=${showInactive ? 1 : 0}`, { headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '조회 실패')
      setSlots(json.data)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [showInactive])

  const startNew = () => {
    const nextOrder = slots.length > 0 ? Math.max(...slots.map(s => s.sort_order)) + 10 : 10
    const nextCode = `L${String(slots.length + 1).padStart(2, '0')}`
    setEditing({ ...EMPTY_FORM, code: nextCode, sort_order: nextOrder })
  }

  const startEdit = (s: ShiftSlot) => {
    setEditing({
      id: s.id,
      code: s.code,
      label: s.label,
      start_time: s.start_time.substring(0, 5),
      end_time: s.end_time.substring(0, 5),
      is_overnight: s.is_overnight,
      category: s.category,
      sort_order: s.sort_order,
    })
  }

  const submit = async () => {
    if (!editing) return
    if (!editing.code.trim() || !editing.label.trim()) {
      setError('code, label 필수'); return
    }
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const payload = {
        code: editing.code.trim(),
        label: editing.label.trim(),
        start_time: editing.start_time,
        end_time: editing.end_time,
        is_overnight: editing.is_overnight,
        category: editing.category,
        sort_order: editing.sort_order,
      }
      const url = editing.id
        ? `/api/call-scheduler/shift-slots/${editing.id}`
        : '/api/call-scheduler/shift-slots'
      const res = await fetch(url, {
        method: editing.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      setEditing(null); await load()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  const remove = async (s: ShiftSlot) => {
    if (!confirm(`"${s.label}" 시프트를 삭제합니다. 사용 중이면 비활성화로 처리됩니다.`)) return
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-slots/${s.id}`, { method: 'DELETE', headers: auth })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      if (json.data?.soft) {
        alert(`사용 중이라 비활성화로 처리: 배정 ${json.data.asn_count}건 / 그룹 ${json.data.grp_count}개`)
      }
      await load()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  const restore = async (s: ShiftSlot) => {
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-slots/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ is_active: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      await load()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  return (
    <div>
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}

      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
          시프트(시간대) {slots.filter(s => s.is_active).length}개 — 그룹/배정에서 참조됩니다.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: COLORS.textSecondary, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            {' '}비활성 포함
          </label>
          <button type="button" onClick={startNew}
                  style={{
                    ...BTN.md, background: COLORS.primary, color: '#fff',
                    border: 'none', cursor: 'pointer',
                  }}>
            + 시프트 추가
          </button>
        </div>
      </div>

      {/* 편집 폼 */}
      {editing && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 12 }}>
            {editing.id ? '시프트 편집' : '신규 시프트'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <Field label="코드 *">
              <input type="text" value={editing.code}
                     onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                     style={inputStyle} placeholder="L14" />
            </Field>
            <Field label="라벨 *">
              <input type="text" value={editing.label}
                     onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                     style={inputStyle} placeholder="07:30~16:30" />
            </Field>
            <Field label="시작">
              <input type="time" value={editing.start_time}
                     onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
                     style={inputStyle} />
            </Field>
            <Field label="종료">
              <input type="time" value={editing.end_time}
                     onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
                     style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            <Field label="카테고리">
              <div style={{ display: 'flex', gap: 4 }}>
                {CATEGORY_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                          onClick={() => setEditing({
                            ...editing,
                            category: opt.value,
                            is_overnight: opt.value === 'overnight',
                          })}
                          style={{
                            flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 700, borderRadius: 6,
                            background: editing.category === opt.value ? COLORS.bgBlue : 'transparent',
                            color: editing.category === opt.value ? COLORS.info : COLORS.textSecondary,
                            border: `1px solid ${editing.category === opt.value ? COLORS.borderBlue : COLORS.borderFaint}`,
                            cursor: 'pointer',
                          }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="익일 종료 (overnight)">
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                ...inputStyle, cursor: 'pointer',
              }}>
                <input type="checkbox" checked={editing.is_overnight}
                       onChange={(e) => setEditing({ ...editing, is_overnight: e.target.checked })} />
                <span style={{ fontSize: 12, color: COLORS.textPrimary }}>
                  종료 시각이 익일 (예: 20:30~08:30)
                </span>
              </label>
            </Field>
            <Field label="정렬 순서">
              <input type="number" value={editing.sort_order}
                     onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                     style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setEditing(null)} style={{
              ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
              border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
            }}>취소</button>
            <button type="button" onClick={submit} disabled={saving} style={{
              ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? '저장 중...' : (editing.id ? '저장' : '추가')}
            </button>
          </div>
        </div>
      )}

      {/* 시프트 목록 */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
      ) : (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <th style={thStyle}>코드</th>
                <th style={thStyle}>라벨</th>
                <th style={thStyle}>시작</th>
                <th style={thStyle}>종료</th>
                <th style={thStyle}>카테고리</th>
                <th style={thStyle}>순서</th>
                <th style={thStyle}>상태</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {slots.map(s => (
                <tr key={s.id} style={{
                  borderBottom: `1px solid ${COLORS.borderFaint}`,
                  opacity: s.is_active ? 1 : 0.5,
                }}>
                  <td style={tdStyle}>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 700,
                      color: COLORS.textMuted, fontSize: 12,
                    }}>{s.code}</span>
                  </td>
                  <td style={tdStyle}>{s.label}</td>
                  <td style={tdStyle}>{s.start_time.substring(0, 5)}</td>
                  <td style={tdStyle}>
                    {s.end_time.substring(0, 5)}
                    {s.is_overnight && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: COLORS.warning }}>(익일)</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={pillStyle(
                      s.category === 'overnight' ? 'warning' :
                      s.category === 'evening' ? 'info' : 'neutral'
                    )}>
                      {s.category === 'overnight' ? '야간' : s.category === 'evening' ? '저녁' : '주간'}
                    </span>
                  </td>
                  <td style={tdStyle}>{s.sort_order}</td>
                  <td style={tdStyle}>
                    {s.is_active ? (
                      <span style={pillStyle('success')}>활성</span>
                    ) : (
                      <span style={pillStyle('neutral')}>비활성</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {s.is_active ? (
                      <>
                        <button type="button" onClick={() => startEdit(s)}
                                style={{
                                  ...BTN.sm, background: 'transparent', color: COLORS.info,
                                  border: `1px solid ${COLORS.borderBlue}`, marginRight: 4, cursor: 'pointer',
                                }}>편집</button>
                        <button type="button" onClick={() => remove(s)}
                                style={{
                                  ...BTN.sm, background: 'transparent', color: COLORS.danger,
                                  border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
                                }}>삭제</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => restore(s)}
                              style={{
                                ...BTN.sm, background: COLORS.success, color: '#fff',
                                border: 'none', cursor: 'pointer',
                              }}>복구</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1, padding: '7px 10px', borderRadius: 8,
  fontSize: 13, color: COLORS.textPrimary, outline: 'none', width: '100%',
}
const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  color: COLORS.textSecondary, fontWeight: 700,
  whiteSpace: 'nowrap', fontSize: 12,
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', whiteSpace: 'nowrap', color: COLORS.textPrimary,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}
