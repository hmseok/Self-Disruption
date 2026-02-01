'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation' // useParams 사용
import { supabase } from '../../utils/supabase' // 경로 확인 (../../utils/supabase)

export default function FinancePage() {
  const { id } = useParams()
  // ID 안전 변환
  const carId = Array.isArray(id) ? id[0] : id

  const router = useRouter()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [carInfo, setCarInfo] = useState<any>(null)

  // 입력 폼
  const [form, setForm] = useState({
    finance_name: '현대캐피탈', type: '운용리스', total_amount: 0,
    interest_rate: 5.5, term_months: 36, monthly_payment: 0,
    payment_date: 25, start_date: new Date().toISOString().split('T')[0], end_date: ''
  })

  useEffect(() => {
    if (!carId) return
    const fetchData = async () => {
      // 1. 차량 정보 (헤더용)
      const { data: car } = await supabase.from('cars').select('number, model').eq('id', carId).single()
      setCarInfo(car)

      // 2. 금융 정보
      const { data } = await supabase.from('financial_products').select('*').eq('car_id', carId).order('id', { ascending: false })
      setProducts(data || [])
      setLoading(false)
    }
    fetchData()
  }, [carId])

  const handleSave = async () => {
    if (!form.monthly_payment) return alert('월 납입금은 필수입니다.')
    const { error } = await supabase.from('financial_products').insert([{ car_id: carId, ...form }])
    if (error) alert('저장 실패: ' + error.message)
    else { alert('✅ 저장되었습니다.'); window.location.reload(); }
  }

  const handleDelete = async (pid: number) => {
    if(confirm('삭제하시겠습니까?')) {
      await supabase.from('financial_products').delete().eq('id', pid)
      window.location.reload()
    }
  }

  const f = (n: number) => n?.toLocaleString() || '0'
  const p = (v: string) => Number(v.replace(/,/g, ''))

  if (loading) return <div className="p-10">로딩 중...</div>

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8 pb-4 border-b">
        <div>
          <span className="text-gray-500 text-sm font-bold">금융/여신 관리</span>
          <h1 className="text-3xl font-black">{carInfo?.number} <span className="text-lg text-gray-500 font-normal">{carInfo?.model}</span></h1>
        </div>
        <button onClick={() => router.push(`/cars/${carId}`)} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-200">
          ← 차량 상세로 복귀
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* 입력 폼 (왼쪽) */}
        <div className="bg-white p-6 rounded-2xl border shadow-sm h-fit">
          <h3 className="font-bold text-lg mb-4">🏦 신규 금융 계약 등록</h3>
          <div className="space-y-4">
            {/* (기존 FinanceTab의 입력 필드들 그대로 유지) */}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-bold text-gray-500">금융사</label><input className="w-full p-2 border rounded" value={form.finance_name} onChange={e=>setForm({...form, finance_name:e.target.value})}/></div>
              <div><label className="text-xs font-bold text-gray-500">월 납입금</label><input className="w-full p-2 border rounded text-right font-bold text-blue-600" value={f(form.monthly_payment)} onChange={e=>setForm({...form, monthly_payment:p(e.target.value)})}/></div>
            </div>
            {/* ... 나머지 필드들도 여기에 쭉 넣으시면 됩니다 (공간상 생략, 기존 코드 복사) ... */}
            <button onClick={handleSave} className="w-full bg-black text-white py-3 font-bold rounded-xl mt-4">저장하기</button>
          </div>
        </div>

        {/* 리스트 (오른쪽) */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg">📋 계약 목록</h3>
          {products.map(prod => (
            <div key={prod.id} className="bg-white p-5 border rounded-xl shadow-sm relative">
              <button onClick={() => handleDelete(prod.id)} className="absolute top-4 right-4 text-xs text-red-500 underline">삭제</button>
              <h4 className="font-bold text-lg">{prod.finance_name} <span className="text-xs bg-gray-100 px-2 py-1 rounded">{prod.type}</span></h4>
              <p className="text-2xl font-black mt-2">{f(prod.monthly_payment)}원 <span className="text-sm font-normal text-gray-400">/ 월</span></p>
              <div className="mt-3 text-sm text-gray-500 bg-gray-50 p-3 rounded">
                <p>기간: {prod.start_date} ~ {prod.end_date} ({prod.term_months}개월)</p>
                <p>원금: {f(prod.total_amount)}원 (금리 {prod.interest_rate}%)</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}