'use client'

// ═══════════════════════════════════════════════════════════════
// 장기계약 — A안 확정 구조 (2026-07-30, CONTRACT-UNIFY-A-PLAN)
//   "영업의 흐름 — 견적을 보내고, 계약으로 만들고, 수납과 만기를 관리"
//   탭: 원장 · 만기 관리 · 신차 카탈로그
//   (견적은 2026-08-02 별도 페이지 /quotes 로 분리 — 임의 견적 보관,
//    계약 등록 패널의 「견적 불러오기」로 연결)
//   개편 원칙(rebuild-fresh): 페이지 골격·원장·만기 뷰는 백지 재작성,
//   카탈로그는 기존 컴포넌트 재사용 (데이터 계층 동일).
//   등록/수정은 모달 대신 우측 슬라이드 패널 (REDESIGN 4장 원칙 4)
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import NeuFilterTabs from '@/app/components/NeuFilterTabs'
import DcToolbar from '@/app/components/DcToolbar'
import NeuDataTable, { TableColumn, MobileCardConfig } from '@/app/components/NeuDataTable'
import { COLORS } from '@/app/utils/ui-tokens'
import NewCarCatalogTab from './_components/NewCarCatalogTab'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fmi_token') : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

type Rental = {
  id: string
  vehicle_id: string | null
  vehicle_car_number: string | null
  vehicle_brand: string | null
  vehicle_model: string | null
  vehicle_spec: string | null
  customer_name: string
  customer_phone: string | null
  contract_no: string | null
  start_date: string | null
  end_date: string | null
  monthly_fee: number | null
  deposit: number | null
  status: 'active' | 'expired' | 'terminated' | string
  contract_type: string | null
  notes: string | null
}

type TopTab = 'ledger' | 'expiry' | 'catalog'

// 견적 불러오기 — /quotes 에 보관된 임의 견적을 계약 등록 시 선택
type QuotePick = {
  id: string
  quote_no: string | null
  status: string
  customer_name: string
  customer_phone: string | null
  vehicle_car_number: string | null
  vehicle_brand: string | null
  vehicle_model: string | null
  vehicle_trim: string | null
  months: number | null
  monthly_fee: number | null
}

const emptyForm = {
  contract_type: '기존차량',
  vehicle_spec: '',
  vehicle_car_number: '',
  customer_name: '',
  customer_phone: '',
  contract_no: '',
  start_date: '',
  end_date: '',
  monthly_fee: '',
  deposit: '',
  status: 'active',
  notes: '',
}

const won = (n: number | null | undefined) => n != null ? Number(n).toLocaleString('ko-KR') : '—'
const fmtDate = (d: string | null) => d ? String(d).slice(0, 10) : '—'

function daysUntil(d: string | null): number | null {
  if (!d) return null
  const end = new Date(String(d).slice(0, 10) + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

function StatusBadge({ r }: { r: Rental }) {
  const dday = daysUntil(r.end_date)
  if (r.status === 'terminated') return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.borderFaint, color: COLORS.textSecondary }}>해지</span>
  if (r.status === 'expired') return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.borderFaint, color: COLORS.textMuted }}>종료</span>
  if (dday !== null && dday <= 30) return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.bgAmber, color: COLORS.warning }}>만기 D-{Math.max(dday, 0)}</span>
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: COLORS.bgGreen, color: COLORS.success }}>운영중</span>
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
  fontSize: 13, outline: 'none', background: '#f6f7f9', color: COLORS.textPrimary, fontFamily: 'inherit',
}
const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4, display: 'block' }

export default function LongTermPage() {
  const router = useRouter()
  const [topTab, setTopTab] = useState<TopTab>('ledger')
  const [rentals, setRentals] = useState<Rental[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active') // active | expiring | expired | terminated | all
  const [quoteCounts, setQuoteCounts] = useState<{ draft: number; sent: number; accepted: number } | null>(null)
  const [quoteList, setQuoteList] = useState<QuotePick[]>([])

  // 등록/수정 슬라이드 패널
  const [panelOpen, setPanelOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [panelMsg, setPanelMsg] = useState<string | null>(null)
  const [delTarget, setDelTarget] = useState<Rental | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((m: { type: 'ok' | 'err'; text: string }) => {
    setToast(m)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const [rRes, qRes] = await Promise.all([
        fetch('/api/long-term-rentals?status=all', { headers }),
        fetch('/api/lt-quotes?status=all', { headers }),
      ])
      const rJson = await rRes.json().catch(() => ({}))
      if (Array.isArray(rJson?.data)) {
        setRentals(rJson.data.map((r: any) => ({ ...r, monthly_fee: r.monthly_fee != null ? Number(r.monthly_fee) : null, deposit: r.deposit != null ? Number(r.deposit) : null })))
      }
      const qJson = await qRes.json().catch(() => ({}))
      if (Array.isArray(qJson?.data)) {
        const qs = qJson.data as QuotePick[]
        setQuoteCounts({
          draft: qs.filter(q => q.status === 'draft').length,
          sent: qs.filter(q => q.status === 'sent').length,
          accepted: qs.filter(q => q.status === 'accepted').length,
        })
        // 계약 전환 전 견적만 불러오기 후보로 (전환 완료 제외)
        setQuoteList(qs.filter(q => q.status !== 'converted' && q.status !== 'rejected'))
      }
    } catch { /* 네트워크 오류 — 빈 상태 유지 */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const active = useMemo(() => rentals.filter(r => r.status === 'active'), [rentals])
  const expiring = useMemo(() => active.filter(r => { const d = daysUntil(r.end_date); return d !== null && d >= 0 && d <= 30 }), [active])
  const monthlyTotal = useMemo(() => active.reduce((s, r) => s + (r.monthly_fee || 0), 0), [active])
  const quoteInProgress = quoteCounts ? quoteCounts.draft + quoteCounts.sent + quoteCounts.accepted : null

  // ── 원장 탭 필터링 ──
  const filtered = useMemo(() => {
    let data = rentals
    if (statusFilter === 'active') data = data.filter(r => r.status === 'active')
    else if (statusFilter === 'expiring') data = expiring
    else if (statusFilter === 'expired') data = data.filter(r => r.status === 'expired')
    else if (statusFilter === 'terminated') data = data.filter(r => r.status === 'terminated')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      data = data.filter(r =>
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.vehicle_car_number || '').toLowerCase().includes(q) ||
        (r.contract_no || '').toLowerCase().includes(q))
    }
    return data
  }, [rentals, statusFilter, search, expiring])

  // ── 등록/수정 ──
  const openCreate = useCallback(() => {
    setEditId(null); setForm({ ...emptyForm }); setPanelMsg(null); setPanelOpen(true)
  }, [])
  const openEdit = useCallback((r: Rental) => {
    setEditId(r.id)
    setForm({
      contract_type: r.contract_type || '기존차량',
      vehicle_spec: r.vehicle_spec || '',
      vehicle_car_number: r.vehicle_car_number || '',
      customer_name: r.customer_name || '',
      customer_phone: r.customer_phone || '',
      contract_no: r.contract_no || '',
      start_date: r.start_date ? String(r.start_date).slice(0, 10) : '',
      end_date: r.end_date ? String(r.end_date).slice(0, 10) : '',
      monthly_fee: r.monthly_fee != null ? String(r.monthly_fee) : '',
      deposit: r.deposit != null ? String(r.deposit) : '',
      status: r.status || 'active',
      notes: r.notes || '',
    })
    setPanelMsg(null); setPanelOpen(true)
  }, [])

  const save = useCallback(async () => {
    if (!form.customer_name.trim()) { setPanelMsg('고객명은 필수입니다'); return }
    setSaving(true); setPanelMsg(null)
    try {
      const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
      const body = {
        contract_type: form.contract_type || '기존차량',
        vehicle_spec: form.vehicle_spec.trim() || null,
        vehicle_car_number: form.vehicle_car_number.trim() || null,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        contract_no: form.contract_no.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        monthly_fee: form.monthly_fee === '' ? null : Number(form.monthly_fee),
        deposit: form.deposit === '' ? null : Number(form.deposit),
        status: form.status,
        notes: form.notes.trim() || null,
      }
      const url = editId ? `/api/long-term-rentals/${editId}` : '/api/long-term-rentals'
      const res = await fetch(url, { method: editId ? 'PATCH' : 'POST', headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '저장 실패')
      setPanelOpen(false)
      showToast({ type: 'ok', text: editId ? '계약을 수정했습니다' : '계약을 등록했습니다' })
      load()
    } catch (e: any) {
      setPanelMsg(e?.message || '저장 오류')
    } finally {
      setSaving(false)
    }
  }, [form, editId, load, showToast])

  const runDelete = useCallback(async () => {
    if (!delTarget) return
    setDelBusy(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/long-term-rentals/${delTarget.id}`, { method: 'DELETE', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) throw new Error(json?.error || '삭제 실패')
      showToast({ type: 'ok', text: '계약을 삭제했습니다' })
      setDelTarget(null)
      load()
    } catch (e: any) {
      showToast({ type: 'err', text: e?.message || '삭제 오류' })
    } finally {
      setDelBusy(false)
    }
  }, [delTarget, load, showToast])

  const columns: TableColumn<Rental>[] = [
    { key: 'customer', label: '고객',
      sortBy: (r) => r.customer_name || '',
      render: (r) => (
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.customer_name}</div>
          {r.customer_phone && <div style={{ fontSize: 11.5, color: COLORS.textMuted }}>{r.customer_phone}</div>}
        </div>
      ) },
    { key: 'vehicle', label: '차량', width: 170,
      sortBy: (r) => r.vehicle_car_number || '',
      render: (r) => r.vehicle_car_number ? (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{r.vehicle_car_number}</div>
          {(r.vehicle_brand || r.vehicle_model) && <div style={{ fontSize: 11.5, color: COLORS.textMuted }}>{[r.vehicle_brand, r.vehicle_model].filter(Boolean).join(' ')}</div>}
        </div>
      ) : <span style={{ color: COLORS.textDim }}>{r.vehicle_spec || '—'}</span> },
    { key: 'contract_no', label: '계약번호', width: 110,
      sortBy: (r) => r.contract_no || '',
      render: (r) => <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{r.contract_no || '—'}</span>,
      hideOnMobile: true },
    { key: 'period', label: '기간', width: 185,
      sortBy: (r) => r.end_date || '',
      render: (r) => <span style={{ fontSize: 12.5, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>{fmtDate(r.start_date)} ~ {fmtDate(r.end_date)}</span> },
    { key: 'monthly_fee', label: '월 렌트료', width: 105, align: 'right',
      sortBy: (r) => r.monthly_fee || 0,
      render: (r) => <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{won(r.monthly_fee)}</span> },
    { key: 'deposit', label: '보증금', width: 95, align: 'right',
      sortBy: (r) => r.deposit || 0,
      render: (r) => <span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{won(r.deposit)}</span>,
      hideOnMobile: true },
    { key: 'status', label: '상태', width: 95, align: 'center',
      sortBy: (r) => r.status,
      render: (r) => <StatusBadge r={r} /> },
    { key: 'actions', label: '', width: 90, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); openEdit(r) }}
            style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 7, padding: '3px 9px', fontSize: 11.5, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>수정</button>
          <button onClick={(e) => { e.stopPropagation(); setDelTarget(r) }}
            style={{ border: `1px solid ${COLORS.borderRed}`, background: '#fff', borderRadius: 7, padding: '3px 9px', fontSize: 11.5, fontWeight: 600, color: COLORS.danger, cursor: 'pointer' }}>삭제</button>
        </span>
      ) },
  ]

  const mobile: MobileCardConfig<Rental> = {
    title: (r) => <span>{r.customer_name} · {r.vehicle_car_number || '차량 미지정'}</span>,
    subtitle: (r) => <span>{fmtDate(r.start_date)} ~ {fmtDate(r.end_date)}</span>,
    trailing: (r) => <span style={{ fontWeight: 700 }}>{won(r.monthly_fee)}원</span>,
    badges: (r) => <StatusBadge r={r} />,
  }

  // ── 만기 관리 탭 — 60일 이내 ──
  const expiryList = useMemo(() =>
    active
      .map(r => ({ r, d: daysUntil(r.end_date) }))
      .filter(x => x.d !== null && x.d <= 60)
      .sort((a, b) => (a.d as number) - (b.d as number)),
  [active])

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, color: COLORS.textPrimary, fontSize: 14 }}>
      {/* 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 21, letterSpacing: '-0.02em', fontWeight: 700 }}>장기계약</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>견적을 보내고, 계약으로 만들고, 수납과 만기를 관리합니다</p>
        </div>
        <button onClick={openCreate}
          style={{ background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + 계약 등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: '운영중 계약', dot: COLORS.success, value: loading ? '—' : `${active.length}건`, onClick: undefined as undefined | (() => void) },
          { label: '만기 임박 (30일)', dot: COLORS.warning, value: loading ? '—' : `${expiring.length}건`, onClick: () => { setTopTab('ledger'); setStatusFilter('expiring') } },
          { label: '월 렌트료 합계', dot: COLORS.info, value: loading ? '—' : `${won(monthlyTotal)}원`, onClick: undefined },
          { label: '진행중 견적', dot: '#7c3aed', value: quoteInProgress === null ? '—' : `${quoteInProgress}건`, onClick: () => router.push('/quotes') },
        ].map((c, i) => (
          <div key={i} onClick={c.onClick}
            style={{ background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', cursor: c.onClick ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 12.5, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />{c.label}
            </div>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 5 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <NeuFilterTabs
        tabs={[
          { key: 'ledger', label: '원장', count: rentals.length },
          { key: 'expiry', label: '만기 관리', count: expiryList.length },
          { key: 'catalog', label: '신차 카탈로그' },
        ]}
        activeKey={topTab}
        onSelect={(k) => setTopTab(k as TopTab)}
      />

      {/* ── 원장 ── */}
      {topTab === 'ledger' && (
        <>
          <DcToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="고객명, 차량번호, 계약번호 검색..."
            filters={[
              { key: 'active', label: '운영중', count: active.length },
              { key: 'expiring', label: '만기임박', count: expiring.length },
              { key: 'expired', label: '종료' },
              { key: 'terminated', label: '해지' },
              { key: 'all', label: '전체', count: rentals.length },
            ]}
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
          />
          <NeuDataTable
            columns={columns}
            data={filtered}
            rowKey={(r) => r.id}
            mobileCard={mobile}
            loading={loading}
            emptyIcon="📄"
            emptyMessage="장기계약이 없습니다 — 견적 메뉴에서 견적을 만들고 수락되면 계약으로 전환됩니다"
            defaultSort={{ key: 'period', dir: 'asc' }}
          />
        </>
      )}

      {/* ── 만기 관리 ── */}
      {topTab === 'expiry' && (
        <div style={{ background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12, boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 700, padding: '13px 16px', borderBottom: `1px solid ${COLORS.borderFaint}` }}>
            60일 이내 만기 {expiryList.length}건 — 연장 협의 또는 재견적이 필요합니다
          </div>
          {loading && <div style={{ padding: '28px 16px', color: COLORS.textMuted, fontSize: 13 }}>불러오는 중...</div>}
          {!loading && expiryList.length === 0 && (
            <div style={{ padding: '28px 16px', color: COLORS.textMuted, fontSize: 13 }}>60일 이내 만기 계약이 없습니다</div>
          )}
          {expiryList.map(({ r, d }) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: `1px solid ${COLORS.borderFaint}` }}>
              <span style={{
                minWidth: 52, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 8,
                background: (d as number) <= 14 ? COLORS.bgRed : COLORS.bgAmber,
                color: (d as number) <= 14 ? COLORS.danger : COLORS.warning,
              }}>{(d as number) < 0 ? '만료' : `D-${d}`}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b style={{ fontSize: 13.5 }}>{r.customer_name} · {r.vehicle_car_number || '차량 미지정'}</b>
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                  {fmtDate(r.end_date)} 만기 · 월 {won(r.monthly_fee)}원{r.customer_phone ? ` · ${r.customer_phone}` : ''}
                </div>
              </div>
              <button
                onClick={() => router.push('/quotes')}
                style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >재견적</button>
            </div>
          ))}
        </div>
      )}

      {/* ── 신차 카탈로그 (기존 컴포넌트 재사용) ── */}
      {topTab === 'catalog' && <NewCarCatalogTab />}

      {/* ═══ 등록/수정 슬라이드 패널 ═══ */}
      {panelOpen && (
        <>
          <div onClick={() => setPanelOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.24)', zIndex: 90 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '92vw', zIndex: 95,
            background: '#fff', borderLeft: `1px solid ${COLORS.borderSubtle}`,
            boxShadow: '-12px 0 32px rgba(16,24,40,0.08)', padding: 24, overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>{editId ? '계약 수정' : '계약 등록'}</h2>
              <button onClick={() => setPanelOpen(false)}
                style={{ border: 'none', background: COLORS.borderFaint, borderRadius: 8, width: 30, height: 30, fontSize: 15, color: COLORS.textSecondary, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ color: COLORS.textMuted, fontSize: 12.5, marginBottom: 18 }}>장기계약 원장에 기록됩니다. 고객명만 필수입니다.</p>

            {/* 견적 불러오기 — /quotes 에 보관된 임의 견적으로 폼 채우기 (신규 등록 시만) */}
            {!editId && quoteList.length > 0 && (
              <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: COLORS.bgViolet }}>
                <label style={{ ...fieldLabel, color: '#6d28d9' }}>견적 불러오기 (선택)</label>
                <select style={inputStyle} defaultValue=""
                  onChange={e => {
                    const q = quoteList.find(x => x.id === e.target.value)
                    if (!q) return
                    const spec = [q.vehicle_brand, q.vehicle_model, q.vehicle_trim].filter(Boolean).join(' ')
                    setForm(f => ({
                      ...f,
                      customer_name: q.customer_name && q.customer_name !== '미정' ? q.customer_name : f.customer_name,
                      customer_phone: q.customer_phone || f.customer_phone,
                      vehicle_car_number: q.vehicle_car_number || f.vehicle_car_number,
                      vehicle_spec: spec || f.vehicle_spec,
                      contract_type: q.vehicle_car_number ? '기존차량' : '신차출고',
                      monthly_fee: q.monthly_fee != null ? String(q.monthly_fee) : f.monthly_fee,
                      notes: f.notes || `견적 ${q.quote_no || q.id.slice(0, 8)} 에서 불러옴${q.months ? ` (${q.months}개월)` : ''}`,
                    }))
                  }}>
                  <option value="">— 견적을 선택하면 아래 항목이 채워집니다 —</option>
                  {quoteList.map(q => (
                    <option key={q.id} value={q.id}>
                      {[q.quote_no, q.customer_name, [q.vehicle_brand, q.vehicle_model].filter(Boolean).join(' '),
                        q.monthly_fee != null ? `월 ${won(q.monthly_fee)}원` : null].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabel}>고객명 *</label>
                  <input style={inputStyle} value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="예: ㈜잠실에너지" />
                </div>
                <div>
                  <label style={fieldLabel}>연락처</label>
                  <input style={inputStyle} value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="010-0000-0000" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabel}>계약 유형</label>
                  <select style={inputStyle} value={form.contract_type} onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))}>
                    <option value="기존차량">기존차량</option>
                    <option value="신차출고">신차출고</option>
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>차량번호</label>
                  <input style={inputStyle} value={form.vehicle_car_number} onChange={e => setForm(f => ({ ...f, vehicle_car_number: e.target.value }))} placeholder="예: 34가1234" />
                </div>
              </div>
              <div>
                <label style={fieldLabel}>차량 사양 (신차출고 시)</label>
                <input style={inputStyle} value={form.vehicle_spec} onChange={e => setForm(f => ({ ...f, vehicle_spec: e.target.value }))} placeholder="예: 팰리세이드 캘리그래피 2.5T" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabel}>계약 시작일</label>
                  <input type="date" style={inputStyle} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label style={fieldLabel}>만기일</label>
                  <input type="date" style={inputStyle} value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabel}>월 렌트료 (원)</label>
                  <input type="number" style={inputStyle} value={form.monthly_fee} onChange={e => setForm(f => ({ ...f, monthly_fee: e.target.value }))} placeholder="1250000" />
                </div>
                <div>
                  <label style={fieldLabel}>보증금 (원)</label>
                  <input type="number" style={inputStyle} value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))} placeholder="3000000" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabel}>계약번호</label>
                  <input style={inputStyle} value={form.contract_no} onChange={e => setForm(f => ({ ...f, contract_no: e.target.value }))} placeholder="선택 입력" />
                </div>
                <div>
                  <label style={fieldLabel}>상태</label>
                  <select style={inputStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">운영중</option>
                    <option value="expired">종료</option>
                    <option value="terminated">해지</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={fieldLabel}>메모</label>
                <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {panelMsg && (
                <div style={{ padding: '9px 12px', borderRadius: 8, background: COLORS.bgRed, color: COLORS.danger, fontSize: 12.5, fontWeight: 600 }}>{panelMsg}</div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button onClick={() => setPanelOpen(false)}
                  style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>취소</button>
                <button onClick={save} disabled={saving}
                  style={{ border: 'none', background: COLORS.primary, borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? '저장 중...' : editId ? '수정 저장' : '등록'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ 삭제 확인 ═══ */}
      {delTarget && (
        <>
          <div onClick={() => setDelTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.24)', zIndex: 90 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 95,
            background: '#fff', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 12,
            boxShadow: '0 8px 24px rgba(16,24,40,0.18)', padding: 22, width: 360, maxWidth: '90vw',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>계약 삭제</div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>
              {delTarget.customer_name} · {delTarget.vehicle_car_number || '차량 미지정'} 계약을 삭제할까요? 되돌릴 수 없습니다.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDelTarget(null)}
                style={{ border: `1px solid ${COLORS.borderSubtle}`, background: '#fff', borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>취소</button>
              <button onClick={runDelete} disabled={delBusy}
                style={{ border: 'none', background: COLORS.danger, borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: delBusy ? 'wait' : 'pointer', opacity: delBusy ? 0.7 : 1 }}>
                {delBusy ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ 토스트 ═══ */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 99,
          background: toast.type === 'ok' ? COLORS.textPrimary : COLORS.danger, color: '#fff',
          padding: '11px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        }}>{toast.text}</div>
      )}
    </div>
  )
}
