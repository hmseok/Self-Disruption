'use client'
// ═══════════════════════════════════════════════════════════════════
// QuotaBulkDialog — 휴가 발급량 일괄 설정 모달
//   · 종류 / 일수 / 적용 직원 / 발급 주기 (year / monthly_all)
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo } from 'react'
import { COLORS, GLASS, BTN, pillStyle } from '@/app/utils/ui-tokens'
import { TONE_BG, TONE_TEXT } from '@/app/(employees)/CallScheduler/utils/palette'
import { getAuthHeader } from '@/app/utils/auth-client'
import type { Worker } from '@/app/(employees)/CallScheduler/utils/types'

interface Props {
  open: boolean
  onClose: () => void
  workers: Worker[]
  defaultYear: number
  onCompleted: () => void
}

type LeaveType = 'annual' | 'familyday' | 'sick' | 'unpaid' | 'family' | 'other'

const TYPE_PRESETS: { value: LeaveType; label: string; days: number; mode: 'year' | 'monthly_all' }[] = [
  { value: 'annual',    label: '연차 (연 단위)',        days: 15, mode: 'year' },
  { value: 'familyday', label: '패밀리데이 (월 1회)',    days: 1,  mode: 'monthly_all' },
  { value: 'sick',      label: '병가 (연 단위)',        days: 5,  mode: 'year' },
  { value: 'family',    label: '경조 (이벤트별, 0=무발급)', days: 0,  mode: 'year' },
  { value: 'unpaid',    label: '무급 (제한 없음, 0=무발급)', days: 0,  mode: 'year' },
  { value: 'other',     label: '기타',                 days: 0,  mode: 'year' },
]

export default function QuotaBulkDialog({ open, onClose, workers, defaultYear, onCompleted }: Props) {
  const [year, setYear] = useState(defaultYear)
  const [preset, setPreset] = useState<LeaveType>('annual')
  const [days, setDays] = useState(15)
  const [mode, setMode] = useState<'year' | 'monthly_all'>('year')
  const [selectedIds, setSelectedIds] = useState<string[]>(workers.map(w => w.id))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  if (!open) return null

  const usePreset = (p: typeof TYPE_PRESETS[0]) => {
    setPreset(p.value); setDays(p.days); setMode(p.mode)
  }

  const submit = async () => {
    setBusy(true); setResult(null)
    try {
      const auth = await getAuthHeader()
      const res = await fetch('/api/call-scheduler/leave-quotas/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          year,
          leave_type: preset,
          granted_days: days,
          mode,
          worker_ids: selectedIds,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '실패')
      const m = mode === 'monthly_all' ? '12개월' : '연 단위'
      setResult({
        ok: true,
        text: `${selectedIds.length}명 × ${m} = INSERT ${json.data.inserted} / UPDATE ${json.data.updated}`,
      })
      onCompleted()
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || '오류' })
    } finally { setBusy(false) }
  }

  const toggleAll = () => {
    if (selectedIds.length === workers.length) setSelectedIds([])
    else setSelectedIds(workers.map(w => w.id))
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...GLASS.L4, width: 560, maxWidth: '94vw', maxHeight: '88vh',
        borderRadius: 16, padding: 22, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
            💼 휴가 발급량 일괄 설정
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
            연차 = 연 1회 / 패밀리데이 = 월 1회 자동 12개월 발급
          </div>
        </div>

        {/* 프리셋 */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
            발급 종류 (프리셋 선택)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {TYPE_PRESETS.map(p => (
              <button key={p.value} type="button" onClick={() => usePreset(p)}
                      style={{
                        padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: preset === p.value ? COLORS.bgBlue : 'transparent',
                        color: preset === p.value ? COLORS.info : COLORS.textSecondary,
                        border: `1px solid ${preset === p.value ? COLORS.borderBlue : COLORS.borderFaint}`,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label="연도">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                    style={inputStyle}>
              {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </Field>
          <Field label="발급 일수 (반차 0.5)">
            <input type="number" value={days} step={0.5} min={0}
                   onChange={(e) => setDays(Number(e.target.value))}
                   style={inputStyle} />
          </Field>
          <Field label="발급 주기">
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={() => setMode('year')}
                      style={{
                        flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700, borderRadius: 6,
                        background: mode === 'year' ? COLORS.bgBlue : 'transparent',
                        color: mode === 'year' ? COLORS.info : COLORS.textSecondary,
                        border: `1px solid ${mode === 'year' ? COLORS.borderBlue : COLORS.borderFaint}`,
                        cursor: 'pointer',
                      }}>연 1회</button>
              <button type="button" onClick={() => setMode('monthly_all')}
                      style={{
                        flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700, borderRadius: 6,
                        background: mode === 'monthly_all' ? COLORS.bgBlue : 'transparent',
                        color: mode === 'monthly_all' ? COLORS.info : COLORS.textSecondary,
                        border: `1px solid ${mode === 'monthly_all' ? COLORS.borderBlue : COLORS.borderFaint}`,
                        cursor: 'pointer',
                      }}>월 1회</button>
            </div>
          </Field>
        </div>

        {/* 워커 선택 */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary }}>
              적용 직원 ({selectedIds.length}/{workers.length})
            </div>
            <button type="button" onClick={toggleAll}
                    style={{
                      fontSize: 11, color: COLORS.info, background: 'transparent',
                      border: 'none', cursor: 'pointer', fontWeight: 700,
                    }}>
              {selectedIds.length === workers.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <div style={{
            ...GLASS.L1, borderRadius: 8, padding: 8, maxHeight: 160, overflowY: 'auto',
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
          }}>
            {workers.map(w => {
              const checked = selectedIds.includes(w.id)
              return (
                <label key={w.id} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                  background: checked ? TONE_BG[w.color_tone] : 'transparent',
                  fontSize: 12,
                }}>
                  <input type="checkbox" checked={checked}
                         onChange={() => {
                           setSelectedIds(prev => prev.includes(w.id)
                             ? prev.filter(x => x !== w.id) : [...prev, w.id])
                         }} />
                  <span style={{ color: TONE_TEXT[w.color_tone], fontWeight: 600 }}>{w.name}</span>
                </label>
              )
            })}
          </div>
        </div>

        {result && (
          <div style={{
            ...GLASS.L3,
            background: result.ok ? COLORS.bgGreen : COLORS.bgRed,
            border: `1px solid ${result.ok ? COLORS.borderGreen : COLORS.borderRed}`,
            borderRadius: 8, padding: '8px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: result.ok ? COLORS.success : COLORS.danger,
            }}>
              {result.ok ? '✅ ' : '❌ '}{result.text}
            </div>
            <button onClick={() => setResult(null)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: COLORS.textMuted, fontSize: 14,
            }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose}
                  style={{
                    ...BTN.md, background: 'transparent', color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.borderFaint}`, cursor: 'pointer',
                  }}>닫기</button>
          <button type="button" onClick={submit}
                  disabled={busy || selectedIds.length === 0}
                  style={{
                    ...BTN.md, background: COLORS.primary, color: '#fff', border: 'none',
                    cursor: busy || selectedIds.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: busy || selectedIds.length === 0 ? 0.6 : 1,
                  }}>
            {busy ? '발급 중...' : '💼 일괄 발급'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  ...GLASS.L1, padding: '7px 10px', borderRadius: 8,
  fontSize: 13, color: COLORS.textPrimary, outline: 'none', width: '100%',
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
