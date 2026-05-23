'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// RentalListTab — 대차리스트 (진행 중 배차 = 상담중·배차예정·배차완료)
//
// PR-N1 (2026-05-22) — fmi_rentals 리스트 탭 신설
// PR-N5 (2026-05-22) — 배차스케줄 탭 폐기·흡수 (상담중 dispatch_order 통합)
// PR-O1 (2026-05-22) — 라이프사이클 분담
//   사용자 명시: 「배차완료·반납된 차량은 청구관리로. 대차에서 정산까지 갈 필요 없다」
//   → 대차리스트 = 상담중 / 배차예정 / 배차완료 (지금 나가 있는/나갈 차)
//     반납(회차완료)되는 순간 청구관리 탭으로 인계 — 여기선 안 보임.
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

// 통합 행 — fmi_rental(배차예정/배차완료) + dispatch_order 상담중
type Row = {
  kind: 'rental' | 'order'
  id: string
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
  status: string
  notes: string | null
  fleet_group: string | null
  // order(상담중) 전용
  order_id?: string
  cafe24_idno?: string | null
  cafe24_mddt?: string | null
  cafe24_srno?: string | number | null
}

type FilterKey = 'all' | 'consulting' | 'pending' | 'dispatched'

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  new:        { label: '상담중',   bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  consulting: { label: '상담중',   bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
  pending:    { label: '배차예정', bg: 'rgba(99,102,241,0.12)',  fg: '#4338ca' },
  dispatched: { label: '배차완료', bg: 'rgba(59,130,246,0.12)',  fg: '#1d4ed8' },
}

function fmtDt(d: string | null | undefined): string {
  if (!d) return '-'
  const s = String(d)
  if (s.includes('T')) return s.slice(0, 16).replace('T', ' ')
  if (s.length >= 16) return s.slice(0, 16)
  return s
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

  // 삭제/취소 인앱 확인 모달 (PR-Q — native confirm 제거, 규칙 20)
  const [confirmTarget, setConfirmTarget] = useState<{ action: 'delete' | 'cancel'; row: Row } | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      const [rRes, oRes] = await Promise.all([
        fetch('/api/fmi-rentals?include_stats=1&limit=2000', { headers }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/operations/dispatch-orders?limit=500', { headers }).then((r) => r.json()).catch(() => ({})),
      ])
      if (rRes?.error) throw new Error(rRes.error)
      // PR-O1 — 대차리스트는 배차예정/배차완료만. 회차완료~정산은 청구관리 탭.
      const rentals: Row[] = (Array.isArray(rRes?.data) ? rRes.data : [])
        .filter((r: any) => ['pending', 'dispatched'].includes(r.status))
        .map((r: any) => ({
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
    return new Date(r.expected_return_date) < new Date() && r.status === 'dispatched'
  }, [])

  // 플릿 옵션 — 데이터에서 동적 추출
  const fleetOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows || []) if (r.fleet_group) set.add(r.fleet_group)
    return Array.from(set).sort()
  }, [rows])

  const fleetScoped = useMemo(() => {
    if (!rows) return []
    if (fleet === 'all') return rows
    return rows.filter((r) => (r.fleet_group || '') === fleet)
  }, [rows, fleet])

  const data = useMemo(() => ({
    all: fleetScoped,
    consulting: fleetScoped.filter((r) => r.status === 'consulting' || r.status === 'new'),
    pending: fleetScoped.filter((r) => r.status === 'pending'),
    dispatched: fleetScoped.filter((r) => r.status === 'dispatched'),
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
    pending: data.pending.length,
    dispatched: data.dispatched.length,
  }), [fleetScoped, data])

  const statItems: StatItem[] = [
    { label: '📋 전체', value: counts.all, unit: '건', tint: 'blue' },
    { label: '📞 상담중', value: counts.consulting, unit: '건', tint: 'amber' },
    { label: '📅 배차예정', value: counts.pending, unit: '건', tint: 'purple' },
    { label: '🚐 배차완료', value: counts.dispatched, unit: '건', tint: 'green' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'blue' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '📋 전체', count: counts.all },
    { key: 'consulting', label: '📞 상담중', count: counts.consulting },
    { key: 'pending', label: '📅 배차예정', count: counts.pending },
    { key: 'dispatched', label: '🚐 배차완료', count: counts.dispatched },
  ]

  // 반납 처리 (배차완료 건) — 반납하면 청구관리로 넘어감
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
      showResult({ type: 'ok', text: '반납 처리 완료 — 청구관리 탭으로 넘어갑니다' })
      refresh()
    } catch (e: any) {
      showResult({ type: 'err', text: e?.message || '반납 처리 오류' })
    } finally {
      setReturnSaving(false)
    }
  }, [returnModal, returnMileage, returnNotes, refresh, showResult])

  // 삭제/취소 실행 — 확인 모달에서 호출 (PR-Q)
  const runConfirmed = useCallback(async () => {
    if (!confirmTarget) return
    const { action, row } = confirmTarget
    setConfirmBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      if (action === 'delete') {
        const res = await fetch(`/api/fmi-rentals/${row.id}`, { method: 'DELETE', headers })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || j?.error) throw new Error(j?.error || '삭제 실패')
        showResult({ type: 'ok', text: '배차 삭제 완료' })
      } else {
        if (!row.order_id) throw new Error('상담 건 정보가 없습니다')
        const res = await fetch(`/api/operations/dispatch-orders/${row.order_id}`, {
          method: 'PATCH', headers, body: JSON.stringify({ status: 'cancelled' }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || j?.error) throw new Error(j?.error || '취소 실패')
        showResult({ type: 'ok', text: '상담 건 취소 처리 완료' })
      }
      setConfirmTarget(null)
      refresh()
    } catch (e: any) {
      showResult({ type: 'err', text: e?.message || '처리 오류' })
    } finally {
      setConfirmBusy(false)
    }
  }, [confirmTarget, refresh, showResult])

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
      key: 'return', label: '반납예정', width: 128,
      sortBy: (r) => r.expected_return_date || '9999',
      render: (r) => {
        const overdue = isOverdue(r)
        if (r.expected_return_date) return <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: overdue ? '#dc2626' : '#64748b', fontWeight: overdue ? 800 : 600 }}>{overdue ? '⚠ ' : ''}{fmtDt(r.expected_return_date)}</span>
        return <span style={{ fontSize: 11, color: '#cbd5e1' }}>미정</span>
      },
    },
    {
      key: 'fleet', label: '플릿', width: 88,
      sortBy: (r) => r.fleet_group || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, color: '#4338ca' }}>{r.fleet_group || '-'}</span>,
    },
    {
      key: 'vehicle', label: '대차차량', width: 184,
      sortBy: (r) => r.vehicle_car_number || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 184, fontSize: 12 }}>
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
      key: 'customer', label: '고객', width: 152,
      sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 152, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.customer_name || '-'}</span>
        {r.customer_phone ? <span style={{ color: '#94a3b8' }}> · {r.customer_phone}</span> : null}
      </span>,
    },
    {
      key: 'insurance', label: '보험사 / 접수번호', width: 180,
      sortBy: (r) => r.insurance_company || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 180, fontSize: 12, color: '#475569' }}>
        {r.insurance_company || '-'}{r.insurance_claim_no ? ` · #${r.insurance_claim_no}` : ''}
      </span>,
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
              onClick={(e) => { e.stopPropagation(); setConfirmTarget({ action: 'cancel', row: r }) }}
              style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            >✕ 취소</button>
          ) : (
            <>
              {r.status === 'dispatched' && !r.actual_return_date && (
                <button
                  onClick={(e) => { e.stopPropagation(); openReturn(r) }}
                  style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#b45309', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                >🏁 반납</button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmTarget({ action: 'delete', row: r }) }}
                style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#991b1b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
              >🗑 삭제</button>
            </>
          )}
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<Row> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.vehicle_car_number || r.customer_name || r.id.slice(0, 12)}</span>,
    subtitle: (r) => `${(STATUS_META[r.status]?.label) || r.status} · ${r.customer_name || ''}`,
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
        emptyMessage="진행 중인 배차가 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'dispatch', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 상담중 → 배차예정 → 배차완료까지 — 반납 처리하면 청구관리 탭으로 넘어갑니다. 상담중 행을 클릭하면 배차 상세로 이동합니다.
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
              <div style={{ fontSize: 11, color: '#94a3b8' }}>※ 반납 처리하면 이 건은 청구관리 탭으로 이동합니다.</div>
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

      {/* 삭제/취소 확인 모달 — PR-Q (native confirm 대체, 규칙 20) */}
      {confirmTarget && (
        <div
          onClick={() => !confirmBusy && setConfirmTarget(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...GLASS.L5, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', width: 'min(420px, 96vw)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}
          >
            <div style={{ padding: '18px 20px 14px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>
                {confirmTarget.action === 'delete' ? '🗑 배차 삭제' : '✕ 상담 건 취소'}
              </h3>
              <div style={{ ...GLASS.L1, marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#1e293b', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>차량 </span>🚗 {confirmTarget.row.vehicle_car_number || '미지정'}</div>
                <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>고객 </span>{confirmTarget.row.customer_name || '-'}</div>
                <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>출고 </span>{fmtDt(confirmTarget.row.dispatch_date)}</div>
                <div><span style={{ color: '#94a3b8', fontWeight: 700 }}>사고차량 </span>{confirmTarget.row.customer_car_number || '-'}</div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: confirmTarget.action === 'delete' ? '#991b1b' : '#b45309' }}>
                {confirmTarget.action === 'delete'
                  ? '이 배차 기록을 삭제합니다. 되돌릴 수 없습니다.'
                  : '이 상담 건을 취소 처리합니다 (상태 → 취소).'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 20px 16px' }}>
              <button onClick={() => !confirmBusy && setConfirmTarget(null)}
                style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                닫기
              </button>
              <button onClick={runConfirmed} disabled={confirmBusy}
                style={{
                  flex: 1, padding: '10px', color: '#fff', border: 'none', borderRadius: 9,
                  cursor: confirmBusy ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 800,
                  opacity: confirmBusy ? 0.5 : 1,
                  background: confirmTarget.action === 'delete'
                    ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                    : 'linear-gradient(135deg,#f59e0b,#d97706)',
                }}>
                {confirmBusy ? '처리 중…' : (confirmTarget.action === 'delete' ? '🗑 삭제하기' : '✕ 취소 처리')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
