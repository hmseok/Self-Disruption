'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'
import type { DispatchOrder } from '@/app/operations/intake/types'

// ═══════════════════════════════════════════════════════════════════
// DispatchIntakeTab — P2.1c
//
// 우리 시스템에서 「대차로 진행」 한 사고 list (operations_dispatch_orders).
// 사고접수 탭에서 「대차로 진행」 누른 사고 자동 노출.
//
// status 별 filter chip:
//   · 전체 (활성 — cancelled/done 제외)
//   · 📞 상담중 (consulting)
//   · 📅 배차예정 (scheduled)
//   · 🚐 배차완료 (dispatched)
//
// 행 클릭 → /operations/dispatch/[idno]/[mddt]/[srno] (cafe24 키 있을 때만)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type FilterKey = 'active' | 'consulting' | 'scheduled' | 'dispatched' | 'done'

const FILTER_LABEL: Record<FilterKey, { label: string; icon: string }> = {
  active:     { label: '전체 (활성)', icon: '📋' },
  consulting: { label: '상담중',      icon: '📞' },
  scheduled:  { label: '배차예정',    icon: '📅' },
  dispatched: { label: '배차완료',    icon: '🚐' },
  done:       { label: '종결',        icon: '✅' },
}

const STATUS_BADGE: Record<DispatchOrder['status'], { label: string; bg: string; color: string }> = {
  new:        { label: '🆕 신규',        bg: 'rgba(148,163,184,0.15)', color: '#475569' },
  consulting: { label: '📞 상담중',      bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  scheduled:  { label: '📅 배차예정',    bg: 'rgba(245,158,11,0.12)',  color: '#b45309' },
  dispatched: { label: '🚐 배차완료',    bg: 'rgba(34,197,94,0.12)',   color: '#15803d' },
  done:       { label: '✅ 종결',        bg: 'rgba(99,102,241,0.12)',  color: '#4338ca' },
  cancelled:  { label: '✗ 취소',         bg: 'rgba(239,68,68,0.12)',   color: '#991b1b' },
}

export default function DispatchIntakeTab() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('active')
  const [orders, setOrders] = useState<DispatchOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // ── Fetch all dispatch_orders ──
  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/operations/dispatch-orders?limit=500', { headers })
      const json = await res.json().catch(() => ({}))
      if (json?.error) {
        setError(json.error)
        setOrders([])
      } else {
        setOrders(Array.isArray(json?.data) ? json.data : [])
      }
    } catch (e: any) {
      setError(e?.message || 'fetch 실패')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // ── filter + search ──
  const filtered = useMemo(() => {
    let list = orders
    if (filter === 'active') {
      list = list.filter((o) => o.status !== 'cancelled' && o.status !== 'done')
    } else {
      list = list.filter((o) => o.status === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((o) =>
        String(o.ride_accident_id || '').includes(q) ||
        (o.consultation_note || '').toLowerCase().includes(q) ||
        (o.acc_driver_name || '').toLowerCase().includes(q) ||
        (o.acc_insurance_company || '').toLowerCase().includes(q) ||
        (o.cafe24_otpt_idno || '').toLowerCase().includes(q),
      )
    }
    return list
  }, [orders, filter, search])

  // ── Counts ──
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      active: 0, consulting: 0, scheduled: 0, dispatched: 0, done: 0,
    }
    orders.forEach((o) => {
      if (o.status !== 'cancelled' && o.status !== 'done') c.active += 1
      if (o.status === 'consulting') c.consulting += 1
      if (o.status === 'scheduled') c.scheduled += 1
      if (o.status === 'dispatched') c.dispatched += 1
      if (o.status === 'done') c.done += 1
    })
    return c
  }, [orders])

  const statItems: StatItem[] = [
    { label: '📋 전체 활성', value: counts.active, unit: '건', tint: 'blue' },
    { label: '📞 상담중', value: counts.consulting, unit: '건', tint: 'amber' },
    { label: '📅 배차예정', value: counts.scheduled, unit: '건', tint: 'red' },
    { label: '🚐 배차완료', value: counts.dispatched, unit: '건', tint: 'green' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'purple' },
  ]

  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: fetchOrders, variant: 'secondary', icon: '🔄' },
  ]

  const filterItems: FilterItem[] = (Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => ({
    key: k,
    label: `${FILTER_LABEL[k].icon} ${FILTER_LABEL[k].label}`,
    count: counts[k] ?? 0,
  }))

  // ── 컬럼 ──
  const columns: TableColumn<DispatchOrder>[] = [
    {
      key: 'created_at',
      label: '등록일시',
      width: 140,
      sortBy: (r) => r.created_at,
      render: (r) => (
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
          {new Date(r.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
    {
      key: 'ride_accident_id',
      label: '사고 ID',
      width: 120,
      sortBy: (r) => r.cafe24_otpt_idno || String(r.ride_accident_id),
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#0f2440', whiteSpace: 'nowrap' }}>
          {r.cafe24_otpt_idno || r.ride_accident_id}
          {r.cafe24_otpt_srno && <span style={{ color: '#94a3b8', marginLeft: 4 }}>/{r.cafe24_otpt_srno}</span>}
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      width: 120,
      align: 'center',
      sortBy: (r) => r.status,
      render: (r) => {
        const meta = STATUS_BADGE[r.status]
        return (
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
            background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
          }}>{meta.label}</span>
        )
      },
    },
    {
      key: 'expected_dispatch_date',
      label: '예상 배차일',
      width: 120,
      sortBy: (r) => r.expected_dispatch_date || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
          {r.expected_dispatch_date || '-'}
        </span>
      ),
    },
    {
      key: 'expected_return_date',
      label: '예상 반납일',
      width: 120,
      sortBy: (r) => r.expected_return_date || '',
      render: (r) => (
        <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
          {r.expected_return_date || '-'}
        </span>
      ),
    },
    {
      key: 'consultation_note',
      label: '상담 요약',
      width: 280,
      sortBy: (r) => r.consultation_note || '',
      render: (r) => (
        <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 280 }}>
          {r.consultation_note || (r.acc_driver_name ? `사고: ${r.acc_driver_name}` : '-')}
        </span>
      ),
    },
    {
      key: 'fmi_rental_id',
      label: '배차',
      width: 80,
      align: 'center',
      sortBy: (r) => r.fmi_rental_id ? '1' : '0',
      render: (r) => (
        <span style={{ fontSize: 11, fontWeight: 700, color: r.fmi_rental_id ? '#15803d' : '#94a3b8' }}>
          {r.fmi_rental_id ? '✅ 확정' : '⏳ 대기'}
        </span>
      ),
    },
    {
      key: 'updated_at',
      label: '최종수정',
      width: 130,
      sortBy: (r) => r.updated_at,
      render: (r) => (
        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
          {new Date(r.updated_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<DispatchOrder> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.cafe24_otpt_idno || r.ride_accident_id}</span>,
    subtitle: (r) => `${STATUS_BADGE[r.status].label} · ${new Date(r.created_at).toLocaleDateString('ko-KR')}`,
  }

  const handleRowClick = (r: DispatchOrder) => {
    if (r.cafe24_otpt_idno && r.cafe24_otpt_mddt && r.cafe24_otpt_srno) {
      router.push(`/operations/dispatch/${r.cafe24_otpt_idno}/${r.cafe24_otpt_mddt}/${r.cafe24_otpt_srno}`)
    } else {
      // cafe24 키 없는 (legacy) row — 상세 link 불가
      alert('카페24 키 미저장 row — 상세 페이지 link 불가\n\n사고접수 탭에서 같은 사고를 찾아 「대차로 진행」 다시 누르면 키 자동 저장됩니다.')
    }
  }

  return (
    <div>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="사고 ID / 상담 요약 / 운전자 / 보험사 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
      />
      {error && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ {error}
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={handleRowClick}
        loading={loading}
        emptyIcon="🚗"
        emptyMessage="우리 시스템에서 「대차로 진행」 한 사고가 없습니다. 사고접수 탭에서 시작하세요."
        mobileCard={mobileCard}
        defaultSort={{ key: 'created_at', dir: 'desc' }}
      />
    </div>
  )
}
