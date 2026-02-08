'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation' // 👈 페이지 이동을 위해 추가

export default function LoanListPage() {
  const { company, role } = useApp()

// ✅ [수정 2] supabase 클라이언트 생성 (이 줄이 없어서 에러가 난 겁니다!)
const router = useRouter()
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [company, role])

  const fetchData = async () => {
    if (!company && role !== 'god_admin') return
    setLoading(true)
    let query = supabase
      .from('loans')
      .select('*, cars(number, brand, model)')

    if (role !== 'god_admin' && company) {
      query = query.eq('company_id', company.id)
    }

    const { data } = await query.order('created_at', { ascending: false })

    setLoans(data || [])
    setLoading(false)
  }

  // 삭제 기능 (리스트에서 바로 삭제)
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation() // 상세페이지 이동 방지
    if(!confirm('정말 삭제하시겠습니까?')) return
    await supabase.from('loans').delete().eq('id', id)
    fetchData()
  }

  // 합계 계산
  const totalDebt = loans.reduce((acc, cur) => acc + (cur.total_amount || 0), 0)
  const monthlyOut = loans.reduce((acc, cur) => acc + (cur.monthly_payment || 0), 0)

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in-up">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">🏦 대출/금융사 관리</h1>
          <p className="text-gray-500 mt-2">차량별 할부, 리스, 대출 현황을 한눈에 관리하세요.</p>
        </div>
        {/* 👇 신규 등록 버튼 (페이지 이동) */}
        <button
          onClick={() => router.push('/loans/new')}
          className="bg-indigo-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black transition-all shadow-lg"
        >
          + 신규 금융 등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">총 대출 잔액</p>
          <p className="text-3xl font-black text-indigo-900">{totalDebt.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">월 고정 지출액</p>
          <p className="text-3xl font-black text-red-500">{monthlyOut.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">관리 중인 계약</p>
          <p className="text-3xl font-black text-gray-800">{loans.length}건</p>
        </div>
      </div>

      {/* 리스트 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
            <tr>
              <th className="p-4 text-xs font-bold">대상 차량</th>
              <th className="p-4 text-xs font-bold">금융사/구분</th>
              <th className="p-4 text-xs font-bold text-right">대출 원금</th>
              <th className="p-4 text-xs font-bold text-right">월 납입금</th>
              <th className="p-4 text-xs font-bold">기간/만기</th>
              <th className="p-4 text-xs font-bold text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-10 text-center text-gray-400">데이터를 불러오는 중...</td></tr>
            ) : loans.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center text-gray-400">등록된 금융 정보가 없습니다.</td></tr>
            ) : (
              loans.map((loan) => (
                <tr
                  key={loan.id}
                  onClick={() => router.push(`/loans/${loan.id}`)} // 👈 클릭 시 상세 페이지로 이동
                  className="border-b border-gray-50 hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                >
                  <td className="p-4">
                    <div className="font-bold text-gray-900">{loan.cars?.number || '차량 정보 없음'}</div>
                    <div className="text-xs text-gray-500">{loan.cars?.model}</div>
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-gray-800">{loan.finance_name}</span>
                    <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{loan.type}</span>
                  </td>
                  <td className="p-4 font-medium text-right text-gray-600">
                    {loan.total_amount?.toLocaleString()}원
                  </td>
                  <td className="p-4 font-bold text-red-500 text-right">
                    {loan.monthly_payment?.toLocaleString()}원
                  </td>
                  <td className="p-4 text-sm">
                      <div className="font-bold text-gray-700">{loan.months}개월</div>
                      <div className="text-xs text-gray-400">{loan.start_date ? `~ ${loan.end_date || '미정'}` : '-'}</div>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={(e) => handleDelete(e, loan.id)}
                      className="text-gray-300 hover:text-red-500 font-bold px-3 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}