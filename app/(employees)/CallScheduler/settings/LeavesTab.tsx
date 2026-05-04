'use client'
// ═══════════════════════════════════════════════════════════════════
// LeavesTab — 연차 / 휴가 마스터 (워커별 일괄 입력)
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import QuotaBulkDialog from './QuotaBulkDialog'
import LeaveBulkUploadDialog from './LeaveBulkUploadDialog'
import { LEAVE_DEFAULTS, QUICK_PRESETS } from '../utils/leaveDefaults'
import type { Worker, ColorTone } from '@/app/(employees)/CallScheduler/utils/types'

// 발급량 잔여 캐시 (워커별 종합)
interface QuotaRow {
  worker_id: string
  year: number
  month: number | null
  leave_type: string
  granted_days: number
  carried_over_days: number
  total_days: number
  used_days: number
  remaining_days: number
}

type LeaveType = 'annual' | 'sick' | 'unpaid' | 'familyday' | 'family' | 'other'
const TYPE_LABEL: Record<LeaveType, string> = {
  annual:    '연차',
  sick:      '병가',
  unpaid:    '무급',
  familyday: '패밀리데이',  // 사용자 분류 — 회사 휴일 아닌 직원별 처리
  family:    '경조',
  other:     '기타',
}
const TYPE_TONE: Record<LeaveType, 'info' | 'warning' | 'neutral' | 'danger' | 'success' | 'primary'> = {
  annual:    'info',
  sick:      'warning',
  unpaid:    'neutral',
  familyday: 'success',
  family:    'primary',
  other:     'neutral',
}

type AmPm = 'full' | 'am' | 'pm' | 'custom'
const AM_PM_LABEL: Record<AmPm, string> = {
  full: '종일 (8h)',
  am: '오전반차 (4h)',
  pm: '오후반차 (4h)',
  custom: '시간 지정',
}

interface Leave {
  id: string
  worker_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  am_pm: AmPm
  hours: number | null
  reason: string | null
  status?: string
  applied_at: string | null
  created_at: string
  worker_name: string
  worker_tone: ColorTone
  group_label: string | null
}

interface FormState {
  id?: string
  worker_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  am_pm: AmPm
  hours: number  // am_pm='custom' 일 때 사용
  reason: string
}

const EMPTY: FormState = {
  worker_id: '',
  leave_type: 'annual',
  start_date: '',
  end_date: '',
  am_pm: 'full',
  hours: 4,
  reason: '',
}

// 일수 계산 (full=종일, am/pm=0.5, custom=hours/8)
function leaveDays(l: { start_date: string; end_date: string; am_pm: AmPm; hours?: number | null }): number {
  if (l.am_pm === 'am' || l.am_pm === 'pm') return 0.5
  if (l.am_pm === 'custom') {
    const h = Number(l.hours || 0)
    return Math.round((h / 8) * 100) / 100
  }
  // full
  const s = new Date(l.start_date + 'T00:00:00')
  const e = new Date(l.end_date + 'T00:00:00')
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return diff < 1 ? 0 : diff
}

export default function LeavesTab() {
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [filterWorker, setFilterWorker] = useState('')
  const [editing, setEditing] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [quotas, setQuotas] = useState<QuotaRow[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const sp = new URLSearchParams()
      sp.set('year', String(year))
      if (filterWorker) sp.set('worker_id', filterWorker)
      const qsp = new URLSearchParams()
      qsp.set('year', String(year))
      if (filterWorker) qsp.set('worker_id', filterWorker)
      const [lRes, wRes, qRes] = await Promise.all([
        fetch(`/api/call-scheduler/leaves?${sp.toString()}`, { headers: auth }),
        fetch('/api/call-scheduler/workers', { headers: auth }),
        fetch(`/api/call-scheduler/leave-quotas?${qsp.toString()}`, { headers: auth }),
      ])
      const lJ = await lRes.json(); if (!lRes.ok) throw new Error(lJ?.error || '연차 조회 실패')
      const wJ = await wRes.json(); if (!wRes.ok) throw new Error(wJ?.error || '워커 조회 실패')
      const qJ = await qRes.json()  // 발급량 — cs_leave_quotas 미적용 시 무시 OK
      setLeaves(lJ.data); setWorkers(wJ.data)
      setQuotas(qRes.ok ? (qJ.data || []) : [])
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setLoading(false) }
  }

  // 워커별 종류별 잔여 합산 (year 단위)
  const quotaByWorker = useMemo(() => {
    const m = new Map<string, Map<string, { total: number; used: number; remaining: number }>>()
    for (const q of quotas) {
      const wm = m.get(q.worker_id) || new Map()
      const entry = wm.get(q.leave_type) || { total: 0, used: 0, remaining: 0 }
      entry.total += Number(q.total_days || 0)
      entry.used += Number(q.used_days || 0)
      entry.remaining += Number(q.remaining_days || 0)
      wm.set(q.leave_type, entry)
      m.set(q.worker_id, wm)
    }
    return m
  }, [quotas])

  useEffect(() => { load() }, [year, filterWorker])

  const stats = useMemo(() => {
    const byWorker = new Map<string, number>()
    let totalDays = 0
    for (const l of leaves) {
      const d = leaveDays(l)
      totalDays += d
      byWorker.set(l.worker_id, (byWorker.get(l.worker_id) || 0) + d)
    }
    return { total: leaves.length, totalDays, workerCount: byWorker.size, byWorker }
  }, [leaves])

  const submit = async () => {
    if (!editing) return
    if (!editing.worker_id) { setError('워커 선택 필수'); return }
    if (!editing.start_date || !editing.end_date) { setError('시작/종료일 필수'); return }
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const url = editing.id
        ? `/api/call-scheduler/leaves/${editing.id}`
        : '/api/call-scheduler/leaves'
      const res = await fetch(url, {
        method: editing.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(editing),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      setEditing(null); await load()
    } catch (e: any) { setError(e?.message || '오류') }
    finally { setSaving(false) }
  }

  const remove = async (l: Leave) => {
    if (!confirm(`${l.worker_name} ${l.start_date}~${l.end_date} ${TYPE_LABEL[l.leave_type]} 삭제할까요?`)) return
    setSaving(true); setError(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch(`/api/call-scheduler/leaves/${l.id}`, { method: 'DELETE', headers: auth })
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

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                  style={{
                    ...GLASS.L1, padding: '6px 12px', borderRadius: 8,
                    fontSize: 13, color: COLORS.textPrimary, outline: 'none',
                  }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select value={filterWorker} onChange={(e) => setFilterWorker(e.target.value)}
                  style={{
                    ...GLASS.L1, padding: '6px 12px', borderRadius: 8,
                    fontSize: 13, color: COLORS.textPrimary, outline: 'none',
                  }}>
            <option value="">전체 워커</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div style={{ fontSize: 12, color: COLORS.textMuted, display: 'flex', gap: 8 }}>
            <span>{stats.total}건</span>
            <span>· {stats.workerCount}명</span>
            <span>· 총 {stats.totalDays}일</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setUploadOpen(true)}
                  style={{
                    ...BTN.md, background: COLORS.bgGreen, color: COLORS.success,
                    border: `1px solid ${COLORS.borderGreen}`, cursor: 'pointer',
                  }}
                  title="엑셀로 직원 명단을 받아서 일괄 등록">
            📤 일괄 업로드
          </button>
          <button type="button" onClick={() => setBulkOpen(true)}
                  style={{
                    ...BTN.md, background: COLORS.bgViolet, color: '#7c3aed',
                    border: `1px solid ${COLORS.borderViolet}`, cursor: 'pointer',
                  }}
                  title="연차/패밀리데이 등 발급량 일괄 설정">
            💼 발급량
          </button>
          <button type="button"
                  onClick={() => setEditing({
                    ...EMPTY,
                    start_date: `${year}-01-01`,
                    end_date: `${year}-01-01`,
                  })}
                  style={{
                    ...BTN.md, background: COLORS.primary, color: '#fff',
                    border: 'none', cursor: 'pointer',
                  }}>
            + 연차 등록
          </button>
        </div>
      </div>

      {/* 편집 폼 */}
      {editing && (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 12 }}>
            {editing.id ? '연차 편집' : '신규 연차 등록'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
            <Field label="워커 *">
              <select value={editing.worker_id}
                      onChange={(e) => setEditing({ ...editing, worker_id: e.target.value })}
                      style={inputStyle}>
                <option value="">선택</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.group_label ? `(${w.group_label})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="시작일 *">
              <input type="date" value={editing.start_date}
                     onChange={(e) => setEditing({
                       ...editing,
                       start_date: e.target.value,
                       // end_date 가 시작보다 빠르면 동일하게
                       end_date: e.target.value > editing.end_date ? e.target.value : editing.end_date,
                     })}
                     style={inputStyle} />
            </Field>
            <Field label="종료일 *">
              <input type="date" value={editing.end_date}
                     min={editing.start_date}
                     onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
                     style={inputStyle} />
            </Field>
            <Field label="시간 단위">
              {/* 빠른 프리셋 (회사 정책) */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                {QUICK_PRESETS.map(p => (
                  <button key={p.label} type="button"
                          onClick={() => setEditing({
                            ...editing,
                            am_pm: p.am_pm,
                            hours: p.hours,
                          })}
                          style={{
                            padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 999,
                            background: 'transparent',
                            color: COLORS.textSecondary,
                            border: `1px dashed ${COLORS.borderFaint}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['full', 'am', 'pm', 'custom'] as AmPm[]).map(v => (
                  <button key={v} type="button"
                          onClick={() => setEditing({ ...editing, am_pm: v })}
                          style={{
                            flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 700, borderRadius: 6,
                            background: editing.am_pm === v ? COLORS.bgBlue : 'transparent',
                            color: editing.am_pm === v ? COLORS.info : COLORS.textSecondary,
                            border: `1px solid ${editing.am_pm === v ? COLORS.borderBlue : COLORS.borderFaint}`,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>
                    {AM_PM_LABEL[v]}
                  </button>
                ))}
              </div>
              {editing.am_pm === 'custom' && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" step={0.5} min={0.5} max={24}
                         value={editing.hours}
                         onChange={(e) => setEditing({ ...editing, hours: Number(e.target.value) })}
                         style={{ ...inputStyle, flex: 1 }} />
                  <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 700 }}>시간</span>
                </div>
              )}
              {editing.leave_type === 'familyday' && editing.am_pm !== 'custom' && (
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4 }}>
                  💡 패밀리데이는 보통 시간 단위 사용 — [시간 지정] 권장
                </div>
              )}
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 10 }}>
            <Field label="종류 (선택 시 회사 정책 자동 적용)">
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['annual', 'sick', 'unpaid', 'familyday', 'family', 'holiday', 'other'] as LeaveType[]).map(t => (
                  <button key={t} type="button"
                          onClick={() => {
                            // 종류 변경 시 default 자동 적용 (사용자가 다시 변경 가능)
                            const def = LEAVE_DEFAULTS[t]
                            setEditing({
                              ...editing,
                              leave_type: t,
                              am_pm: def.am_pm,
                              hours: def.hours,
                            })
                          }}
                          style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6,
                            background: editing.leave_type === t ? COLORS.bgBlue : 'transparent',
                            color: editing.leave_type === t ? COLORS.info : COLORS.textSecondary,
                            border: `1px solid ${editing.leave_type === t ? COLORS.borderBlue : COLORS.borderFaint}`,
                            cursor: 'pointer',
                          }}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                💡 {LEAVE_DEFAULTS[editing.leave_type]?.description || ''}
              </div>
            </Field>
            <Field label="사유 / 메모">
              <input type="text" value={editing.reason}
                     onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                     style={inputStyle} placeholder="자유 메모" />
            </Field>
          </div>
          <div style={{
            marginTop: 8, padding: '6px 10px', borderRadius: 6,
            background: COLORS.bgBlue, color: COLORS.info, fontSize: 11,
          }}>
            계산: {leaveDays(editing)}일 차감
            {editing.am_pm === 'custom' && ` (${editing.hours}시간 = ${(editing.hours / 8).toFixed(2)}일)`}
            {editing.am_pm === 'full' && ' (8시간/일)'}
            {(editing.am_pm === 'am' || editing.am_pm === 'pm') && ' (4시간 = 0.5일)'}
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
              {saving ? '저장 중...' : (editing.id ? '저장' : '등록')}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>로딩 중...</div>
      ) : leaves.length === 0 ? (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 60, textAlign: 'center', color: COLORS.textMuted }}>
          {year}년 등록된 연차가 없습니다.
        </div>
      ) : (
        <div style={{ ...GLASS.L4, borderRadius: 12, padding: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                <th style={thStyle}>워커</th>
                <th style={thStyle}>기간</th>
                <th style={thStyle}>일수</th>
                <th style={thStyle}>범위</th>
                <th style={thStyle}>종류</th>
                <th style={thStyle}>사유</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map(l => (
                <tr key={l.id} style={{ borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                  <td style={tdStyle}>
                    <span style={{
                      color: TONE_TEXT[l.worker_tone],
                      background: TONE_BG[l.worker_tone] !== 'transparent' ? TONE_BG[l.worker_tone] : undefined,
                      padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                    }}>{l.worker_name}</span>
                    {l.group_label && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: COLORS.textMuted }}>{l.group_label}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>
                    {l.start_date === l.end_date ? l.start_date : `${l.start_date} ~ ${l.end_date}`}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{leaveDays(l)}일</td>
                  <td style={tdStyle}>
                    <span style={pillStyle(
                      l.am_pm === 'full' ? 'neutral'
                      : l.am_pm === 'custom' ? 'info'
                      : 'warning'
                    )}>
                      {l.am_pm === 'custom' ? `${l.hours || 0}h` : AM_PM_LABEL[l.am_pm]}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={pillStyle(TYPE_TONE[l.leave_type])}>{TYPE_LABEL[l.leave_type]}</span>
                  </td>
                  <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: 12 }}>{l.reason || '·'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button type="button"
                            onClick={() => setEditing({
                              id: l.id,
                              worker_id: l.worker_id,
                              leave_type: l.leave_type,
                              start_date: l.start_date,
                              end_date: l.end_date,
                              am_pm: l.am_pm,
                              hours: Number(l.hours || 4),
                              reason: l.reason || '',
                            })}
                            style={{
                              ...BTN.sm, background: 'transparent', color: COLORS.info,
                              border: `1px solid ${COLORS.borderBlue}`, marginRight: 4, cursor: 'pointer',
                            }}>편집</button>
                    <button type="button" onClick={() => remove(l)}
                            style={{
                              ...BTN.sm, background: 'transparent', color: COLORS.danger,
                              border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer',
                            }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuotaBulkDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        workers={workers}
        defaultYear={year}
        onCompleted={() => { setBulkOpen(false); load() }}
      />
      <LeaveBulkUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCompleted={() => load()}
      />
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1, padding: '7px 10px', borderRadius: 8,
  fontSize: 13, color: COLORS.textPrimary, outline: 'none', width: '100%',
}
const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left',
  color: COLORS.textSecondary, fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12,
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
