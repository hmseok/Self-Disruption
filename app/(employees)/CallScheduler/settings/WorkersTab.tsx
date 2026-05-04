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
  }
  const cancelEdit = () => { setEditingId(null) }

  const saveEdit = async (w: Worker) => {
    setSaving(true); setActionMsg(null)
    try {
      const auth = await getAuthHeader()
      // workers PATCH 엔드포인트 부재 — 임시로 PUT/POST 대신 RideEmployees PATCH 사용
      // (cs_workers 의 color_tone/group_label 도 업데이트 필요 — 별도 API 신설 권장)
      // 본 PR 에서는 RideEmployees 측 업데이트만 (마스터 우선)
      const emp = employees.find(e => e.id === (w as any).employee_id) || employees.find(e => e.name === w.name)
      if (emp) {
        const res = await fetch(`/api/ride-employees/${emp.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ color_tone: editTone, group_label: editGroup }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '저장 실패')
      } else {
        throw new Error('연결된 라이드 직원이 없습니다. RideEmployees 마스터에서 먼저 등록하세요.')
      }
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
                    <tr key={worker.id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
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
                      </td>
                    </tr>
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
