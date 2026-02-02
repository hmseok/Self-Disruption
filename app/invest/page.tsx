'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// 금액 포맷
const f = (n: number) => n ? n.toLocaleString() : '0'
const formatSimpleMoney = (num: number) => {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '억'
  if (num >= 10000) return (num / 10000).toLocaleString() + '만'
  return num.toLocaleString()
}

export default function GeneralInvestDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])

  // 📊 일반 투자 전용 통계
  const [stats, setStats] = useState({
    totalAmount: 0,      // 총 투자 원금
    totalMonthlyInterest: 0, // 월 예상 이자 지출액
    avgInterestRate: 0,  // 평균 이자율
    activeCount: 0       // 진행 중 건수
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    // 오직 'general_investments' 테이블만 조회
    const { data } = await supabase
      .from('general_investments')
      .select('*')
      .order('created_at', { ascending: false })

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
        activeCount: investments.length
    })

    setLoading(false)
  }

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in pb-32">

      {/* 상단 헤더 (제목 변경됨) */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">💰 일반 투자 관리</h1>
          <p className="text-gray-500 mt-2">법인 운영 자금 및 순수 투자 계약 현황입니다.</p>
        </div>

        <Link href="/invest/general/new" className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center gap-2 transition-all">
          + 신규 투자 등록
        </Link>
      </div>

      {/* 📊 KPI 요약 카드 (일반 투자 전용) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100">
              <p className="text-xs font-bold text-gray-400 mb-1 uppercase">Total Principal</p>
              <h3 className="text-3xl font-black text-gray-900">{formatSimpleMoney(stats.totalAmount)}원</h3>
              <p className="text-xs text-gray-500 mt-2">총 투자 원금 (부채)</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-100">
              <p className="text-xs font-bold text-gray-400 mb-1 uppercase">Monthly Interest</p>
              <h3 className="text-3xl font-black text-red-600">{formatSimpleMoney(Math.round(stats.totalMonthlyInterest))}원</h3>
              <p className="text-xs text-gray-500 mt-2">월 예상 이자 지출</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100">
              <p className="text-xs font-bold text-gray-400 mb-1 uppercase">Avg. Rate</p>
              <h3 className="text-3xl font-black text-blue-600">{stats.avgInterestRate.toFixed(1)}%</h3>
              <p className="text-xs text-gray-500 mt-2">평균 조달 금리 (연)</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <p className="text-xs font-bold text-gray-400 mb-1 uppercase">Active Contracts</p>
              <h3 className="text-3xl font-black text-gray-900">{stats.activeCount}건</h3>
              <p className="text-xs text-gray-500 mt-2">운용 중인 계약</p>
          </div>
      </div>

      {/* 📋 일반 투자 리스트 (단독 표출) */}
      <div className="bg-white shadow-sm border rounded-2xl overflow-hidden min-h-[300px]">
          {loading ? (
              <div className="p-20 text-center text-gray-400">데이터 로딩 중...</div>
          ) : (
            <table className="w-full text-sm text-left">
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
                    {list.length === 0 ? (
                        <tr><td colSpan={6} className="p-20 text-center text-gray-400">
                            아직 등록된 일반 투자가 없습니다.<br/>
                            우측 상단 버튼을 눌러 등록해주세요.
                        </td></tr>
                    ) : (
                        list.map(item => (
                            <tr key={item.id} onClick={() => router.push(`/invest/general/${item.id}`)} className="hover:bg-indigo-50 cursor-pointer group transition-colors">
                                <td className="p-4">
                                    <div className="font-bold text-gray-900 text-base">{item.investor_name}</div>
                                    <div className="text-xs text-gray-400">{item.investor_phone}</div>
                                </td>
                                <td className="p-4 text-right font-black text-gray-900 text-base">
                                    {f(item.invest_amount)}원
                                </td>
                                <td className="p-4 text-center">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold">{item.interest_rate}%</span>
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
                        ))
                    )}
                </tbody>
            </table>
          )}
      </div>
    </div>
  )
}