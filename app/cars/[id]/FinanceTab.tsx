'use client'
import { useEffect, useState } from 'react'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export default function FinanceTab({ carId }: { carId: string }) {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 입력 폼 (DB 컬럼과 일치)
  const [form, setForm] = useState({
    finance_name: '현대캐피탈',
    type: '운용리스', // 할부, 렌트 등
    total_amount: 0,  // 대출 원금
    interest_rate: 5.5, // 금리
    term_months: 36, // 기간
    monthly_payment: 0, // 월 납입금 (핵심)
    payment_date: 25, // 매월 결제일
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
  })

  // 1. 금융 정보 불러오기
  const fetchFinance = async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/financial-products?car_id=${carId}`, { headers })
      const json = await res.json()
      setProducts(json.data || [])
    } catch (e) { console.error('[FinanceTab]', e) }
    setLoading(false)
  }

  useEffect(() => { fetchFinance() }, [carId])

  // 2. 저장하기
  const handleSave = async () => {
    if (!form.monthly_payment) return alert('월 납입금은 필수입니다.')
    const headers = await getAuthHeader()
    const res = await fetch('/api/financial-products', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ car_id: carId, ...form }),
    })
    const json = await res.json()
    if (json.error) alert('저장 실패: ' + json.error)
    else { alert('✅ 금융 계약이 등록되었습니다.'); fetchFinance() }
  }

  // 3. 삭제하기
  const handleDelete = async (id: number) => {
    if(!confirm('삭제하시겠습니까?')) return;
    const headers = await getAuthHeader()
    await fetch(`/api/financial-products/${id}`, { method: 'DELETE', headers })
    fetchFinance()
  }

  // 숫자 포맷
  const f = (n: number) => n.toLocaleString()
  const p = (v: string) => Number(v.replace(/,/g, ''))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">

      {/* 입력 폼 */}
      <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">🏦 금융/할부 등록</h3>
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-500">금융사</label>
                    <input className="w-full p-2 border rounded" value={form.finance_name} onChange={e=>setForm({...form, finance_name:e.target.value})} placeholder="예: 현대캐피탈"/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">상품 구분</label>
                    <select className="w-full p-2 border rounded" value={form.type} onChange={e=>setForm({...form, type:e.target.value})}>
                        <option>운용리스</option><option>금융리스</option><option>할부구매</option><option>장기렌트</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-blue-600">월 납입금(원) *</label>
                    <input className="w-full p-2 border-2 border-blue-100 rounded text-right font-bold"
                        value={f(form.monthly_payment)} onChange={e=>setForm({...form, monthly_payment:p(e.target.value)})}/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">결제일 (매월)</label>
                    <select className="w-full p-2 border rounded" value={form.payment_date} onChange={e=>setForm({...form, payment_date:Number(e.target.value)})}>
                        {[1,5,10,15,20,25,30].map(d => <option key={d} value={d}>{d}일</option>)}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="text-xs font-bold text-gray-500">총 대출원금</label>
                    <input className="w-full p-2 border rounded text-right text-xs" value={f(form.total_amount)} onChange={e=>setForm({...form, total_amount:p(e.target.value)})}/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">금리(%)</label>
                    <input className="w-full p-2 border rounded text-center text-xs" value={form.interest_rate} onChange={e=>setForm({...form, interest_rate:Number(e.target.value)})}/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">기간(개월)</label>
                    <input className="w-full p-2 border rounded text-center text-xs" value={form.term_months} onChange={e=>setForm({...form, term_months:Number(e.target.value)})}/>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-500">실행일(시작)</label>
                    <input type="date" className="w-full p-2 border rounded" value={form.start_date} onChange={e=>setForm({...form, start_date:e.target.value})}/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500">만기일(종료)</label>
                    <input type="date" className="w-full p-2 border rounded" value={form.end_date} onChange={e=>setForm({...form, end_date:e.target.value})}/>
                </div>
            </div>

            <button onClick={handleSave} className="w-full py-3 bg-steel-600 text-white font-bold rounded-xl hover:bg-steel-700 transition-colors">
                금융 정보 저장
            </button>
        </div>
      </div>

      {/* 목록 리스트 */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">📋 대출/리스 내역 ({products.length}건)</h3>
        {loading ? <p>로딩 중...</p> : products.length === 0 ? (
            <div className="p-10 text-center text-gray-400 border border-dashed rounded-xl">금융 내역이 없습니다.</div>
        ) : (
            products.map(prod => (
                <div key={prod.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative hover:border-blue-500 transition-colors">
                    <button onClick={() => handleDelete(prod.id)} className="absolute top-4 right-4 text-gray-300 hover:text-red-500 font-bold text-xs border px-2 py-1 rounded">삭제</button>

                    <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-lg text-gray-900">{prod.finance_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-bold">{prod.type}</span>
                    </div>

                    <div className="text-sm text-gray-600 space-y-1">
                        <p className="text-lg text-black font-black">월 {f(prod.monthly_payment)}원 <span className="text-xs font-normal text-gray-500">(매월 {prod.payment_date}일)</span></p>
                        <div className="flex gap-4 mt-2 text-xs text-gray-400 bg-gray-50 p-2 rounded-lg">
                            <span>원금: {f(prod.total_amount)}원</span>
                            <span>금리: {prod.interest_rate}%</span>
                            <span>기간: {prod.term_months}개월</span>
                        </div>
                        <p className="text-xs mt-1">📅 {prod.start_date} ~ {prod.end_date}</p>
                    </div>
                </div>
            ))
        )}
      </div>
    </div>
  )
}