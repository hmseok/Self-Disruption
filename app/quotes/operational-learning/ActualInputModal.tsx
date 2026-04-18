'use client'

import { useEffect, useState } from 'react'
import { Snapshot, fmtWon } from './OperationalLearningContext'
import { getAuthHeader } from '@/app/utils/auth-client'

// ═══════════════════════════════════════════════════════════════
// ActualInputModal — 월별 실적 다건 입력 그리드 (Soft Ice Level 4)
// 스냅샷의 term_months 만큼의 행을 표시, UPSERT (snapshot_id, recorded_month)
// ═══════════════════════════════════════════════════════════════

type Row = {
  recorded_month: string            // YYYY-MM
  actual_depreciation: string       // 빈 문자열 = null
  actual_insurance: string
  actual_maintenance: string
  actual_tax: string
  actual_accident_cost: string
  source?: string                   // 조회된 경우 표시
  id?: string                       // 기존 row id
}

type Props = {
  snapshot: Snapshot
  onClose: () => void
  onSaved: () => void
}

export default function ActualInputModal({ snapshot, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startMonth, setStartMonth] = useState<string>(() => {
    // 기본: 스냅샷 생성월부터 시작
    const d = new Date(snapshot.snapshot_date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const months = generateMonths(startMonth, Math.max(1, snapshot.term_months || 12))

  // 기존 실적 로드
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const auth = await getAuthHeader()
        const res = await fetch(`/api/operational-learning/actuals?snapshotId=${snapshot.id}`, {
          headers: auth,
        })
        const json = await res.json()
        if (cancelled) return
        const existing: any[] = json.data || []
        const map = new Map<string, any>(existing.map(e => [e.recorded_month, e]))
        setRows(months.map(m => {
          const e = map.get(m)
          return {
            recorded_month: m,
            actual_depreciation: e?.actual_depreciation != null ? String(e.actual_depreciation) : '',
            actual_insurance:    e?.actual_insurance    != null ? String(e.actual_insurance)    : '',
            actual_maintenance:  e?.actual_maintenance  != null ? String(e.actual_maintenance)  : '',
            actual_tax:          e?.actual_tax          != null ? String(e.actual_tax)          : '',
            actual_accident_cost:e?.actual_accident_cost!= null ? String(e.actual_accident_cost): '',
            source: e?.source,
            id: e?.id,
          }
        }))
      } catch (e: any) {
        if (!cancelled) setError(e.message || '불러오기 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.id, startMonth])

  const update = (idx: number, key: keyof Row, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const auth = await getAuthHeader()
      // 빈 행(모든 값이 비어있음)은 스킵
      const entries = rows
        .filter(r => [r.actual_depreciation, r.actual_insurance, r.actual_maintenance, r.actual_tax, r.actual_accident_cost].some(v => v.trim() !== ''))
        .map(r => ({
          snapshot_id: snapshot.id,
          contract_id: snapshot.contract_id,
          recorded_month: r.recorded_month,
          actual_depreciation: numOrNull(r.actual_depreciation),
          actual_insurance:    numOrNull(r.actual_insurance),
          actual_maintenance:  numOrNull(r.actual_maintenance),
          actual_tax:          numOrNull(r.actual_tax),
          actual_accident_cost:numOrNull(r.actual_accident_cost),
          source: 'manual',
        }))

      if (entries.length === 0) {
        setError('저장할 데이터가 없습니다 (모든 셀이 비어있음)')
        setSaving(false)
        return
      }

      const res = await fetch('/api/operational-learning/actuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ entries }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || '저장 실패')
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message || '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  // 예측값 (월 기준) 표시용
  const pred = {
    dep: Number(snapshot.predicted_depreciation || 0),
    ins: Number(snapshot.predicted_insurance || 0),
    mnt: Number(snapshot.predicted_maintenance || 0),
    tax: Number(snapshot.predicted_tax || 0),
    acc: Number(snapshot.predicted_accident_cost || 0),
  }

  return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>월별 실적 입력</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            견적: <span style={{ fontFamily: 'monospace' }}>{snapshot.quote_id.slice(0, 8)}</span>
            {snapshot.vehicle_class && <> · {snapshot.vehicle_class}</>}
            {snapshot.term_months && <> · {snapshot.term_months}개월</>}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            color: '#64748b',
            padding: 4,
          }}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* 시작월 설정 */}
      <div style={{ padding: '12px 20px', display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(248,250,252,0.6)' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>시작월</label>
        <input
          type="month"
          value={startMonth}
          onChange={e => setStartMonth(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid rgba(0,0,0,0.05)',
            background: 'rgba(255,255,255,0.40)',
            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05)',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        />
        <span style={{ fontSize: 11, color: '#64748b' }}>→ {snapshot.term_months || 12}개월 ({months[months.length - 1]}까지)</span>
      </div>

      <div style={{ padding: '12px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 220px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,0.95)', zIndex: 2 }}>
            <tr>
              <Th>월</Th>
              <Th sub={`예측 ${fmtWon(pred.dep)}`}>감가</Th>
              <Th sub={`예측 ${fmtWon(pred.ins)}`}>보험</Th>
              <Th sub={`예측 ${fmtWon(pred.mnt)}`}>정비</Th>
              <Th sub={`예측 ${fmtWon(pred.tax)}`}>세금</Th>
              <Th sub={`예측 ${fmtWon(pred.acc)}`}>사고</Th>
              <Th>출처</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>불러오는 중…</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.recorded_month} style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1e293b' }}>{r.recorded_month}</td>
                <NumCell value={r.actual_depreciation}  onChange={v => update(i, 'actual_depreciation',  v)} />
                <NumCell value={r.actual_insurance}     onChange={v => update(i, 'actual_insurance',     v)} />
                <NumCell value={r.actual_maintenance}   onChange={v => update(i, 'actual_maintenance',   v)} />
                <NumCell value={r.actual_tax}           onChange={v => update(i, 'actual_tax',           v)} />
                <NumCell value={r.actual_accident_cost} onChange={v => update(i, 'actual_accident_cost', v)} />
                <td style={{ padding: '6px 8px', fontSize: 10, color: '#94a3b8' }}>
                  {r.source === 'manual' ? '수동' :
                   r.source === 'auto_payment' ? '자동' :
                   r.source === 'mixed' ? '혼합' :
                   r.source === 'auto_accident' ? '사고' :
                   r.source ? r.source : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {error
            ? <span style={{ color: '#b91c1c', fontWeight: 700 }}>⚠ {error}</span>
            : '값을 비워두면 해당 셀은 저장되지 않습니다. 단위: 원.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnSecondary}>취소</button>
          <button onClick={save} disabled={saving || loading} style={btnPrimary}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── 소컴포넌트 ─────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,41,0.35)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(900px, 95vw)',
          maxHeight: '90vh',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 18,
          boxShadow: '12px 12px 40px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Th({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <th style={{
      padding: '10px 8px',
      textAlign: 'left',
      fontSize: 11,
      fontWeight: 700,
      color: '#475569',
      textTransform: 'uppercase',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div>{children}</div>
      {sub && <div style={{ fontSize: 10, fontWeight: 500, color: '#94a3b8', textTransform: 'none', marginTop: 2 }}>{sub}</div>}
    </th>
  )
}

function NumCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <td style={{ padding: '4px 4px' }}>
      <input
        type="text"
        inputMode="numeric"
        value={value ? Number(value).toLocaleString() : ''}
        onChange={e => {
          const raw = e.target.value.replace(/[^0-9.-]/g, '')
          onChange(raw)
        }}
        placeholder="0"
        style={{
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid rgba(0,0,0,0.05)',
          // Soft Ice Level 1 — inset shadow (오목)
          background: 'rgba(255,255,255,0.40)',
          boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.06)',
          fontSize: 12,
          textAlign: 'right',
          fontFamily: 'inherit',
          color: '#1e293b',
        }}
      />
    </td>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: '4px 4px 12px rgba(59,110,181,0.25)',
}

const btnSecondary: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.05)',
  background: 'rgba(255,255,255,0.72)',
  color: '#475569',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

// ─── 유틸 ─────────────────────────

function generateMonths(start: string, count: number): string[] {
  const [y, m] = start.split('-').map(Number)
  const arr: string[] = []
  let yy = y, mm = m
  for (let i = 0; i < count; i++) {
    arr.push(`${yy}-${String(mm).padStart(2, '0')}`)
    mm++
    if (mm > 12) { mm = 1; yy++ }
  }
  return arr
}

function numOrNull(s: string): number | null {
  if (!s || s.trim() === '') return null
  const n = Number(s.replace(/,/g, ''))
  return isNaN(n) ? null : n
}
