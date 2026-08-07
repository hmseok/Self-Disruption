'use client'

// ═══════════════════════════════════════════════════════════════
// 타이어 판매 모듈 (2026-08-07 신설)
// 흐름: 판매내역 등록/보강 → 기간·건 선택 청구서 발행(인쇄) → KB 516551 입금 매칭
// 매입(블랙서클→우리3582 자동출금)은 장부에서 수집 — 파서 연동은 주문 문자 샘플 후속
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react'
import DcStatStrip from '@/app/components/DcStatStrip'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'

const nf = (n: number) => (Number(n) || 0).toLocaleString()
type TabKey = 'sales' | 'invoices' | 'deposits' | 'catalog' | 'customers'

const FULFILL_OPTIONS = [
  ['', '—'], ['received', '접수'], ['confirmed', '확정'],
  ['ordered', '주문완료'], ['shipping', '배송중'], ['done', '완료'],
] as const

interface SaleRow {
  id: string; sale_date: string; customer_name: string | null; customer_phone: string | null
  car_number: string | null; item_name: string | null; spec: string | null
  qty: number; unit_price: number; amount: number; purchase_cost: number | null
  invoice_id: string | null; status: string; source: string; memo: string | null
}
interface InvoiceRow {
  id: string; invoice_no: string; customer_name: string | null
  period_from: string | null; period_to: string | null
  line_count: number; total: number; status: string
  issued_at: string | null; paid_at: string | null; deposit_tx_id: string | null
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  requested: { label: '신청', bg: 'rgba(191,219,254,0.6)', color: '#2563eb' },
  unbilled: { label: '미청구', bg: 'rgba(254,202,202,0.5)', color: '#dc2626' },
  billed:   { label: '청구됨', bg: 'rgba(253,230,138,0.5)', color: '#b45309' },
  paid:     { label: '입금완료', bg: 'rgba(167,243,208,0.5)', color: '#059669' },
  issued:   { label: '발행', bg: 'rgba(253,230,138,0.5)', color: '#b45309' },
  void:     { label: '취소', bg: 'rgba(226,232,240,0.7)', color: '#94a3b8' },
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700 }
const td: React.CSSProperties = { padding: '9px 12px', color: '#1e293b' }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #e6e8ec', fontSize: 12,
  background: '#fff', color: '#1e293b', outline: 'none',
}

function StatusBadge({ s }: { s: string }) {
  const v = STATUS_LABEL[s] || { label: s, bg: '#f1f5f9', color: '#64748b' }
  return <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: v.bg, color: v.color }}>{v.label}</span>
}

export default function TirePage() {
  const [tab, setTab] = useState<TabKey>('sales')

  // ── 판매내역 ──
  const [sales, setSales] = useState<SaleRow[]>([])
  const [salesSummary, setSalesSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const emptyForm = { sale_date: new Date().toISOString().slice(0, 10), customer_name: '', customer_phone: '', car_number: '', delivery_address: '', item_name: '', spec: '', qty: '1', unit_price: '', amount: '', purchase_cost: '', memo: '' }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── 청구서 ──
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])

  // ── 입금확인 ──
  const [deposits, setDeposits] = useState<any[]>([])
  const [waiting, setWaiting] = useState<any[]>([])

  // ── 카탈로그 ──
  const [catalog, setCatalog] = useState<any[]>([])
  const [catQ, setCatQ] = useState('')
  const [catBrand, setCatBrand] = useState('')
  const [catW, setCatW] = useState('')
  const [catR, setCatR] = useState('')
  const [catRim, setCatRim] = useState('')

  // ── 거래처 ──
  const [customers, setCustomers] = useState<any[]>([])
  const [custForm, setCustForm] = useState({ name: '', phone: '', memo: '' })
  const [showCustForm, setShowCustForm] = useState(false)

  // ── 발주 (블랙서클) ──
  const [orderModal, setOrderModal] = useState<any>(null)   // {sale, catalog, options}
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderPick, setOrderPick] = useState('')
  const [orderSubmitting, setOrderSubmitting] = useState(false)
  const [orderDone, setOrderDone] = useState<any>(null)

  const [ordersSyncing, setOrdersSyncing] = useState(false)

  // ── 블랙서클 연동 ──
  const [bc, setBc] = useState<any>(null)
  const [bcForm, setBcForm] = useState({ id: '', password: '' })
  const [bcMargin, setBcMargin] = useState('')
  const [bcSyncing, setBcSyncing] = useState(false)

  const loadSales = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (q) params.set('q', q)
      const { ok, json } = await fetchWithAuth(`/api/tire/sales?${params}`)
      if (ok) { setSales(json.rows || []); setSalesSummary(json.summary || null) }
    } finally { setLoading(false) }
  }, [statusFilter, q])

  const loadInvoices = useCallback(async () => {
    const { ok, json } = await fetchWithAuth('/api/tire/invoices')
    if (ok) setInvoices(json.rows || [])
  }, [])

  const loadDeposits = useCallback(async () => {
    const { ok, json } = await fetchWithAuth('/api/tire/deposits?days=180')
    if (ok) { setDeposits(json.rows || []); setWaiting(json.waiting || []) }
  }, [])

  const loadCatalog = useCallback(async () => {
    const { ok, json } = await fetchWithAuth('/api/tire/catalog?admin=1')
    if (ok) setCatalog(json.rows || [])
  }, [])

  const loadCustomers = useCallback(async () => {
    const { ok, json } = await fetchWithAuth('/api/tire/customers')
    if (ok) setCustomers(json.rows || [])
  }, [])

  const loadBc = useCallback(async () => {
    const { ok, json } = await fetchWithAuth('/api/tire/blackcircle')
    if (ok) { setBc(json); setBcForm(f => ({ ...f, id: json.id || '' })); setBcMargin(json.marginPercent || '') }
  }, [])

  useEffect(() => { loadSales() }, [loadSales])
  useEffect(() => {
    if (tab === 'invoices') loadInvoices()
    if (tab === 'deposits') { loadDeposits(); loadInvoices() }
    if (tab === 'catalog') { loadCatalog(); loadBc() }
    if (tab === 'customers') loadCustomers()
  }, [tab, loadInvoices, loadDeposits, loadCatalog, loadCustomers, loadBc])

  const saveSale = async () => {
    if (!form.sale_date) { alert('판매일을 입력하세요'); return }
    setSaving(true)
    try {
      const body: any = { ...form }
      if (editingId) {
        body.id = editingId
        await fetchWithAuth('/api/tire/sales', { method: 'PATCH', body })
      } else {
        await fetchWithAuth('/api/tire/sales', { method: 'POST', body })
      }
      setShowAdd(false); setForm(emptyForm); setEditingId(null)
      loadSales()
    } finally { setSaving(false) }
  }

  const deleteSale = async (id: string) => {
    if (!confirm('이 판매 건을 삭제할까요?')) return
    const { ok, json } = await fetchWithAuth(`/api/tire/sales?id=${id}`, { method: 'DELETE' })
    if (!ok) alert(json.error || '삭제 실패')
    loadSales()
  }

  const issueInvoice = async () => {
    if (selected.size === 0) { alert('청구할 판매 건을 선택하세요'); return }
    const picked = sales.filter(s => selected.has(s.id))
    const dates = picked.map(s => String(s.sale_date).slice(0, 10)).sort()
    const customers = [...new Set(picked.map(s => s.customer_name).filter(Boolean))]
    const customerName = customers.length === 1 ? customers[0] : customers.length === 0 ? null : `${customers[0]} 외 ${customers.length - 1}`
    if (!confirm(`${picked.length}건 · ${nf(picked.reduce((a, s) => a + s.amount, 0))}원 청구서를 발행할까요?`)) return
    const { ok, json } = await fetchWithAuth('/api/tire/invoices', {
      method: 'POST',
      body: { sale_ids: [...selected], period_from: dates[0], period_to: dates[dates.length - 1], customer_name: customerName },
    })
    if (!ok) { alert(json.error || '발행 실패'); return }
    setSelected(new Set())
    loadSales()
    window.open(`/tire/invoice/${json.id}`, '_blank')
  }

  const markPaid = async (invoiceId: string, txId?: string) => {
    await fetchWithAuth('/api/tire/invoices', { method: 'PATCH', body: { id: invoiceId, action: 'paid', deposit_tx_id: txId || null } })
    loadInvoices(); loadDeposits(); loadSales()
  }

  const voidInvoice = async (invoiceId: string) => {
    if (!confirm('청구서를 취소할까요? 포함된 판매 건은 미청구로 돌아갑니다.')) return
    await fetchWithAuth('/api/tire/invoices', { method: 'PATCH', body: { id: invoiceId, action: 'void' } })
    loadInvoices(); loadSales()
  }

  const openOrder = async (saleId: string) => {
    setOrderLoading(true); setOrderModal(null); setOrderDone(null); setOrderPick('')
    try {
      const { ok, json } = await fetchWithAuth(`/api/tire/order?sale_id=${saleId}`)
      if (!ok) { alert(json.error || '발주 정보 조회 실패'); return }
      setOrderModal(json)
      // 기본 선택: 재고 충분한 것 중 가장 싼 것
      const need = json.sale.qty || 1
      const avail = (json.options || []).filter((o: any) => o.stock >= need)
      const best = avail.sort((a: any, b: any) => (a.price + a.deliveryFee) - (b.price + b.deliveryFee))[0]
      setOrderPick(best?.code || json.options?.[0]?.code || '')
    } finally { setOrderLoading(false) }
  }

  const submitOrder = async () => {
    if (!orderModal || !orderPick) return
    setOrderSubmitting(true)
    try {
      const { ok, json } = await fetchWithAuth('/api/tire/order', {
        method: 'POST',
        body: { sale_id: orderModal.sale.id, delivery_select: orderPick, qty: orderModal.sale.qty },
      })
      if (!ok) { alert(json.error || '발주 실패'); return }
      setOrderDone(json)
      loadSales()
    } finally { setOrderSubmitting(false) }
  }

  const syncOrders = async () => {
    setOrdersSyncing(true)
    try {
      const { ok, json } = await fetchWithAuth('/api/tire/orders?days=60')
      if (!ok) { alert(json.error || '주문 상태 조회 실패'); return }
      alert(`블랙서클 주문 ${json.orders.length}건 확인 — 신규 매칭 ${json.matched}건, 상태 갱신 ${json.statusUpdated}건`)
      loadSales()
    } finally { setOrdersSyncing(false) }
  }

  const cancelOrder = async (sale: any) => {
    if (!confirm(`${sale.item_name} ${sale.spec || ''} 발주를 취소할까요?${sale.bc_od_id ? '\n블랙서클 주문도 함께 취소됩니다.' : ''}`)) return
    const { ok, json } = await fetchWithAuth('/api/tire/orders', { method: 'POST', body: { sale_id: sale.id, action: 'cancel' } })
    alert(ok ? (json.message || '취소되었습니다') : (json.error || '취소 실패'))
    loadSales()
  }

  const margin = useMemo(() => {
    if (!salesSummary) return null
    return salesSummary.total - salesSummary.cost
  }, [salesSummary])

  const tabBtn = (k: TabKey, label: string, count?: number) => (
    <button key={k} onClick={() => setTab(k)} style={{
      padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      border: `1px solid ${tab === k ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
      background: tab === k ? 'rgba(191,219,254,0.6)' : '#ffffff', color: '#1e293b',
    }}>
      {label}{count != null && <span style={{ marginLeft: 6, fontSize: 11, color: '#64748b' }}>{nf(count)}</span>}
    </button>
  )

  return (
    <div style={{ padding: 20, maxWidth: 1280, margin: '0 auto' }}>
      {/* ═══ 발주 확인 모달 ═══ */}
      {orderModal && (
        <div onClick={e => { if (e.target === e.currentTarget) { setOrderModal(null); setOrderDone(null) } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 22, width: 460, maxWidth: '100%', boxShadow: '0 20px 50px rgba(16,24,40,0.25)' }}>
            {!orderDone ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1d23', marginBottom: 4 }}>발주 확인</div>
                <div style={{ fontSize: 12, color: '#5b626e', marginBottom: 14 }}>
                  블랙서클 실시간 시세·재고입니다. 확인 후 발주하면 장바구니에 담깁니다.
                </div>

                <div style={{ background: '#f6f7f9', borderRadius: 10, padding: '11px 13px', marginBottom: 14, fontSize: 12.5 }}>
                  <div style={{ fontWeight: 800, color: '#1a1d23' }}>{orderModal.catalog.brand} {orderModal.catalog.model} {orderModal.catalog.spec}</div>
                  <div style={{ color: '#5b626e', marginTop: 3 }}>
                    {orderModal.sale.customer_name || ''} {orderModal.sale.car_number ? `· ${orderModal.sale.car_number}` : ''} · <b>{orderModal.sale.qty}개</b>
                  </div>
                  {orderModal.sale.delivery_address && (
                    <div style={{ color: '#5b626e', fontSize: 11.5, marginTop: 2 }}>🚚 {orderModal.sale.delivery_address}</div>
                  )}
                  <div style={{ color: '#2563eb', fontSize: 11.5, fontWeight: 700, marginTop: 4 }}>
                    고객 청구 예정 {nf(orderModal.sale.amount)}원
                  </div>
                </div>

                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5b626e', marginBottom: 6 }}>배송 방법 선택</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
                  {orderModal.options.map((o: any) => {
                    const need = orderModal.sale.qty || 1
                    const short = o.stock < need
                    const total = o.price * need + (o.deliveryFee || 0)
                    const profit = orderModal.sale.amount - total
                    return (
                      <button key={o.code} disabled={short} onClick={() => setOrderPick(o.code)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                          padding: '10px 13px', borderRadius: 10, cursor: short ? 'not-allowed' : 'pointer',
                          border: `1.5px solid ${orderPick === o.code ? COLORS.primary : '#e6e8ec'}`,
                          background: orderPick === o.code ? '#eff4ff' : '#fff', opacity: short ? 0.45 : 1, textAlign: 'left',
                        }}>
                        <span style={{ fontSize: 12.5 }}>
                          <b>{o.label}</b>
                          <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>재고 {nf(o.stock)}{short ? ' (부족)' : ''}</span>
                        </span>
                        <span style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                            {nf(total)}원
                            {o.deliveryFee > 0 && <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}> (배송비 {nf(o.deliveryFee)})</span>}
                          </div>
                          {orderModal.sale.amount > 0 && (
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: profit >= 0 ? COLORS.income : COLORS.expense }}>
                              마진 {nf(profit)}원
                            </div>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={submitOrder} disabled={orderSubmitting || !orderPick}
                    style={{ flex: 1, padding: 13, borderRadius: 11, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 800, fontSize: 14, cursor: orderSubmitting ? 'wait' : 'pointer', opacity: !orderPick ? 0.5 : 1 }}>
                    {orderSubmitting ? '발주 중...' : '🛒 발주하기'}
                  </button>
                  <button onClick={() => setOrderModal(null)}
                    style={{ padding: '13px 20px', borderRadius: 11, border: '1px solid #e6e8ec', background: '#fff', color: '#5b626e', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>닫기</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 34, textAlign: 'center' }}>🛒</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1d23', textAlign: 'center', marginTop: 8 }}>장바구니에 담겼습니다</div>
                <div style={{ fontSize: 12.5, color: '#5b626e', textAlign: 'center', marginTop: 6, lineHeight: 1.7 }}>
                  {orderDone.note}<br />
                  매입 합계 <b>{nf(orderDone.cost)}원</b>
                </div>
                <div style={{ fontSize: 11.5, color: '#b45309', background: 'rgba(253,230,138,0.4)', borderRadius: 10, padding: '10px 13px', margin: '14px 0', lineHeight: 1.6 }}>
                  결제(주문 확정)는 블랙서클 장바구니에서 직접 눌러주세요. 여러 건을 담아 한 번에 결제하셔도 됩니다.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => window.open(orderDone.cartUrl, '_blank')}
                    style={{ flex: 1, padding: 13, borderRadius: 11, border: 'none', background: COLORS.primary, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                    블랙서클 장바구니 열기 →
                  </button>
                  <button onClick={() => { setOrderModal(null); setOrderDone(null) }}
                    style={{ padding: '13px 20px', borderRadius: 11, border: '1px solid #e6e8ec', background: '#fff', color: '#5b626e', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>닫기</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1d23' }}>타이어 판매</h1>
        <span style={{ fontSize: 12, color: '#9aa1ad' }}>판매 → 청구서 발행 → KB 441501-01-516551 입금 매칭</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {tabBtn('sales', '판매내역', salesSummary?.cnt)}
        {tabBtn('invoices', '청구서', invoices.length || undefined)}
        {tabBtn('deposits', '입금확인')}
        {tabBtn('catalog', '품목·단가', catalog.length || undefined)}
        {tabBtn('customers', '거래처', customers.length || undefined)}
        <span style={{ flex: 1 }} />
        <button onClick={() => { navigator.clipboard?.writeText(`${location.origin}/tire/apply`); alert('신청 페이지 주소가 복사되었습니다.\n고객에게 전달하세요: ' + location.origin + '/tire/apply') }}
          style={{ padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${COLORS.borderBlue}`, background: '#fff', color: COLORS.primary }}>
          🔗 신청 페이지 링크 복사
        </button>
      </div>

      {/* ═══ 판매내역 탭 ═══ */}
      {tab === 'sales' && (
        <>
          <DcStatStrip stats={[
            { label: '판매 합계', value: nf(salesSummary?.total || 0), unit: '원', tint: 'blue' as const, icon: '🛞' },
            { label: '미청구', value: nf(salesSummary?.unbilled || 0), unit: '원', tint: 'red' as const, icon: '📝' },
            { label: '청구됨(입금대기)', value: nf(salesSummary?.billed || 0), unit: '원', tint: 'amber' as const, icon: '📤' },
            { label: '입금완료', value: nf(salesSummary?.paid || 0), unit: '원', tint: 'green' as const, icon: '✅' },
            ...(salesSummary?.cost > 0 ? [{ label: '마진(매입 기입분)', value: nf(margin || 0), unit: '원', tint: 'violet' as const, icon: '📈' }] : []),
          ]} />

          <div style={{ display: 'flex', gap: 8, margin: '10px 0 12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {['', 'requested', 'unbilled', 'billed', 'paid'].map(s => (
              <button key={s || 'all'} onClick={() => setStatusFilter(s)} style={{
                padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${statusFilter === s ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
                background: statusFilter === s ? 'rgba(191,219,254,0.6)' : '#ffffff', color: '#1e293b',
              }}>
                {s === '' ? '전체' : STATUS_LABEL[s].label}
              </button>
            ))}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="고객·차량번호·품목 검색" style={{ ...inputStyle, width: 200 }} />
            <span style={{ flex: 1 }} />
            {selected.size > 0 && (
              <button onClick={issueInvoice} style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
                선택 {selected.size}건 청구서 발행
              </button>
            )}
            <button onClick={syncOrders} disabled={ordersSyncing}
              title="블랙서클 주문내역을 읽어 발주 건 상태(결제완료·상품준비중·배송중·배송완료)를 갱신합니다"
              style={{ ...BTN.sm, background: '#fff', color: '#b45309', border: '1px solid #f3e3c8', padding: '8px 14px', fontWeight: 700, cursor: ordersSyncing ? 'wait' : 'pointer' }}>
              {ordersSyncing ? '조회 중...' : '🔄 주문 상태'}
            </button>
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowAdd(v => !v) }}
              style={{ ...BTN.sm, background: showAdd ? '#f1f5f9' : '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
              {showAdd ? '닫기' : '판매 등록'}
            </button>
          </div>

          {showAdd && (
            <div style={{ ...GLASS.L4, borderRadius: 14, padding: 16, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              {([
                ['sale_date', '판매일', 'date', 130], ['customer_name', '고객명', 'text', 110],
                ['customer_phone', '연락처', 'text', 120], ['car_number', '차량번호', 'text', 100], ['delivery_address', '배송지', 'text', 180],
                ['item_name', '상품명', 'text', 170], ['spec', '규격', 'text', 110],
                ['qty', '수량', 'number', 60], ['unit_price', '단가', 'number', 100],
                ['amount', '금액(자동)', 'number', 100], ['purchase_cost', '매입원가', 'number', 100],
                ['memo', '메모', 'text', 150],
              ] as const).map(([key, label, type, width]) => (
                <div key={key}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>{label}</div>
                  <input type={type} value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ ...inputStyle, width }} />
                </div>
              ))}
              <button onClick={saveSale} disabled={saving}
                style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', padding: '8px 18px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? '저장 중...' : editingId ? '수정 저장' : '등록'}
              </button>
            </div>
          )}

          <div style={{ ...GLASS.L4, borderRadius: 16, overflow: 'auto', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
                  <th style={{ ...th, width: 34 }}>
                    <input type="checkbox"
                      checked={sales.length > 0 && sales.filter(s => s.status === 'unbilled').every(s => selected.has(s.id))}
                      onChange={e => {
                        const next = new Set<string>()
                        if (e.target.checked) sales.filter(s => s.status === 'unbilled').forEach(s => next.add(s.id))
                        setSelected(next)
                      }} />
                  </th>
                  <th style={th}>판매일</th><th style={th}>고객</th><th style={th}>차량번호</th>
                  <th style={th}>상품</th><th style={th}>규격</th>
                  <th style={{ ...th, textAlign: 'right' }}>수량</th>
                  <th style={{ ...th, textAlign: 'right' }}>단가</th>
                  <th style={{ ...th, textAlign: 'right' }}>금액</th>
                  <th style={th}>상태</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={11} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>불러오는 중...</td></tr>}
                {!loading && sales.length === 0 && (
                  <tr><td colSpan={11} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
                    판매 내역이 없습니다. 「판매 등록」으로 시작하세요. (블랙서클 주문 문자 연동 준비 중)
                  </td></tr>
                )}
                {sales.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={td}>
                      {s.status === 'unbilled' && (
                        <input type="checkbox" checked={selected.has(s.id)}
                          onChange={e => {
                            const next = new Set(selected)
                            if (e.target.checked) next.add(s.id); else next.delete(s.id)
                            setSelected(next)
                          }} />
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{String(s.sale_date).slice(0, 10)}</td>
                    <td style={td}>{s.customer_name || '—'}{s.customer_phone && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 5 }}>{s.customer_phone}</span>}{(s as any).delivery_address && <div style={{ color: '#94a3b8', fontSize: 10.5 }}>🚚 {(s as any).delivery_address}</div>}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{s.car_number || '—'}</td>
                    <td style={td}>{s.item_name || '—'}</td>
                    <td style={td}>{s.spec || '—'}</td>
                    <td style={num}>{nf(s.qty)}</td>
                    <td style={num}>{nf(s.unit_price)}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{nf(s.amount)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <StatusBadge s={s.status} />
                      <select value={(s as any).fulfill_status || ''} title="이행 상태 (고객 화면에 표시)"
                        onChange={async e => {
                          await fetchWithAuth('/api/tire/sales', { method: 'PATCH', body: { id: s.id, fulfill_status: e.target.value || null } })
                          loadSales()
                        }}
                        style={{ ...inputStyle, padding: '3px 6px', fontSize: 11, marginLeft: 5, width: 86 }}>
                        {FULFILL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => {
                        setEditingId(s.id)
                        setForm({
                          sale_date: String(s.sale_date).slice(0, 10),
                          customer_name: s.customer_name || '', customer_phone: s.customer_phone || '',
                          car_number: s.car_number || '', delivery_address: (s as any).delivery_address || '', item_name: s.item_name || '', spec: s.spec || '',
                          qty: String(s.qty), unit_price: String(s.unit_price), amount: String(s.amount),
                          purchase_cost: s.purchase_cost == null ? '' : String(s.purchase_cost), memo: s.memo || '',
                        })
                        setShowAdd(true)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }} style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}>수정</button>
                      {!(s as any).ordered_at && (
                        <button onClick={() => openOrder(s.id)} disabled={orderLoading}
                          title="블랙서클 시세·재고 확인 후 발주"
                          style={{ ...BTN.sm, padding: '3px 9px', fontSize: 11, background: '#fff', color: '#b45309', border: '1px solid #f3e3c8', cursor: orderLoading ? 'wait' : 'pointer', marginLeft: 4, fontWeight: 700 }}>
                          🛒 발주
                        </button>
                      )}
                      {(s as any).ordered_at && (
                        <>
                          <span title={(s as any).order_note || ''} style={{ fontSize: 11, fontWeight: 700, color: '#059669', marginLeft: 6 }}>
                            {(s as any).bc_status || '발주완료'}
                          </span>
                          <button onClick={() => cancelOrder(s)} title="발주 취소"
                            style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.danger, border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer', marginLeft: 4 }}>취소</button>
                        </>
                      )}
                      {s.status === 'requested' && (
                        <button onClick={async () => {
                          if (!confirm(`${s.customer_name || ''} 신청 건을 금액 ${nf(s.amount)}원으로 확정할까요?\n(금액 조정은 「수정」에서 먼저 하세요)`)) return
                          await fetchWithAuth('/api/tire/sales', { method: 'PATCH', body: { id: s.id, status: 'unbilled' } })
                          loadSales()
                        }} style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer', marginLeft: 4 }}>확정</button>
                      )}
                      {(s.status === 'unbilled' || s.status === 'requested') && (
                        <button onClick={() => deleteSale(s.id)} style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.danger, border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer', marginLeft: 4 }}>삭제</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ 청구서 탭 ═══ */}
      {tab === 'invoices' && (
        <div style={{ ...GLASS.L4, borderRadius: 16, overflow: 'auto', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
                <th style={th}>청구서 번호</th><th style={th}>고객</th><th style={th}>기간</th>
                <th style={{ ...th, textAlign: 'right' }}>건수</th>
                <th style={{ ...th, textAlign: 'right' }}>청구액</th>
                <th style={th}>발행일</th><th style={th}>상태</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
                  발행된 청구서가 없습니다. 판매내역에서 건을 선택해 발행하세요.
                </td></tr>
              )}
              {invoices.map(v => (
                <tr key={v.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)', opacity: v.status === 'void' ? 0.5 : 1 }}>
                  <td style={{ ...td, fontWeight: 700 }}>{v.invoice_no}</td>
                  <td style={td}>{v.customer_name || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {v.period_from ? `${String(v.period_from).slice(0, 10)} ~ ${String(v.period_to).slice(0, 10)}` : '—'}
                  </td>
                  <td style={num}>{nf(v.line_count)}</td>
                  <td style={{ ...num, fontWeight: 700 }}>{nf(v.total)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{v.issued_at ? String(v.issued_at).slice(0, 10) : '—'}</td>
                  <td style={td}><StatusBadge s={v.status} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => window.open(`/tire/invoice/${v.id}`, '_blank')}
                      style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}>보기/인쇄</button>
                    {v.status === 'issued' && (
                      <>
                        <button onClick={() => markPaid(v.id)}
                          style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.success, border: `1px solid ${COLORS.borderGreen}`, cursor: 'pointer', marginLeft: 4 }}>입금완료</button>
                        <button onClick={() => voidInvoice(v.id)}
                          style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.danger, border: `1px solid ${COLORS.borderRed}`, cursor: 'pointer', marginLeft: 4 }}>취소</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ 입금확인 탭 ═══ */}
      {tab === 'deposits' && (
        <>
          {waiting.length > 0 && (
            <div style={{ ...GLASS.L4, borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#b45309', marginBottom: 8 }}>입금 대기 청구서 {waiting.length}건</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {waiting.map(w => (
                  <span key={w.id} style={{ padding: '5px 12px', borderRadius: 8, background: 'rgba(253,230,138,0.4)', fontSize: 12, color: '#78350f', fontWeight: 600 }}>
                    {w.invoice_no} {w.customer_name || ''} · {nf(w.total)}원
                  </span>
                ))}
              </div>
            </div>
          )}
          <div style={{ ...GLASS.L4, borderRadius: 16, overflow: 'auto', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
                  <th style={th}>일시</th><th style={th}>구분</th><th style={th}>적요</th>
                  <th style={{ ...th, textAlign: 'right' }}>금액</th>
                  <th style={th}>청구 매칭</th>
                </tr>
              </thead>
              <tbody>
                {deposits.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
                    KB 441501-01-516551 거래가 아직 수집되지 않았습니다. SMS 알림 개시 후 자동으로 쌓입니다.
                  </td></tr>
                )}
                {deposits.map(d => (
                  <tr key={d.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{String(d.transaction_date).slice(0, 16).replace('T', ' ')}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: d.type === 'income' ? COLORS.income : COLORS.expense }}>
                        {d.type === 'income' ? '입금' : '출금'}
                      </span>
                    </td>
                    <td style={td}>{d.description || '—'}</td>
                    <td style={{ ...num, fontWeight: 700, color: d.type === 'income' ? COLORS.income : COLORS.expense }}>{nf(d.amount)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {d.matched_invoice
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{d.matched_invoice} 매칭됨</span>
                        : d.type === 'income' && waiting.length > 0
                          ? <select defaultValue="" onChange={e => { if (e.target.value) markPaid(e.target.value, d.id) }} style={{ ...inputStyle, padding: '4px 8px', fontSize: 11 }}>
                              <option value="">청구서 선택...</option>
                              {waiting.map(w => <option key={w.id} value={w.id}>{w.invoice_no} · {nf(w.total)}원</option>)}
                            </select>
                          : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ 품목·단가(카탈로그) 탭 ═══ */}
      {tab === 'catalog' && (
        <>
          {/* 블랙서클 연동 설정 */}
          <div style={{ ...GLASS.L4, borderRadius: 14, padding: 16, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', alignSelf: 'center', marginRight: 4 }}>⚙️ 블랙서클 연동</div>
            <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>아이디</div>
              <input style={{ ...inputStyle, width: 140 }} value={bcForm.id} onChange={e => setBcForm(f => ({ ...f, id: e.target.value }))} /></div>
            <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>비밀번호 {bc?.configured && <span style={{ color: '#059669' }}>(저장됨)</span>}</div>
              <input type="password" style={{ ...inputStyle, width: 140 }} value={bcForm.password} placeholder={bc?.configured ? '변경 시에만 입력' : ''} onChange={e => setBcForm(f => ({ ...f, password: e.target.value }))} /></div>
            <button onClick={async () => {
              if (!bcForm.id || !bcForm.password) { alert('아이디와 비밀번호를 입력하세요'); return }
              const { ok, json } = await fetchWithAuth('/api/tire/blackcircle', { method: 'POST', body: { action: 'save', id: bcForm.id, password: bcForm.password } })
              if (!ok) { alert(json.error || '저장 실패'); return }
              setBcForm(f => ({ ...f, password: '' }))
              loadBc()
            }} style={{ ...BTN.sm, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>저장</button>
            <button disabled={bcSyncing || !bc?.configured} onClick={async () => {
              setBcSyncing(true)
              try {
                const { ok, json } = await fetchWithAuth('/api/tire/blackcircle', { method: 'POST', body: { action: 'sync' } })
                if (!ok) alert(json.error || '동기화 실패')
                else alert(`동기화 완료 — ${json.items}품목 (${json.pages}페이지)`)
                loadBc(); loadCatalog()
              } finally { setBcSyncing(false) }
            }} style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', padding: '8px 16px', fontWeight: 700, cursor: bcSyncing ? 'wait' : 'pointer', opacity: !bc?.configured ? 0.5 : 1 }}>
              {bcSyncing ? '동기화 중... (2~3분)' : '🔄 지금 동기화'}
            </button>
            <div style={{ borderLeft: '1px solid #e6e8ec', paddingLeft: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>마진율 %(매입가)</div>
                <input type="number" style={{ ...inputStyle, width: 70, textAlign: 'right' }} value={bcMargin} placeholder="미사용" onChange={e => setBcMargin(e.target.value)} /></div>
              <button onClick={async () => {
                await fetchWithAuth('/api/tire/blackcircle', { method: 'POST', body: { action: 'margin', percent: bcMargin } })
                loadBc()
                alert(bcMargin ? `마진율 ${bcMargin}% 저장 — 판매단가 미입력 품목은 매입가×${(1 + Number(bcMargin) / 100).toFixed(2)} (천원 올림)로 자동 노출됩니다` : '자동 마진율 해제')
              }} style={{ ...BTN.sm, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>적용</button>
            </div>
            {bc?.lastSync && (
              <div style={{ fontSize: 11, color: '#94a3b8', width: '100%' }}>
                마지막 동기화: {String(bc.lastSync).slice(0, 16).replace('T', ' ')} — {bc.lastResult || ''} · 매일 새벽 5:30 자동 실행
              </div>
            )}
          </div>

          {/* 필터: 브랜드 칩 + 사이즈 3구분 + 검색 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {['', ...[...new Set(catalog.map(c => c.brand))]].map(b => (
              <button key={b || 'all'} onClick={() => setCatBrand(b)} style={{
                padding: '5px 12px', borderRadius: 16, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${catBrand === b ? COLORS.primary : 'rgba(0,0,0,0.08)'}`,
                background: catBrand === b ? COLORS.primary : '#fff',
                color: catBrand === b ? '#fff' : '#5b626e',
              }}>{b || '전체'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {([
              [catW, setCatW, '폭', (s: string) => s.match(/^(\d{3})\//)?.[1]],
              [catR, setCatR, '편평비', (s: string) => s.match(/^\d{3}\/(\d{2})R/)?.[1]],
              [catRim, setCatRim, '인치', (s: string) => s.match(/R(\d{2})$/)?.[1]],
            ] as const).map(([val, setter, label, extract], i) => (
              <select key={i} value={val as string} onChange={e => (setter as any)(e.target.value)} style={{ ...inputStyle, width: 90 }}>
                <option value="">{label as string}</option>
                {[...new Set(catalog.map(c => (extract as any)(c.spec)).filter(Boolean))].sort((a: any, b: any) => Number(a) - Number(b))
                  .map((v: any) => <option key={v} value={v}>{v}</option>)}
              </select>
            ))}
            <input value={catQ} onChange={e => setCatQ(e.target.value)} placeholder="모델·규격 검색 (2454519)" style={{ ...inputStyle, width: 200 }} />
            {(catBrand || catW || catR || catRim || catQ) && (
              <button onClick={() => { setCatBrand(''); setCatW(''); setCatR(''); setCatRim(''); setCatQ('') }}
                style={{ ...BTN.sm, padding: '6px 12px', fontSize: 11, background: '#fff', color: '#5b626e', border: '1px solid #e6e8ec', cursor: 'pointer' }}>필터 초기화</button>
            )}
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              판매단가 미입력 시 마진율 자동가(매입가 기준)가 적용됩니다 · 매입가·소비자가는 외부 비공개
            </span>
          </div>
          <div style={{ ...GLASS.L4, borderRadius: 16, overflow: 'auto', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
                  <th style={th}>브랜드</th><th style={th}>모델</th><th style={th}>규격</th>
                  <th style={{ ...th, textAlign: 'right' }}>소비자가</th>
                  <th style={{ ...th, textAlign: 'right' }}>매입가</th>
                  <th style={{ ...th, textAlign: 'right' }}>판매단가</th>
                  <th style={{ ...th, textAlign: 'right' }}>마진</th>
                  <th style={th}>재고·배송</th>
                  <th style={th}>신청 노출</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const digitsQ = catQ.trim().toLowerCase().replace(/\s/g, '')
                  const specQ = digitsQ.replace(/[^0-9]/g, '')
                  const filtered = catalog.filter(c => {
                    if (catBrand && c.brand !== catBrand) return false
                    const m = String(c.spec || '').match(/^(\d{3})\/(\d{2})R(\d{2})$/)
                    if (catW && m?.[1] !== catW) return false
                    if (catR && m?.[2] !== catR) return false
                    if (catRim && m?.[3] !== catRim) return false
                    if (digitsQ) {
                      const hay = `${c.brand}${c.model}${c.spec}`.toLowerCase().replace(/\s/g, '')
                      const specDigits = String(c.spec || '').replace(/[^0-9]/g, '')
                      if (!hay.includes(digitsQ) && !(specQ.length >= 4 && specDigits.includes(specQ))) return false
                    }
                    return true
                  })
                  const marginPct = Number(bcMargin)
                  const autoOf = (c: any) => (c.purchase_price && marginPct > 0)
                    ? Math.ceil(c.purchase_price * (1 + marginPct / 100) / 1000) * 1000 : null
                  return filtered.slice(0, 300).map(c => {
                    const auto = autoOf(c)
                    const effective = c.sale_price ?? auto
                    return (
                      <tr key={c.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)', opacity: c.active ? 1 : 0.45 }}>
                        <td style={{ ...td, fontWeight: 700 }}>{c.brand}</td>
                        <td style={td}>{c.model}</td>
                        <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{c.spec}</td>
                        <td style={{ ...num, color: '#64748b' }}>{c.consumer_price != null ? nf(c.consumer_price) : '—'}</td>
                        <td style={num}>{c.purchase_price != null ? nf(c.purchase_price) : '—'}</td>
                        <td style={{ ...num, whiteSpace: 'nowrap' }}>
                          <input type="number" defaultValue={c.sale_price ?? ''}
                            placeholder={auto ? `자동 ${nf(auto)}` : '미설정'}
                            title={auto ? `마진율 자동가 ${nf(auto)}원 — 직접 입력하면 우선 적용` : ''}
                            onBlur={async e => {
                              const v = e.target.value
                              if (String(c.sale_price ?? '') === v) return
                              await fetchWithAuth('/api/tire/catalog', { method: 'PATCH', body: { id: c.id, sale_price: v } })
                              loadCatalog()
                            }}
                            style={{ ...inputStyle, width: 100, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                        </td>
                        <td style={{ ...num, fontWeight: 700, color: effective && c.purchase_price ? (effective - c.purchase_price >= 0 ? COLORS.income : COLORS.expense) : '#cbd5e1' }}>
                          {effective && c.purchase_price ? nf(effective - c.purchase_price) : '—'}
                        </td>
                        <td style={{ ...td, fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {c.stock_note ? `재고 ${c.stock_note}` : ''}{c.stock_note && c.delivery_note ? ' · ' : ''}{c.delivery_note ? String(c.delivery_note).slice(0, 18) : ''}
                          {!c.stock_note && !c.delivery_note && '—'}
                        </td>
                        <td style={td}>
                          <button onClick={async () => {
                            await fetchWithAuth('/api/tire/catalog', { method: 'PATCH', body: { id: c.id, active: c.active ? 0 : 1 } })
                            loadCatalog()
                          }} style={{ ...BTN.sm, padding: '3px 10px', fontSize: 11, cursor: 'pointer', background: c.active ? 'rgba(167,243,208,0.5)' : '#f1f5f9', color: c.active ? '#059669' : '#94a3b8', border: 'none', fontWeight: 700 }}>
                            {c.active ? '노출' : '숨김'}
                          </button>
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ 거래처 탭 ═══ */}
      {tab === 'customers' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              거래처를 등록하면 <b>전용 링크</b>가 생성됩니다 — 링크를 카톡으로 보내면 그 거래처만의 신청·배송지·내역 화면이 열립니다
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={() => setShowCustForm(v => !v)}
              style={{ ...BTN.sm, background: showCustForm ? '#f1f5f9' : '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
              {showCustForm ? '닫기' : '거래처 등록'}
            </button>
          </div>

          {showCustForm && (
            <div style={{ ...GLASS.L4, borderRadius: 14, padding: 16, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>거래처명 *</div>
                <input style={{ ...inputStyle, width: 160 }} value={custForm.name} onChange={e => setCustForm(f => ({ ...f, name: e.target.value }))} placeholder="우리모터스" /></div>
              <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>연락처</div>
                <input style={{ ...inputStyle, width: 140 }} value={custForm.phone} onChange={e => setCustForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" /></div>
              <div><div style={{ fontSize: 10.5, fontWeight: 700, color: '#5b626e', marginBottom: 4 }}>메모</div>
                <input style={{ ...inputStyle, width: 200 }} value={custForm.memo} onChange={e => setCustForm(f => ({ ...f, memo: e.target.value }))} /></div>
              <button onClick={async () => {
                if (!custForm.name.trim()) { alert('거래처명을 입력하세요'); return }
                const { ok, json } = await fetchWithAuth('/api/tire/customers', { method: 'POST', body: custForm })
                if (!ok) { alert(json.error || '등록 실패'); return }
                setCustForm({ name: '', phone: '', memo: '' }); setShowCustForm(false)
                loadCustomers()
              }} style={{ ...BTN.sm, background: COLORS.primary, color: '#fff', border: 'none', padding: '8px 18px', fontWeight: 700, cursor: 'pointer' }}>등록</button>
            </div>
          )}

          <div style={{ ...GLASS.L4, borderRadius: 16, overflow: 'auto', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(241,245,249,0.6)', color: '#475569', textAlign: 'left' }}>
                  <th style={th}>거래처</th><th style={th}>연락처</th>
                  <th style={{ ...th, textAlign: 'right' }}>신청 건수</th>
                  <th style={th}>최근 신청</th><th style={th}>전용 링크</th><th style={th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>등록된 거래처가 없습니다. 「거래처 등록」으로 시작하세요.</td></tr>
                )}
                {customers.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid rgba(0,0,0,0.05)', opacity: c.status === 'active' ? 1 : 0.5 }}>
                    <td style={{ ...td, fontWeight: 700 }}>{c.name}{c.memo && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6 }}>{c.memo}</span>}</td>
                    <td style={td}>{c.phone || '—'}</td>
                    <td style={num}>{nf(c.order_cnt)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: '#64748b', fontSize: 11 }}>{c.last_order_at ? String(c.last_order_at).slice(0, 10) : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <code style={{ fontSize: 11, color: '#475569', background: '#f1f5f9', borderRadius: 6, padding: '2px 7px' }}>/t/{c.token}</code>
                      <button onClick={() => {
                        const url = `${location.origin}/t/${c.token}`
                        navigator.clipboard?.writeText(url)
                        alert(`${c.name} 전용 링크가 복사되었습니다.\n${url}`)
                      }} style={{ ...BTN.sm, padding: '3px 9px', fontSize: 11, marginLeft: 5, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}>🔗 복사</button>
                      <button onClick={() => window.open(`/t/${c.token}`, '_blank')}
                        style={{ ...BTN.sm, padding: '3px 9px', fontSize: 11, marginLeft: 4, background: '#fff', color: '#475569', border: '1px solid #e6e8ec', cursor: 'pointer' }}>미리보기</button>
                    </td>
                    <td style={td}>
                      <button onClick={async () => {
                        await fetchWithAuth('/api/tire/customers', { method: 'PATCH', body: { id: c.id, status: c.status === 'active' ? 'disabled' : 'active' } })
                        loadCustomers()
                      }} style={{ ...BTN.sm, padding: '3px 10px', fontSize: 11, cursor: 'pointer', background: c.status === 'active' ? 'rgba(167,243,208,0.5)' : '#f1f5f9', color: c.status === 'active' ? '#059669' : '#94a3b8', border: 'none', fontWeight: 700 }}>
                        {c.status === 'active' ? '활성' : '중지'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
