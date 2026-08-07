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
type TabKey = 'sales' | 'invoices' | 'deposits'

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
  const emptyForm = { sale_date: new Date().toISOString().slice(0, 10), customer_name: '', customer_phone: '', car_number: '', item_name: '', spec: '', qty: '1', unit_price: '', amount: '', purchase_cost: '', memo: '' }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── 청구서 ──
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])

  // ── 입금확인 ──
  const [deposits, setDeposits] = useState<any[]>([])
  const [waiting, setWaiting] = useState<any[]>([])

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

  useEffect(() => { loadSales() }, [loadSales])
  useEffect(() => {
    if (tab === 'invoices') loadInvoices()
    if (tab === 'deposits') { loadDeposits(); loadInvoices() }
  }, [tab, loadInvoices, loadDeposits])

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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1d23' }}>타이어 판매</h1>
        <span style={{ fontSize: 12, color: '#9aa1ad' }}>판매 → 청구서 발행 → KB 441501-01-516551 입금 매칭</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {tabBtn('sales', '판매내역', salesSummary?.cnt)}
        {tabBtn('invoices', '청구서', invoices.length || undefined)}
        {tabBtn('deposits', '입금확인')}
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
            {['', 'unbilled', 'billed', 'paid'].map(s => (
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
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowAdd(v => !v) }}
              style={{ ...BTN.sm, background: showAdd ? '#f1f5f9' : '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
              {showAdd ? '닫기' : '판매 등록'}
            </button>
          </div>

          {showAdd && (
            <div style={{ ...GLASS.L4, borderRadius: 14, padding: 16, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              {([
                ['sale_date', '판매일', 'date', 130], ['customer_name', '고객명', 'text', 110],
                ['customer_phone', '연락처', 'text', 120], ['car_number', '차량번호', 'text', 100],
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
                    <td style={td}>{s.customer_name || '—'}{s.customer_phone && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 5 }}>{s.customer_phone}</span>}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{s.car_number || '—'}</td>
                    <td style={td}>{s.item_name || '—'}</td>
                    <td style={td}>{s.spec || '—'}</td>
                    <td style={num}>{nf(s.qty)}</td>
                    <td style={num}>{nf(s.unit_price)}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{nf(s.amount)}</td>
                    <td style={td}><StatusBadge s={s.status} /></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => {
                        setEditingId(s.id)
                        setForm({
                          sale_date: String(s.sale_date).slice(0, 10),
                          customer_name: s.customer_name || '', customer_phone: s.customer_phone || '',
                          car_number: s.car_number || '', item_name: s.item_name || '', spec: s.spec || '',
                          qty: String(s.qty), unit_price: String(s.unit_price), amount: String(s.amount),
                          purchase_cost: s.purchase_cost == null ? '' : String(s.purchase_cost), memo: s.memo || '',
                        })
                        setShowAdd(true)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }} style={{ ...BTN.sm, padding: '3px 8px', fontSize: 11, background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.borderBlue}`, cursor: 'pointer' }}>수정</button>
                      {s.status === 'unbilled' && (
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
    </div>
  )
}
