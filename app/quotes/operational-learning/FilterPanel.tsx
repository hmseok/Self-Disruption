'use client'

import { useOL, OLFilter } from './OperationalLearningContext'

// ═══════════════════════════════════════════════════════════════
// FilterPanel — 좌측 필터 (Soft Ice Level 2)
// 기간 / 차종 / 계약타입
// ═══════════════════════════════════════════════════════════════

const PERIOD_OPTIONS: Array<{ value: OLFilter['period']; label: string }> = [
  { value: '30',  label: '최근 30일' },
  { value: '90',  label: '최근 90일' },
  { value: '180', label: '최근 180일' },
  { value: '365', label: '최근 1년' },
  { value: 'all', label: '전체 기간' },
]

const VEHICLE_CLASS_OPTIONS = ['경형', '소형', '준중형', '중형', '준대형', '대형', '수입']
const CONTRACT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'return', label: '반환' },
  { value: 'buyout', label: '인수' },
]

export default function FilterPanel() {
  const { filter, setFilter, triggerReload } = useOL()

  const toggle = (arr: string[], v: string): string[] =>
    arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

  return (
    <aside style={{
      // Soft Ice Level 2 — 서브 패널
      background: 'rgba(255,255,255,0.35)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(0,0,0,0.05)',
      borderRadius: 16,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      minWidth: 220,
      maxWidth: 240,
      boxShadow: '2px 2px 8px rgba(0,0,0,0.03)',
      height: 'fit-content',
      position: 'sticky',
      top: 16,
    }}>
      {/* ── 기간 ────────────────── */}
      <Group title="📅 기간">
        {PERIOD_OPTIONS.map(opt => (
          <RadioRow
            key={opt.value}
            label={opt.label}
            checked={filter.period === opt.value}
            onChange={() => { setFilter({ period: opt.value }); triggerReload() }}
          />
        ))}
      </Group>

      {/* ── 차종 ────────────────── */}
      <Group title="🚗 차종">
        <CheckRow
          label="전체"
          checked={filter.vehicleClasses.length === 0}
          onChange={() => { setFilter({ vehicleClasses: [] }); triggerReload() }}
        />
        {VEHICLE_CLASS_OPTIONS.map(vc => (
          <CheckRow
            key={vc}
            label={vc}
            checked={filter.vehicleClasses.includes(vc)}
            onChange={() => {
              setFilter({ vehicleClasses: toggle(filter.vehicleClasses, vc) })
              triggerReload()
            }}
          />
        ))}
      </Group>

      {/* ── 계약타입 ────────────── */}
      <Group title="📄 계약타입">
        <CheckRow
          label="전체"
          checked={filter.contractTypes.length === 0}
          onChange={() => { setFilter({ contractTypes: [] }); triggerReload() }}
        />
        {CONTRACT_TYPE_OPTIONS.map(ct => (
          <CheckRow
            key={ct.value}
            label={ct.label}
            checked={filter.contractTypes.includes(ct.value)}
            onChange={() => {
              setFilter({ contractTypes: toggle(filter.contractTypes, ct.value) })
              triggerReload()
            }}
          />
        ))}
      </Group>

      <button
        onClick={() => {
          setFilter({ period: '180', vehicleClasses: [], contractTypes: [] })
          triggerReload()
        }}
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: '1px solid rgba(0,0,0,0.05)',
          background: 'rgba(255,255,255,0.72)',
          color: '#475569',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        🔄 초기화
      </button>
    </aside>
  )
}

// ─── 소컴포넌트 ─────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: '1px dashed rgba(0,0,0,0.08)',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  )
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: checked ? '#1e293b' : '#64748b',
      cursor: 'pointer',
      padding: '3px 4px',
      fontWeight: checked ? 700 : 500,
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ cursor: 'pointer' }} />
      {label}
    </label>
  )
}

function RadioRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: checked ? '#1e293b' : '#64748b',
      cursor: 'pointer',
      padding: '3px 4px',
      fontWeight: checked ? 700 : 500,
    }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ cursor: 'pointer' }} />
      {label}
    </label>
  )
}
