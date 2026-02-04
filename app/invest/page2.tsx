'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// 금액 포맷 (1.2억)
const formatSimpleMoney = (num: number) => {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '억'
  if (num >= 10000) return (num / 10000).toLocaleString() + '만'
  return num.toLocaleString()
}

// 날짜 포맷 (YYYY.MM.DD)
const formatDate = (dateStr: string) => dateStr ? dateStr.split('T')[0].replaceAll('-', '.') : '-'

// D-Day 계산기
const getDday = (endDateStr: string) => {
    if (!endDateStr) return ''
    const end = new Date(endDateStr)
    const today = new Date()
    const diff = end.getTime() - today.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days < 0) return `만료됨`
    if (days === 0) return `오늘만기`
    return `D-${days}`
}

export default function InvestDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [contracts, setContracts] = useState<any[]>([])

  // 📊 분석 데이터 상태
  const [stats, setStats] = useState({
    totalAmount: 0,     // 총 운용 자산 (AUM)
    avgShareRatio: 0,   // 평균 투자자 배분율 (조달 비용)
    expiringSoon: 0,    // 3개월 내 만기 예정 건수
    totalInvestors: 0   // 총 투자자 수 (중복 제거)
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    // 계약 + 차량 정보 조회
    const { data: contractsData } = await supabase
      .from('jiip_contracts')
      .select('*, cars(id, brand, model, number, image_url)')
      .order('contract_end_date', { ascending: true }) // 만기일 빠른 순 정렬

    if (contractsData) {
      setContracts(contractsData)

      // 통계 계산
      const totalAmount = contractsData.reduce((acc, cur) => acc + (cur.invest_amount || 0), 0)
      const avgShareRatio = contractsData.length > 0
        ? contractsData.reduce((acc, cur) => acc + (cur.share_ratio || 0), 0) / contractsData.length
        : 0

      // 3개월(90일) 내 만기 예정 건수 계산
      const today = new Date()
      const ninetyDaysLater = new Date()
      ninetyDaysLater.setDate(today.getDate() + 90)

      const expiringSoon = contractsData.filter(c => {
          if (!c.contract_end_date) return false
          const end = new Date(c.contract_end_date)
          return end >= today && end <= ninetyDaysLater
      }).length

      // 투자자 수 (이름 기준 중복 제거)
      const uniqueInvestors = new Set(contractsData.map(c => c.investor_name)).size

      setStats({
        totalAmount,
        avgShareRatio,
        expiringSoon,
        totalInvestors: uniqueInvestors
      })
    }
    setLoading(false)
  }

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in pb-32">

      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">🏦 자금 운용 현황 (Fund Status)</h1>
          <p className="text-gray-500 mt-2">투자 계약 및 자산 만기 관리 대시보드</p>
        </div>
        <Link href="/jiip/new" className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black shadow-lg text-center whitespace-nowrap">
          + 신규 투자 계약
        </Link>
      </div>

      {/* 📊 KPI 분석 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
          {/* 1. AUM */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <p className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Total AUM</p>
              <h3 className="text-3xl font-black text-gray-900">{formatSimpleMoney(stats.totalAmount)}원</h3>
              <p className="text-xs text-gray-500 mt-2">총 운용 자산 규모</p>
          </div>

          {/* 2. 평균 배분율 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <p className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Avg. Profit Share</p>
              <h3 className="text-3xl font-black text-blue-600">{stats.avgShareRatio.toFixed(1)}%</h3>
              <p className="text-xs text-gray-500 mt-2">평균 투자자 수익 배분율</p>
          </div>

          {/* 3. 만기 임박 (리스크 관리) */}
          <div className={`p-6 rounded-2xl shadow-sm border ${stats.expiringSoon > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
              <p className={`text-xs font-bold mb-1 uppercase tracking-wider ${stats.expiringSoon > 0 ? 'text-red-500' : 'text-gray-400'}`}>Maturity Risk</p>
              <h3 className={`text-3xl font-black ${stats.expiringSoon > 0 ? 'text-red-600' : 'text-gray-900'}`}>{stats.expiringSoon}건</h3>
              <p className={`text-xs mt-2 ${stats.expiringSoon > 0 ? 'text-red-500 font-bold' : 'text-gray-500'}`}>3개월 내 만기 예정</p>
          </div>

          {/* 4. 투자자 수 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
              <p className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Total Investors</p>
              <h3 className="text-3xl font-black text-gray-900">{stats.totalInvestors}명</h3>
              <p className="text-xs text-gray-500 mt-2">활성 투자 파트너</p>
          </div>
      </div>

      {/* 📋 계약 리스트 (테이블) */}
      <div className="bg-white shadow-sm border rounded-2xl overflow-hidden">
          <div className="p-5 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-700">📜 전체 투자 계약 리스트</h3>
              <span className="text-xs text-gray-400">* 만기일이 가까운 순서대로 정렬됩니다.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-white text-gray-500 font-bold border-b text-xs uppercase">
                    <tr>
                        <th className="p-4 w-20 text-center">상태</th>
                        <th className="p-4">투자자 정보</th>
                        <th className="p-4">담보 차량</th>
                        <th className="p-4 text-right">투자 원금</th>
                        <th className="p-4 text-center">배분율</th>
                        <th className="p-4 text-center">계약 기간</th>
                        <th className="p-4 text-center">만기 D-Day</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {contracts.map((c) => {
                        const dDay = getDday(c.contract_end_date)
                        const isRisk = dDay.includes('만료') || (dDay.includes('D-') && parseInt(dDay.replace('D-', '')) <= 90)

                        return (
                            <tr key={c.id} onClick={() => router.push(`/jiip/${c.id}`)} className="hover:bg-gray-50 cursor-pointer group transition-colors">
                                <td className="p-4 text-center">
                                    {c.signed_file_url ? (
                                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">운용중</span>
                                    ) : (
                                        <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">서명대기</span>
                                    )}
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-gray-900 text-base">{c.investor_name}</div>
                                    <div className="text-xs text-gray-400">{c.investor_phone}</div>
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-gray-800">{c.cars?.number || '차량미정'}</div>
                                    <div className="text-xs text-gray-500">{c.cars?.brand} {c.cars?.model}</div>
                                </td>
                                <td className="p-4 text-right font-black text-gray-900 text-base">
                                    {c.invest_amount?.toLocaleString()}원
                                </td>
                                <td className="p-4 text-center">
                                    <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold">{c.share_ratio}%</span>
                                </td>
                                <td className="p-4 text-center text-xs text-gray-500">
                                    {formatDate(c.contract_start_date)} <br/> ~ {formatDate(c.contract_end_date)}
                                </td>
                                <td className="p-4 text-center">
                                    <span className={`px-3 py-1 rounded-full font-bold text-xs ${isRisk ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600'}`}>
                                        {dDay || '-'}
                                    </span>
                                </td>
                            </tr>
                        )
                    })}
                    {contracts.length === 0 && !loading && (
                        <tr><td colSpan={7} className="p-10 text-center text-gray-400">등록된 투자 계약이 없습니다.</td></tr>
                    )}
                </tbody>
            </table>
          </div>
      </div>
    </div>
  )
}