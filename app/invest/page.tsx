'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const f = (n: number) => n ? n.toLocaleString() : '0'
const formatSimpleMoney = (num: number) => {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '억'
  if (num >= 10000) return (num / 10000).toFixed(0) + '만'
  return num.toLocaleString()
}

export default function GeneralInvestDashboard() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const [stats, setStats] = useState({
    totalAmount: 0,
    totalMonthlyInterest: 0,
    avgInterestRate: 0,
    activeCount: 0,
  })

  useEffect(() => { fetchData() }, [company, role, adminSelectedCompanyId])

  const fetchData = async () => {
    if (!company && role !== 'god_admin') return
    setLoading(true)

    let query = supabase.from('general_investments').select('*')

    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company) {
      query = query.eq('company_id', company.id)
    }

    const { data } = await query.order('created_at', { ascending: false })
    const investments = data || []
    setList(investments)

    const totalAmount = investments.reduce((acc, cur) => acc + (cur.invest_amount || 0), 0)
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
      activeCount: investments.filter(i => i.status === 'active').length,
    })
    setLoading(false)
  }

  const endedCount = list.filter(i => i.status !== 'active').length
  const today = new Date()
  const ninetyDaysLater = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
  const expiringCount = list.filter(i => {
    if (!i.contract_end_date) return false
    const end = new Date(i.contract_end_date)
    return end >= today && end <= ninetyDaysLater
  }).length

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

  if (role === 'god_admin' && !adminSelectedCompanyId) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50">
        <div className="p-12 md:p-20 text-center text-gray-400 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen pb-20 md:pb-32">
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>💼 투자자/펀딩 정산</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>투자 계약 및 수익 배분 관리</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <Link
            href="/invest/general/new"
            className="flex items-center gap-2 bg-steel-600 text-white px-3 py-2 text-sm md:px-5 md:py-3 md:text-base rounded-xl font-bold hover:bg-steel-700 transition-colors"
          >
            + 신규 투자 등록
          </Link>
        </div>
      </div>

      {/* 📊 KPI 대시보드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
          <p className="text-xs text-gray-400 font-bold">총 투자 원금</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#111827', marginTop: 4 }}>{formatSimpleMoney(stats.totalAmount)}<span className="text-sm text-gray-400 ml-0.5">원</span></p>
        </div>
        <div className="bg-green-50 p-3 md:p-4 rounded-xl border border-green-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('active')}>
          <p className="text-xs text-green-600 font-bold">운용 중</p>
          <p className="text-xl md:text-2xl font-black text-green-700 mt-1">{stats.activeCount}<span className="text-sm text-green-500 ml-0.5">건</span></p>
        </div>
        <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-100">
          <p className="text-xs text-red-500 font-bold">월 예상 이자</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#dc2626', marginTop: 4 }}>{formatSimpleMoney(stats.totalMonthlyInterest)}<span className="text-sm text-red-400 ml-0.5">원</span></p>
        </div>
        <div className={`p-3 md:p-4 rounded-xl border cursor-pointer hover:shadow-md transition-shadow ${expiringCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`} onClick={() => setStatusFilter('expiring')}>
          <p className="text-xs text-amber-600 font-bold">만기 임박 (90일)</p>
          <p className="text-xl md:text-2xl font-black text-amber-700 mt-1">{expiringCount}<span className="text-sm text-amber-500 ml-0.5">건</span></p>
        </div>
        <div className="bg-blue-50 p-3 md:p-4 rounded-xl border border-blue-100">
          <p className="text-xs text-blue-500 font-bold">평균 연 수익률</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#1d4ed8', marginTop: 4 }}>{stats.avgInterestRate.toFixed(1)}<span className="text-sm text-blue-400 ml-0.5">%</span></p>
        </div>
      </div>

      {/* 필터 + 검색 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
          {[
            { key: 'all', label: '전체', count: list.length },
            { key: 'active', label: '운용중', count: stats.activeCount },
            { key: 'expiring', label: '만기임박', count: expiringCount },
            { key: 'ended', label: '종료', count: endedCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                background: statusFilter === tab.key ? '#2d5fa8' : '#fff',
                color: statusFilter === tab.key ? '#fff' : '#6b7280',
                border: statusFilter === tab.key ? 'none' : '1px solid #e5e7eb',
                boxShadow: statusFilter === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="투자자명, 연락처 검색..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, flex: 1, minWidth: 150, outline: 'none' }}
        />
      </div>

      {/* 리스트 테이블 */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', minHeight: 300 }}>
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af', fontWeight: 700 }}>데이터 로딩 중...</div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: 80, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
            <p style={{ color: '#111827', fontWeight: 700, fontSize: 18 }}>
              {list.length === 0 ? '아직 등록된 일반 투자가 없습니다.' : '해당 조건의 투자 정보가 없습니다.'}
            </p>
            <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>우측 상단 버튼을 눌러 첫 번째 투자를 등록해보세요.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>투자자 정보</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>투자 원금</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>이자율 (연)</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>이자 지급일</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>계약 기간</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((item, idx) => {
                    // 만기 임박 체크
                    const endDate = item.contract_end_date ? new Date(item.contract_end_date) : null
                    const daysLeft = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null

                    return (
                      <tr
                        key={item.id}
                        onClick={() => router.push(`/invest/general/${item.id}`)}
                        style={{ borderBottom: idx < filteredList.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
                        className="hover:bg-steel-50/30 transition-colors"
                      >
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ fontWeight: 800, color: '#111827', fontSize: 15 }}>{item.investor_name}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.investor_phone}</div>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 800, color: '#111827', fontSize: 15 }}>
                          {f(item.invest_amount)}원
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <span style={{ background: '#eff6ff', color: '#2d5fa8', padding: '4px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13 }}>
                            {Number(item.interest_rate).toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 700, color: '#4b5563', fontSize: 14 }}>
                          매월 <span style={{ color: '#111827' }}>{item.payment_day}일</span>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{item.contract_start_date}</div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>~ {item.contract_end_date}</div>
                          {daysLeft !== null && daysLeft >= 0 && daysLeft <= 90 && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginTop: 2, display: 'inline-block',
                              background: daysLeft <= 7 ? '#fee2e2' : daysLeft <= 30 ? '#fff7ed' : '#fefce8',
                              color: daysLeft <= 7 ? '#dc2626' : daysLeft <= 30 ? '#ea580c' : '#ca8a04',
                            }}>
                              D-{daysLeft}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background: item.status === 'active' ? '#dcfce7' : '#f3f4f6',
                            color: item.status === 'active' ? '#16a34a' : '#9ca3af',
                          }}>
                            {item.status === 'active' ? '운용중' : '종료됨'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
