'use client'
import { supabase } from '../../utils/supabase'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ContractDetailPage() {
  const { id } = useParams()
  const contractId = Array.isArray(id) ? id[0] : id
  const router = useRouter()

  const [contract, setContract] = useState<any>(null)
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 데이터 불러오기
  const fetchData = async () => {
    if(!contractId) return
    // 계약 정보
    const { data: cData } = await supabase.from('contracts').select('*, car:cars(*)').eq('id', contractId).single()
    setContract(cData)

    // 수납 스케줄 (날짜순 정렬)
    const { data: sData } = await supabase.from('payment_schedules').select('*').eq('contract_id', contractId).order('round_number', { ascending: true })
    setSchedules(sData || [])

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [contractId])

  // 💰 수납 처리 (토글 기능)
  const togglePayment = async (scheduleId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid'
    const paidDate = newStatus === 'paid' ? new Date().toISOString().split('T')[0] : null // 오늘 날짜

    const { error } = await supabase
      .from('payment_schedules')
      .update({ status: newStatus, paid_date: paidDate })
      .eq('id', scheduleId)

    if (error) alert('오류: ' + error.message)
    else fetchData() // 새로고침 없이 데이터만 다시 로드
  }

  const f = (n: number) => n?.toLocaleString() || '0'

  if (loading) return <div className="p-20 text-center">장부 불러오는 중...</div>

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8 pb-6 border-b">
        <div>
          <span className="text-sm font-bold text-steel-600 bg-steel-50 px-2 py-1 rounded">계약 관리</span>
          <h1 className="text-3xl font-black mt-2">{contract.customer_name}님 계약 현황</h1>
          <p className="text-gray-500 mt-1">{contract.car?.number} ({contract.car?.model})</p>
        </div>
        <div className="text-right">
            <p className="text-sm text-gray-500">총 계약기간</p>
            <p className="font-bold text-lg">{contract.start_date} ~ {contract.end_date}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 왼쪽: 요약 카드 */}
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border shadow-sm">
                <h3 className="font-bold text-gray-700 mb-4">계약 요약</h3>
                <div className="space-y-3">
                    <div className="flex justify-between"><span>보증금</span><b>{f(contract.deposit)}원</b></div>
                    <div className="flex justify-between"><span>월 렌트료</span><b>{f(contract.monthly_rent)}원</b></div>
                    <div className="flex justify-between text-blue-600"><span>납입금(VAT포함)</span><b className="text-xl">{f(contract.monthly_rent * 1.1)}원</b></div>
                </div>
            </div>

            {/* 수납 현황판 */}
            <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg">
                <h3 className="font-bold text-gray-400 mb-4">수납 현황</h3>
                <div className="flex justify-between items-end mb-2">
                    <span className="text-3xl font-black text-green-400">
                        {schedules.filter(s => s.status === 'paid').length}회
                    </span>
                    <span className="text-gray-400">/ 총 {schedules.length}회</span>
                </div>
                <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full transition-all duration-500"
                         style={{ width: `${(schedules.filter(s => s.status === 'paid').length / schedules.length) * 100}%` }}></div>
                </div>
                <p className="text-right text-xs text-gray-400 mt-2">
                    미수금: {f(schedules.filter(s => s.status === 'unpaid').reduce((a, c) => a + c.amount, 0))}원
                </p>
            </div>
        </div>

        {/* 오른쪽: 수납 스케줄 테이블 (메인) */}
        <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="p-4 bg-gray-50 border-b font-bold flex justify-between items-center">
                    <span>📅 월별 수납 장부</span>
                    <span className="text-xs font-normal text-gray-500">* 클릭하여 수납처리</span>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 text-gray-500 text-xs sticky top-0">
                            <tr>
                                <th className="p-3">회차</th>
                                <th className="p-3">예정일</th>
                                <th className="p-3 text-right">금액</th>
                                <th className="p-3 text-center">상태</th>
                                <th className="p-3 text-right">처리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {schedules.map((item) => (
                                <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${item.status === 'paid' ? 'bg-green-50/30' : ''}`}>
                                    <td className="p-4 font-bold text-gray-600">
                                        {item.round_number === 0 ? <span className="text-blue-600">보증금</span> : `${item.round_number}회차`}
                                    </td>
                                    <td className={`p-4 ${new Date(item.due_date) < new Date() && item.status === 'unpaid' ? 'text-red-500 font-bold' : ''}`}>
                                        {item.due_date}
                                        {new Date(item.due_date) < new Date() && item.status === 'unpaid' && <span className="text-xs ml-1">❗연체</span>}
                                    </td>
                                    <td className="p-4 text-right font-bold">{f(item.amount)}</td>
                                    <td className="p-4 text-center">
                                        {item.status === 'paid'
                                            ? <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-bold">완납 ({item.paid_date})</span>
                                            : <span className="px-2 py-1 rounded bg-red-100 text-red-600 text-xs font-bold">미납</span>}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => togglePayment(item.id, item.status)}
                                            className={`px-3 py-1 rounded border text-xs font-bold transition-all
                                                ${item.status === 'paid'
                                                    ? 'border-gray-200 text-gray-400 hover:bg-gray-100'
                                                    : 'bg-black text-white hover:bg-gray-800 shadow-md'}`}
                                        >
                                            {item.status === 'paid' ? '취소' : '수납확인'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}