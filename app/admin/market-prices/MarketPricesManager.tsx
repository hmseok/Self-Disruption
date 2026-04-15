'use client'
/**
 * 시중가 샘플 관리 (롯데/SK/현대/KB/AJ 등)
 * — RentPricingBuilder의 목표 렌트가 역산에 노출되는 데이터
 */
import { useEffect, useState } from 'react'
import { getAuthHeader } from '@/app/utils/auth-client'
import { f } from '@/lib/quote-utils'

interface MarketPrice {
  id?: number
  brand: string
  model: string
  year: number
  trim_name?: string | null
  company: string
  product_name?: string | null
  term_months: number
  annual_km: number
  deposit_pct?: number
  prepay_pct?: number
  monthly_price: number
  source_url?: string | null
  note?: string | null
  is_active?: number | boolean
}

const EMPTY: MarketPrice = {
  brand: '', model: '', year: 2026, company: '롯데',
  product_name: '', term_months: 60, annual_km: 20000,
  deposit_pct: 30, prepay_pct: 0, monthly_price: 0,
}

const COMPANIES = ['롯데', 'SK', '현대', 'KB', 'AJ', '기타']

export default function MarketPricesManager() {
  const [rows, setRows] = useState<MarketPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<MarketPrice | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const r = await fetch('/api/market-prices?all=1', { headers })
      const j = await r.json()
      setRows(Array.isArray(j.data) ? j.data.map((d: any) => ({ ...d, monthly_price: Number(d.monthly_price) })) : [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing) return
    const headers = { ...(await getAuthHeader()), 'Content-Type': 'application/json' }
    const method = editing.id ? 'PUT' : 'POST'
    try {
      const r = await fetch('/api/market-prices', { method, headers, body: JSON.stringify(editing) })
      const j = await r.json()
      if (!j.ok) { alert('저장 실패: ' + (j.error || '')); return }
      setEditing(null); setShowForm(false); load()
    } catch (e: any) { alert('저장 오류: ' + e.message) }
  }

  const remove = async (id: number) => {
    if (!confirm('이 샘플을 비활성화 하시겠어요? (소프트 삭제)')) return
    const headers = await getAuthHeader()
    await fetch(`/api/market-prices?id=${id}`, { method: 'DELETE', headers })
    load()
  }

  const filtered = rows.filter(r => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (r.brand || '').toLowerCase().includes(q)
        || (r.model || '').toLowerCase().includes(q)
        || (r.company || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800">📊 시중가 샘플 관리</h1>
          <p className="text-xs text-slate-500 mt-1">대기업 렌트 실판매가 — 견적 원가분석 UI 역산 기능에 노출됩니다.</p>
        </div>
        <div className="flex gap-2">
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="브랜드/모델/기업명 검색"
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white/70 w-56" />
          <button onClick={() => { setEditing({ ...EMPTY }); setShowForm(true) }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-black hover:bg-slate-700">
            + 샘플 추가
          </button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12)' }}>
        <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr style={{ background: 'rgba(241,245,249,0.75)' }} className="text-slate-600 text-left">
              <th className="px-3 py-2 font-black">기업</th>
              <th className="px-3 py-2 font-black">브랜드</th>
              <th className="px-3 py-2 font-black">모델</th>
              <th className="px-3 py-2 font-black">연식</th>
              <th className="px-3 py-2 font-black">상품</th>
              <th className="px-3 py-2 font-black text-right">개월</th>
              <th className="px-3 py-2 font-black text-right">연 km</th>
              <th className="px-3 py-2 font-black text-right">월 렌트가</th>
              <th className="px-3 py-2 font-black text-center">상태</th>
              <th className="px-3 py-2 font-black text-right">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
            {loading && <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">불러오는 중…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">데이터 없음</td></tr>}
            {filtered.map(r => (
              <tr key={r.id} className={!r.is_active ? 'opacity-50' : ''}>
                <td className="px-3 py-2 font-bold text-slate-700">{r.company}</td>
                <td className="px-3 py-2">{r.brand}</td>
                <td className="px-3 py-2">{r.model}</td>
                <td className="px-3 py-2">{r.year}</td>
                <td className="px-3 py-2 text-slate-500">{r.product_name || '—'}</td>
                <td className="px-3 py-2 text-right">{r.term_months}</td>
                <td className="px-3 py-2 text-right">{(r.annual_km / 1000).toFixed(0)}천</td>
                <td className="px-3 py-2 text-right font-black">{f(Number(r.monthly_price))}</td>
                <td className="px-3 py-2 text-center">
                  {r.is_active ? <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">활성</span>
                                : <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-black">비활성</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => { setEditing(r); setShowForm(true) }} className="text-indigo-600 font-bold hover:underline mr-3">수정</button>
                  <button onClick={() => r.id && remove(r.id)} className="text-rose-600 font-bold hover:underline">삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && editing && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-800">{editing.id ? '샘플 수정' : '샘플 추가'}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">기업</span>
                <select value={editing.company} onChange={e => setEditing({ ...editing, company: e.target.value })}
                  className="px-3 py-1.5 rounded border border-slate-200">
                  {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">상품명</span>
                <input value={editing.product_name || ''} onChange={e => setEditing({ ...editing, product_name: e.target.value })}
                  className="px-3 py-1.5 rounded border border-slate-200" placeholder="신차장기/다이렉트 등" />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">브랜드</span>
                <input value={editing.brand} onChange={e => setEditing({ ...editing, brand: e.target.value })}
                  className="px-3 py-1.5 rounded border border-slate-200" placeholder="현대" />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">모델</span>
                <input value={editing.model} onChange={e => setEditing({ ...editing, model: e.target.value })}
                  className="px-3 py-1.5 rounded border border-slate-200" placeholder="아반떼" />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">연식</span>
                <input type="number" value={editing.year} onChange={e => setEditing({ ...editing, year: Number(e.target.value) })}
                  className="px-3 py-1.5 rounded border border-slate-200" />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">트림</span>
                <input value={editing.trim_name || ''} onChange={e => setEditing({ ...editing, trim_name: e.target.value })}
                  className="px-3 py-1.5 rounded border border-slate-200" placeholder="선택" />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">계약 개월</span>
                <input type="number" value={editing.term_months} onChange={e => setEditing({ ...editing, term_months: Number(e.target.value) })}
                  className="px-3 py-1.5 rounded border border-slate-200" />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">연 약정 km</span>
                <input type="number" value={editing.annual_km} onChange={e => setEditing({ ...editing, annual_km: Number(e.target.value) })}
                  className="px-3 py-1.5 rounded border border-slate-200" />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">보증금 %</span>
                <input type="number" value={editing.deposit_pct || 0} onChange={e => setEditing({ ...editing, deposit_pct: Number(e.target.value) })}
                  className="px-3 py-1.5 rounded border border-slate-200" />
              </label>
              <label className="flex flex-col gap-1"><span className="text-[11px] font-bold text-slate-500">선납 %</span>
                <input type="number" value={editing.prepay_pct || 0} onChange={e => setEditing({ ...editing, prepay_pct: Number(e.target.value) })}
                  className="px-3 py-1.5 rounded border border-slate-200" />
              </label>
              <label className="flex flex-col gap-1 col-span-2"><span className="text-[11px] font-bold text-slate-500">월 렌트가 (VAT포함, 원)</span>
                <input type="number" value={editing.monthly_price} onChange={e => setEditing({ ...editing, monthly_price: Number(e.target.value) })}
                  className="px-3 py-1.5 rounded border border-slate-200 font-black text-right" />
              </label>
              <label className="flex flex-col gap-1 col-span-2"><span className="text-[11px] font-bold text-slate-500">출처 URL</span>
                <input value={editing.source_url || ''} onChange={e => setEditing({ ...editing, source_url: e.target.value })}
                  className="px-3 py-1.5 rounded border border-slate-200" placeholder="https://..." />
              </label>
              <label className="flex flex-col gap-1 col-span-2"><span className="text-[11px] font-bold text-slate-500">메모</span>
                <input value={editing.note || ''} onChange={e => setEditing({ ...editing, note: e.target.value })}
                  className="px-3 py-1.5 rounded border border-slate-200" />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">취소</button>
              <button onClick={save} className="px-4 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-black hover:bg-slate-700">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
