'use client'
import { supabase } from '../utils/supabase'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

export default function JiipListPage() {
const router = useRouter()

  // ✅ [핵심 1] 전역 상태에서 '현재 선택된 회사' 가져오기
  const { company: currentCompany, role, adminSelectedCompanyId } = useApp()

  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 데이터 불러오기
  const fetchContracts = async () => {
    // god_admin이 아닌데 회사가 없으면 로딩 안 함
    if (!currentCompany?.id && role !== 'god_admin') return

    setLoading(true)

    // 차량 정보(cars)도 같이 가져오기 (Join)
    let query = supabase
      .from('jiip_contracts')
      .select(`
        *,
        car:cars ( number, model )
      `)

    // god_admin은 전체 데이터 조회, 일반 사용자는 본인 회사만
    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (currentCompany?.id) {
      query = query.eq('company_id', currentCompany.id)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('데이터 로딩 실패 원인:', error.message)
    } else {
      setContracts(data || [])
    }
    setLoading(false)
  }

  // 회사 또는 역할이 바뀌면 데이터를 다시 불러옵니다.
  useEffect(() => {
    fetchContracts()
  }, [currentCompany, role, adminSelectedCompanyId])

  // (편의기능) 총 투자금 합계 계산
  const totalInvest = contracts.reduce((sum, item) => sum + (item.invest_amount || 0), 0)

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-12 md:px-6 bg-gray-50/50 min-h-screen">
      {/* 상단 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900">
             🤝 {currentCompany?.name} 지입/위수탁 관리
          </h1>
          <p className="text-gray-500 mt-2">차주 및 투자자와의 계약 현황을 관리합니다.</p>
        </div>
        <button
          onClick={() => router.push('/jiip/new')} // (나중에 등록 페이지 만들 예정)
          className="bg-steel-600 text-white px-4 py-2 text-sm md:px-6 md:py-3 md:text-base rounded-xl font-bold hover:bg-steel-700 shadow-lg shadow-steel-200 transition-all"
        >
          + 신규 계약 등록
        </button>
      </div>

      {/* 요약 대시보드 (간단) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 font-bold">총 운영 차량</p>
            <p className="text-xl md:text-3xl font-black text-gray-800">{contracts.length}대</p>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 font-bold">총 투자 유치금</p>
            <p className="text-xl md:text-3xl font-black text-steel-600">{totalInvest.toLocaleString()}원</p>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 font-bold">이번 달 지급 예정액</p>
            <p className="text-xl md:text-3xl font-black text-gray-400">-</p> {/* 추후 구현 */}
        </div>
      </div>

      {/* 리스트 테이블 */}
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        {loading ? (
           <div className="p-20 text-center text-gray-400 font-bold animate-pulse">데이터를 불러오는 중...</div>
        ) : contracts.length === 0 ? (
           <div className="p-20 text-center flex flex-col items-center justify-center">
             <div className="text-5xl mb-4">🚛</div>
             <p className="text-gray-900 font-bold text-lg">등록된 지입 계약이 없습니다.</p>
             <p className="text-gray-500 text-sm mt-2">우측 상단 버튼을 눌러 첫 번째 계약을 등록해보세요.</p>
           </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="p-3 md:p-5 font-bold">계약 차량</th>
                    <th className="p-3 md:p-5 font-bold">투자자(차주)</th>
                    <th className="p-3 md:p-5 font-bold">투자금 / 수익률</th>
                    <th className="p-3 md:p-5 font-bold">월 관리비</th>
                    <th className="p-3 md:p-5 font-bold">지급일</th>
                    <th className="p-3 md:p-5 font-bold text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contracts.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => router.push(`/jiip/${item.id}`)}>
                      <td className="p-3 md:p-5">
                        <div className="font-bold text-gray-900">{item.car?.number || '차량 미지정'}</div>
                        <div className="text-xs text-gray-400">{item.car?.model}</div>
                      </td>
                      <td className="p-3 md:p-5">
                        <div className="font-bold text-gray-700">{item.investor_name}</div>
                        <div className="text-xs text-gray-400">{item.investor_phone}</div>
                      </td>
                      <td className="p-3 md:p-5">
                        <div className="font-bold text-steel-600">{item.invest_amount.toLocaleString()}원</div>
                        <span className="text-xs bg-steel-50 text-steel-600 px-1.5 py-0.5 rounded font-bold">
                          {item.share_ratio}% 배분
                        </span>
                      </td>
                      <td className="p-3 md:p-5 text-sm font-bold text-gray-600">
                        {item.admin_fee.toLocaleString()}원
                      </td>
                      <td className="p-3 md:p-5 text-sm font-bold text-gray-500">
                        매월 {item.payout_day}일
                      </td>
                      <td className="p-3 md:p-5 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          item.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {item.status === 'active' ? '운영 중' : '종료'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-100">
              {contracts.map((item) => (
                <div key={item.id} onClick={() => router.push(`/jiip/${item.id}`)} className="p-4 hover:bg-gray-50/50 transition-colors cursor-pointer">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-gray-900 text-base">{item.car?.number || '차량 미지정'}</div>
                      <div className="text-xs text-gray-500 mt-1">{item.car?.model}</div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ml-2 ${
                      item.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {item.status === 'active' ? '운영 중' : '종료'}
                    </span>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-600 font-bold mb-1">차주명</div>
                    <div className="font-bold text-gray-900">{item.investor_name}</div>
                    <div className="text-xs text-gray-500">{item.investor_phone}</div>
                  </div>
                  <div className="mb-3 pb-3 border-b border-gray-200">
                    <div className="text-xs text-gray-600 font-bold mb-1">투자금</div>
                    <div className="text-xl font-black text-steel-600">{item.invest_amount.toLocaleString()}원</div>
                    <span className="text-xs bg-steel-50 text-steel-600 px-1.5 py-0.5 rounded font-bold mt-1 inline-block">
                      {item.share_ratio}% 배분
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">월 관리비</div>
                      <div className="font-bold text-gray-900">{item.admin_fee.toLocaleString()}원</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">지급일</div>
                      <div className="font-bold text-gray-900">매월 {item.payout_day}일</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}