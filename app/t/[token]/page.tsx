'use client'

// ═══════════════════════════════════════════════════════════════
// 더범 타이어 — 거래처 전용 포털 (/t/{token}, 공개, 2026-08-07)
// 탭: 주문 신청(브랜드 칩 + 사이즈 3구분/검색) · 신청 내역(상태·재주문) · 배송지 관리
// 토큰이 곧 인증 — ConditionalLayout 게스트 경로
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

const nf = (n: number) => (Number(n) || 0).toLocaleString()

interface CatalogItem { id: string; brand: string; model: string; spec: string; sale_price: number | null; stock_note: string | null; delivery_note: string | null }
interface Address { id: string; label: string | null; address: string; contact_name: string | null; contact_phone: string | null; is_default: number }
interface Order { id: string; sale_date: string; item_name: string; spec: string | null; qty: number; amount: number; car_number: string | null; statusLabel: string; amountConfirmed: boolean }

const BADGE_COLOR: Record<string, { bg: string; color: string }> = {
  '접수됨': { bg: 'rgba(191,219,254,0.7)', color: '#1d4fd7' },
  '확정': { bg: 'rgba(221,214,254,0.7)', color: '#6d28d9' },
  '주문완료': { bg: 'rgba(253,230,138,0.6)', color: '#b45309' },
  '배송중': { bg: 'rgba(253,230,138,0.6)', color: '#b45309' },
  '완료': { bg: 'rgba(167,243,208,0.6)', color: '#059669' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 13px', borderRadius: 10, border: '1px solid #e6e8ec',
  fontSize: 14, background: '#fff', color: '#1a1d23', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#5b626e', display: 'block', marginBottom: 6 }

export default function TirePortal() {
  const { token } = useParams<{ token: string }>()
  const [tab, setTab] = useState<'order' | 'history' | 'address'>('order')
  const [data, setData] = useState<{ customer: { name: string }; addresses: Address[]; orders: Order[] } | null>(null)
  const [notFound, setNotFound] = useState(false)

  // 신청 폼 상태
  const [facets, setFacets] = useState<{ brands: { name: string; count: number }[]; widths: string[]; ratios: string[]; rims: string[] } | null>(null)
  const [brand, setBrand] = useState('')
  const [width, setWidth] = useState('')
  const [ratio, setRatio] = useState('')
  const [rim, setRim] = useState('')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [picked, setPicked] = useState<CatalogItem | null>(null)
  const [qty, setQty] = useState('4')
  const [carNumber, setCarNumber] = useState('')
  const [addressId, setAddressId] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 배송지 폼
  const [showAddrForm, setShowAddrForm] = useState(false)
  const [addrForm, setAddrForm] = useState({ label: '', address: '', contact_name: '', contact_phone: '' })

  const load = useCallback(async () => {
    const res = await fetch(`/api/tire/portal/${token}`)
    if (res.status === 404) { setNotFound(true); return }
    const json = await res.json()
    setData(json)
    const def = (json.addresses || []).find((a: Address) => a.is_default)
    if (def) setAddressId(prev => prev || def.id)
  }, [token])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/tire/catalog/facets').then(r => r.json()).then(setFacets).catch(() => {})
  }, [])

  // 검색: 사이즈 3구분 or 텍스트
  useEffect(() => {
    const spec = width && ratio && rim ? `${width}/${ratio}R${rim}` : ''
    if (!spec && !q.trim() && !brand) { setResults([]); return }
    const t = setTimeout(() => {
      const p = new URLSearchParams()
      if (brand) p.set('brand', brand)
      if (spec) p.set('spec', spec)
      if (q.trim()) p.set('q', q.trim())
      fetch(`/api/tire/catalog?${p}`).then(r => r.json()).then(d => setResults(d.rows || [])).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [brand, width, ratio, rim, q])

  const submit = async () => {
    setMsg(null)
    if (!picked && !q.trim()) { setMsg({ type: 'err', text: '타이어를 선택해주세요.' }); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/tire/portal/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'order',
          catalog_id: picked?.id || null,
          item_name: picked ? undefined : q.trim(),
          qty: Number(qty) || 4, car_number: carNumber, address_id: addressId || null, memo,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setMsg({ type: 'err', text: json.error || '신청 실패' }); return }
      setMsg({ type: 'ok', text: '신청이 접수되었습니다. 확인 후 연락드립니다.' })
      setPicked(null); setQ(''); setCarNumber(''); setMemo('')
      load()
      setTab('history')
    } finally { setSubmitting(false) }
  }

  const addAddress = async () => {
    if (!addrForm.address.trim()) return
    await fetch(`/api/tire/portal/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'address', ...addrForm }),
    })
    setAddrForm({ label: '', address: '', contact_name: '', contact_phone: '' })
    setShowAddrForm(false)
    load()
  }

  const addrAction = async (action: string, id: string) => {
    await fetch(`/api/tire/portal/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    })
    load()
  }

  const reorder = (o: Order) => {
    setTab('order')
    setPicked(null)
    setQ(`${o.item_name} ${o.spec || ''}`.trim())
    setQty(String(o.qty || 4))
    setCarNumber(o.car_number || '')
    window.scrollTo({ top: 0 })
  }

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f6f7f9', fontFamily: '-apple-system, "Apple SD Gothic Neo", sans-serif' }}>
      <div style={{ textAlign: 'center', color: '#5b626e' }}>유효하지 않은 링크입니다.<br />담당자에게 새 링크를 요청해주세요.</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7f9', fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif', paddingBottom: 40 }}>
      {/* 헤더 */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f1f4', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 11 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 12.5 }}>더</div>
            <div style={{ fontSize: 14.5, fontWeight: 900, color: '#1a1d23' }}>더범 타이어</div>
            {data && <div style={{ marginLeft: 'auto', fontSize: 11, color: '#5b626e', background: '#f6f7f9', borderRadius: 20, padding: '4px 11px', fontWeight: 700 }}>{data.customer.name} 님</div>}
          </div>
          <div style={{ display: 'flex' }}>
            {([['order', '주문 신청'], ['history', '신청 내역'], ['address', '배송지']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '10px 0',
                border: 'none', background: 'none', cursor: 'pointer',
                color: tab === k ? '#2563eb' : '#9aa1ad',
                borderBottom: `2px solid ${tab === k ? '#2563eb' : 'transparent'}`,
              }}>
                {label}{k === 'history' && data && data.orders.length > 0 ? ` ${data.orders.length}` : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ═══ 주문 신청 ═══ */}
        {tab === 'order' && (
          <>
            <div>
              <span style={labelStyle}>브랜드</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{ name: '', count: 0 }, ...(facets?.brands || [])].slice(0, 15).map(b => (
                  <button key={b.name || 'all'} onClick={() => { setBrand(b.name); setPicked(null) }} style={{
                    border: `1px solid ${brand === b.name ? '#2563eb' : '#e6e8ec'}`,
                    background: brand === b.name ? '#2563eb' : '#fff',
                    color: brand === b.name ? '#fff' : '#5b626e',
                    borderRadius: 18, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}>{b.name || '전체'}</button>
                ))}
              </div>
            </div>

            <div>
              <span style={labelStyle}>사이즈</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <select style={inputStyle} value={width} onChange={e => { setWidth(e.target.value); setPicked(null) }}>
                  <option value="">폭</option>
                  {(facets?.widths || []).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <select style={inputStyle} value={ratio} onChange={e => { setRatio(e.target.value); setPicked(null) }}>
                  <option value="">편평비</option>
                  {(facets?.ratios || []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select style={inputStyle} value={rim} onChange={e => { setRim(e.target.value); setPicked(null) }}>
                  <option value="">인치</option>
                  {(facets?.rims || []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <input style={{ ...inputStyle, marginTop: 8 }} value={q}
                onChange={e => { setQ(e.target.value); setPicked(null) }}
                placeholder="🔍 또는 바로 검색 — 2454519, 피제로" />
            </div>

            {/* 검색 결과 */}
            {!picked && results.length > 0 && (
              <div style={{ border: '1px solid #e6e8ec', borderRadius: 12, background: '#fff', maxHeight: 280, overflowY: 'auto' }}>
                {results.slice(0, 40).map(c => (
                  <button key={c.id} onClick={() => setPicked(c)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                    padding: '11px 14px', border: 'none', borderBottom: '1px solid #f0f1f4', background: '#fff', cursor: 'pointer', textAlign: 'left',
                  }}>
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
              <div style={{ background: '#eff4ff', border: '1px solid #c9dbfa', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1d23' }}>{picked.brand} {picked.model}</div>
                  <div style={{ fontSize: 11.5, color: '#5b626e' }}>{picked.spec} · {qty}개</div>
                  {(picked.stock_note || picked.delivery_note) && (
                    <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginTop: 2 }}>
                      {picked.stock_note ? `재고 ${picked.stock_note}` : ''}{picked.stock_note && picked.delivery_note ? ' · ' : ''}{picked.delivery_note || ''}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#2563eb' }}>
                    {picked.sale_price ? `약 ${nf(picked.sale_price * (Number(qty) || 1))}원` : '가격 문의'}
                  </div>
                  <button onClick={() => setPicked(null)} style={{ border: 'none', background: 'none', fontSize: 11, color: '#9aa1ad', cursor: 'pointer', padding: 0, marginTop: 3 }}>다시 선택</button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <span style={labelStyle}>차량번호</span>
                <input style={inputStyle} value={carNumber} onChange={e => setCarNumber(e.target.value)} placeholder="12가3456" />
              </div>
              <div>
                <span style={labelStyle}>수량</span>
                <select style={inputStyle} value={qty} onChange={e => setQty(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n}>{n}개</option>)}
                </select>
              </div>
            </div>

            <div>
              <span style={labelStyle}>배송지</span>
              {data && data.addresses.length > 0 ? (
                <select style={inputStyle} value={addressId} onChange={e => setAddressId(e.target.value)}>
                  {data.addresses.map(a => (
                    <option key={a.id} value={a.id}>🚚 {a.label || a.address.slice(0, 20)}{a.is_default ? ' (기본)' : ''}</option>
                  ))}
                </select>
              ) : (
                <button onClick={() => setTab('address')} style={{ ...inputStyle, textAlign: 'left', color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}>
                  ＋ 배송지를 먼저 등록해주세요
                </button>
              )}
            </div>

            <div>
              <span style={labelStyle}>요청사항</span>
              <input style={inputStyle} value={memo} onChange={e => setMemo(e.target.value)} placeholder="장착 희망일, 기타 요청" />
            </div>

            <div style={{ fontSize: 11.5, color: '#9aa1ad', background: '#f0f1f4', borderRadius: 10, padding: '9px 13px', lineHeight: 1.6 }}>
              표시 가격은 <b>참고가</b>이며 시세에 따라 변동될 수 있습니다. 접수 후 최종 금액을 안내드립니다.
            </div>

            {msg && (
              <div style={{ fontSize: 12.5, fontWeight: 700, borderRadius: 10, padding: '10px 13px', color: msg.type === 'ok' ? '#059669' : '#dc2626', background: msg.type === 'ok' ? 'rgba(167,243,208,0.4)' : '#fdf0f0' }}>{msg.text}</div>
            )}

            <button onClick={submit} disabled={submitting} style={{
              width: '100%', padding: 15, borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff',
              fontSize: 15, fontWeight: 800, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}>{submitting ? '접수 중...' : '주문 신청하기'}</button>
          </>
        )}

        {/* ═══ 신청 내역 ═══ */}
        {tab === 'history' && (
          <>
            {(!data || data.orders.length === 0) && (
              <div style={{ textAlign: 'center', color: '#9aa1ad', fontSize: 13, padding: '60px 0' }}>아직 신청 내역이 없습니다.</div>
            )}
            {data?.orders.map(o => {
              const bc = BADGE_COLOR[o.statusLabel] || { bg: '#f1f5f9', color: '#64748b' }
              return (
                <div key={o.id} style={{ background: '#fff', border: '1px solid #e6e8ec', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: '#9aa1ad' }}>{String(o.sale_date).slice(0, 10)}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 6, padding: '2px 9px', background: bc.bg, color: bc.color }}>{o.statusLabel}</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1d23', marginTop: 4 }}>
                    {o.item_name} {o.spec || ''} × {o.qty}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#5b626e', marginTop: 3 }}>
                    <span>{o.car_number || ''}</span>
                    <b style={{ color: '#1a1d23', fontVariantNumeric: 'tabular-nums' }}>
                      {o.amountConfirmed && o.amount > 0 ? `${nf(o.amount)}원` : '금액 확정 대기'}
                    </b>
                  </div>
                  {(o.statusLabel === '완료' || o.statusLabel === '주문완료') && (
                    <button onClick={() => reorder(o)} style={{
                      fontSize: 11.5, fontWeight: 700, color: '#2563eb', border: '1px solid #c9dbfa',
                      borderRadius: 8, padding: '4px 11px', background: '#fff', cursor: 'pointer', marginTop: 8,
                    }}>↻ 같은 걸로 재주문</button>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ═══ 배송지 관리 ═══ */}
        {tab === 'address' && (
          <>
            {data?.addresses.map(a => (
              <div key={a.id} style={{ background: '#fff', border: `1px solid ${a.is_default ? '#2563eb' : '#e6e8ec'}`, borderRadius: 12, padding: '12px 14px', position: 'relative' }}>
                {!!a.is_default && <span style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, fontWeight: 800, color: '#2563eb', background: '#eff4ff', padding: '2px 8px', borderRadius: 6 }}>기본 배송지</span>}
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1a1d23' }}>{a.label || '배송지'}</div>
                <div style={{ fontSize: 12, color: '#5b626e', marginTop: 3 }}>{a.address}</div>
                {(a.contact_name || a.contact_phone) && (
                  <div style={{ fontSize: 11.5, color: '#5b626e', marginTop: 2 }}>{a.contact_name || ''} {a.contact_phone ? `· ${a.contact_phone}` : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {!a.is_default && (
                    <button onClick={() => addrAction('address-default', a.id)} style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', border: '1px solid #c9dbfa', borderRadius: 8, padding: '3px 10px', background: '#fff', cursor: 'pointer' }}>기본으로</button>
                  )}
                  <button onClick={() => addrAction('address-delete', a.id)} style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', border: '1px solid #f3c6c6', borderRadius: 8, padding: '3px 10px', background: '#fff', cursor: 'pointer' }}>삭제</button>
                </div>
              </div>
            ))}

            {showAddrForm ? (
              <div style={{ background: '#fff', border: '1px solid #e6e8ec', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input style={inputStyle} value={addrForm.label} onChange={e => setAddrForm(f => ({ ...f, label: e.target.value }))} placeholder="이름 (본점, 성남점, 장착점 등)" />
                <input style={inputStyle} value={addrForm.address} onChange={e => setAddrForm(f => ({ ...f, address: e.target.value }))} placeholder="주소 *" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input style={inputStyle} value={addrForm.contact_name} onChange={e => setAddrForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="담당자" />
                  <input style={inputStyle} value={addrForm.contact_phone} onChange={e => setAddrForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="연락처" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={addAddress} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>저장</button>
                  <button onClick={() => setShowAddrForm(false)} style={{ padding: '12px 18px', borderRadius: 10, border: '1px solid #e6e8ec', background: '#fff', color: '#5b626e', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>취소</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddrForm(true)} style={{
                border: '1.5px dashed #c9dbfa', borderRadius: 12, textAlign: 'center', padding: '14px 0',
                color: '#2563eb', fontSize: 13, fontWeight: 700, background: 'transparent', cursor: 'pointer',
              }}>＋ 배송지 추가</button>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', fontSize: 10.5, color: '#9aa1ad', paddingTop: 10 }}>
          더범 · 856-56-00996 · 입금계좌 국민은행 441501-01-516551
        </div>
      </div>
    </div>
  )
}
