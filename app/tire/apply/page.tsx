'use client'

// ═══════════════════════════════════════════════════════════════
// 타이어 주문 신청 — 공개 페이지 (인증 없음, 2026-08-07)
// 고객이 차량·배송지·품목 입력 → tire_sales 'requested' → 대표가 블랙서클 주문·확정
// 가격은 참고가 — "실제 금액은 변동될 수 있습니다" 고지
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react'

const nf = (n: number) => (Number(n) || 0).toLocaleString()

interface CatalogItem { id: string; brand: string; model: string; spec: string; sale_price: number | null }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e6e8ec',
  fontSize: 14, background: '#f6f7f9', color: '#1a1d23', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5b626e', display: 'block', marginBottom: 6 }

export default function TireApplyPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [q, setQ] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [picked, setPicked] = useState<CatalogItem | null>(null)
  const [customItem, setCustomItem] = useState(false)
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', car_number: '', delivery_address: '',
    item_name: '', spec: '', qty: '4', memo: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tire/catalog').then(r => r.json()).then(d => setCatalog(d.rows || [])).catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    if (!q.trim()) return catalog
    const t = q.trim().toLowerCase().replace(/\s/g, '')
    return catalog.filter(c => `${c.brand}${c.model}${c.spec}`.toLowerCase().replace(/\s/g, '').includes(t))
  }, [catalog, q])

  const qty = Math.max(1, Number(form.qty) || 1)
  const refTotal = picked?.sale_price ? picked.sale_price * qty : null

  const submit = async () => {
    setError(null)
    if (!form.customer_name.trim() || !form.customer_phone.trim()) { setError('이름과 연락처를 입력해주세요.'); return }
    if (!picked && !form.item_name.trim()) { setError('타이어 품목을 선택하거나 직접 입력해주세요.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/tire/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, qty,
          catalog_id: picked?.id || null,
          item_name: picked ? undefined : form.item_name,
          spec: picked ? undefined : form.spec,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || '신청에 실패했습니다.'); return }
      setDone(true)
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
    } finally { setSubmitting(false) }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#f6f7f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif' }}>
        <div style={{ background: '#fff', border: '1px solid #e6e8ec', borderRadius: 16, padding: '44px 36px', maxWidth: 420, textAlign: 'center', boxShadow: '0 12px 34px rgba(16,24,40,0.07)' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#1a1d23', marginBottom: 8 }}>신청이 접수되었습니다</div>
          <div style={{ fontSize: 13, color: '#5b626e', lineHeight: 1.7 }}>
            담당자가 확인 후 연락드립니다.<br />
            최종 금액은 확인 연락 시 안내됩니다.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7f9', padding: '32px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 15 }}>더</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#1a1d23', lineHeight: 1 }}>더범 타이어</div>
            <div style={{ fontSize: 11, color: '#9aa1ad', marginTop: 3 }}>타이어 주문 신청</div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e6e8ec', borderRadius: 16, padding: '26px 24px', boxShadow: '0 12px 34px rgba(16,24,40,0.07)', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 기본 정보 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>이름 *</label>
              <input style={inputStyle} value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="홍길동" />
            </div>
            <div>
              <label style={labelStyle}>연락처 *</label>
              <input style={inputStyle} value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="010-0000-0000" inputMode="tel" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>차량번호</label>
              <input style={inputStyle} value={form.car_number} onChange={e => setForm(f => ({ ...f, car_number: e.target.value }))} placeholder="12가3456" />
            </div>
            <div>
              <label style={labelStyle}>수량</label>
              <select style={inputStyle} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}>
                {[1, 2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n}>{n}개</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>배송지 (장착점 주소)</label>
            <input style={inputStyle} value={form.delivery_address} onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))} placeholder="배송받을 주소 또는 장착점" />
          </div>

          {/* 품목 선택 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={labelStyle}>타이어 선택</label>
              <button type="button" onClick={() => { setCustomItem(v => !v); setPicked(null) }}
                style={{ background: 'none', border: 'none', fontSize: 11.5, color: '#2563eb', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                {customItem ? '목록에서 선택' : '목록에 없어요 (직접 입력)'}
              </button>
            </div>

            {!customItem ? (
              <>
                <input style={inputStyle} value={q}
                  onChange={e => { setQ(e.target.value); setPicked(null); setListOpen(true) }}
                  onFocus={() => setListOpen(true)}
                  placeholder="클릭하면 목록이 열립니다 — 브랜드·모델·규격 검색" />
                {listOpen && !picked && (
                  <div style={{ border: '1px solid #e6e8ec', borderRadius: 10, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {filtered.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: '#9aa1ad' }}>검색 결과가 없습니다 — "직접 입력"을 이용해주세요</div>}
                    {filtered.slice(0, 60).map(c => (
                      <button key={c.id} type="button" onClick={() => { setPicked(c); setQ(`${c.brand} ${c.model} ${c.spec}`); setListOpen(false) }}
                        style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '10px 14px', border: 'none', borderBottom: '1px solid #f0f1f4', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 13, color: '#1a1d23' }}>
                          <b>{c.brand}</b> {c.model} <span style={{ color: '#5b626e' }}>{c.spec}</span>
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: c.sale_price ? '#2563eb' : '#9aa1ad', whiteSpace: 'nowrap', marginLeft: 8 }}>
                          {c.sale_price ? `${nf(c.sale_price)}원~` : '가격 문의'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {picked && (
                  <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 10, background: '#eff4ff', border: '1px solid #c9dbfa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1d23' }}>{picked.brand} {picked.model} {picked.spec} × {qty}개</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#2563eb' }}>{refTotal ? `약 ${nf(refTotal)}원` : '가격 문의'}</span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
                <input style={inputStyle} value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} placeholder="브랜드/모델 (예: 한국 벤투스 S2)" />
                <input style={inputStyle} value={form.spec} onChange={e => setForm(f => ({ ...f, spec: e.target.value }))} placeholder="규격 (예: 245/40R20)" />
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>요청사항</label>
            <input style={inputStyle} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="장착 희망일, 기타 요청" />
          </div>

          <div style={{ fontSize: 11.5, color: '#9aa1ad', lineHeight: 1.6, background: '#f6f7f9', borderRadius: 10, padding: '10px 14px' }}>
            표시된 가격은 <b>참고가</b>이며 시세에 따라 변동될 수 있습니다. 신청 후 담당자가 최종 금액을 안내드립니다.
          </div>

          {error && (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#dc2626', background: '#fdf0f0', borderRadius: 10, padding: '10px 14px' }}>{error}</div>
          )}

          <button onClick={submit} disabled={submitting} style={{
            width: '100%', padding: 15, borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff',
            fontSize: 15, fontWeight: 800, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
          }}>
            {submitting ? '접수 중...' : '주문 신청하기'}
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9aa1ad', marginTop: 16 }}>
          더범 · 856-56-00996 · 입금계좌 국민은행 441501-01-516551
        </div>
      </div>
    </div>
  )
}
