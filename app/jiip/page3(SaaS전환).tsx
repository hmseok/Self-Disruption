'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function JiipListPage() {
  const router = useRouter()

  // ✅ [수정] 이 한 줄이 빠져 있었습니다! (추가 완료)
  const supabase = createClientComponentClient()

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    // 이제 supabase 변수가 있어서 에러가 나지 않습니다.
    const { data, error } = await supabase
      .from('jiip_contracts')
      .select('*, cars(number, brand, model)')
      .order('created_at', { ascending: false })

    if (!error) setItems(data || [])
    setLoading(false)
  }

  // 합계 계산
  const totalInvest = items.reduce((acc, cur) => acc + (cur.invest_amount || 0), 0)

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in-up">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">🤝 지입/투자 계약 관리</h1>
          <p className="text-gray-500 mt-2">차량 투자 계약 및 수익 배분율을 리스트로 관리합니다.</p>
        </div>
        <button
          onClick={() => router.push('/jiip/new')}
          className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg"
        >
          + 투자 계약 등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">총 투자 유치금</p>
          <p className="text-3xl font-black text-green-700">{totalInvest.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">평균 배분율 (투자자)</p>
          <p className="text-3xl font-black text-blue-600">
            {items.length > 0 ? (items.reduce((acc, cur) => acc + (cur.share_ratio || 0), 0) / items.length).toFixed(0) : 0}%
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">운영 중인 계약</p>
          <p className="text-3xl font-black text-gray-800">{items.length}건</p>
        </div>
      </div>

      {/* 리스트 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="p-4 text-xs font-bold text-gray-500">대상 차량</th>
              <th className="p-4 text-xs font-bold text-gray-500">투자자 (을)</th>
              <th className="p-4 text-xs font-bold text-gray-500">투자금 / 기간</th>
              <th className="p-4 text-xs font-bold text-gray-500">수익 배분 조건</th>
              <th className="p-4 text-xs font-bold text-gray-500 text-right">상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="p-10 text-center">로딩 중...</td></tr> :
             items.map((item) => (
              <tr key={item.id} onClick={() => router.push(`/jiip/${item.id}`)} className="border-b border-gray-50 hover:bg-green-50 transition-colors cursor-pointer group">
                <td className="p-4">
                  <div className="font-bold text-gray-900 group-hover:text-green-700">{item.cars?.number}</div>
                  <div className="text-xs text-gray-500">{item.cars?.brand} {item.cars?.model}</div>
                </td>
                <td className="p-4">
                  <div className="font-bold">{item.investor_name}</div>
                  <div className="text-xs text-gray-400">{item.investor_phone}</div>
                </td>
                <td className="p-4">
                   <div className="font-bold">{item.invest_amount?.toLocaleString()}원</div>
                   <div className="text-xs text-gray-400">{item.contract_start_date} ~</div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">배분 {item.share_ratio}%</span>
                    <span className="text-xs text-gray-500">관리비 -{(item.admin_fee / 10000)}만</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">매월 {item.payout_day}일 지급</div>
                </td>
                <td className="p-4 text-right">
                  <span className="text-gray-400 text-xs font-bold group-hover:text-green-600">상세보기 &gt;</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}