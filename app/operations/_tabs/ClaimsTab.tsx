'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar, { FilterItem } from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { GLASS } from '@/app/utils/ui-tokens'
import { LOTTE_SHORT_TERM_RATES, computeLotteClaim } from '@/lib/lotte-short-term-rates'

// ═══════════════════════════════════════════════════════════════════
// ClaimsTab — 청구관리 (회차완료 → 청구 → 정산)
//
// PR-D1/D2 (2026-05-16) — 청구관리 list + 청구 작성
// PR-O (2026-05-22) — 라이프사이클 분담 + 보강
//   사용자 명시: 「배차완료·반납된 차량은 청구관리로」
//   → 청구관리 = 회차완료(반납) / 청구중 / 정산완료 의 청구·정산 원장.
//   추가: 청구유형 컬럼, 부가세 추가청구 배지/필터, 청구 모달 청구유형 선택.
//   입금 확인은 재무(통장) 영역 — 여기선 '정산완료' 상태로만 반영.
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
  claim_type: string | null
  vat_extra_billing: string | null
  capital_company: string | null
  // PR-N6c — 입고공장 / 지급 추적
  repair_factory: string | null
  customer_birth: string | null
  paid_amount: number | null
  payment_status: string | null
  payment_memo: string | null
  // PR-N7.1 — 과실율 / 청구율
  fault_rate: number | null
  claim_rate: number | null
}

type FilterKey = 'active' | 'all' | 'returned' | 'claiming' | 'settled'

// 청구관리 영역 = 회차 후 단계
const VISIBLE_STATUS = ['returned', 'claiming', 'settled']
const CLAIM_TYPES = ['보험', '라이드', '고객유상', '유상대차', '정비대차', '사고대차']
const PAYMENT_STATUSES = ['미지급', '지급완료', '종결']

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  returned: { label: '📥 회차완료', bg: 'rgba(245,158,11,0.12)', fg: '#b45309' },
  claiming: { label: '📤 청구중',   bg: 'rgba(99,102,241,0.12)', fg: '#4338ca' },
  settled:  { label: '✅ 정산완료', bg: 'rgba(34,197,94,0.12)',  fg: '#15803d' },
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
  const [filter, setFilter] = useState<FilterKey>('active')  // PR-S: 기본 = 처리 대상(회차완료+청구중)
  const [search, setSearch] = useState('')
  const [vatOnly, setVatOnly] = useState(false)
  const [rows, setRows] = useState<ClaimRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 청구 작성 모달
  const [claimModalOpen, setClaimModalOpen] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState<ClaimRow | null>(null)
  const [claimAmount, setClaimAmount] = useState('')
  const [claimNo, setClaimNo] = useState('')
  const [claimType, setClaimType] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')   // PR-N6c — 지급여부
  const [paymentMemo, setPaymentMemo] = useState('')        // PR-N6c — 지급 메모
  const [lotteRateIdx, setLotteRateIdx] = useState<number>(-1)  // PR-N7 — 롯데 차종 행
  const [lotteDays, setLotteDays] = useState<string>('')        // PR-N7 — 산출 대여일수
  const [faultRate, setFaultRate] = useState<string>('')        // PR-N7.1 — 과실율(%)
  const [claimRate, setClaimRate] = useState<string>('')        // PR-N7.1 — 청구율(%)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimMsg, setClaimMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/fmi-rentals?limit=2000', { headers })
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

  // 행 클릭 → 청구 작성 모달 오픈
  const openClaim = useCallback((r: ClaimRow) => {
    setSelectedClaim(r)
    setClaimAmount(r.final_claim_amount != null ? String(r.final_claim_amount) : '')
    setClaimNo(r.insurance_claim_no || '')
    setClaimType(r.claim_type || '')
    setPaymentStatus(r.payment_status || '')
    setPaymentMemo(r.payment_memo || '')
    setLotteRateIdx(-1)
    setLotteDays(r.rental_days != null ? String(r.rental_days) : '')
    setFaultRate(r.fault_rate != null ? String(r.fault_rate) : '')
    setClaimRate(r.claim_rate != null ? String(r.claim_rate) : '')
    setClaimMsg(null)
    setClaimModalOpen(true)
  }, [])

  // PR-N7 — 롯데 차종 select 그룹 + 산출 결과
  const lotteGroups = useMemo(() => {
    const out: { cat: string; rows: { idx: number; label: string }[] }[] = []
    LOTTE_SHORT_TERM_RATES.forEach((r, idx) => {
      let g = out.find((x) => x.cat === r.category)
      if (!g) { g = { cat: r.category, rows: [] }; out.push(g) }
      g.rows.push({ idx, label: r.vehicle_names })
    })
    return out
  }, [])
  const lotteResult = useMemo(() => {
    if (lotteRateIdx < 0) return null
    const rate = LOTTE_SHORT_TERM_RATES[lotteRateIdx]
    const d = Number(lotteDays)
    if (!rate || !d || d < 1) return null
    const base = computeLotteClaim(rate, d)  // 정가 (구간일요금 × 일수)
    // PR-N7.1 — 과실율·청구율 적용. 미입력/비정상 → 100%
    const fr = faultRate === '' ? 100 : Number(faultRate)
    const cr = claimRate === '' ? 100 : Number(claimRate)
    const faultPct = Number.isFinite(fr) && fr >= 0 ? fr : 100
    const claimPct = Number.isFinite(cr) && cr >= 0 ? cr : 100
    const finalTotal = Math.round(base.total * (faultPct / 100) * (claimPct / 100))
    return { ...base, faultPct, claimPct, finalTotal }
  }, [lotteRateIdx, lotteDays, faultRate, claimRate])

  // 청구 저장 (status 전이: claiming / settled)
  const saveClaim = useCallback(async (nextStatus: 'claiming' | 'settled') => {
    if (!selectedClaim) return
    setClaimBusy(true)
    setClaimMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/fmi-rentals/${selectedClaim.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          final_claim_amount: claimAmount === '' ? null : Number(claimAmount),
          insurance_claim_no: claimNo || null,
          claim_type: claimType || null,
          payment_status: paymentStatus || null,
          payment_memo: paymentMemo || null,
          fault_rate: faultRate === '' ? null : Number(faultRate),
          claim_rate: claimRate === '' ? null : Number(claimRate),
          status: nextStatus,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (json?.error) throw new Error(json.error)
      setClaimMsg({ type: 'ok', text: nextStatus === 'settled' ? '정산 완료 처리됨' : '청구 확정 저장됨' })
      setClaimModalOpen(false)
      refresh()
    } catch (e: any) {
      setClaimMsg({ type: 'err', text: e?.message || '저장 실패' })
    } finally {
      setClaimBusy(false)
    }
  }, [selectedClaim, claimAmount, claimNo, claimType, paymentStatus, paymentMemo, faultRate, claimRate, refresh])

  // 청구관리 영역 (returned/claiming/settled) — 부가세 필터 적용
  const claimRows = useMemo(() => {
    let list = (rows || []).filter((r) => VISIBLE_STATUS.includes(r.status || ''))
    if (vatOnly) list = list.filter((r) => r.vat_extra_billing === 'Y')
    return list
  }, [rows, vatOnly])

  const data = useMemo(() => ({
    all: claimRows,
    active: claimRows.filter((r) => r.status === 'returned' || r.status === 'claiming'),
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
      (r.claim_type || '').toLowerCase().includes(q) ||
      (r.rental_no || '').toLowerCase().includes(q),
    )
  }, [activeData, search])

  const counts = {
    all: claimRows.length,
    active: data.active.length,
    returned: data.returned.length,
    claiming: data.claiming.length,
    settled: data.settled.length,
  }
  const vatCount = useMemo(
    () => (rows || []).filter((r) => VISIBLE_STATUS.includes(r.status || '') && r.vat_extra_billing === 'Y').length,
    [rows],
  )
  // 청구액 합계 (정보성)
  const totalClaim = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.final_claim_amount || 0), 0),
    [filtered],
  )

  const statItems: StatItem[] = [
    { label: '💰 청구 대상 전체', value: counts.all, unit: '건', tint: 'blue' },
    { label: '📥 회차완료', value: counts.returned, unit: '건', tint: 'amber' },
    { label: '📤 청구중', value: counts.claiming, unit: '건', tint: 'purple' },
    { label: '🧾 부가세 추가청구', value: vatCount, unit: '건', tint: 'amber' },
    { label: '🧮 청구액 합계', value: Math.round(totalClaim / 10000), unit: '만원', tint: 'green' },
  ]
  const statActions: ActionButton[] = [
    { label: '새로고침', onClick: refresh, variant: 'secondary', icon: '🔄' },
  ]
  const filterItems: FilterItem[] = [
    { key: 'active', label: '🔔 처리 대상', count: counts.active },
    { key: 'returned', label: '📥 회차완료', count: counts.returned },
    { key: 'claiming', label: '📤 청구중', count: counts.claiming },
    { key: 'settled', label: '✅ 정산완료', count: counts.settled },
    { key: 'all', label: '💰 전체', count: counts.all },
  ]

  const columns: TableColumn<ClaimRow>[] = [
    {
      key: 'actual_return_date', label: '반납일', width: 108,
      sortBy: (r) => r.actual_return_date || '',
      render: (r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontSize: 12 }}>{fmtDate(r.actual_return_date)}</span>,
    },
    {
      key: 'status', label: '상태', width: 116, align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => {
        const meta = STATUS_META[r.status || ''] || { label: r.status || '-', bg: 'rgba(148,163,184,0.15)', fg: '#475569' }
        return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: meta.bg, color: meta.fg }}>{meta.label}</span>
      },
    },
    {
      key: 'claim_type', label: '청구유형', width: 158,
      sortBy: (r) => r.claim_type || '',
      render: (r) => (
        <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
          {r.claim_type
            ? <span style={{ fontWeight: 700, color: '#4338ca' }}>{r.claim_type}</span>
            : <span style={{ color: '#cbd5e1' }}>-</span>}
          {r.vat_extra_billing === 'Y' && (
            <span style={{ marginLeft: 5, padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 800, background: 'rgba(245,158,11,0.16)', color: '#b45309' }}>
              부가세{r.capital_company ? ` ${r.capital_company}` : ''}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'vehicle_car_number', label: '대차차량', width: 110,
      sortBy: (r) => r.vehicle_car_number || '',
      render: (r) => <span style={{ fontWeight: 700, color: '#0f2440', whiteSpace: 'nowrap' }}>🚗 {r.vehicle_car_number || '-'}</span>,
    },
    {
      key: 'customer_name', label: '고객', width: 128,
      sortBy: (r) => r.customer_name || '',
      render: (r) => <span style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 128 }}>{r.customer_name || '-'}</span>,
    },
    {
      key: 'repair_factory', label: '입고공장', width: 124,
      sortBy: (r) => r.repair_factory || '',
      render: (r) => r.repair_factory
        ? <span style={{ fontSize: 12, color: '#0f2440', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 124 }}>🔧 {r.repair_factory}</span>
        : <span style={{ fontSize: 11, color: '#cbd5e1' }}>-</span>,
    },
    {
      key: 'insurance_company', label: '보험사', width: 116,
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
      key: 'period', label: '대여기간', width: 86, align: 'center',
      sortBy: (r) => r.rental_days ?? 0,
      render: (r) => <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>{r.rental_days != null ? `${r.rental_days}일` : '-'}</span>,
    },
    {
      key: 'final_claim_amount', label: '청구액', width: 124, align: 'right',
      sortBy: (r) => Number(r.final_claim_amount || 0),
      render: (r) => r.final_claim_amount != null
        ? <span style={{ fontWeight: 800, color: '#0f2440', whiteSpace: 'nowrap' }}>{fmtWon(r.final_claim_amount)}</span>
        : <span style={{ fontSize: 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>미작성</span>,
    },
    {
      key: 'handler_name', label: '담당자', width: 88,
      sortBy: (r) => r.handler_name || '',
      render: (r) => <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.handler_name || '-'}</span>,
    },
  ]

  const mobileCard: MobileCardConfig<ClaimRow> = {
    title: (r) => <span style={{ whiteSpace: 'nowrap' }}>🚗 {r.vehicle_car_number || r.customer_name || r.rental_no}</span>,
    subtitle: (r) => `${(STATUS_META[r.status || '']?.label) || r.status || ''} · ${r.claim_type || '유형미정'} · ${fmtWon(r.final_claim_amount)}`,
  }

  return (
    <div>
      <DcStatStrip stats={statItems} actions={statActions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="대차차량 / 고객 / 보험사 / 보험접수번호 / 청구유형 검색…"
        filters={filterItems}
        activeFilter={filter}
        onFilterChange={(k) => setFilter(k as FilterKey)}
        trailing={
          <select
            value={vatOnly ? 'vat' : 'all'}
            onChange={(e) => setVatOnly(e.target.value === 'vat')}
            style={{ ...GLASS.L1, padding: '7px 10px', borderRadius: 8, fontSize: 12, color: '#1e293b', fontWeight: 700 }}
          >
            <option value="all">🧾 부가세 전체</option>
            <option value="vat">🧾 부가세 추가청구만</option>
          </select>
        }
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
        onRowClick={openClaim}
        loading={loading}
        emptyIcon="💰"
        emptyMessage="청구 대상 (회차 완료) 건이 없습니다"
        mobileCard={mobileCard}
        defaultSort={{ key: 'actual_return_date', dir: 'desc' }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        💡 행을 클릭하면 청구 작성(청구유형·청구액·보험접수번호 / 청구 확정 / 정산 완료)이 열립니다. 입금 확인은 재무(통장)에서 — 여기선 정산완료로 반영됩니다.
      </div>

      {/* 청구 작성 모달 */}
      {claimModalOpen && selectedClaim && (
        <div
          onClick={() => !claimBusy && setClaimModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...GLASS.L5,
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              width: 'min(560px, 96vw)', maxHeight: '86vh',
              borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#0f2440', margin: 0 }}>💰 청구 작성</h3>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                🚗 {selectedClaim.vehicle_car_number || '-'} · {selectedClaim.customer_name || '-'}
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={() => !claimBusy && setClaimModalOpen(false)}
                style={{ padding: '5px 10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>
            {/* 본문 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 참고 정보 */}
              <div style={{ ...GLASS.L3, padding: '10px 12px', borderRadius: 8, fontSize: 12, display: 'grid', gridTemplateColumns: '90px 1fr', gap: '5px 10px' }}>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>보험사</span>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{selectedClaim.insurance_company || '-'}</span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>대여기간</span>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{selectedClaim.rental_days != null ? `${selectedClaim.rental_days}일` : '-'}</span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>일대여료</span>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{fmtWon(selectedClaim.daily_rate)}</span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>대여료 합계</span>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{fmtWon(selectedClaim.total_rental_fee)}</span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>입고공장</span>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{selectedClaim.repair_factory ? `🔧 ${selectedClaim.repair_factory}` : '-'}</span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>지급금액</span>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>
                  {fmtWon(selectedClaim.paid_amount)}
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 5 }}>재무 통장/카드 자동매칭</span>
                </span>
                {selectedClaim.vat_extra_billing === 'Y' && (
                  <>
                    <span style={{ color: '#b45309', fontWeight: 700 }}>부가세</span>
                    <span style={{ color: '#b45309', fontWeight: 700 }}>추가청구 대상{selectedClaim.capital_company ? ` · ${selectedClaim.capital_company}` : ''}</span>
                  </>
                )}
              </div>
              {/* 청구유형 */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>청구유형</label>
                <select
                  value={claimType}
                  onChange={(e) => setClaimType(e.target.value)}
                  style={{ ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' }}
                >
                  <option value="">— 선택 —</option>
                  {CLAIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* PR-N7 — 롯데 단기 요금 산출 */}
              <div style={{ ...GLASS.L3, padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>💡 롯데 단기 요금 산출</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={lotteRateIdx}
                    onChange={(e) => setLotteRateIdx(Number(e.target.value))}
                    style={{ ...GLASS.L1, flex: '1 1 220px', padding: '8px 10px', borderRadius: 8, fontSize: 12, color: '#1e293b' }}
                  >
                    <option value={-1}>— 대차차량 차종 선택 —</option>
                    {lotteGroups.map((g) => (
                      <optgroup key={g.cat} label={g.cat}>
                        {g.rows.map((r) => <option key={r.idx} value={r.idx}>{r.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div style={{ ...GLASS.L1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8 }}>
                    <input
                      type="number" value={lotteDays}
                      onChange={(e) => setLotteDays(e.target.value)} placeholder="일수"
                      style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#1e293b', fontWeight: 700, outline: 'none', width: 52 }}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>일</span>
                  </div>
                  <div style={{ ...GLASS.L1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>과실</span>
                    <input
                      type="number" value={faultRate}
                      onChange={(e) => setFaultRate(e.target.value)} placeholder="100"
                      style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#1e293b', fontWeight: 700, outline: 'none', width: 42 }}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
                  </div>
                  <div style={{ ...GLASS.L1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>청구율</span>
                    <input
                      type="number" value={claimRate}
                      onChange={(e) => setClaimRate(e.target.value)} placeholder="100"
                      style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#1e293b', fontWeight: 700, outline: 'none', width: 42 }}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
                  </div>
                </div>
                {lotteResult ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.55 }}>
                      [{lotteResult.tierLabel}] {lotteResult.dailyRate.toLocaleString('ko-KR')}원/일 × {lotteResult.days}일
                      {(lotteResult.faultPct !== 100 || lotteResult.claimPct !== 100) ? ` × 과실 ${lotteResult.faultPct}% × 청구율 ${lotteResult.claimPct}%` : ''}
                      {' = '}
                      <b style={{ color: '#0f2440', fontSize: 13 }}>{lotteResult.finalTotal.toLocaleString('ko-KR')}원</b>
                      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 5 }}>
                        VAT 포함{(lotteResult.faultPct !== 100 || lotteResult.claimPct !== 100) ? ` · 정가 ${lotteResult.total.toLocaleString('ko-KR')}` : ` · 공급가 ${lotteResult.supply.toLocaleString('ko-KR')}`}
                      </span>
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => setClaimAmount(String(lotteResult.finalTotal))}
                      style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff' }}
                    >청구액에 적용 →</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>차종·대여일수·과실율·청구율을 입력하면 롯데 공식 요금이 산출됩니다 (구간일요금 × 일수 × 과실율 × 청구율, VAT 포함).</div>
                )}
              </div>
              {/* 청구액 */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>최종 청구액 (원)</label>
                <input
                  type="number"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)}
                  placeholder="예: 540000"
                  style={{ ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' }}
                />
                {claimAmount !== '' && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    = {Number(claimAmount).toLocaleString('ko-KR')}원
                  </div>
                )}
              </div>
              {/* 보험접수번호 */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>보험 접수번호</label>
                <input
                  value={claimNo}
                  onChange={(e) => setClaimNo(e.target.value)}
                  placeholder="보험사 청구 접수번호"
                  style={{ ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' }}
                />
              </div>
              {/* 지급여부 (지급금액은 재무 자동매칭 — 위 참고정보 표시) */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>지급여부</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  style={{ ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' }}
                >
                  <option value="">— 선택 —</option>
                  {PAYMENT_STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* 지급 메모 */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>지급 메모</label>
                <input
                  value={paymentMemo}
                  onChange={(e) => setPaymentMemo(e.target.value)}
                  placeholder="청구·지급 관련 메모"
                  style={{ ...GLASS.L1, width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#1e293b' }}
                />
              </div>
              {claimMsg && (
                <div style={{ fontSize: 12, fontWeight: 700, color: claimMsg.type === 'ok' ? '#15803d' : '#991b1b' }}>
                  {claimMsg.type === 'ok' ? '✅' : '⚠️'} {claimMsg.text}
                </div>
              )}
            </div>
            {/* 푸터 — 청구 확정 / 정산 완료 */}
            <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <button onClick={() => !claimBusy && setClaimModalOpen(false)}
                style={{ padding: '9px 16px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                닫기
              </button>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => saveClaim('claiming')}
                disabled={claimBusy}
                style={{
                  padding: '9px 18px',
                  background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  cursor: claimBusy ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 12,
                  opacity: claimBusy ? 0.5 : 1,
                }}
              >
                📤 청구 확정
              </button>
              <button
                onClick={() => saveClaim('settled')}
                disabled={claimBusy}
                style={{
                  padding: '9px 18px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  cursor: claimBusy ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 12,
                  opacity: claimBusy ? 0.5 : 1,
                }}
              >
                ✅ 정산 완료
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
