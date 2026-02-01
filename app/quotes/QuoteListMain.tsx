'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import Link from 'next/link'

export default function QuoteListPage() {
  const router = useRouter()
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchQuotes = async () => {
      // 1. 견적서 가져오기
      const { data: quotesData, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .order('id', { ascending: false })

      if (quoteError || !quotesData) {
        setLoading(false)
        return
      }

      // 2. 차량 정보 & 계약 정보 함께 가져오기
      const quoteIds = quotesData.map(q => q.id)
      const carIds = quotesData.map(q => q.car_id)

      // (1) 차량 정보
      const { data: carsData } = await supabase.from('cars').select('*').in('id', carIds)

      // (2) 계약 정보 (이 견적으로 만들어진 계약서가 있는지 확인)
      const { data: contractsData } = await supabase.from('contracts').select('id, quote_id, status').in('quote_id', quoteIds)

      // 3. 데이터 합치기
      const combinedData = quotesData.map(quote => {
        const matchingCar = carsData?.find(c => c.id === quote.car_id)
        const matchingContract = contractsData?.find(c => c.quote_id === quote.id) // 연결된 계약 찾기

        return {
          ...quote,
          car: matchingCar,
          contract: matchingContract // 계약 정보 통째로 넣어둠 (없으면 undefined)
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
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">📄 견적 및 계약 관리</h1>
          <p className="text-gray-500 mt-2">전체 견적: <span className="font-bold text-blue-600">{quotes.length}</span>건</p>
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

      {/* 리스트 테이블 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
            <div className="p-20 text-center text-gray-400">로딩 중...</div>
        ) : quotes.length === 0 ? (
            <div className="p-20 text-center text-gray-400">발행된 견적서가 없습니다.</div>
        ) : (
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 font-bold border-b">
                    <tr>
                        <th className="p-4 pl-6">진행상태</th>
                        <th className="p-4">고객명</th>
                        <th className="p-4">대상 차량</th>
                        <th className="p-4">계약 기간</th>
                        <th className="p-4 text-right">보증금</th>
                        <th className="p-4 text-right">월 렌트료</th>
                        <th className="p-4 text-center">작성일</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {quotes.map((quote) => (
                        <tr
                            key={quote.id}
                            // 👇 계약이 있으면 '계약서'로, 없으면 '견적서'로 이동하게 분기 처리
                            onClick={() => {
                                if (quote.contract) router.push(`/contracts/${quote.contract.id}`)
                                else router.push(`/quotes/${quote.id}`)
                            }}
                            className={`transition-colors cursor-pointer group ${quote.contract ? 'bg-blue-50/30 hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                            <td className="p-4 pl-6">
                                {/* 👇 상태값 표시 로직 업그레이드 */}
                                {quote.contract ? (
                                    <span className="px-2 py-1 rounded-md text-xs font-black bg-blue-600 text-white shadow-sm">
                                        계약확정 ✅
                                    </span>
                                ) : (
                                    <span className="px-2 py-1 rounded-md text-xs font-bold bg-gray-200 text-gray-600">
                                        견적단계
                                    </span>
                                )}
                            </td>
                            <td className="p-4">
                                <div className="font-bold text-gray-900">{quote.customer_name}</div>
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden border">
                                        {quote.car?.image_url ? (
                                            <img src={quote.car.image_url} className="w-full h-full object-cover"/>
                                        ) : <span className="text-xs text-gray-300 flex items-center justify-center h-full">No Img</span>}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-800">{quote.car?.number || '정보없음'}</div>
                                        <div className="text-xs text-gray-500">{quote.car?.brand} {quote.car?.model}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="p-4 text-gray-600 font-medium">
                                {quote.start_date} ~ {quote.end_date}
                            </td>
                            <td className="p-4 text-right text-gray-500">
                                {f(quote.deposit)}
                            </td>
                            <td className="p-4 text-right">
                                <span className="font-black text-blue-900 text-lg">{f(quote.rent_fee + (quote.rent_fee * 0.1))}</span>
                            </td>
                            <td className="p-4 text-center text-gray-400 text-xs">
                                {quote.created_at?.split('T')[0]}
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