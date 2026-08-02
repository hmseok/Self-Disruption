'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import DcToolbar from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn } from '@/app/components/NeuDataTable'
import { COLORS } from '@/app/utils/ui-tokens'

// ═══════════════════════════════════════════════════════════════════
// DepositsTab — 입금 확인
//
// 2026-08-01 리뉴얼 (사용자 보고: "입금은 배차된 차량 중에 매칭해서
//   해당 입금 건만 배치되어야 하는데 UI 가 확립이 안 됐다"):
//   축을 뒤집음 — 기본 뷰 = 「배차건 기준」: 진행 중 대차건마다
//   청구액/입금 누계/잔액/입금 상태를 보여주고, 건을 열면 그 건의
//   연결된 입금 + 이 건에 맞는 후보 입금만 나온다.
//   「입금 목록」 뷰(기존)는 보조로 유지 — 통장 전체를 훑을 때.
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

type Rental = {
  id: string
  customer_name: string | null
  customer_car_number: string | null
  vehicle_car_number: string | null
  insurance_company: string | null
  claim_amount: number | null
  dispatch_date: string | null
  status: string | null
  paid_sum: number
  ride_sum: number
  vehicle_class: 'ride' | 'own'
  ride_items: Array<{ settle_month: string; deposit_date: string | null; insurer: string | null; customer_car: string | null; amount: number }>
}
type RideMonth = { month: string; count: number; total: number; matched: number }
// 통장 입금 + 라이드 일괄 정산분 합계
const totalPaid = (r: Rental) => (r.paid_sum || 0) + (r.ride_sum || 0)

const nf = (n: any) => Number(n || 0).toLocaleString('ko-KR')
const REASONS = ['지입 정산', '투자', '보험', '일반 매출', '기타']
const MATCH_BY_LABEL: Record<string, string> = { name: '입금자명', car: '차량번호', payer: '입금자명', insurer: '보험사명' }
// 입금 매칭 대상 = 배차 이후 ~ 청구 진행 중 (settled 전)
const ACTIVE_STATUSES = new Set(['dispatched', 'returned', 'claiming'])
const RENTAL_STATUS_LABEL: Record<string, string> = {
  dispatched: '배차중', returned: '반납완료', claiming: '청구중', settled: '정산완료',
  pending: '접수', consult: '상담',
}

type PayState = 'waiting' | 'partial' | 'done' | 'noclaim'
function payState(r: Rental): PayState {
  const paid = totalPaid(r)
  if (r.claim_amount == null || r.claim_amount <= 0) return paid > 0 ? 'partial' : 'noclaim'
  if (paid <= 0) return 'waiting'
  if (paid >= r.claim_amount) return 'done'
  return 'partial'
}
const PAY_META: Record<PayState, { label: string; bg: string; fg: string }> = {
  waiting: { label: '입금 대기', bg: COLORS.bgRed, fg: COLORS.danger },
  partial: { label: '부분 입금', bg: COLORS.bgAmber, fg: COLORS.warning },
  done:    { label: '완납', bg: COLORS.bgGreen, fg: COLORS.success },
  noclaim: { label: '청구액 미정', bg: COLORS.borderFaint, fg: COLORS.textMuted },
}

export default function DepositsTab() {
  const [rows, setRows] = useState<DepositRow[]>([])
  const [rentals, setRentals] = useState<Rental[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'rentals' | 'deposits'>('rentals')
  const [days, setDays] = useState(120) // 과거 입금 매칭용 기간 (국민은행 구계좌 포함)
  const [payFilter, setPayFilter] = useState('open') // open = 대기+부분 / all / done
  const [depositFilter, setDepositFilter] = useState('todo')
  const [vehClass, setVehClass] = useState<'all' | 'ride' | 'own'>('all') // 차량 소속 (빌려타/자사)
  const [rideMonths, setRideMonths] = useState<RideMonth[]>([])
  const [matching, setMatching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const rideFileRef = useRef<HTMLInputElement>(null)

  // 배차건 상세 (배차건 기준 뷰) / 입금 연결 모달 (입금 목록 뷰)
  const [rentalModal, setRentalModal] = useState<Rental | null>(null)
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
      const res = await fetch(`/api/operations/deposits?days=${days}${q}`, { headers })
      const json = await res.json()
      if (json?.data) {
        setRows(json.data); setRentals(json.rentals || []); setSummary(json.summary)
        setRideMonths(json.ride_months || [])
      }
    } finally { setLoading(false) }
  }, [search, days])
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

  // 라이드(빌려타) 월 대차료 마감엑셀 업로드 → 건별 저장 + 자동 매칭
  const uploadRideSettlement = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const [{ read, utils }, { parseRideSettlement }] = await Promise.all([
        import('xlsx'), import('@/lib/ride-settlement-parser'),
      ])
      const wb = read(await file.arrayBuffer(), { type: 'array' })
      const sheetName = wb.SheetNames.find((n) => n.includes('정산')) || wb.SheetNames[0]
      const rows = utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true }) as unknown[][]
      const parsed = parseRideSettlement(rows)
      if (!parsed.deposits.length) { alert('정산 내역을 찾지 못했습니다 — 「월 정산」 시트가 있는 라이드 마감엑셀인지 확인해주세요'); return }
      const month = parsed.month || prompt('정산월을 확인하지 못했습니다. YYYY-MM 형식으로 입력해주세요', '') || ''
      if (!/^\d{4}-\d{2}$/.test(month)) { alert('정산월(YYYY-MM)이 없어 중단했습니다'); return }
      if (!confirm(`라이드 ${month} 정산 — 차량 ${parsed.vehicles.length}대, 입금 ${parsed.deposits.length}건, 총 ${nf(parsed.grandTotal)}원\n저장하고 배차건과 매칭할까요? (재업로드해도 중복 저장되지 않습니다)`)) return
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const res = await fetch('/api/operations/ride-settlement', {
        method: 'POST', headers, body: JSON.stringify({ month, deposits: parsed.deposits }),
      })
      const json = await res.json()
      if (json?.error) { alert(`업로드 실패: ${json.error}`); return }
      const d = json.data
      let msg = `라이드 ${d.month} 정산 반영 완료\n신규 ${d.inserted}건 (중복 제외 ${d.duplicated}건)\n배차건 매칭 ${d.matched}건 / 미매칭 ${d.unmatched}건`
      if (d.unmatchedList?.length) {
        msg += '\n\n미매칭 내역:\n' + d.unmatchedList.slice(0, 8).map((u: any) =>
          `· ${u.vehicle || '?'} / 고객차 ${u.customerCar || '?'} / ${u.insurer || '?'} / ${nf(u.amount)}원`).join('\n')
        if (d.unmatchedList.length > 8) msg += `\n… 외 ${d.unmatchedList.length - 8}건`
      }
      alert(msg)
      load()
    } catch (e: any) {
      alert(`엑셀 처리 오류: ${e?.message || e}`)
    } finally {
      setUploading(false)
      if (rideFileRef.current) rideFileRef.current.value = ''
    }
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

  const unlinkTx = useCallback(async (txId: string) => {
    if (!confirm('이 입금의 연결을 해제할까요?')) return
    setBusy(true)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ related_type: null, related_id: null }),
      })
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

  // ── 배차건 축 인덱스 — 이 건에 연결된 입금 / 이 건이 후보인 입금 ──
  const linkedByRental = useMemo(() => {
    const m = new Map<string, DepositRow[]>()
    for (const d of rows) {
      if (d.status === 'linked' && d.linked?.id) {
        if (!m.has(d.linked.id)) m.set(d.linked.id, [])
        m.get(d.linked.id)!.push(d)
      }
    }
    return m
  }, [rows])
  const candidateByRental = useMemo(() => {
    const m = new Map<string, DepositRow[]>()
    for (const d of rows) {
      if (d.status !== 'candidate') continue
      for (const c of d.candidates) {
        if (!m.has(c.id)) m.set(c.id, [])
        m.get(c.id)!.push(d)
      }
    }
    return m
  }, [rows])
  const unlinkedRows = useMemo(() => rows.filter((d) => d.status === 'candidate' || d.status === 'none'), [rows])

  // ── 배차건 기준 뷰 데이터 ──
  const activeRentals = useMemo(() =>
    rentals.filter((r) => ACTIVE_STATUSES.has(String(r.status || ''))), [rentals])
  const rentalRows = useMemo(() => {
    let data = activeRentals
    if (vehClass !== 'all') data = data.filter((r) => r.vehicle_class === vehClass)
    if (payFilter === 'open') data = data.filter((r) => payState(r) !== 'done')
    else if (payFilter === 'done') data = data.filter((r) => payState(r) === 'done')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      data = data.filter((r) =>
        String(r.customer_name || '').toLowerCase().includes(q) ||
        String(r.customer_car_number || '').toLowerCase().includes(q) ||
        String(r.vehicle_car_number || '').toLowerCase().includes(q))
    }
    return data
  }, [activeRentals, payFilter, search, vehClass])

  const filtered = useMemo(() => {
    if (depositFilter === 'all') return rows
    if (depositFilter === 'todo') return rows.filter((r) => r.status === 'candidate' || r.status === 'none')
    return rows.filter((r) => r.status === depositFilter)
  }, [rows, depositFilter])

  const rentalSearchResults = useMemo(() => {
    const q = rentalSearch.trim().toLowerCase()
    if (q.length < 2) return []
    return rentals.filter((r) =>
      String(r.customer_name || '').toLowerCase().includes(q) ||
      String(r.customer_car_number || '').toLowerCase().includes(q) ||
      String(r.vehicle_car_number || '').toLowerCase().includes(q)
    ).slice(0, 6)
  }, [rentals, rentalSearch])

  // ── 배차건 기준 테이블 ──
  const rentalColumns: TableColumn<Rental>[] = [
    { key: 'customer', label: '고객',
      sortBy: (r) => r.customer_name || '',
      render: (r) => (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.customer_name || '—'}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted }}>{r.insurance_company || ''}</div>
        </div>
      ) },
    { key: 'car', label: '차량', width: 168,
      sortBy: (r) => r.vehicle_car_number || '',
      render: (r) => (
        <div style={{ fontSize: 12.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>대차 <b>{r.vehicle_car_number || '—'}</b></span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1.5px 6px', borderRadius: 5, whiteSpace: 'nowrap',
              background: r.vehicle_class === 'ride' ? COLORS.bgViolet : COLORS.bgBlue,
              color: r.vehicle_class === 'ride' ? '#6d28d9' : COLORS.primary,
            }}>{r.vehicle_class === 'ride' ? '빌려타' : '자사'}</span>
          </div>
          <div style={{ color: COLORS.textMuted, fontSize: 11.5 }}>고객차 {r.customer_car_number || '—'}</div>
        </div>
      ) },
    { key: 'dispatch', label: '배차일', width: 92,
      sortBy: (r) => r.dispatch_date || '',
      render: (r) => <span style={{ fontSize: 12.5, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{r.dispatch_date ? String(r.dispatch_date).slice(0, 10) : '—'}</span> },
    { key: 'rstatus', label: '진행', width: 78, align: 'center',
      sortBy: (r) => r.status || '',
      render: (r) => <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.bgBlue, color: COLORS.primary, whiteSpace: 'nowrap' }}>{RENTAL_STATUS_LABEL[String(r.status)] || r.status}</span> },
    { key: 'claim', label: '청구액', width: 105, align: 'right',
      sortBy: (r) => r.claim_amount || 0,
      render: (r) => <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{r.claim_amount != null ? nf(r.claim_amount) : '—'}</span> },
    { key: 'paid', label: '입금 누계', width: 115, align: 'right',
      sortBy: (r) => totalPaid(r),
      render: (r) => (
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: totalPaid(r) > 0 ? COLORS.success : COLORS.textMuted, fontVariantNumeric: 'tabular-nums' }}>{nf(totalPaid(r))}</span>
          {r.ride_sum > 0 && <div style={{ fontSize: 10.5, color: COLORS.textMuted }}>라이드 {nf(r.ride_sum)}</div>}
        </div>
      ) },
    { key: 'remain', label: '잔액', width: 105, align: 'right',
      sortBy: (r) => (r.claim_amount || 0) - totalPaid(r),
      render: (r) => {
        if (r.claim_amount == null) return <span style={{ color: COLORS.textDim, fontSize: 12 }}>—</span>
        const remain = r.claim_amount - totalPaid(r)
        return <span style={{ fontSize: 13, fontWeight: 600, color: remain > 0 ? COLORS.danger : COLORS.success, fontVariantNumeric: 'tabular-nums' }}>{nf(Math.max(remain, 0))}</span>
      } },
    { key: 'paystate', label: '입금 상태', width: 92, align: 'center',
      sortBy: (r) => payState(r),
      render: (r) => {
        const m = PAY_META[payState(r)]
        return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: m.bg, color: m.fg, whiteSpace: 'nowrap' }}>{m.label}</span>
      } },
    { key: 'cand', label: '후보 입금', width: 90, align: 'center',
      sortBy: (r) => (candidateByRental.get(r.id) || []).length,
      render: (r) => {
        const n = (candidateByRental.get(r.id) || []).length
        return n > 0
          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: COLORS.bgAmber, color: COLORS.warning }}>{n}건 대기</span>
          : <span style={{ fontSize: 11, color: COLORS.textDim }}>—</span>
      } },
  ]

  const summaryCounts = useMemo(() => ({
    open: activeRentals.filter((r) => payState(r) !== 'done').length,
    done: activeRentals.filter((r) => payState(r) === 'done').length,
    candTotal: activeRentals.reduce((s, r) => s + ((candidateByRental.get(r.id) || []).length > 0 ? 1 : 0), 0),
  }), [activeRentals, candidateByRental])

  const depositColumns: TableColumn<DepositRow>[] = [
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
          linked: ['연결됨', COLORS.bgGreen, COLORS.success],
          candidate: ['후보 있음', COLORS.bgAmber, COLORS.warning],
          none: ['미연결', COLORS.bgRed, COLORS.danger],
          excluded: ['사유 처리', COLORS.bgViolet, '#6d28d9'],
        }
        const [label, bg, color] = m[r.status]
        return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: bg, color, whiteSpace: 'nowrap' }}>{label}</span>
      } },
    { key: 'target', label: '연결 대상', width: 170,
      sortBy: (r) => r.linked?.customer_name || r.not_rental || '',
      render: (r) => {
        if (r.status === 'linked' && r.linked) {
          return <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>
            {r.linked.customer_car_number || r.linked.vehicle_car_number || ''} {r.linked.customer_name || ''}
          </span>
        }
        if (r.status === 'excluded') {
          return <span style={{ fontSize: 12, color: '#6d28d9', whiteSpace: 'nowrap' }}>{r.not_rental}</span>
        }
        if (r.status === 'candidate') {
          const c = r.candidates[0]
          return <span style={{ fontSize: 12, color: COLORS.warning, whiteSpace: 'nowrap' }}>
            {c.customer_car_number || c.vehicle_car_number || ''} {c.customer_name || ''} ({MATCH_BY_LABEL[c.match_by] || c.match_by} 일치{r.candidates.length > 1 ? ` 외 ${r.candidates.length - 1}` : ''})
          </span>
        }
        return <span style={{ fontSize: 11, color: COLORS.textDim }}>—</span>
      } },
    { key: 'action', label: '처리', width: 96,
      render: (r) => r.status === 'linked'
        ? <button onClick={() => unlinkTx(r.id)}
            style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', background: '#fff', color: COLORS.textMuted, border: `1px solid ${COLORS.borderSubtle}` }}>해제</button>
        : <button
            onClick={() => { setModalRow(r); setRentalSearch(''); setReasonMemo('') }}
            style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}` }}
          >{r.status === 'excluded' ? '다시 보기' : '연결/정리'}</button> },
  ]

  const panelStyle: React.CSSProperties = {
    background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
    boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden',
  }

  return (
    <>
      {/* 뷰 전환 + 자동 연결 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: COLORS.borderFaint }}>
          {([['rentals', '배차건 기준'], ['deposits', '입금 목록']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              style={{
                padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                border: view === k ? `1px solid ${COLORS.borderSubtle}` : '1px solid transparent',
                background: view === k ? '#fff' : 'transparent',
                color: view === k ? COLORS.textPrimary : COLORS.textMuted,
              }}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>
          {view === 'rentals'
            ? '배차된 건마다 청구액·입금·잔액을 확인하고, 건을 열어 입금을 연결합니다'
            : '렌터카통장 입금 전체 (최근 120일)'}
        </span>
        <span style={{ flex: 1 }} />
        {view === 'rentals' && (
          <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: COLORS.borderFaint }}>
            {([['all', '전체'], ['ride', '빌려타'], ['own', '자사']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setVehClass(k)}
                title={k === 'ride' ? '라이드 소유 지입 차량 — 입금은 라이드 월 정산으로 확인' : k === 'own' ? '자사 직접 운용 차량 — 입금은 통장으로 확인' : ''}
                style={{
                  padding: '5px 11px', fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
                  border: vehClass === k ? `1px solid ${COLORS.borderSubtle}` : '1px solid transparent',
                  background: vehClass === k ? '#fff' : 'transparent',
                  color: vehClass === k ? (k === 'ride' ? '#6d28d9' : COLORS.textPrimary) : COLORS.textMuted,
                }}>{label}</button>
            ))}
          </div>
        )}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          style={{ padding: '7px 10px', borderRadius: 9, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary, background: '#fff' }}>
          <option value={120}>최근 4개월</option>
          <option value={183}>최근 6개월</option>
          <option value={365}>최근 1년</option>
        </select>
        <input ref={rideFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRideSettlement(f) }} />
        <button onClick={() => rideFileRef.current?.click()} disabled={uploading}
          style={{ background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary, cursor: uploading ? 'wait' : 'pointer' }}>
          {uploading ? '처리 중...' : '라이드 정산 업로드'}
        </button>
        <button onClick={runAutoMatch} disabled={matching}
          style={{ border: 'none', background: COLORS.primary, borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: matching ? 'wait' : 'pointer' }}>
          {matching ? '연결 중...' : '자동 연결'}
        </button>
      </div>

      {/* ── 배차건 기준 뷰 ── */}
      {view === 'rentals' && (
        <>
          {/* 라이드 정산 반영 현황 — 업로드된 정산월별 요약 */}
          {rideMonths.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px', borderRadius: 10, background: COLORS.bgViolet }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9' }}>라이드 정산 반영</span>
              {rideMonths.map((m) => (
                <span key={m.month} style={{ fontSize: 12, color: '#6d28d9' }}>
                  {m.month} · {m.count}건 · {nf(m.total)}원 (매칭 {m.matched}건{m.matched < m.count ? ` / 미매칭 ${m.count - m.matched}` : ''})
                </span>
              ))}
              <span style={{ fontSize: 11.5, color: COLORS.textMuted }}>— 빌려타 차량 건은 통장이 아닌 라이드 월 정산으로 입금 확인</span>
            </div>
          )}
          <DcToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="고객명, 차량번호 검색..."
            filters={[
              { key: 'open', label: '수납 진행', count: summaryCounts.open },
              { key: 'done', label: '완납' },
              { key: 'all', label: '전체', count: activeRentals.length },
            ]}
            activeFilter={payFilter}
            onFilterChange={setPayFilter}
          />
          <NeuDataTable
            columns={rentalColumns}
            data={rentalRows}
            rowKey={(r) => r.id}
            onRowClick={(r) => setRentalModal(r)}
            loading={loading}
            emptyIcon="🚗"
            emptyMessage="진행 중인 배차 건이 없습니다"
            defaultSort={{ key: 'dispatch', dir: 'desc' }}
          />
        </>
      )}

      {/* ── 입금 목록 뷰 (기존) ── */}
      {view === 'deposits' && (
        <>
          <DcToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="입금자, 적요 검색..."
            filters={[
              { key: 'todo', label: '처리 대상', count: (summary?.candidate ?? 0) + (summary?.none ?? 0) },
              { key: 'linked', label: '연결됨', count: summary?.linked ?? 0 },
              { key: 'excluded', label: '사유 처리', count: summary?.excluded ?? 0 },
              { key: 'all', label: '전체', count: summary?.total ?? 0 },
            ]}
            activeFilter={depositFilter}
            onFilterChange={setDepositFilter}
          />
          <NeuDataTable
            columns={depositColumns}
            data={filtered}
            rowKey={(r) => r.id}
            loading={loading}
            emptyIcon="💰"
            emptyMessage="입금 내역이 없습니다 (렌터카통장 최근 120일)"
            defaultSort={{ key: 'date', dir: 'desc' }}
          />
        </>
      )}

      {/* ═══ 배차건 상세 — 이 건의 입금만 (2026-08-01 신설) ═══ */}
      {rentalModal && (() => {
        const linked = linkedByRental.get(rentalModal.id) || []
        const cands = candidateByRental.get(rentalModal.id) || []
        const others = unlinkedRows.filter((d) => !cands.some((c) => c.id === d.id)).slice(0, 30)
        const label = `${rentalModal.customer_name || ''} ${rentalModal.customer_car_number || rentalModal.vehicle_car_number || ''}`.trim()
        const ps = PAY_META[payState(rentalModal)]
        return (
          <>
            <div onClick={() => !busy && setRentalModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.24)', zIndex: 200 }} />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '94vw', zIndex: 210,
              background: '#fff', borderLeft: `1px solid ${COLORS.borderSubtle}`,
              boxShadow: '-12px 0 32px rgba(16,24,40,0.08)', padding: 20, overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>{rentalModal.customer_name || '고객 미상'} — 입금 현황</h2>
                <button onClick={() => setRentalModal(null)}
                  style={{ border: 'none', background: COLORS.borderFaint, borderRadius: 8, width: 30, height: 30, fontSize: 15, color: COLORS.textSecondary, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginBottom: 14 }}>
                대차 {rentalModal.vehicle_car_number || '—'} · 고객차 {rentalModal.customer_car_number || '—'} · {rentalModal.insurance_company || '보험사 미정'}
              </div>

              {/* 수납 요약 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { k: '청구액', v: rentalModal.claim_amount != null ? `${nf(rentalModal.claim_amount)}원` : '미정' },
                  { k: '입금 누계', v: `${nf(totalPaid(rentalModal))}원` },
                  { k: '잔액', v: rentalModal.claim_amount != null ? `${nf(Math.max(rentalModal.claim_amount - totalPaid(rentalModal), 0))}원` : '—' },
                ].map((c, i) => (
                  <div key={i} style={{ background: COLORS.bgGray, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{c.k}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 2 }}>{c.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: ps.bg, color: ps.fg }}>{ps.label}</span>
                {rentalModal.ride_sum > 0 && (
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: COLORS.bgViolet, color: '#6d28d9' }}>
                    라이드 일괄 정산분 {nf(rentalModal.ride_sum)}원 포함
                  </span>
                )}
              </div>

              {/* 라이드 정산분 (빌려타 차량) */}
              {rentalModal.ride_items.length > 0 && (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>라이드 정산분 {rentalModal.ride_items.length}건</div>
                  {rentalModal.ride_items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: '1px solid #ddd6fe', background: COLORS.bgViolet, marginBottom: 6 }}>
                      <div style={{ flex: 1, fontSize: 12.5 }}>
                        <b>{nf(it.amount)}원</b> · {it.insurer || '보험사 미상'}
                        <span style={{ color: COLORS.textMuted, fontSize: 11.5 }}>
                          {' '}· {it.deposit_date ? String(it.deposit_date).slice(0, 10) : '—'} · {it.settle_month} 정산
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {rentalModal.vehicle_class === 'ride' && rentalModal.ride_items.length === 0 && (
                <div style={{ fontSize: 12, color: '#6d28d9', background: COLORS.bgViolet, borderRadius: 9, padding: '8px 10px', marginBottom: 12 }}>
                  빌려타(라이드 소유) 차량 — 입금은 통장이 아닌 라이드 월 정산 업로드로 확인됩니다
                </div>
              )}

              {/* 연결된 입금 */}
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>연결된 입금 {linked.length}건{rentalModal.vehicle_class === 'ride' ? ' (통장)' : ''}</div>
              {linked.length === 0 && <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>아직 연결된 입금이 없습니다 (최근 120일 기준)</div>}
              {linked.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: `1px solid ${COLORS.borderGreen}`, background: COLORS.bgGreen, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 12.5 }}>
                    <b>{nf(d.amount)}원</b> · {d.client_name || '입금자 미상'}
                    <span style={{ color: COLORS.textMuted, fontSize: 11.5 }}> · {String(d.transaction_date).slice(0, 10)}</span>
                  </div>
                  <button disabled={busy} onClick={() => unlinkTx(d.id)}
                    style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', background: '#fff', color: COLORS.textMuted, border: `1px solid ${COLORS.borderSubtle}` }}>해제</button>
                </div>
              ))}

              {/* 이 건에 맞는 후보 입금 */}
              <div style={{ fontSize: 12.5, fontWeight: 700, margin: '14px 0 6px' }}>이 건에 맞는 후보 입금 {cands.length}건</div>
              {cands.length === 0 && <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>자동 매칭된 후보가 없습니다 — 아래 미연결 입금에서 직접 연결하세요</div>}
              {cands.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: `1px solid ${COLORS.borderAmber}`, background: COLORS.bgAmber, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 12.5 }}>
                    <b>{nf(d.amount)}원</b> · {d.client_name || '입금자 미상'}
                    <span style={{ color: COLORS.textMuted, fontSize: 11.5 }}> · {String(d.transaction_date).slice(0, 10)}</span>
                    {d.description ? <div style={{ fontSize: 11, color: COLORS.textMuted }}>{d.description}</div> : null}
                  </div>
                  <button disabled={busy} onClick={() => linkRental(d.id, rentalModal.id, label)}
                    style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', background: COLORS.primary, color: '#fff', border: 'none' }}>연결</button>
                </div>
              ))}

              {/* 그 외 미연결 입금 (직접 연결) */}
              <details style={{ marginTop: 14 }}>
                <summary style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>
                  그 외 미연결 입금에서 직접 찾기 ({others.length}건 표시)
                </summary>
                <div style={{ marginTop: 8 }}>
                  {others.map((d) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderFaint}`, marginBottom: 5 }}>
                      <div style={{ flex: 1, fontSize: 12 }}>
                        <b>{nf(d.amount)}원</b> · {d.client_name || '입금자 미상'}
                        <span style={{ color: COLORS.textMuted, fontSize: 11 }}> · {String(d.transaction_date).slice(0, 10)}</span>
                      </div>
                      <button disabled={busy} onClick={() => linkRental(d.id, rentalModal.id, label)}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}` }}>연결</button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </>
        )
      })()}

      {/* ═══ 입금 연결/사유 모달 (입금 목록 뷰) ═══ */}
      {modalRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.24)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !busy && setModalRow(null)}>
          <div style={{ ...panelStyle, borderRadius: 14, padding: 20, width: 560, maxWidth: '92vw', maxHeight: '84vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>입금 연결</div>
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
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, border: `1px solid ${COLORS.borderAmber}`, marginBottom: 6, background: COLORS.bgAmber }}>
                    <div style={{ fontSize: 12 }}>
                      <b>{c.customer_name || '-'}</b> · 고객차 {c.customer_car_number || '-'} · 대차 {c.vehicle_car_number || '-'}
                      <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                        {c.insurance_company || ''} {c.claim_amount ? `· 청구 ${nf(c.claim_amount)}원` : ''} · {MATCH_BY_LABEL[c.match_by] || c.match_by} 일치
                      </div>
                    </div>
                    <button disabled={busy} onClick={() => linkRental(modalRow.id, c.id, `${c.customer_name || ''} ${c.customer_car_number || ''}`)}
                      style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', background: COLORS.primary, color: '#fff', border: 'none' }}>연결</button>
                  </div>
                ))}
              </div>
            )}

            {/* 직접 검색 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>대차건 직접 찾기</div>
              <input value={rentalSearch} onChange={(e) => setRentalSearch(e.target.value)} placeholder="고객명 또는 차량번호 2자 이상"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: COLORS.bgGray, border: `1px solid ${COLORS.borderSubtle}` }} />
              {rentalSearchResults.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, marginTop: 6 }}>
                  <div style={{ fontSize: 12 }}>
                    <b>{r.customer_name || '-'}</b> · 고객차 {r.customer_car_number || '-'} · 대차 {r.vehicle_car_number || '-'}
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}> {r.dispatch_date ? `· ${String(r.dispatch_date).slice(0, 10)}` : ''}</span>
                  </div>
                  <button disabled={busy} onClick={() => linkRental(modalRow.id, r.id, `${r.customer_name || ''} ${r.customer_car_number || ''}`)}
                    style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}` }}>연결</button>
                </div>
              ))}
            </div>

            {/* 대차 입금 아님 — 사유 */}
            <div style={{ paddingTop: 12, borderTop: `1px dashed ${COLORS.borderSubtle}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>대차 입금이 아니면 — 사유 남기기 (관리자가 이어받아 처리)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {REASONS.map((rs) => (
                  <button key={rs} onClick={() => setReasonPick(rs)}
                    style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                      background: reasonPick === rs ? COLORS.bgViolet : '#fff',
                      color: reasonPick === rs ? '#6d28d9' : COLORS.textSecondary,
                      border: reasonPick === rs ? '1.5px solid #7c3aed' : `1px solid ${COLORS.borderSubtle}` }}>{rs}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={reasonMemo} onChange={(e) => setReasonMemo(e.target.value)} placeholder="메모 (선택)"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12, outline: 'none', background: COLORS.bgGray, border: `1px solid ${COLORS.borderSubtle}` }} />
                <button disabled={busy} onClick={() => saveReason(modalRow.id)}
                  style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: '#6d28d9', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>사유 저장</button>
              </div>
              {modalRow.status === 'excluded' && (
                <button disabled={busy} onClick={async () => {
                  const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
                  await fetch(`/api/transactions/${modalRow.id}`, { method: 'PATCH', headers, body: JSON.stringify({ not_rental: null }) })
                  setModalRow(null); load()
                }} style={{ marginTop: 8, fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: '#fff', color: COLORS.danger, border: `1px solid ${COLORS.borderRed}` }}>사유 해제 (다시 검수 대상으로)</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
