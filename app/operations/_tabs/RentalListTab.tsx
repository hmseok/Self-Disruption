'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// RentalListTab — 대차리스트 (배차 1건 = 1행, 상담~회차~청구 통합 원장)
//
// PR-N1 (2026-05-22) — fmi_rentals 리스트 탭 신설
// PR-N5 (2026-05-22) — 배차스케줄 탭 폐기·흡수
//   사용자 명시: 「리스트가 많으니 상담도 대차로 넘기고, 거기서 배차예약·배차
//                진행하고, 상담 후 취소되면 취소 처리」
//   → 상담중 dispatch_order(아직 fmi_rental 없는 건) + fmi_rentals 를 한 리스트로.
//     상담중 행 클릭 → 배차 상세(상담·배차·회차). 상담중 행에 「취소」 액션.
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

// 통합 행 — fmi_rental(확정 후) + dispatch_order 상담중(확정 전)
type Row = {
  kind: 'rental' | 'order'
  id: string                       // 행 고유 키 (order 는 'order:' prefix)
  customer_name: string | null
  customer_phone: string | null
  customer_car_number: string | null
  customer_car_type: string | null
  vehicle_car_number: string | null
  vehicle_car_type: string | null
  insurance_company: string | null
  insurance_claim_no: string | null
  adjuster_name: string | null
  dispatch_date: string | null
  expected_return_date: string | null
  actual_return_date: string | null
  final_claim_amount: number | null
  status: string
  notes: string | null
  fleet_group: string | null
  // order(상담중) 전용
  order_id?: string
  cafe24_idno?: string | null
  cafe24_mddt?: string | null
  cafe24_srno?: string | number | null
}

type FilterKey = 'all' | 'consulting' | 'active' | 'returned' | 'settled'

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  new:        { label: '상담중',   bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  consulting: { label: '상담중',   bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  pending:    { label: '배차예정', bg: 'rgba(99,102,241,0.12)',  fg: '#4338ca' },
  dispatched: { label: '배차완료', bg: 'rgba(59,130,246,0.12)',  fg: '#1d4ed8' },
  returned:   { label: '회차완료', bg: 'rgba(100,116,139,0.16)', fg: '#475569' },
  claiming:   { label: '청구중',   bg: 'rgba(124,58,237,0.12)',  fg: '#6d28d9' },
  settled:    { label: '정산완료', bg: 'rgba(34,197,94,0.12)',   fg: '#15803d' },
  cancelled:  { label: '취소',     bg: 'rgba(239,68,68,0.12)',   fg: '#991b1b' },
}

function fmtDt(d: string | null | undefined): string {
  if (!d) return '-'
  const s = String(d)
  if (s.includes('T')) return s.slice(0, 16).replace('T', ' ')
  if (s.length >= 16) return s.slice(0, 16)
  return s
}
function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return '-'
  return n.toLocaleString('ko-KR')
}

export default function RentalListTab() {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [fleet, setFleet] = useState<string>('all')

  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 결과 토스트 — PR-M 패턴: 화면 고정
  const [resultMsg, setResultMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showResult = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setResultMsg(m)
    setTimeout(() => setResultMsg(null), 5000)
  }, [])

  // 반납 처리 모달
  const [returnModal, setReturnModal] = useState<Row | null>(null)
  const [returnMileage, setReturnMileage] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnSaving, setReturnSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      // 확정 후(fmi_rentals) + 상담중(dispatch_orders, fmi_rental 미생성) 동시 조회
      const [rRes, oRes] = await Promise.all([
        fetch('/api/fmi-rentals?include_stats=1&limit=2000', { headers }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/operations/dispatch-orders?limit=500', { headers }).then((r) => r.json()).catch(() => ({})),
      ])
      if (rRes?.error) throw new Error(rRes.error)
      const rentals: Row[] = (Array.isArray(rRes?.data) ? rRes.data : []).map((r: any) => ({
        kind: 'rental' as const,
        id: String(r.id),
        customer_name: r.customer_name ?? null,
        customer_phone: r.customer_phone ?? null,
        customer_car_number: r.customer_car_number ?? null,
        customer_car_type: r.customer_car_type ?? null,
        vehicle_car_number: r.vehicle_car_number ?? null,
        vehicle_car_type: r.vehicle_car_type ?? null,
        insurance_company: r.insurance_company ?? null,
        insurance_claim_no: r.insurance_claim_no ?? null,
        adjuster_name: r.adjuster_name ?? null,
        dispatch_date: r.dispatch_date ?? null,
        expected_return_date: r.expected_return_date ?? null,
        actual_return_date: r.actual_return_date ?? null,
        final_claim_amount: r.final_claim_amount ?? null,
        status: r.status || 'pending',
        notes: r.notes ?? null,
        fleet_group: r.fleet_group ?? null,
      }))
      // 상담중 = fmi_rental 아직 없고 done/cancelled 아닌 dispatch_order
      const orders: Row[] = (Array.isArray(oRes?.data) ? oRes.data : [])
        .filter((o: any) => !o.fmi_rental_id && !['done', 'cancelled'].includes(o.status))
        .map((o: any) => ({
          kind: 'order' as const,
          id: 'order:' + String(o.id),
          customer_name: o.acc_driver_name ?? null,
          customer_phone: o.acc_driver_phone ?? null,
          customer_car_number: null,
          customer_car_type: null,
          vehicle_car_number: null,
          vehicle_car_type: null,
          insurance_company: o.acc_insurance_company ?? null,
          insurance_claim_no: o.acc_claim_no ?? null,
          adjuster_name: null,
          dispatch_date: o.expected_dispatch_date ?? null,
          expected_return_date: o.expected_return_date ?? null,
          actual_return_date: null,
          final_claim_amount: null,
          status: o.status || 'consulting',
          notes: o.consultation_note ?? null,
          fleet_group: null,
          order_id: String(o.id),
          cafe24_idno: o.cafe24_otpt_idno ?? null,
          cafe24_mddt: o.cafe24_otpt_mddt ?? null,
          cafe24_srno: o.cafe24_otpt_srno ?? null,
        }))
      setRows([...orders, ...rentals])
    } catch (e: any) {
      setErr(e?.message || 'fetch 실패')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (rows === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => { setRows(null); fetchAll() }, [fetchAll])

  const isOverdue = useCallback((r: Row) => {
    if (r.actual_return_date) return false
    if (!r.expected_return_date) return false
    return new Date(r.expected_return_date) < new Date() && ['dispatched', 'claiming'].includes(r.status)
  }, [])

  // 플릿 옵션 — 데이터에서 동적 추출
  const fleetOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows || []) if (r.fleet_group) set.add(r.fleet_group)
    return Array.from(set).sort()
  }, [rows])

  // 플릿 필터 1차 적용
  const fleetScoped = useMemo(() => {
    if (!rows) return []
    if (fleet === 'all') return rows
    return rows.filter((r) => (r.fleet_group || '') === fleet)
  }, [rows, fleet])

  // 상태별 분류
  const data = useMemo(() => ({
    all: fleetScoped,
    consulting: fleetScoped.filter((r) => r.status === 'consulting' || r.status === 'new'),
    active: fleetScoped.filter((r) => ['pending', 'dispatched', 'claiming'].includes(r.status)),
    returned: fleetScoped.filter((r) => r.status === 'returned'),
    settled: fleetScoped.filter((r) => r.status === 'settled'),
  }), [fleetScoped])

  const activeData = data[filter]
  const filtered = useMemo(() => {
    if (!search.trim()) return activeData
    const q = search.toLowerCase()
    return activeData.filter((r) =>
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.customer_phone || '').toLowerCase().includes(q) ||
      (r.customer_car_number || '').toLowerCase().includes(q) ||
      (r.vehicle_car_number || '').toLowerCase().includes(q) ||
      (r.insurance_company || '').toLowerCase().includes(q) ||
      (r.insurance_claim_no || '').toLowerCase().includes(q) ||
      (r.adjuster_name || '').toLowerCase().includes(q) ||
      (r.fleet_group || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = useMemo(() => ({
    all: fleetScoped.length,
    consulting: data.consulting.length,
    active: data.active.length,
    returned: data.returned.length,
    settled: data.settled.length,
    overdue: fleetScoped.filter(isOverdue).length,
  }), [fleetScoped, data, isOverdue])

  const statItems: StatItem[] = [
    { label: '📋 전체', value: counts.all, unit: '건', tint: 'blue' },
    { label: '📞 상담중', value: counts.consulting, unit: '건', tint: 'amber' },
    { label: '🚐 진행 중', value: counts.active, unit: '건', tint: 'green' },
    { label: '✅ 정산완료', value: counts.settled, unit: '건', tint: 'purple' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'blue' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '📋 전체', count: counts.all },
    { key: 'consulting', label: '📞 상담중', count: counts.consulting },
    { key: 'active', label: '🚐 진행중', count: counts.active },
    { key: 'returned', label: '🏁 회차완료', count: counts.returned },
    { key: 'settled', label: '✅ 정산완료', count: counts.settled },
  ]

  // 반납 처리 (확정 건)
  const openReturn = useCallback((r: Row) => {
    setReturnModal(r); setReturnMileage(''); setReturnNotes('')
  }, [])
  const confirmReturn = useCallback(async () => {
    if (!returnModal) return
    setReturnSaving(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/fmi-rentals/${returnModal.id}/return`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          return_mileage: returnMileage ? Number(returnMileage) : null,
          notes: returnNotes || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j?.error) throw new Error(j?.error || '반납 처리 실패')
      setReturnModal(null)
      showResult({ type: 'ok', text: '반납 처리 완료' })
      refresh()
    } catch (e: any) {
      showResult({ type: 'err', text: e?.message || '반납 처리 오류' })
    } finally {
      setReturnSaving(false)
    }
  }, [returnModal, returnMileage, returnNotes, refresh, showResult])

  // 삭제 (확정 건)
  const handleDelete = useCallback(async (r: Row) => {
    if (!confirm(`${r.customer_name || '고객'}님 배차를 삭제할까요?\n(${r.vehicle_car_number || '차량 미지정'})`)) return
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/fmi-rentals/${r.id}`, { method: 'DELETE', headers })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j?.error) throw new Error(j?.error || '삭제 실패')
      showResult({ type: 'ok', text: '배차 삭제 완료' })
      refresh()
    } catch (e: any) {
      showResult({ type: 'err', text: e?.message || '삭제 오류' })
    }
  }, [refresh, showResult])

  // 취소 처리 (상담중 dispatch_order) — PR-N5
  const cancelOrder = useCallback(async (r: Row) => {
    if (!r.order_id) return
    if (!confirm(`${r.customer_name || '고객'}님 상담 건을 취소 처리할까요?`)) return
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/operations/dispatch-orders/${r.order_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'cancelled' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j?.error) throw new Error(j?.error || '취소 실패')
      showResult({ type: 'ok', text: '상담 건 취소 처리 완료' })
      refresh()
    } catch (e: any) {
      showResult({ type: 'err', text: e?.message || '취소 오류' })
    }
  }, [refresh, showResult])

  // 행 클릭 — 상담중(order) 건은 배차 상세로 진입
  const onRowClick = useCallback((r: Row) => {
    if (r.kind === 'order' && r.cafe24_idno && r.cafe24_mddt && r.cafe24_srno != null) {
      router.push(`/operations/dispatch/${r.cafe24_idno}/${r.cafe24_mddt}/${r.cafe24_srno}?mode=schedule`)
    }
  }, [router])

  const columns: TableColumn<Row>[] = [
    {
      key: 'dispatch', label: '출고일시', width: 132,
      sortBy: (r) => r.dispatch_date || '',
      render: (r) => r.dispatch_date
        ? <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontSize: 12 }}>
            {r.kind === 'order' ? '예상 ' : ''}{fmtDt(r.dispatch_date)}
          </span>
        : <span style={{ fontSize: 11, color: '#cbd5e1' }}>미정</span>,
    },
    {
      key: 'return', label: '반납', width: 132,
      sortBy: (r) => r.actual_return_date || r.expected_return_date || '9999',
      render: (r) => {
        const overdue = isOverdue(r)
        if (r.actual_return_date) return <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#15803d', fontWeight: 600 }}>{fmtDt(r.actual_return_date)}</span>
        if (r.expected_return_date) return <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: overdue ? '#dc2626' : '#64748b', fontWeight: overdue ? 800 : 600 }}>{overdue ? '⚠ ' : '예정 '}{fmtDt(r.expected_return_date)}</span>
        return <span style={{ fontSize: 11, color: '#cbd5e1' }}>미정</span>
      },
    },
    {
      key: 'fleet', label: '플릿', width: 88,
      sortBy: (r) => r.fleet_group || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: '#4338ca' }}>{r.fleet_group || '-'}</span>,
    },
    {
      key: 'vehicle', label: '대차차량', width: 180,
      sortBy: (r) => r.vehicle_car_number || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 180, fontSize: 12 }}>
        <span style={{ fontWeight: 800, color: '#0f2440' }}>🚗 {r.vehicle_car_number || '미지정'}</span>
        {r.vehicle_car_type ? <span style={{ color: '#94a3b8' }}> · {r.vehicle_car_type}</span> : null}
      </span>,
    },
    {
      key: 'customer_car', label: '사고차량', width: 150,
      sortBy: (r) => r.customer_car_number || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 150, fontSize: 12, color: '#475569' }}>
        {r.customer_car_number || '-'}{r.customer_car_type ? ` · ${r.customer_car_type}` : ''}
      </span>,
    },
    {
      key: 'customer', label: '고객', width: 150,
      sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 150, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.customer_name || '-'}</span>
        {r.customer_phone ? <span style={{ color: '#94a3b8' }}> · {r.customer_phone}</span> : null}
      </span>,
    },
    {
      key: 'insurance', label: '보험사 / 접수번호', width: 168,
      sortBy: (r) => r.insurance_company || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 168, fontSize: 12, color: '#475569' }}>
        {r.insurance_company || '-'}{r.insurance_claim_no ? ` · #${r.insurance_claim_no}` : ''}
      </span>,
    },
    {
      key: 'claim', label: '청구금액', width: 104, align: 'right',
      sortBy: (r) => Number(r.final_claim_amount || 0),
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: r.final_claim_amount ? '#0f2440' : '#cbd5e1' }}>{fmtMoney(r.final_claim_amount)}</span>,
    },
    {
      key: 'status', label: '상태', width: 92, align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => {
        const m = STATUS_META[r.status] || { label: r.status, bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: m.bg, color: m.fg }}>{m.label}</span>
      },
    },
    {
      key: 'actions', label: '액션', width: 132, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
          {r.kind === 'order' ? (
            <button
              onClick={(e) => { e.stopPropagation(); cancelOrder(r) }}
              style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            >✕ 취소</button>
          ) : (
            <>
              {!r.actual_return_date && ['dispatched', 'claiming', 'pending'].includes(r.status) && (
                <button
                  onClick={(e) => { e.stopPropagation(); openReturn(r) }}
                  style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#b45309', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                >🏁 반납</button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(r) }}
                style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
              >삭제</button>
            </>
          )}
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<Row> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.vehicle_car_number || r.customer_name || r.id.slice(0, 12)}</span>,
    subtitle: (r) => `${(STATUS_META[r.status]?.label) || r.status} · ${r.customer_name || ''}`,
    trailing: (r) => <span style={{ fontWeight: 700, fontSize: 12 }}>{fmtMoney(r.final_claim_amount)}</span>,
  }

  return (
    <div>
      {/* 결과 토스트 — 화면 고정 (PR-M 패턴, 규칙 20) */}
      {resultMsg && (
        <div
          role="status"
          style={{
            position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
            maxWidth: 'min(560px, 92vw)', padding: '13px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            background: resultMsg.type === 'ok' ? 'rgba(236,253,245,0.97)' : 'rgba(254,242,242,0.97)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${resultMsg.type === 'ok' ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)'}`,
            borderRadius: 12, boxShadow: '0 14px 36px rgba(15,23,42,0.18)',
            fontSize: 13, fontWeight: 700, color: resultMsg.type === 'ok' ? '#065f46' : '#991b1b',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>{resultMsg.type === 'ok' ? '✅' : '⚠️'}</span>
          <span style={{ flex: 1, lineHeight: 1.45 }}>{resultMsg.text}</span>
          <button onClick={() => setResultMsg(null)} aria-label="닫기"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 2, flexShrink: 0, color: resultMsg.type === 'ok' ? '#047857' : '#b91c1c' }}>×</button>
        </div>
      )}

      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="고객 / 차량번호 / 보험사 / 접수번호 / 담당자 / 플릿 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
        trailing={
          <select
            value={fleet}
            onChange={(e) => setFleet(e.target.value)}
            style={{ ...GLASS.L1, padding: '7px 10px', borderRadius: 8, fontSize: 12, color: '#1e293b', fontWeight: 700 }}
          >
            <option value="all">🚙 플릿 전체</option>
            {fleetOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        }
      />
      {err && (
        <div style={{ ...GLASS.L3, marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: '#991b1b' }}>
          ⚠ 대차 목록 조회 실패: {err}
        </div>
      )}
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        loading={loading}
        emptyIcon="🚗"
        emptyMessage="대차·상담 내역이 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'dispatch', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 한 줄 = 배차 1건 — 상담중부터 회차·정산까지 한 곳에서. 상담중 행을 클릭하면 배차 상세(상담·배차·회차)로 이동합니다.
      </div>

      {/* 반납 처리 모달 */}
      {returnModal && (
        <div
          onClick={() => !returnSaving && setReturnModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(460px, 96vw)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>🏁 반납 처리</h3>
              <div style={{ flex: 1 }} />
              <button onClick={() => !returnSaving && setReturnModal(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ ...GLASS.L1, padding: 10, borderRadius: 8, fontSize: 12, color: '#475569' }}>
                {returnModal.customer_name || '고객'} · 🚗 {returnModal.vehicle_car_number || '-'}
                <span style={{ color: '#94a3b8' }}> · 출고 {fmtDt(returnModal.dispatch_date)}</span>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>반납 주행거리 (km)</label>
                <input type="number" value={returnMileage} onChange={(e) => setReturnMileage(e.target.value)} placeholder="예: 45800"
                  style={{ ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>반납 메모</label>
                <textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={3} placeholder="반납 상태, 파손 여부 등"
                  style={{ ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <button onClick={() => !returnSaving && setReturnModal(null)}
                style={{ padding: '9px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>닫기</button>
              <div style={{ flex: 1 }} />
              <button onClick={confirmReturn} disabled={returnSaving}
                style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', border: 'none', borderRadius: 8, cursor: returnSaving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, opacity: returnSaving ? 0.5 : 1 }}>
                🏁 {returnSaving ? '처리 중…' : '반납 확정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
