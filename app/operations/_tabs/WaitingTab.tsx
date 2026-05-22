'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// WaitingTab — PR-G (2026-05-16) 대기차량 탭
//
// 사용자 명시: 「대기차량 — 정비/세차 완료 후 가용 상태」
//
// 데이터: cars 테이블 (PR-E 차량 통합 정본) — /api/operations/waiting-vehicles
//   status: active (사용가능·대기) / rented (배차중) / accident (정비·사고)
//
// 기능:
//   - 상태별 list + 필터
//   - 정비·사고 → 사용가능 전환 / 사용가능 → 정비 전환 (cars.status PATCH)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type WaitingVehicle = {
  id: string
  number: string | null
  brand: string | null
  model: string | null
  trim: string | null
  year: number | null
  image_url: string | null
  status: string
  location: string | null
  mileage: number | null
}

type FilterKey = 'all' | 'active' | 'rented' | 'accident'

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  active:   { label: '🟢 사용가능', bg: 'rgba(34,197,94,0.12)',   fg: '#15803d' },
  rented:   { label: '🚗 배차중',   bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
  accident: { label: '🔧 정비·사고', bg: 'rgba(245,158,11,0.12)', fg: '#b45309' },
}

export default function WaitingTab() {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<WaitingVehicle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/operations/waiting-vehicles?status=all', { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.success && Array.isArray(json.data)) {
        setRows(json.data as WaitingVehicle[])
      } else {
        setRows([])
        setErr(json?.error || '차량 조회 실패')
      }
    } catch (e: any) {
      setRows([])
      setErr(e?.message || 'fetch 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (rows === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => {
    setRows(null)
    fetchAll()
  }, [fetchAll])

  // 상태 전환 — cars.status PATCH
  const changeStatus = useCallback(async (v: WaitingVehicle, next: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setBusyId(v.id)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/cars/${v.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (json?.error) throw new Error(json.error)
      refresh()
    } catch {
      // 실패해도 조용히 — refresh 로 실제 상태 재확인
      refresh()
    } finally {
      setBusyId(null)
    }
  }, [refresh])

  const allRows = rows || []
  const data = useMemo(() => ({
    all: allRows,
    active: allRows.filter((r) => r.status === 'active'),
    rented: allRows.filter((r) => r.status === 'rented'),
    accident: allRows.filter((r) => r.status === 'accident'),
  }), [allRows])

  const activeData = data[filter]
  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.number || '').toLowerCase().includes(q) ||
      (r.brand || '').toLowerCase().includes(q) ||
      (r.model || '').toLowerCase().includes(q) ||
      (r.location || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: allRows.length,
    active: data.active.length,
    rented: data.rented.length,
    accident: data.accident.length,
  }

  const statItems: StatItem[] = [
    { label: '🚙 보유 차량 전체', value: counts.all, unit: '대', tint: 'blue' },
    { label: '🟢 사용가능 (대기)', value: counts.active, unit: '대', tint: 'green' },
    { label: '🚗 배차중', value: counts.rented, unit: '대', tint: 'red' },
    { label: '🔧 정비·사고', value: counts.accident, unit: '대', tint: 'amber' },
    { label: '🔍 검색결과', value: filtered.length, unit: '대', tint: 'purple' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '🚙 전체', count: counts.all },
    { key: 'active', label: '🟢 사용가능', count: counts.active },
    { key: 'rented', label: '🚗 배차중', count: counts.rented },
    { key: 'accident', label: '🔧 정비·사고', count: counts.accident },
  ]

  const columns: TableColumn<WaitingVehicle>[] = [
    {
      key: 'number', label: '차량번호', width: 110,
      sortBy: (r) => r.number || '',
      render: (r) => <span style={{ fontWeight: 700, color: '#0f2440', whiteSpace: 'nowrap' }}>🚗 {r.number || '-'}</span>,
    },
    {
      key: 'model', label: '차종', width: 260,
      sortBy: (r) => `${r.brand || ''} ${r.model || ''}`,
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 260 }}>
        {[r.brand, r.model, r.trim].filter(Boolean).join(' ') || '-'}
      </span>,
    },
    {
      key: 'year', label: '연식', width: 70, align: 'center',
      sortBy: (r) => r.year ?? 0,
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.year ? `${r.year}` : '-'}</span>,
    },
    {
      key: 'status', label: '상태', width: 110, align: 'center',
      sortBy: (r) => r.status,
      render: (r) => {
        const meta = STATUS_META[r.status] || { label: r.status, bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: meta.bg, color: meta.fg }}>{meta.label}</span>
      },
    },
    {
      key: 'location', label: '위치', width: 160,
      sortBy: (r) => r.location || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160 }}>{r.location || '-'}</span>,
    },
    {
      key: 'mileage', label: '주행거리', width: 100, align: 'right',
      sortBy: (r) => r.mileage ?? 0,
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.mileage != null ? `${Number(r.mileage).toLocaleString('ko-KR')}km` : '-'}</span>,
    },
    {
      // 상태 전환 액션
      key: 'action', label: '상태 변경', width: 140, align: 'center',
      render: (r) => {
        const busy = busyId === r.id
        if (r.status === 'rented') {
          return <span style={{ fontSize: 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>회차 시 자동</span>
        }
        if (r.status === 'accident') {
          return (
            <button
              onClick={(e) => changeStatus(r, 'active', e)}
              disabled={busy}
              style={{
                padding: '4px 10px', borderRadius: 7, border: 'none', cursor: busy ? 'wait' : 'pointer',
                fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? '⏳' : '✅ 사용가능 처리'}
            </button>
          )
        }
        // active — 정비/세차 보내기
        return (
          <button
            onClick={(e) => changeStatus(r, 'accident', e)}
            disabled={busy}
            style={{
              padding: '4px 10px', borderRadius: 7, cursor: busy ? 'wait' : 'pointer',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              background: 'transparent', border: '1px solid rgba(245,158,11,0.4)', color: '#b45309',
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? '⏳' : '🔧 정비·세차'}
          </button>
        )
      },
    },
  ]

  const mobileCard: MobileCardConfig<WaitingVehicle> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.number || r.id.slice(0, 8)}</span>,
    subtitle: (r) => `${STATUS_META[r.status]?.label || r.status} · ${[r.brand, r.model].filter(Boolean).join(' ')}`,
  }

  return (
    <div>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="차량번호 / 브랜드 / 모델 / 위치 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ {err}
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        loading={loading}
        emptyIcon="🚙"
        emptyMessage="보유 차량이 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'status', dir: 'asc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 「정비·세차」 / 「사용가능 처리」 버튼으로 차량 상태를 전환합니다. 배차중 차량은 회차 처리 시 자동으로 사용가능 복귀됩니다.
      </div>
    </div>
  )
}
