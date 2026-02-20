'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// 금액 포맷 (소수점 1자리 강제 통일)
const f = (n: number) => n ? n.toLocaleString() : '0'

const formatSimpleMoney = (num: number) => {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '억' // 예: 1.5억
  if (num >= 10000) return (num / 10000).toFixed(1) + '만'       // 예: 5,250.5만 (수정됨)
  return num.toLocaleString()
}

export default function GeneralInvestDashboard() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // 📊 일반 투자 전용 통계
  const [stats, setStats] = useState({
    totalAmount: 0,      // 총 투자 원금
    totalMonthlyInterest: 0, // 월 예상 이자 지출액
    avgInterestRate: 0,  // 평균 이자율
    activeCount: 0       // 진행 중 건수
  })

  useEffect(() => {
    fetchData()
  }, [company, role, adminSelectedCompanyId])

  const fetchData = async () => {
    if (!company && role !== 'god_admin') return
    setLoading(true)

    // 오직 'general_investments' 테이블만 조회
    let query = supabase
      .from('general_investments')
      .select('*')

    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company) {
      query = query.eq('company_id', company.id)
    }

    const { data } = await query.order('created_at', { ascending: false })

    const investments = data || []
    setList(investments)

    // 통계 계산
    const totalAmount = investments.reduce((acc, cur) => acc + (cur.invest_amount || 0), 0)

    // 월 이자 지출액 추산 (원금 * 연이율 / 12)
    const totalMonthlyInterest = investments.reduce((acc, cur) => {
        return acc + ((cur.invest_amount || 0) * (cur.interest_rate || 0) / 100 / 12)
    }, 0)

    const avgInterestRate = investments.length > 0
        ? investments.reduce((acc, cur) => acc + (cur.interest_rate || 0), 0) / investments.length
        : 0

    setStats({
        totalAmount,
        totalMonthlyInterest,
        avgInterestRate,
        activeCount: investments.filter(i => i.status === 'active').length
    })

    setLoading(false)
  }

  // 종료 건수
  const endedCount = list.filter(i => i.status !== 'active').length

  // 만기 임박 (90일 이내)
  const today = new Date()
  const ninetyDaysLater = new Date(today.getTime() + 90*24*60*60*1000)
  const expiringCount = list.filter(i => {
    if (!i.contract_end_date) return false
    const end = new Date(i.contract_end_date)
    return end >= today && end <= ninetyDaysLater
  }).length

  // 필터 + 검색
  const filteredList = list.filter(item => {
    if (statusFilter === 'active' && item.status !== 'active') return false
    if (statusFilter === 'ended' && item.status === 'active') return false
    if (statusFilter === 'expiring') {
      if (!item.contract_end_date) return false
      const end = new Date(item.contract_end_date)
      if (end < today || end > ninetyDaysLater) return false
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return (
        (item.investor_name || '').toLowerCase().includes(term) ||
        (item.investor_phone || '').includes(term)
      )
    }
    return true
  })

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen pb-20 md:pb-32">

      {/* 상단 헤더 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">💼 투자자/펀딩 정산</h1>
        </div>

        <Link href="/invest/general/new" className="py-2.5 px-5 bg-steel-600 text-white text-sm md:text-base rounded-xl font-bold hover:bg-steel-700 transition-colors flex items-center gap-2">
          + 신규 투자 등록
        </Link>
      </div>

      {/* KPI 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
        <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 font-bold">총 투자 원금</p>
          <p className="text-lg md:text-xl font-black text-gray-800 mt-1">{formatSimpleMoney(stats.totalAmount)}<span className="text-xs text-gray-400 ml-0.5">원</span></p>
        </div>
        <div className="bg-green-50 p-3 md:p-4 rounded-xl border border-green-100 cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('active')}>
          <p className="text-xs text-green-600 font-bold">운용 중</p>
          <p className="text-lg md:text-xl font-black text-green-700 mt-1">{stats.activeCount}<span className="text-xs text-green-500 ml-0.5">건</span></p>
        </div>
        <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-100">
          <p className="text-xs text-red-500 font-bold">월 예상 이자</p>
          <p className="text-lg md:text-xl font-black text-red-600 mt-1">{formatSimpleMoney(stats.totalMonthlyInterest)}<span className="text-xs text-red-400 ml-0.5">원</span></p>
        </div>
        <div className={`p-3 md:p-4 rounded-xl border cursor-pointer hover:shadow-md ${expiringCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`} onClick={() => setStatusFilter('expiring')}>
          <p className="text-xs text-amber-600 font-bold">만기 임박 (90일)</p>
          <p className="text-lg md:text-xl font-black text-amber-700 mt-1">{expiringCount}<span className="text-xs text-amber-500 ml-0.5">건</span></p>
        </div>
        <div className="bg-steel-50 p-3 md:p-4 rounded-xl border border-steel-100">
          <p className="text-xs text-steel-500 font-bold">평균 연 수익률</p>
          <p className="text-lg md:text-xl font-black text-steel-700 mt-1">{stats.avgInterestRate.toFixed(1)}<span className="text-xs text-steel-400 ml-0.5">%</span></p>
        </div>
      </div>

      {/* 필터 + 검색 */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {[
            { key: 'all', label: '전체', count: list.length },
            { key: 'active', label: '운용중', count: stats.activeCount },
            { key: 'expiring', label: '만기임박', count: expiringCount },
            { key: 'ended', label: '종료', count: endedCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === tab.key
                  ? 'bg-steel-600 text-white shadow'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="투자자명, 연락처 검색..."
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1 focus:outline-none focus:border-steel-500 shadow-sm"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* 일반 투자 리스트 */}
      <div className="bg-white shadow-sm border rounded-2xl overflow-hidden min-h-[300px]">
          {loading ? (
              <div className="p-20 text-center text-gray-400">데이터 로딩 중...</div>
          ) : filteredList.length === 0 ? (
              <div className="p-20 text-center text-gray-400">
                  {list.length === 0 ? '아직 등록된 일반 투자가 없습니다.' : '해당 조건의 투자 정보가 없습니다.'}
              </div>
          ) : (
              <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm text-left min-w-[600px]">
                          <thead className="bg-gray-50 text-gray-600 font-bold border-b text-xs uppercase">
                              <tr>
                                  <th className="p-4">투자자 정보</th>
                                  <th className="p-4 text-right">투자 원금</th>
                                  <th className="p-4 text-center">이자율 (연)</th>
                                  <th className="p-4 text-center">이자 지급일</th>
                                  <th className="p-4 text-center">계약 기간</th>
                                  <th className="p-4 text-center">상태</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {filteredList.map(item => (
                                  <tr key={item.id} onClick={() => router.push(`/invest/general/${item.id}`)} className="hover:bg-steel-50 cursor-pointer group transition-colors">
                                      <td className="p-4">
                                          <div className="font-bold text-gray-900 text-base">{item.investor_name}</div>
                                          <div className="text-xs text-gray-400">{item.investor_phone}</div>
                                      </td>
                                      <td className="p-4 text-right font-black text-gray-900 text-base">
                                          {f(item.invest_amount)}원
                                      </td>
                                      <td className="p-4 text-center">
                                          <span className="bg-steel-50 text-steel-700 px-2 py-1 rounded font-bold">{Number(item.interest_rate).toFixed(1)}%</span>
                                      </td>
                                      <td className="p-4 text-center font-bold text-gray-600">
                                          매월 <span className="text-black">{item.payment_day}일</span>
                                      </td>
                                      <td className="p-4 text-center text-xs text-gray-500">
                                          {item.contract_start_date} <br/> ~ {item.contract_end_date}
                                      </td>
                                      <td className="p-4 text-center">
                                          <span className={`px-2 py-1 rounded text-xs font-bold ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                              {item.status === 'active' ? '운용중' : '종료됨'}
                                          </span>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden divide-y divide-gray-100">
                      {filteredList.map(item => (
                          <div key={item.id} onClick={() => router.push(`/invest/general/${item.id}`)} className="p-4 hover:bg-steel-50/30 transition-colors cursor-pointer">
                              <div className="flex justify-between items-start mb-3">
                                  <div>
                                      <div className="font-bold text-gray-900 text-base">{item.investor_name}</div>
                                      <div className="text-xs text-gray-500 mt-1">{item.investor_phone}</div>
                                  </div>
                                  <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ml-2 ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {item.status === 'active' ? '운용중' : '종료됨'}
                                  </span>
                              </div>
                              <div className="mb-3 pb-3 border-b border-gray-200">
                                  <div className="text-sm text-gray-600 mb-1">투자 원금</div>
                                  <div className="text-2xl font-black text-steel-600">{f(item.invest_amount)}원</div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                  <div>
                                      <div className="text-xs text-gray-500 mb-1">이자율</div>
                                      <div className="font-bold text-gray-900">{Number(item.interest_rate).toFixed(1)}%</div>
                                  </div>
                                  <div>
                                      <div className="text-xs text-gray-500 mb-1">지급일</div>
                                      <div className="font-bold text-gray-900">매월 {item.payment_day}일</div>
                                  </div>
                              </div>
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="text-xs text-gray-500 mb-1">계약 기간</div>
                                  <div className="text-xs text-gray-600">{item.contract_start_date} ~ {item.contract_end_date}</div>
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