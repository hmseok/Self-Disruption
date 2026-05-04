'use client'
// ═══════════════════════════════════════════════════════════════════
// WorkersTab — 콜센터 워커 관리
//   · 라이드 직원 마스터(ride_employees) 중에서 콜센터 워커로 활성화
//   · 콜센터 특화 컬럼: color_tone, group_label
//   · cs_workers 의 마스터 컬럼은 점진 deprecated → 라이드 직원 정보가 우선 표시
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { COLOR_TONE_OPTIONS } from '@/app/(employees)/CallScheduler/utils/types'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { Worker, ColorTone } from '@/app/(employees)/CallScheduler/utils/types'

const GROUP_OPTIONS: (string | null)[] = [null, '주간', '야간', '저녁', '관리', '기타']

interface RideEmp {
  id: string
  name: string
  department: string | null
  position: string | null
  phone: string | null
  email: string | null
  color_tone: ColorTone
  group_label: string | null
  is_active: boolean
}

export default function WorkersTab() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [employees, setEmployees] = useState<RideEmp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTone, setEditTone] = useState<ColorTone>('none')
  const [editGroup, setEditGroup] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // PR-2QQ-d-1 — 워커 제약 셋팅
  const [editIsExternal, setEditIsExternal] = useState(false)
  const [editPriority, setEditPriority] = useState(2)
  const [editAvoidDow, setEditAvoidDow] = useState<Set<number>>(new Set())
  const [editRequired, setEditRequired] = useState<string>('')
  const [editMax, setEditMax] = useState<string>('')
  const [editPattern, setEditPattern] = useState<string>('')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const [wRes, eRes] = await Promise.all([
        fetch('/api/call-scheduler/workers', { headers: auth }),
        fetch('/api/ride-employees?include_inactive=0', { headers: auth }),
      ])
      const wJ = await wRes.json(); if (!wRes.ok) throw new Error(wJ?.error || '워커 조회 실패')
      const eJ = await eRes.json(); if (!eRes.ok) throw new Error(eJ?.error || '직원 조회 실패')
      setWorkers(wJ.data); setEmployees(eJ.data)
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // 어떤 직원이 콜센터 워커로 활성/비활성인지
  const workerByName = useMemo(() => {
    const m = new Map<string, Worker>()
    for (const w of workers) m.set(w.name, w)
    return m
  }, [workers])

  // 콜센터 워커 + 라이드 직원 조인 (이름 또는 employee_id 기준)
  const rows = useMemo(() => {
    return workers.map(w => {
      // employee 매칭은 v1 에서는 이름으로, v2 부터 employee_id 도 활용
      const emp = employees.find(e => e.id === (w as any).employee_id) || employees.find(e => e.name === w.name)
      return { worker: w, employee: emp || null }
    })
  }, [workers, employees])

  const startEdit = (w: Worker) => {
    setEditingId(w.id); setEditTone(w.color_tone); setEditGroup(w.group_label)
    setEditIsExternal(!!w.is_external)
    setEditPriority(w.priority_level || 2)
    // PR-2QQ-d-1 버그 fix: 빈 문자열이 Number('') === 0 (일요일) 으로 잘못 파싱되던 문제
    setEditAvoidDow(new Set(
      (w.preferred_dow_avoid || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s !== '')           // ✅ 빈 토큰 먼저 제거
        .map(Number)
        .filter(n => !isNaN(n) && n >= 0 && n <= 6)
    ))
    setEditRequired(w.required_days_per_month != null ? String(w.required_days_per_month) : '')
    setEditMax(w.max_days_per_month != null ? String(w.max_days_per_month) : '')
    setEditPattern(w.work_pattern_text || '')
  }
  const cancelEdit = () => { setEditingId(null) }

  const saveEdit = async (w: Worker) => {
    setSaving(true); setActionMsg(null)
    try {
      const auth = await getAuthHeader()
      // 1. RideEmployees 마스터 (color/group) — 사람 정보
      const emp = employees.find(e => e.id === (w as any).employee_id) || employees.find(e => e.name === w.name)
      if (emp) {
        const res = await fetch(`/api/ride-employees/${emp.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ color_tone: editTone, group_label: editGroup }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'RideEmployees 저장 실패')
      }
      // 2. cs_workers (PR-2QQ-d-1: 제약 셋팅)
      const avoidStr = Array.from(editAvoidDow).sort().join(',')
      const wRes = await fetch(`/api/call-scheduler/workers/${w.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          color_tone: editTone,
          group_label: editGroup,
          is_external: editIsExternal,
          priority_level: editPriority,
          preferred_dow_avoid: avoidStr || null,
          required_days_per_month: editRequired ? Number(editRequired) : null,
          max_days_per_month: editMax ? Number(editMax) : null,
          work_pattern_text: editPattern.trim() || null,
        }),
      })
      const wJson = await wRes.json()
      if (!wRes.ok) throw new Error(wJson?.error || 'cs_workers 저장 실패')

      setActionMsg({ ok: true, text: `${w.name} 변경 저장됨` })
      setEditingId(null)
      await load()
    } catch (e: any) { setActionMsg({ ok: false, text: e?.message || '오류' }) }
    finally { setSaving(false) }
  }

  // 라이드 직원 중 콜센터 워커가 아닌 사람들 (활성화 후보)
  const candidates = useMemo(() => {
    return employees.filter(e =>
      e.is_active && !workers.some(w => (w as any).employee_id === e.id || w.name === e.name)
    )
  }, [employees, workers])

  return (
    <div>
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: COLORS.bgRed, border: `1px solid ${COLORS.borderRed}`,
          color: COLORS.danger, fontSize: 13,
        }}>❌ {error}</div>
      )}
      {actionMsg && (
        <div style={{
          ...GLASS.L3,
          background: actionMsg.ok ? COLORS.bgGreen : COLORS.bgRed,
          border: `1px solid ${actionMsg.ok ? COLORS.borderGreen : COLORS.borderRed}`,
          borderRadius: 8, padding: '8px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: actionMsg.ok ? COLORS.success : COLORS.danger,
          }}>
            {actionMsg.ok ? '✅ ' : '❌ '}{actionMsg.text}
          </div>
          <button onClick={() => setActionMsg(null)} style={{
            background: 'transparent', border: 'none',
            color: COLORS.textMuted, cursor: 'pointer', fontSize: 14,
          }}>×</button>
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
          콜센터 워커 <strong>{workers.length}명</strong>
          {' · '}
          라이드 직원 마스터 <strong>{employees.length}명</strong>
          {candidates.length > 0 && (
            <span style={{ marginLeft: 8 }}>
              <span style={pillStyle('warning')}>+ {candidates.length}명 미활성화</span>
            </span>
          )}
        </div>
        <Link href="/RideEmployees" style={{
          ...BTN.sm, background: 'transparent', color: COLORS.info,
          border: `1px solid ${COLORS.borderBlue}`, textDecoration: 'none',
        }}>
          → 라이드 직원 마스터로
        </Link>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
      ) : (
        <>
          {/* 콜센터 워커 목록 */}
          <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, marginBottom: 12, overflow: 'auto' }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: COLORS.textPrimary,
              padding: '4px 6px', marginBottom: 8,
            }}>
              📞 콜센터 워커 ({workers.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <th style={thStyle}>이름</th>
                  <th style={thStyle}>부서</th>
                  <th style={thStyle}>직급</th>
                  <th style={thStyle}>그룹 (콜센터)</th>
                  <th style={thStyle}>색상 (캘린더)</th>
                  <th style={thStyle}>연락처</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ worker, employee }) => {
                  const isEditing = editingId === worker.id
                  const tone = isEditing ? editTone : worker.color_tone
                  return (
                    <>
                    <tr key={worker.id} style={{ borderBottom: isEditing ? 'none' : `1px solid ${COLORS.borderFaint}` }}>
                      <td style={tdStyle}>
                        <span style={{
                          color: TONE_TEXT[tone],
                          background: TONE_BG[tone] !== 'transparent' ? TONE_BG[tone] : undefined,
                          padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                        }}>
                          {employee?.name || worker.name}
                        </span>
                        {!employee && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: COLORS.warning }}>
                            ⚠ 라이드 직원 미연결
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: 12 }}>
                        {employee?.department || '·'}
                      </td>
                      <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: 12 }}>
                        {employee?.position || '·'}
                      </td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {GROUP_OPTIONS.map((g, i) => {
                              const v = g
                              const label = v || '없음'
                              return (
                                <button key={i} type="button"
                                        onClick={() => setEditGroup(v)}
                                        style={{
                                          padding: '2px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                                          background: editGroup === v ? COLORS.bgBlue : 'transparent',
                                          color: editGroup === v ? COLORS.info : COLORS.textSecondary,
                                          border: `1px solid ${editGroup === v ? COLORS.borderBlue : COLORS.borderFaint}`,
                                          cursor: 'pointer',
                                        }}>{label}</button>
                              )
                            })}
                          </div>
                        ) : (
                          worker.group_label
                            ? <span style={pillStyle('neutral')}>{worker.group_label}</span>
                            : <span style={{ color: COLORS.textMuted, fontSize: 11 }}>·</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          // PR-2QQ-a — 14 색상 dot picker
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {COLOR_TONE_OPTIONS.map(opt => {
                              const active = editTone === opt.value
                              return (
                                <button key={opt.value} type="button"
                                        onClick={() => setEditTone(opt.value)}
                                        title={opt.label}
                                        style={{
                                          width: 18, height: 18, borderRadius: '50%',
                                          background: opt.value === 'none' ? '#fff' : opt.hex,
                                          border: active ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.borderFaint}`,
                                          cursor: 'pointer', padding: 0,
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          fontSize: 10, color: '#fff', fontWeight: 700,
                                        }}>
                                  {active ? '✓' : ''}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <span style={{
                            display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                            background: TONE_BG[worker.color_tone] !== 'transparent' ? TONE_BG[worker.color_tone] : '#fff',
                            border: `1px solid ${COLORS.borderFaint}`, verticalAlign: 'middle',
                            marginRight: 6,
                          }} />
                        )}
                        {!isEditing && (
                          <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                            {worker.color_tone === 'none' ? '없음' : worker.color_tone}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11, color: COLORS.textMuted }}>
                        {employee?.phone || '·'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {isEditing ? (
                          <>
                            <button type="button" onClick={() => saveEdit(worker)} disabled={saving}
                                    style={{
                                      ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none',
                                      cursor: saving ? 'not-allowed' : 'pointer', marginRight: 4,
                                    }}>저장</button>
                            <button type="button" onClick={cancelEdit}
                                    style={{
                                      ...BTN.sm, background: 'transparent', color: COLORS.textSecondary,
                                      border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                                    }}>취소</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => startEdit(worker)}
                                  style={{
                                    ...BTN.sm, background: 'transparent', color: COLORS.info,
                                    border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer',
                                  }}>편집</button>
                        )}
                        {!isEditing && worker.is_external && (
                          <span style={{
                            marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                            background: COLORS.bgViolet, color: '#7c3aed', fontWeight: 800,
                          }} title="외부 직원">🔒 외부</span>
                        )}
                        {!isEditing && worker.priority_level === 1 && (
                          <span style={{
                            marginLeft: 4, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                            background: COLORS.bgRed, color: COLORS.danger, fontWeight: 800,
                          }} title="1순위">P1</span>
                        )}
                      </td>
                    </tr>
                    {/* PR-2QQ-d-1 — 편집 시 제약 셋팅 펼침 */}
                    {isEditing && (
                      <tr key={`${worker.id}-edit`} style={{ borderBottom: `1px solid ${COLORS.borderFaint}`, background: 'rgba(59,130,246,0.04)' }}>
                        <td colSpan={7} style={{ padding: '12px 14px' }}>
                          <ConstraintsPanel
                            isExternal={editIsExternal} setIsExternal={setEditIsExternal}
                            priority={editPriority} setPriority={setEditPriority}
                            avoidDow={editAvoidDow} setAvoidDow={setEditAvoidDow}
                            required={editRequired} setRequired={setEditRequired}
                            max={editMax} setMax={setEditMax}
                            pattern={editPattern} setPattern={setEditPattern}
                          />
                        </td>
                      </tr>
                    )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 미활성화 후보 */}
          {candidates.length > 0 && (
            <div style={{
              ...GLASS.L4, borderRadius: 12, padding: 12,
              border: `1px dashed ${COLORS.borderAmber}`,
              background: COLORS.bgAmber,
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.warning, marginBottom: 6 }}>
                💡 라이드 직원 마스터에는 있지만 콜센터 워커가 아님 ({candidates.length}명)
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 8 }}>
                콜센터 부서로 옮기거나, 별도 부서면 그대로 두세요.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {candidates.map(e => (
                  <Link key={e.id} href={`/RideEmployees/${e.id}`}
                        style={{
                          padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                          background: 'rgba(255,255,255,0.5)',
                          color: TONE_TEXT[e.color_tone],
                          border: `1px solid ${COLORS.borderFaint}`,
                          textDecoration: 'none', whiteSpace: 'nowrap',
                        }}>
                    {e.name} {e.department && <span style={{ color: COLORS.textMuted, marginLeft: 4 }}>· {e.department}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  color: COLORS.textSecondary, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12,
}
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', whiteSpace: 'nowrap', color: COLORS.textPrimary,
}

// PR-2QQ-d-1 — 워커 제약 패널 (편집 시 펼침)
function ConstraintsPanel({
  isExternal, setIsExternal,
  priority, setPriority,
  avoidDow, setAvoidDow,
  required, setRequired,
  max, setMax,
  pattern, setPattern,
}: {
  isExternal: boolean; setIsExternal: (v: boolean) => void
  priority: number; setPriority: (v: number) => void
  avoidDow: Set<number>; setAvoidDow: (v: Set<number>) => void
  required: string; setRequired: (v: string) => void
  max: string; setMax: (v: string) => void
  pattern: string; setPattern: (v: string) => void
}) {
  const DOW = ['일', '월', '화', '수', '목', '금', '토']
  const toggleDow = (d: number) => {
    const next = new Set(avoidDow)
    if (next.has(d)) next.delete(d); else next.add(d)
    setAvoidDow(next)
  }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14,
      ...GLASS.L1, borderRadius: 8, padding: 12,
    }}>
      {/* 좌측 — 우선순위 + 외부 + 비선호 요일 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <FieldLabel>🏷 우선순위</FieldLabel>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {[1, 2, 3].map(n => (
              <button key={n} type="button" onClick={() => setPriority(n)}
                      style={{
                        flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: priority === n
                          ? (n === 1 ? COLORS.bgRed : n === 2 ? COLORS.bgBlue : COLORS.bgGray)
                          : 'transparent',
                        color: priority === n
                          ? (n === 1 ? COLORS.danger : n === 2 ? COLORS.info : COLORS.textSecondary)
                          : COLORS.textSecondary,
                        border: `1px solid ${
                          priority === n
                            ? (n === 1 ? COLORS.borderRed : n === 2 ? COLORS.borderBlue : COLORS.borderFaint)
                            : COLORS.borderFaint
                        }`,
                        cursor: 'pointer',
                      }}>
                {n === 1 ? 'P1 최우선' : n === 2 ? 'P2 일반' : 'P3 백업'}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
            자동 생성 시 P1 부터 우선 배정 (외부 직원은 보통 P1)
          </div>
        </div>

        <div>
          <FieldLabel>🔒 외부 직원</FieldLabel>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
            cursor: 'pointer', userSelect: 'none',
          }}>
            <input type="checkbox" checked={isExternal}
                   onChange={(e) => setIsExternal(e.target.checked)} />
            <span style={{ fontSize: 12, color: COLORS.textPrimary }}>
              외부 직원으로 표시 (🔒 아이콘 + 자동 P1 권장)
            </span>
          </label>
        </div>

        <div>
          <FieldLabel>🚫 비선호 요일</FieldLabel>
          <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
            {DOW.map((label, i) => {
              const active = avoidDow.has(i)
              const isWeekend = i === 0 || i === 6
              return (
                <button key={i} type="button" onClick={() => toggleDow(i)}
                        style={{
                          flex: 1, padding: '6px 0', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: active ? COLORS.bgRed : 'transparent',
                          color: active
                            ? COLORS.danger
                            : (isWeekend ? COLORS.textSecondary : COLORS.textMuted),
                          border: `1px solid ${active ? COLORS.borderRed : COLORS.borderFaint}`,
                          cursor: 'pointer',
                        }}>
                  {label}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
            자동 생성 시 이 요일 후순위 (예: 야간 워커 금·일 회피)
          </div>
        </div>
      </div>

      {/* 우측 — 필수/최대 + 패턴 메모 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <FieldLabel>📊 월 필수 일수</FieldLabel>
            <input type="number" min={0} max={31} value={required}
                   onChange={(e) => setRequired(e.target.value)}
                   placeholder="없음"
                   style={{
                     width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                     border: `1px solid ${COLORS.borderFaint}`,
                     background: 'rgba(255,255,255,0.85)', marginTop: 4,
                   }} />
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
              미달 시 자동 생성에 우선 배정
            </div>
          </div>
          <div>
            <FieldLabel>🛑 월 최대 일수</FieldLabel>
            <input type="number" min={0} max={31} value={max}
                   onChange={(e) => setMax(e.target.value)}
                   placeholder="없음"
                   style={{
                     width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                     border: `1px solid ${COLORS.borderFaint}`,
                     background: 'rgba(255,255,255,0.85)', marginTop: 4,
                   }} />
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
              초과 시 자동 생성에서 제외
            </div>
          </div>
        </div>

        <div>
          <FieldLabel>📝 패턴 메모</FieldLabel>
          <input type="text" value={pattern}
                 onChange={(e) => setPattern(e.target.value)}
                 placeholder="예: 2-on-2-off, 평일만, 주말만"
                 maxLength={64}
                 style={{
                   width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                   border: `1px solid ${COLORS.borderFaint}`,
                   background: 'rgba(255,255,255,0.85)', marginTop: 4,
                 }} />
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
            매니저 메모 (자동 생성 알고리즘에 직접 영향 X — 참고용)
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary }}>
      {children}
    </div>
  )
}
