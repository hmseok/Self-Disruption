'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getAuthHeader } from '@/app/utils/auth-client'

export default function CompanyDashboard() {
  const params = useParams()
const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<any>(null)

  // 대시보드용 가짜 데이터 (나중에 DB 연결하면 됩니다)
  const stats = [
    { label: '총 보유 차량', value: '48대', change: '+2대 (전월 대비)', color: 'bg-blue-500' },
    { label: '현재 가동률', value: '82.5%', change: '-1.2% (전월 대비)', color: 'bg-green-500' },
    { label: '이번 달 매출', value: '₩ 42,500,000', change: '+12% (전월 대비)', color: 'bg-sky-500' },
    { label: '정비/사고', value: '3건', change: '조치 필요', color: 'bg-red-500' },
  ]

  useEffect(() => {
    const fetchCompanyData = async () => {
      if (!params?.id) return

      try {
        const headers = await getAuthHeader()
        const res = await fetch(`/api/companies/${params.id}`, { headers })

        if (res.ok) {
          const data = await res.json()
          if (data) setCompany(data)
        }
      } catch (error) {
        console.error('Failed to fetch company:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchCompanyData()
  }, [params.id])

  if (loading) return <div className="p-8">로딩 중...</div>

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* 1. 상단 헤더 */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Dashboard</span>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-1">
            {company?.name || '나의 회사'} <span className="text-steel-600">현황</span>
          </h1>
        </div>
        <div className="text-right">
           <p className="text-sm text-slate-500 font-medium">오늘 날짜</p>
           <p className="text-lg font-bold text-slate-800">{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* 2. 핵심 지표 카드 (Stats) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all">
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-sm font-bold text-slate-400">{stat.label}</h3>
               <div className={`w-2 h-2 rounded-full ${stat.color}`}></div>
            </div>
            <p className="text-2xl font-extrabold text-slate-900">{stat.value}</p>
            <p className={`text-xs font-bold mt-2 ${stat.change.includes('+') ? 'text-red-500' : 'text-steel-500'}`}>
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      {/* 3. 메인 콘텐츠 영역 (차트 & 최근 활동) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* 왼쪽: 빠른 실행 */}
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">🚀 빠른 실행</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             {['신규 계약 등록', '차량 입출고', '사고 접수', '정비 관리'].map((action) => (
               <button key={action} className="p-4 rounded-xl bg-slate-50 hover:bg-steel-50 text-slate-600 hover:text-steel-600 font-bold transition-colors border border-slate-100 hover:border-steel-200">
                 {action}
               </button>
             ))}
          </div>

          <div className="mt-8 p-6 bg-steel-50/50 rounded-xl border border-steel-100">
             <h4 className="font-bold text-steel-800 mb-2">💡 Self-Disruption Tip</h4>
             <p className="text-sm text-steel-600">이번 달 차량 가동률이 지난달보다 1.2% 떨어졌습니다. 유휴 차량을 프로모션에 활용해보세요.</p>
          </div>
        </div>

        {/* 오른쪽: 최근 알림 */}
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">🔔 최근 알림</h3>
          <ul className="space-y-4">
            {[
              { text: 'K5 (12가3456) 정비 완료', time: '방금 전', type: 'info' },
              { text: '신규 예약 접수 (홍길동 고객)', time: '1시간 전', type: 'success' },
              { text: '자동차 보험 갱신 필요', time: '3시간 전', type: 'warn' },
              { text: '1월 매출 마감 보고서', time: '어제', type: 'info' },
            ].map((noti, idx) => (
              <li key={idx} className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer">
                <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${noti.type === 'warn' ? 'bg-red-500' : noti.type === 'success' ? 'bg-green-500' : 'bg-steel-400'}`}></div>
                <div>
                   <p className="text-sm font-bold text-slate-700">{noti.text}</p>
                   <p className="text-xs text-slate-400">{noti.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  )
}