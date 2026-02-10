'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation' // 👈 페이지 이동을 위해 추가

export default function LoanListPage() {
  const { company, role, adminSelectedCompanyId } = useApp()

// ✅ [수정 2] supabase 클라이언트 생성 (이 줄이 없어서 에러가 난 겁니다!)
const router = useRouter()
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [company, role, adminSelectedCompanyId])

  const fetchData = async () => {
    if (!company && role !== 'god_admin') return
    setLoading(true)
    let query = supabase
      .from('loans')
      .select('*, cars(number, brand, model)')

    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company) {
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
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-12 md:px-6 bg-gray-50/50 min-h-screen">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900">🏦 대출/금융사 관리</h1>
          <p className="text-gray-500 mt-2">차량별 할부, 리스, 대출 현황을 한눈에 관리하세요.</p>
        </div>
        {/* 👇 신규 등록 버튼 (페이지 이동) */}
        <button
          onClick={() => router.push('/loans/new')}
          className="bg-steel-900 text-white px-4 py-2 text-sm md:px-6 md:py-3 md:text-base rounded-xl font-bold hover:bg-black transition-all shadow-lg"
        >
          + 신규 금융 등록
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">총 대출 잔액</p>
          <p className="text-xl md:text-3xl font-black text-steel-900">{totalDebt.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">월 고정 지출액</p>
          <p className="text-xl md:text-3xl font-black text-red-500">{monthlyOut.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-gray-500 text-xs font-bold mb-1">관리 중인 계약</p>
          <p className="text-xl md:text-3xl font-black text-gray-800">{loans.length}건</p>
        </div>
      </div>

      {/* 리스트 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 md:p-10 text-center text-gray-400">데이터를 불러오는 중...</div>
        ) : loans.length === 0 ? (
          <div className="p-6 md:p-10 text-center text-gray-400">등록된 금융 정보가 없습니다.</div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                  <tr>
                    <th className="p-3 md:p-4 text-xs font-bold">대상 차량</th>
                    <th className="p-3 md:p-4 text-xs font-bold">금융사/구분</th>
                    <th className="p-4 text-xs font-bold text-right">대출 원금</th>
                    <th className="p-4 text-xs font-bold text-right">월 납입금</th>
                    <th className="p-4 text-xs font-bold">기간/만기</th>
                    <th className="p-4 text-xs font-bold text-center">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr
                      key={loan.id}
                      onClick={() => router.push(`/loans/${loan.id}`)}
                      className="border-b border-gray-50 hover:bg-steel-50 transition-colors cursor-pointer group"
                    >
                      <td className="p-3 md:p-4">
                        <div className="font-bold text-gray-900">{loan.cars?.number || '차량 정보 없음'}</div>
                        <div className="text-xs text-gray-500">{loan.cars?.model}</div>
                      </td>
                      <td className="p-3 md:p-4">
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-100">
              {loans.map((loan) => (
                <div
                  key={loan.id}
                  onClick={() => router.push(`/loans/${loan.id}`)}
                  className="p-4 hover:bg-steel-50 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-gray-900">{loan.cars?.number || '차량 정보 없음'}</div>
                      <div className="text-xs text-gray-500 mt-1">{loan.cars?.model}</div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, loan.id)}
                      className="text-gray-300 hover:text-red-500 font-bold px-2 py-1 text-sm"
                    >
                      삭제
                    </button>
                  </div>
                  <div className="mb-3 pb-3 border-b border-gray-200">
                    <div className="text-xs text-gray-600 font-bold mb-1">금융사</div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800">{loan.finance_name}</span>
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{loan.type}</span>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-600 font-bold mb-1">대출 원금</div>
                    <div className="text-xl font-black text-gray-900">{loan.total_amount?.toLocaleString()}원</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-600 font-bold mb-1">월 납입금</div>
                      <div className="font-bold text-red-500 text-base">{loan.monthly_payment?.toLocaleString()}원</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 font-bold mb-1">기간</div>
                      <div className="font-bold text-gray-700">{loan.months}개월</div>
                    </div>
                  </div>
                  {loan.start_date && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-600 font-bold mb-1">만기일</div>
                      <div className="text-xs text-gray-500">{loan.end_date || '미정'}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}