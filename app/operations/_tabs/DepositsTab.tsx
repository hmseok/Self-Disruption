'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import DcStatStrip, { StatItem, ActionButton } from '@/app/components/DcStatStrip'
import DcToolbar from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'
import { GLASS, COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// DepositsTab — 입금 확인 (2026-07-08 사용자 명시)
//
// 배차 직원용: 렌터카통장 입금만 열람 + 대차건 연결/사유 정리.
// 원장(통장/카드) 페이지는 관리자 영역 — 여기서는 읽기 + 연결 액션만.
// 사유(지입 정산/투자/보험/일반 매출/기타)는 관리자 도메인과 연동 —
// 지입·투자 페이지 및 통장 분류에서 관리자가 이어받아 처리.
// ═══════════════════════════════════════════════════════════════════

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type DepositRow = {
  id: string
  transaction_date: string
  amount: number
  client_name: string | null
  description: string | null
  balance_after: number | null
  account_last4: string | null
  status: 'linked' | 'excluded' | 'candidate' | 'none'
  not_rental: string | null
  linked: { id: string; customer_name: string | null; customer_car_number: string | null; vehicle_car_number: string | null; status: string | null; claim_amount: number | null } | null
  candidates: Array<{ id: string; customer_name: string | null; customer_car_number: string | null; vehicle_car_number: string | null; insurance_company: string | null; claim_amount: number | null; dispatch_date: string | null; status: string | null; match_by: string }>
}

const nf = (n: any) => Number(n || 0).toLocaleString('ko-KR')
const REASONS = ['지입 정산', '투자', '보험', '일반 매출', '기타']
const MATCH_BY_LABEL: Record<string, string> = { name: '입금자명', car: '차량번호', payer: '입금자명' }

export default function DepositsTab() {
  const [rows, setRows] = useState<DepositRow[]>([])
  const [rentals, setRentals] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todo')  // todo = 후보+미연결
  const [matching, setMatching] = useState(false)

  // 연결/사유 모달
  const [modalRow, setModalRow] = useState<DepositRow | null>(null)
  const [rentalSearch, setRentalSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [reasonPick, setReasonPick] = useState('지입 정산')
  const [reasonMemo, setReasonMemo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const q = search ? `&q=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/operations/deposits?days=120${q}`, { headers })
      const json = await res.json()
      if (json?.data) { setRows(json.data); setRentals(json.rentals || []); setSummary(json.summary) }
    } finally { setLoading(false) }
  }, [search])
  useEffect(() => { load() }, [load])

  const runAutoMatch = useCallback(async () => {
    if (!confirm('입금과 대차건을 자동으로 연결할까요?\n(확실한 것만 연결 — 애매한 건 후보로 남습니다)')) return
    setMatching(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/finance/transactions/auto-match-fmi-rental', {
        method: 'POST', headers, body: JSON.stringify({ mode: 'insurance', dryRun: false }),
      })
      const json = await res.json()
      alert(json?.error ? `오류: ${json.error}` : `자동 연결 완료: ${json?.applied ?? json?.matched ?? 0}건`)
      load()
    } finally { setMatching(false) }
  }, [load])

  const linkRental = useCallback(async (txId: string, rentalId: string, label: string) => {
    if (!confirm(`이 입금을 「${label}」 대차건에 연결할까요? (연결 후 해제 가능)`)) return
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ related_type: 'fmi_rental', related_id: rentalId }),
      })
      const json = await res.json()
      if (json?.error) { alert(`연결 실패: ${json.error}`); return }
      setModalRow(null)
      load()
    } finally { setBusy(false) }
  }, [load])

  const saveReason = useCallback(async (txId: string) => {
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ not_rental: { reason: reasonPick, memo: reasonMemo } }),
      })
      const json = await res.json()
      if (json?.error) { alert(`저장 실패: ${json.error}`); return }
      setModalRow(null); setReasonMemo('')
      load()
    } finally { setBusy(false) }
  }, [reasonPick, reasonMemo, load])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'todo') return rows.filter((r) => r.status === 'candidate' || r.status === 'none')
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const rentalSearchResults = useMemo(() => {
    const q = rentalSearch.trim().toLowerCase()
    if (q.length < 2) return []
    return rentals.filter((r) =>
      String(r.customer_name || '').toLowerCase().includes(q) ||
      String(r.customer_car_number || '').toLowerCase().includes(q) ||
      String(r.vehicle_car_number || '').toLowerCase().includes(q)
    ).slice(0, 6)
  }, [rentals, rentalSearch])

  const stats: StatItem[] = [
    { label: '전체 입금', value: summary?.total ?? 0, tint: 'blue', onClick: () => setFilter('all'), active: filter === 'all' },
    { label: '연결됨', value: summary?.linked ?? 0, tint: 'green', onClick: () => setFilter('linked'), active: filter === 'linked' },
    { label: '후보 있음', value: summary?.candidate ?? 0, tint: 'amber', onClick: () => setFilter('candidate'), active: filter === 'candidate' },
    { label: '미연결', value: summary?.none ?? 0, tint: 'red', onClick: () => setFilter('none'), active: filter === 'none' },
    { label: '사유 처리', value: summary?.excluded ?? 0, tint: 'purple', onClick: () => setFilter('excluded'), active: filter === 'excluded' },
  ]
  const actions: ActionButton[] = [
    { label: matching ? '연결 중...' : '🔗 자동 연결', onClick: runAutoMatch, variant: 'primary' },
  ]

  const columns: TableColumn<DepositRow>[] = [
    { key: 'date', label: '입금일', width: 96,
      sortBy: (r) => new Date(r.transaction_date).getTime(),
      render: (r) => <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{String(r.transaction_date).slice(0, 10)}</span> },
    { key: 'payer', label: '입금자', width: 130,
      sortBy: (r) => r.client_name || '',
      render: (r) => <span style={{ fontSize: 13, fontWeight: 600 }}>{r.client_name || '-'}</span> },
    { key: 'desc', label: '적요',
      sortBy: (r) => r.description || '',
      render: (r) => <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{r.description || '-'}</span>, hideOnMobile: true },
    { key: 'amount', label: '금액', width: 110, align: 'right',
      sortBy: (r) => r.amount,
      render: (r) => <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.income, fontVariantNumeric: 'tabular-nums' }}>{nf(r.amount)}</span> },
    { key: 'status', label: '상태', width: 84,
      sortBy: (r) => r.status,
      render: (r) => {
        const m: Record<string, [string, string, string]> = {
          linked: ['연결됨', 'rgba(167,243,208,0.5)', '#059669'],
          candidate: ['후보 있음', 'rgba(253,230,138,0.5)', '#b45309'],
          none: ['미연결', 'rgba(254,202,202,0.5)', '#dc2626'],
          excluded: ['사유 처리', 'rgba(221,214,254,0.5)', '#6d28d9'],
        }
        const [label, bg, color] = m[r.status]
        return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: bg, color, whiteSpace: 'nowrap' }}>{label}</span>
      } },
    { key: 'target', label: '연결 대상', width: 170,
      sortBy: (r) => r.linked?.customer_name || r.not_rental || '',
      render: (r) => {
        if (r.status === 'linked' && r.linked) {
          return <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>
            🚗 {r.linked.customer_car_number || r.linked.vehicle_car_number || ''} {r.linked.customer_name || ''}
          </span>
        }
        if (r.status === 'excluded') {
          return <span style={{ fontSize: 12, color: '#6d28d9', whiteSpace: 'nowrap' }}>{r.not_rental}</span>
        }
        if (r.status === 'candidate') {
          const c = r.candidates[0]
          return <span style={{ fontSize: 12, color: '#b45309', whiteSpace: 'nowrap' }}>
            {c.customer_car_number || c.vehicle_car_number || ''} {c.customer_name || ''} ({MATCH_BY_LABEL[c.match_by] || c.match_by} 일치{r.candidates.length > 1 ? ` 외 ${r.candidates.length - 1}` : ''})
          </span>
        }
        return <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
      } },
    { key: 'action', label: '처리', width: 96,
      render: (r) => r.status === 'linked'
        ? <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
        : <button
            onClick={() => { setModalRow(r); setRentalSearch(''); setReasonMemo('') }}
            style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}` }}
          >{r.status === 'excluded' ? '다시 보기' : '연결/정리'}</button> },
  ]

  return (
    <>
      <DcStatStrip stats={stats} actions={actions} />
      <DcToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="입금자, 적요 검색..."
        filters={[{ key: 'todo', label: '처리 대상', count: (summary?.candidate ?? 0) + (summary?.none ?? 0) }]}
        activeFilter={filter === 'todo' ? 'todo' : ''}
        onFilterChange={() => setFilter('todo')}
      />
      <NeuDataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        loading={loading}
        emptyIcon="💰"
        emptyMessage="입금 내역이 없습니다 (렌터카통장 최근 120일)"
        defaultSort={{ key: 'date', dir: 'desc' }}
      />

      {/* 연결/사유 모달 */}
      {modalRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !busy && setModalRow(null)}>
          <div style={{ ...GLASS.L4, borderRadius: 16, padding: 20, width: 560, maxWidth: '92vw', maxHeight: '84vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>💰 입금 연결</div>
              <button onClick={() => setModalRow(null)} style={{ border: 'none', background: 'none', fontSize: 16, cursor: 'pointer', color: COLORS.textMuted }}>×</button>
            </div>
            <div style={{ fontSize: 13, marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: COLORS.bgBlue }}>
              <b>{modalRow.client_name || '입금자 미상'}</b> · {nf(modalRow.amount)}원 · {String(modalRow.transaction_date).slice(0, 10)}
              {modalRow.description ? <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>{modalRow.description}</div> : null}
            </div>

            {/* 후보 */}
            {modalRow.candidates.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>자동으로 찾은 후보</div>
                {modalRow.candidates.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, border: `1px solid ${COLORS.borderAmber}`, marginBottom: 6, background: 'rgba(255,251,235,0.6)' }}>
                    <div style={{ fontSize: 12 }}>
                      <b>{c.customer_name || '-'}</b> · 고객차 {c.customer_car_number || '-'} · 대차 {c.vehicle_car_number || '-'}
                      <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                        {c.insurance_company || ''} {c.claim_amount ? `· 청구 ${nf(c.claim_amount)}원` : ''} · {MATCH_BY_LABEL[c.match_by] || c.match_by} 일치
                      </div>
                    </div>
                    <button disabled={busy} onClick={() => linkRental(modalRow.id, c.id, `${c.customer_name || ''} ${c.customer_car_number || ''}`)}
                      style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', background: COLORS.primary, color: '#fff', border: 'none' }}>연결</button>
                  </div>
                ))}
              </div>
            )}

            {/* 직접 검색 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>대차건 직접 찾기</div>
              <input value={rentalSearch} onChange={(e) => setRentalSearch(e.target.value)} placeholder="고객명 또는 차량번호 2자 이상"
                style={{ ...GLASS.L1, width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              {rentalSearchResults.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, marginTop: 6 }}>
                  <div style={{ fontSize: 12 }}>
                    <b>{r.customer_name || '-'}</b> · 고객차 {r.customer_car_number || '-'} · 대차 {r.vehicle_car_number || '-'}
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}> {r.dispatch_date ? `· ${String(r.dispatch_date).slice(0, 10)}` : ''}</span>
                  </div>
                  <button disabled={busy} onClick={() => linkRental(modalRow.id, r.id, `${r.customer_name || ''} ${r.customer_car_number || ''}`)}
                    style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}` }}>연결</button>
                </div>
              ))}
            </div>

            {/* 대차 입금 아님 — 사유 */}
            <div style={{ paddingTop: 12, borderTop: `1px dashed ${COLORS.borderSubtle}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>대차 입금이 아니면 — 사유 남기기 (관리자가 이어받아 처리)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {REASONS.map((rs) => (
                  <button key={rs} onClick={() => setReasonPick(rs)}
                    style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                      background: reasonPick === rs ? COLORS.bgViolet : '#fff',
                      color: reasonPick === rs ? '#6d28d9' : COLORS.textSecondary,
                      border: reasonPick === rs ? '1.5px solid #7c3aed' : `1px solid ${COLORS.borderSubtle}` }}>{rs}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={reasonMemo} onChange={(e) => setReasonMemo(e.target.value)} placeholder="메모 (선택)"
                  style={{ ...GLASS.L1, flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12, outline: 'none' }} />
                <button disabled={busy} onClick={() => saveReason(modalRow.id)}
                  style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: '#6d28d9', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>사유 저장</button>
              </div>
              {modalRow.status === 'excluded' && (
                <button disabled={busy} onClick={async () => {
                  const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
                  await fetch(`/api/transactions/${modalRow.id}`, { method: 'PATCH', headers, body: JSON.stringify({ not_rental: null }) })
                  setModalRow(null); load()
                }} style={{ marginTop: 8, fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: '#fff', color: COLORS.danger, border: '1px solid rgba(239,68,68,0.3)' }}>사유 해제 (다시 검수 대상으로)</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
