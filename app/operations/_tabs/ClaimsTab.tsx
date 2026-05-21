'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// ClaimsTab — PR-D1 (2026-05-16) 청구관리 list
//
// 운영 라이프사이클 마지막 단계: 회차 완료 → 청구 작성 → 입금 추적
//
// 데이터: fmi_rentals (청구 데이터 본체) — /api/fmi-rentals
//   status: returned (반납·청구전) / claiming (청구중) / settled (정산완료)
//
// PR-D1 범위 — list + 화면 골격:
//   - 반납일 / 차량 / 고객 / 보험사 / 대여기간 / 청구액 / 상태
//   - 상태별 필터
// PR-D2 (다음): 청구 작성 폼 (final_claim_amount / insurance_claim_no)
// PR-D3 (이후): 입금% 동적 계산 (transactions JOIN)
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

// /api/fmi-rentals 응답 row
type ClaimRow = {
  id: string
  rental_no: string | null
  customer_name: string | null
  customer_car_number: string | null
  vehicle_car_number: string | null
  vehicle_car_type: string | null
  insurance_company: string | null
  insurance_claim_no: string | null
  dispatch_date: string | null
  expected_return_date: string | null
  actual_return_date: string | null
  rental_days: number | null
  daily_rate: number | null
  total_rental_fee: number | null
  final_claim_amount: number | null
  status: string | null
  handler_name: string | null
}

type FilterKey = 'all' | 'returned' | 'claiming' | 'settled'

// 청구관리 영역 = 회차 후 단계
const VISIBLE_STATUS = ['returned', 'claiming', 'settled']

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  returned: { label: '📥 반납·청구전', bg: 'rgba(245,158,11,0.12)', fg: '#b45309' },
  claiming: { label: '📤 청구중',      bg: 'rgba(99,102,241,0.12)', fg: '#4338ca' },
  settled:  { label: '✅ 정산완료',    bg: 'rgba(34,197,94,0.12)',  fg: '#15803d' },
}

function fmtWon(n: number | null | undefined): string {
  if (n == null) return '-'
  return `${Number(n).toLocaleString('ko-KR')}원`
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  return String(s).slice(0, 10)
}

export default function ClaimsTab() {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ClaimRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      // fmi-rentals 전체 받아 client filter (status 별 — returned/claiming/settled)
      const res = await fetch('/api/fmi-rentals?limit=1000', { headers })
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json?.data)) {
        setRows(json.data as ClaimRow[])
      } else {
        setRows([])
        if (json?.error) setErr(json.error)
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

  // 청구관리 영역 (returned/claiming/settled) 만
  const claimRows = useMemo(
    () => (rows || []).filter((r) => VISIBLE_STATUS.includes(r.status || '')),
    [rows],
  )

  const data = useMemo(() => ({
    all: claimRows,
    returned: claimRows.filter((r) => r.status === 'returned'),
    claiming: claimRows.filter((r) => r.status === 'claiming'),
    settled: claimRows.filter((r) => r.status === 'settled'),
  }), [claimRows])

  const activeData = data[filter]
  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.vehicle_car_number || '').toLowerCase().includes(q) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.insurance_company || '').toLowerCase().includes(q) ||
      (r.insurance_claim_no || '').toLowerCase().includes(q) ||
      (r.rental_no || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: claimRows.length,
    returned: data.returned.length,
    claiming: data.claiming.length,
    settled: data.settled.length,
  }
  // 청구액 합계 (정보성)
  const totalClaim = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.final_claim_amount || 0), 0),
    [filtered],
  )

  const statItems: StatItem[] = [
    { label: '💰 청구 대상 전체', value: counts.all, unit: '건', tint: 'blue' },
    { label: '📥 반납·청구전', value: counts.returned, unit: '건', tint: 'amber' },
    { label: '📤 청구중', value: counts.claiming, unit: '건', tint: 'purple' },
    { label: '✅ 정산완료', value: counts.settled, unit: '건', tint: 'green' },
    { label: '🧮 청구액 합계', value: Math.round(totalClaim / 10000), unit: '만원', tint: 'blue' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '💰 전체', count: counts.all },
    { key: 'returned', label: '📥 청구전', count: counts.returned },
    { key: 'claiming', label: '📤 청구중', count: counts.claiming },
    { key: 'settled', label: '✅ 정산완료', count: counts.settled },
  ]

  const columns: TableColumn<ClaimRow>[] = [
    {
      key: 'actual_return_date', label: '반납일', width: 110,
      sortBy: (r) => r.actual_return_date || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontSize: 12 }}>{fmtDate(r.actual_return_date)}</span>,
    },
    {
      key: 'status', label: '상태', width: 120, align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => {
        const meta = STATUS_META[r.status || ''] || { label: r.status || '-', bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: meta.bg, color: meta.fg }}>{meta.label}</span>
      },
    },
    {
      key: 'vehicle_car_number', label: '대차차량', width: 110,
      sortBy: (r) => r.vehicle_car_number || '',
      render: (r) => <span style={{ fontWeight: 700, color: '#0f2440', whiteSpace: 'nowrap' }}>🚗 {r.vehicle_car_number || '-'}</span>,
    },
    {
      key: 'customer_name', label: '고객', width: 130,
      sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 130 }}>{r.customer_name || '-'}</span>,
    },
    {
      key: 'insurance_company', label: '보험사', width: 120,
      sortBy: (r) => r.insurance_company || '',
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.insurance_company || '-'}</span>,
    },
    {
      key: 'insurance_claim_no', label: '보험접수번호', width: 140,
      sortBy: (r) => r.insurance_claim_no || '',
      render: (r) => r.insurance_claim_no
        ? <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}>{r.insurance_claim_no}</span>
        : <span style={{ fontSize: 11, color: '#cbd5e1' }}>미입력</span>,
    },
    {
      key: 'period', label: '대여기간', width: 90, align: 'center',
      sortBy: (r) => r.rental_days ?? 0,
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.rental_days != null ? `${r.rental_days}일` : '-'}</span>,
    },
    {
      key: 'final_claim_amount', label: '청구액', width: 130, align: 'right',
      sortBy: (r) => Number(r.final_claim_amount || 0),
      render: (r) => r.final_claim_amount != null
        ? <span style={{ fontWeight: 800, color: '#0f2440', whiteSpace: 'nowrap' }}>{fmtWon(r.final_claim_amount)}</span>
        : <span style={{ fontSize: 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>미작성</span>,
    },
    {
      key: 'handler_name', label: '담당자', width: 90,
      sortBy: (r) => r.handler_name || '',
      render: (r) => <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.handler_name || '-'}</span>,
    },
  ]

  const mobileCard: MobileCardConfig<ClaimRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.vehicle_car_number || r.customer_name || r.rental_no}</span>,
    subtitle: (r) => `${(STATUS_META[r.status || '']?.label) || r.status || ''} · ${fmtWon(r.final_claim_amount)}`,
  }

  return (
    <div>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="대차차량 / 고객 / 보험사 / 보험접수번호 / 대차번호 검색…"
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
        emptyIcon="💰"
        emptyMessage="청구 대상 (회차 완료) 건이 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'actual_return_date', dir: 'desc' }}
      />
      {/* PR-D1 안내 */}
      <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(99,102,241,0.05)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 10, fontSize: 12, color: '#475569' }}>
        ℹ️ PR-D1: 청구 대상 list (회차 완료 건). 다음 단계 — PR-D2 청구 작성 폼 (청구액·보험접수번호) / PR-D3 입금% 동적 계산.
      </div>
    </div>
  )
}
