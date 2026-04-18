'use client'

import { useState } from 'react'
import { useOL, Snapshot, fmtWon } from './OperationalLearningContext'

// ═══════════════════════════════════════════════════════════════
// SnapshotTable — 스냅샷 목록 (Soft Ice Level 4)
// 행 클릭 → 우측 ComparisonDetail 로드
// 행 내 버튼: 실적입력 / 자동집계
// ═══════════════════════════════════════════════════════════════

type Props = {
  onOpenActualInput: (snapshot: Snapshot) => void
  onAutoAggregate: (snapshot: Snapshot) => void | Promise<void>
}

export default function SnapshotTable({ onOpenActualInput, onAutoAggregate }: Props) {
  const { snapshots, loadingSnapshots, selectedSnapshotId, setSelectedSnapshotId } = useOL()
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleAuto = async (snap: Snapshot) => {
    setBusyId(snap.id)
    try {
      await onAutoAggregate(snap)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section style={{
      // Soft Ice Level 4
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(0,0,0,0.06)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '4px 4px 14px rgba(0,0,0,0.04)',
    }}>
      {/* 카드 타이틀 — 투톤 */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>스냅샷 목록</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            ({snapshots.length}건)
          </span>
        </div>
        {loadingSnapshots && (
          <span style={{ fontSize: 11, color: '#64748b' }}>불러오는 중…</span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(248,250,252,0.8)' }}>
              <Th>일자</Th>
              <Th>견적</Th>
              <Th>차종</Th>
              <Th>계약</Th>
              <Th align="right">예측월임대료</Th>
              <Th align="right">정확도</Th>
              <Th align="center">액션</Th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 && !loadingSnapshots && (
              <tr>
                <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  {'해당 조건의 스냅샷이 없습니다. 견적을 저장하면 자동으로 기록됩니다.'}
                </td>
              </tr>
            )}
            {snapshots.map(s => {
              const isSel = s.id === selectedSnapshotId
              return (
                <tr
                  key={s.id}
                  onClick={() => setSelectedSnapshotId(s.id)}
                  style={{
                    borderTop: '1px solid rgba(0,0,0,0.04)',
                    background: isSel ? 'rgba(59,110,181,0.08)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <Td>{fmtDate(s.snapshot_date)}</Td>
                  <Td>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#334155' }}>
                      {s.quote_id.slice(0, 8)}
                    </span>
                  </Td>
                  <Td>{s.vehicle_class || '-'}</Td>
                  <Td>
                    {s.contract_type === 'buyout' ? '인수' : s.contract_type === 'return' ? '반환' : '-'}
                    {s.term_months ? <span style={{ color: '#94a3b8', marginLeft: 4 }}>{s.term_months}개월</span> : null}
                  </Td>
                  <Td align="right" mono>{fmtWon(s.predicted_rent)}</Td>
                  <Td align="right">
                    <AccuracyBadge value={s.accuracy ?? null} />
                  </Td>
                  <Td align="center" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <MiniBtn
                        label="실적입력"
                        onClick={() => onOpenActualInput(s)}
                        variant="primary"
                      />
                      <MiniBtn
                        label={busyId === s.id ? '집계중…' : '자동집계'}
                        onClick={() => handleAuto(s)}
                        variant="secondary"
                        disabled={busyId === s.id}
                      />
                    </div>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── 소컴포넌트 ─────────────────────────

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th style={{
      padding: '10px 12px',
      textAlign: align,
      fontSize: 11,
      fontWeight: 700,
      color: '#475569',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

function Td({
  children, align = 'left', mono, onClick,
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
  mono?: boolean
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <td
      onClick={onClick}
      style={{
        padding: '10px 12px',
        textAlign: align,
        color: '#1e293b',
        fontFamily: mono ? 'monospace' : 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  )
}

function MiniBtn({
  label, onClick, variant = 'secondary', disabled,
}: {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 10px',
        borderRadius: 8,
        border: variant === 'primary' ? 'none' : '1px solid rgba(0,0,0,0.06)',
        background: variant === 'primary'
          ? 'linear-gradient(135deg, #3b6eb5, #5a8fd4)'
          : 'rgba(255,255,255,0.72)',
        color: variant === 'primary' ? '#fff' : '#475569',
        fontSize: 11,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

function AccuracyBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: '#94a3b8', fontSize: 11 }}>미측정</span>
  const tint = value >= 80 ? 'green' : value >= 60 ? 'amber' : 'red'
  const colors: Record<string, { bg: string; fg: string }> = {
    green: { bg: 'rgba(34,197,94,0.15)', fg: '#15803d' },
    amber: { bg: 'rgba(245,158,11,0.15)', fg: '#b45309' },
    red:   { bg: 'rgba(239,68,68,0.15)',  fg: '#b91c1c' },
  }
  const c = colors[tint]
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
      minWidth: 44,
      textAlign: 'center',
    }}>
      {value}%
    </span>
  )
}

function fmtDate(s: string | Date): string {
  try {
    const d = typeof s === 'string' ? new Date(s) : s
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return String(s).slice(0, 10)
  }
}
