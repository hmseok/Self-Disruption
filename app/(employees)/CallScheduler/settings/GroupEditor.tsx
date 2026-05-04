'use client'
// ═══════════════════════════════════════════════════════════════════
// GroupEditor — 그룹 신규/편집 + 멤버 매핑 (드래그/순서 조정)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { COLOR_TONE_OPTIONS } from '@/app/(employees)/CallScheduler/utils/types'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { ShiftSlot, Worker, ColorTone } from '@/app/(employees)/CallScheduler/utils/types'

interface Props {
  groupId: string | null  // null = 신규
  slots: ShiftSlot[]
  workers: Worker[]
  onClose: () => void
  onSaved: () => void
}

const PATTERN_OPTIONS: { value: 'all_days' | 'all_weekdays' | 'weekends_only' | 'custom'; label: string; sub: string }[] = [
  { value: 'all_weekdays', label: '평일만',   sub: '월~금 매일' },
  { value: 'all_days',     label: '매일',     sub: '주말 포함' },
  { value: 'weekends_only',label: '주말만',   sub: '토·일' },
  { value: 'custom',       label: '요일 지정', sub: '체크 선택' },
]
const STRATEGY_OPTIONS: { value: 'all_members' | 'rotation'; label: string; sub: string }[] = [
  { value: 'all_members', label: '전원 동시', sub: '소속 멤버 모두 매일 출근' },
  { value: 'rotation',    label: '로테이션',  sub: '순서대로 일부만 — 야간조 등' },
]
const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export default function GroupEditor({ groupId, slots, workers, onClose, onSaved }: Props) {
  const isNew = groupId === null
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 폼 상태
  const [name, setName] = useState('')
  const [slotId, setSlotId] = useState(slots[0]?.id || '')
  const [pattern, setPattern] = useState<'all_days' | 'all_weekdays' | 'weekends_only' | 'custom'>('all_weekdays')
  const [customDays, setCustomDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))
  const [strategy, setStrategy] = useState<'all_members' | 'rotation'>('all_members')
  const [rotationSize, setRotationSize] = useState(1)
  const [rotationPeriod, setRotationPeriod] = useState(1)
  const [colorTone, setColorTone] = useState<ColorTone>('none')
  const [description, setDescription] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])

  // 기존 그룹 로드
  useEffect(() => {
    if (isNew) return
    let abort = false
    ;(async () => {
      try {
        const auth = await getAuthHeader()
        const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}`, { headers: auth })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '조회 실패')
        if (abort) return
        const { group, members } = json.data
        setName(group.name); setSlotId(group.shift_slot_id)
        setPattern(group.pattern_type)
        if (group.custom_days) {
          setCustomDays(new Set(String(group.custom_days).split(',').map(Number)))
        }
        setStrategy(group.generation_strategy)
        setRotationSize(group.rotation_size || 1)
        setRotationPeriod(group.rotation_period_days || 1)
        setColorTone(group.color_tone)
        setDescription(group.description || '')
        setMemberIds(members.map((m: any) => m.worker_id))
      } catch (e: any) { setError(e?.message || '오류') }
      finally { if (!abort) setLoading(false) }
    })()
    return () => { abort = true }
  }, [groupId, isNew])

  const toggleMember = (wId: string) => {
    setMemberIds(prev => prev.includes(wId) ? prev.filter(x => x !== wId) : [...prev, wId])
  }

  const moveMember = (wId: string, dir: -1 | 1) => {
    setMemberIds(prev => {
      const idx = prev.indexOf(wId)
      if (idx < 0) return prev
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      const [m] = arr.splice(idx, 1)
      arr.splice(next, 0, m)
      return arr
    })
  }

  const submit = async () => {
    if (!name.trim()) { setError('이름은 필수'); return }
    if (!slotId) { setError('시프트 선택 필수'); return }
    setError(null); setSaving(true)
    try {
      const auth = await getAuthHeader()
      const payload: any = {
        name: name.trim(),
        shift_slot_id: slotId,
        pattern_type: pattern,
        custom_days: pattern === 'custom' ? Array.from(customDays).sort().join(',') : null,
        generation_strategy: strategy,
        rotation_size: strategy === 'rotation' ? rotationSize : null,
        rotation_period_days: rotationPeriod,
        color_tone: colorTone,
        description: description.trim() || null,
      }
      let id = groupId
      if (isNew) {
        payload.member_ids = memberIds
        const res = await fetch('/api/call-scheduler/shift-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '생성 실패')
        id = json.data.id
      } else {
        // PATCH 본문 + 멤버 별도 PUT
        const res = await fetch(`/api/call-scheduler/shift-groups/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '저장 실패')
        const mRes = await fetch(`/api/call-scheduler/shift-groups/${id}/members`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ worker_ids: memberIds }),
        })
        const mJ = await mRes.json()
        if (!mRes.ok) throw new Error(mJ?.error || '멤버 저장 실패')
      }
      onSaved()
    } catch (e: any) { setError(e?.message || '저장 실패') }
    finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('이 그룹을 삭제(비활성화) 합니다. 계속할까요?')) return
    setSaving(true)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/shift-groups/${groupId}`, {
        method: 'DELETE', headers: auth,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '삭제 실패')
      onSaved()
    } catch (e: any) { setError(e?.message || '오류'); setSaving(false) }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
  }

  const selectedWorkers = memberIds
    .map(id => workers.find(w => w.id === id))
    .filter((w): w is Worker => !!w)
  const availableWorkers = workers.filter(w => !memberIds.includes(w.id))

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <button type="button" onClick={onClose} style={{
          ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
          border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
        }}>
          ← 그룹 목록
        </button>
        <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary }}>
          {isNew ? '신규 그룹 만들기' : '그룹 편집'}
        </div>
        {!isNew ? (
          <button type="button" onClick={remove} disabled={saving} style={{
            ...BTN.sm, background: 'transparent', color: COLORS.danger,
            border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
          }}>
            삭제
          </button>
        ) : <div style={{ width: 60 }} />}
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* 좌측 — 기본 설정 */}
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="그룹 이름" required>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                   style={inputStyle} placeholder="예: 주간 09-18" />
          </Field>

          <Field label="시프트 (시간대)" required>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4,
              maxHeight: 120, overflowY: 'auto',
              padding: 4, borderRadius: 8,
              border: `1px solid ${COLORS.borderFaint}`,
            }}>
              {slots.map(s => {
                const active = slotId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSlotId(s.id)}
                    style={{
                      padding: '4px 8px', borderRadius: 6,
                      fontSize: 11, fontWeight: 600,
                      background: active ? COLORS.bgBlue : 'transparent',
                      color: active ? COLORS.info : COLORS.textSecondary,
                      border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ color: COLORS.textMuted, marginRight: 4, fontFamily: 'monospace' }}>
                      {s.code}
                    </span>
                    {s.label}
                  </button>
                )
              })}
              {slots.length === 0 && (
                <div style={{ padding: 12, fontSize: 11, color: COLORS.textMuted }}>
                  시프트가 없습니다 — [시프트] 탭에서 먼저 추가하세요.
                </div>
              )}
            </div>
          </Field>

          <Field label="배정 패턴">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {PATTERN_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setPattern(opt.value)}
                        style={modeBtnStyle(pattern === opt.value)}>
                  <div style={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: 12 }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>{opt.sub}</div>
                </button>
              ))}
            </div>
            {pattern === 'custom' && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {DOW_LABELS.map((dow, i) => {
                  const on = customDays.has(i)
                  return (
                    <button key={i} type="button"
                            onClick={() => {
                              const next = new Set(customDays)
                              if (on) next.delete(i); else next.add(i)
                              setCustomDays(next)
                            }}
                            style={{
                              flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
                              background: on ? COLORS.bgBlue : 'transparent',
                              border: `1px solid ${on ? COLORS.borderBlue : COLORS.borderFaint}`,
                              color: on ? COLORS.info : COLORS.textSecondary, cursor: 'pointer',
                            }}>
                      {dow}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>

          <Field label="생성 전략">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {STRATEGY_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setStrategy(opt.value)}
                        style={modeBtnStyle(strategy === opt.value)}>
                  <div style={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: 12 }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>{opt.sub}</div>
                </button>
              ))}
            </div>
            {strategy === 'rotation' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                <Field label="하루 인원" sub="rotation 시">
                  <input type="number" min={1} value={rotationSize}
                         onChange={(e) => setRotationSize(Number(e.target.value))}
                         style={inputStyle} />
                </Field>
                <Field label="로테이션 주기 (일)" sub="몇 일마다 교대">
                  <input type="number" min={1} value={rotationPeriod}
                         onChange={(e) => setRotationPeriod(Number(e.target.value))}
                         style={inputStyle} />
                </Field>
              </div>
            )}
          </Field>

          <Field label="식별 색상">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {COLOR_TONE_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setColorTone(opt.value)}
                        style={{
                          padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: colorTone === opt.value ? TONE_BG[opt.value] : 'transparent',
                          border: `1px solid ${colorTone === opt.value ? COLORS.borderBlue : COLORS.borderFaint}`,
                          color: colorTone === opt.value ? TONE_TEXT[opt.value] : COLORS.textSecondary,
                          cursor: 'pointer',
                        }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="설명">
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                   style={inputStyle} placeholder="자유 메모" />
          </Field>
        </div>

        {/* 우측 — 멤버 매핑 */}
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>
            멤버 ({memberIds.length}명)
            <span style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, marginLeft: 6 }}>
              순서 중요 — 로테이션은 위에서부터
            </span>
          </div>

          {/* 선택된 멤버 (순서) */}
          <div style={{ ...GLASS.L1, borderRadius: 8, padding: 8, minHeight: 80 }}>
            {selectedWorkers.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
                아래에서 워커를 클릭해 추가하세요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selectedWorkers.map((w, idx) => (
                  <div key={w.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', borderRadius: 6,
                    background: TONE_BG[w.color_tone] !== 'transparent' ? TONE_BG[w.color_tone] : 'rgba(0,0,0,0.03)',
                  }}>
                    <span style={{ fontSize: 11, color: COLORS.textMuted, width: 18 }}>{idx + 1}.</span>
                    <span style={{ flex: 1, fontWeight: 700, color: TONE_TEXT[w.color_tone] }}>{w.name}</span>
                    {w.group_label && (
                      <span style={{ fontSize: 10, color: COLORS.textMuted }}>{w.group_label}</span>
                    )}
                    <button type="button" onClick={() => moveMember(w.id, -1)} disabled={idx === 0}
                            style={miniBtn} title="위로">↑</button>
                    <button type="button" onClick={() => moveMember(w.id, 1)} disabled={idx === selectedWorkers.length - 1}
                            style={miniBtn} title="아래로">↓</button>
                    <button type="button" onClick={() => toggleMember(w.id)}
                            style={{ ...miniBtn, color: COLORS.danger }} title="제외">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 후보 워커 */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
              + 추가 후보 ({availableWorkers.length}명)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {availableWorkers.map(w => (
                <button key={w.id} type="button" onClick={() => toggleMember(w.id)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: TONE_BG[w.color_tone] !== 'transparent' ? TONE_BG[w.color_tone] : 'transparent',
                          border: `1px dashed ${COLORS.borderFaint}`,
                          color: TONE_TEXT[w.color_tone] || COLORS.textPrimary, cursor: 'pointer',
                        }}>
                  + {w.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button type="button" onClick={onClose} style={{
          ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
          border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
        }}>취소</button>
        <button type="button" onClick={submit} disabled={saving} style={{
          ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? '저장 중...' : (isNew ? '생성' : '저장')}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1, padding: '7px 10px', borderRadius: 8,
  fontSize: 13, color: COLORS.textPrimary, outline: 'none', width: '100%',
}
const miniBtn: React.CSSProperties = {
  width: 22, height: 22, padding: 0, borderRadius: 4,
  background: 'transparent', border: `1px solid ${COLORS.borderFaint}`,
  color: COLORS.textSecondary, fontSize: 11, cursor: 'pointer',
}
const modeBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 10px', borderRadius: 8, textAlign: 'left',
  background: active ? COLORS.bgBlue : 'transparent',
  border: `1px solid ${active ? COLORS.borderBlue : COLORS.borderFaint}`,
  cursor: 'pointer',
})

function Field({ label, sub, required, children }: {
  label: string; sub?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 4 }}>
        {label}{required && <span style={{ color: COLORS.danger, marginLeft: 2 }}>*</span>}
        {sub && <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 4 }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}
