'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// RentalListTab — PR-N1 (2026-05-22) 대차리스트 (배차 한 건 = 한 줄)
//
// 사용자 명시:
//   「배차 한건 리스트 탭 따로 나와야 하죠」
//   「지금 엑셀로 하고있는 내용도 적용 — 바로 넘어와서 업무할 수 있게」
//
// 사용자 운영 엑셀 「대차 현황」 의 빌려타/마춤카/부가세/따봉 시트 = 플릿 그룹.
// fmi_rentals 전체를 한 줄씩 — 출고~반납~청구 라이프사이클 원장.
//
// 기존 /operations/rentals 페이지를 표준 UI(DcStatStrip/DcToolbar/NeuDataTable)
// 로 재작성 + /operations 5번째 탭으로 편입.
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type Rental = {
  id: string
  rental_no: string | null
  customer_name: string
  customer_phone: string | null
  customer_car_number: string | null
  customer_car_type: string | null
  vehicle_car_number: string | null
  vehicle_car_type: string | null
  insurance_company: string | null
  insurance_claim_no: string | null
  adjuster_name: string | null
  adjuster_phone: string | null
  dispatch_date: string | null
  expected_return_date: string | null
  actual_return_date: string | null
  rental_days: number | null
  daily_rate: number | null
  total_rental_fee: number | null
  final_claim_amount: number | null
  status: string
  handler_name: string | null
  dispatcher_name: string | null
  notes: string | null
  fleet_group: string | null
  vehicle_status: string | null
}

type FilterKey = 'all' | 'dispatched' | 'claiming' | 'returned' | 'settled'

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  pending:    { label: '대기',     bg: 'rgba(148,163,184,0.15)', fg: '#475569' },
  dispatched: { label: '배차중',   bg: 'rgba(59,130,246,0.12)',  fg: '#1d4ed8' },
  returned:   { label: '반차완료', bg: 'rgba(245,158,11,0.12)',  fg: '#b45309' },
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
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [fleet, setFleet] = useState<string>('all')

  const [rentals, setRentals] = useState<Rental[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 결과 토스트 — PR-M 패턴: 화면 고정
  const [resultMsg, setResultMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showResult = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setResultMsg(m)
    setTimeout(() => setResultMsg(null), 5000)
  }, [])

  // 반납 처리 모달
  const [returnModal, setReturnModal] = useState<Rental | null>(null)
  const [returnMileage, setReturnMileage] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnSaving, setReturnSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/fmi-rentals?include_stats=1&limit=2000', { headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`)
      setRentals(Array.isArray(json?.data) ? json.data : [])
    } catch (e: any) {
      setErr(e?.message || 'fetch 실패')
      setRentals([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (rentals === null && !loading) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => { setRentals(null); fetchAll() }, [fetchAll])

  const isOverdue = useCallback((r: Rental) => {
    if (r.actual_return_date) return false
    if (!r.expected_return_date) return false
    return new Date(r.expected_return_date) < new Date() && ['dispatched', 'claiming'].includes(r.status)
  }, [])

  // 플릿 옵션 — 데이터에서 동적 추출
  const fleetOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rentals || []) if (r.fleet_group) set.add(r.fleet_group)
    return Array.from(set).sort()
  }, [rentals])

  // 플릿 필터 1차 적용
  const fleetScoped = useMemo(() => {
    if (!rentals) return []
    if (fleet === 'all') return rentals
    return rentals.filter((r) => (r.fleet_group || '') === fleet)
  }, [rentals, fleet])

  // 상태별 분류
  const data = useMemo(() => ({
    all: fleetScoped,
    dispatched: fleetScoped.filter((r) => r.status === 'dispatched'),
    claiming: fleetScoped.filter((r) => r.status === 'claiming'),
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
    dispatched: data.dispatched.length,
    claiming: data.claiming.length,
    returned: data.returned.length,
    settled: data.settled.length,
    overdue: fleetScoped.filter(isOverdue).length,
  }), [fleetScoped, data, isOverdue])

  const statItems: StatItem[] = [
    { label: '📋 전체 배차', value: counts.all, unit: '건', tint: 'blue' },
    { label: '🚐 운용 중', value: counts.dispatched + counts.claiming, unit: '건', tint: 'green' },
    { label: '⚠ 연체', value: counts.overdue, unit: '건', tint: 'red' },
    { label: '✅ 정산완료', value: counts.settled, unit: '건', tint: 'purple' },
    { label: '🔍 검색결과', value: filtered.length, unit: '건', tint: 'blue' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'all', label: '📋 전체', count: counts.all },
    { key: 'dispatched', label: '🚐 배차중', count: counts.dispatched },
    { key: 'claiming', label: '💰 청구중', count: counts.claiming },
    { key: 'returned', label: '🏁 반차완료', count: counts.returned },
    { key: 'settled', label: '✅ 정산완료', count: counts.settled },
  ]

  // 반납 처리
  const openReturn = useCallback((r: Rental) => {
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

  // 삭제 (배차 취소)
  const handleDelete = useCallback(async (r: Rental) => {
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

  const columns: TableColumn<Rental>[] = [
    {
      key: 'dispatch', label: '출고일시', width: 130,
      sortBy: (r) => r.dispatch_date || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontSize: 12 }}>{fmtDt(r.dispatch_date)}</span>,
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
      key: 'fleet', label: '플릿', width: 92,
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
      key: 'customer_car', label: '사고차량', width: 160,
      sortBy: (r) => r.customer_car_number || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 160, fontSize: 12, color: '#475569' }}>
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
      key: 'insurance', label: '보험사 / 접수번호', width: 170,
      sortBy: (r) => r.insurance_company || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 170, fontSize: 12, color: '#475569' }}>
        {r.insurance_company || '-'}{r.insurance_claim_no ? ` · #${r.insurance_claim_no}` : ''}
      </span>,
    },
    {
      key: 'adjuster', label: '담당자', width: 100,
      sortBy: (r) => r.adjuster_name || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>{r.adjuster_name || '-'}</span>,
    },
    {
      key: 'claim', label: '청구금액', width: 110, align: 'right',
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
      key: 'actions', label: '액션', width: 130, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
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
        </span>
      ),
    },
  ]

  const mobileCard: MobileCardConfig<Rental> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.vehicle_car_number || r.customer_name || r.id.slice(0, 8)}</span>,
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
        loading={loading}
        emptyIcon="🚗"
        emptyMessage="대차 내역이 없습니다 — 엑셀 일괄 업로드로 데이터를 채워보세요"
        mobileCard={mobileCard}
        defaultSort={{ key: 'dispatch', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 한 줄 = 배차 1건. 출고~반납~청구 라이프사이클 원장 — 엑셀 「빌려타·마춤카·부가세·따봉」 시트가 플릿 그룹으로 표시됩니다.
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
                style={{ padding: '9px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>취소</button>
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
