'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/app/utils/supabase'
import Link from 'next/link'

export default function QuoteListPage() {
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchQuotes = async () => {
      // 1. 견적서(quotes)만 먼저 가져옵니다. (에러 원천 차단)
      const { data: quotesData, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .order('id', { ascending: false }) // ✅ id는 무조건 있으니까 100% 안전함

      if (quoteError) {
        console.error("견적서 로딩 실패:", quoteError)
        setLoading(false)
        return
      }

      if (!quotesData || quotesData.length === 0) {
        setQuotes([])
        setLoading(false)
        return
      }

      // 2. 견적서에 있는 차 아이디(car_id)들만 뽑아냅니다.
      const carIds = quotesData.map(q => q.car_id)

      // 3. 그 차량들의 정보를 가져옵니다.
      const { data: carsData } = await supabase
        .from('cars')
        .select('id, number, brand, model, image_url')
        .in('id', carIds)

      // 4. 자바스크립트로 둘을 합칩니다. (수동 조립)
      const combinedData = quotesData.map(quote => {
        const matchingCar = carsData?.find(car => car.id === quote.car_id)
        return {
          ...quote,
          cars: matchingCar // cars라는 이름으로 차량 정보를 넣어줌
        }
      })

      setQuotes(combinedData)
      setLoading(false)
    }

    fetchQuotes()
  }, [])

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in">

      {/* 상단 헤더 */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">📄 견적 및 계약 관리</h1>
          <p className="text-gray-500 mt-2">발행된 견적서: <span className="font-bold text-blue-600">{quotes.length}</span>건</p>
        </div>
        <div className="flex gap-3">
            <Link href="/" className="px-6 py-3 border border-gray-300 rounded-xl font-bold text-gray-600 hover:bg-gray-50">
                🚗 차량 관리로
            </Link>
            <Link href="/quotes/new" className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black shadow-lg">
                + 새 견적 작성
            </Link>
        </div>
      </div>

      {/* 견적 리스트 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
            <div className="p-20 text-center text-gray-400">로딩 중...</div>
        ) : quotes.length === 0 ? (
            <div className="p-20 text-center text-gray-400">
                아직 발행된 견적서가 없습니다.<br/>
                우측 상단 버튼을 눌러 첫 견적을 만들어보세요!
            </div>
        ) : (
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 font-bold border-b">
                    <tr>
                        <th className="p-4 pl-6">상태</th>
                        <th className="p-4">고객명</th>
                        <th className="p-4">대상 차량</th>
                        <th className="p-4">계약 기간</th>
                        <th className="p-4 text-right">보증금</th>
                        <th className="p-4 text-right">월 렌트료(VAT포함)</th>
                        <th className="p-4 text-center">작성일</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {quotes.map((q) => (
                        <tr key={q.id} className="hover:bg-blue-50 transition-colors group cursor-pointer">
                            <td className="p-4 pl-6">
                                <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                                    q.status === 'active' ? 'bg-blue-100 text-blue-700' :
                                    q.status === 'pending' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {q.status === 'active' ? '계약중' : q.status === 'pending' ? '견적단계' : '종료'}
                                </span>
                            </td>
                            <td className="p-4">
                                <div className="font-bold text-gray-900">{q.customer_name}</div>
                                <div className="text-xs text-gray-400">개인/법인</div>
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border">
                                        {q.cars?.image_url ? (
                                            <img src={q.cars.image_url} className="w-full h-full object-cover"/>
                                        ) : <span className="text-xs text-gray-300 flex items-center justify-center h-full">No Img</span>}
                                    </div>
                                    <div>
                                        {/* cars 정보가 있으면 보여주고 없으면(삭제된 차) 미상으로 표시 */}
                                        <div className="font-bold text-gray-800">{q.cars?.number || '차량정보 없음'}</div>
                                        <div className="text-xs text-gray-500">{q.cars?.brand} {q.cars?.model}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="p-4 font-bold text-gray-600">
                                {q.start_date} ~ {q.end_date}
                            </td>
                            <td className="p-4 text-right font-medium text-gray-500">
                                {f(q.deposit)}원
                            </td>
                            <td className="p-4 text-right">
                                <div className="font-black text-blue-900 text-lg">{f(q.rent_fee + (q.rent_fee * 0.1))}원</div>
                                <div className="text-xs text-gray-400">(공급가 {f(q.rent_fee)})</div>
                            </td>
                            <td className="p-4 text-center text-gray-400 text-xs">
                                {q.created_at?.split('T')[0]}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  )
}