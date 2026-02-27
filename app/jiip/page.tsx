'use client'
import { supabase } from '../utils/supabase'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

const f = (n: number) => n ? n.toLocaleString() : '0'
const formatSimpleMoney = (num: number) => {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '억'
  if (num >= 10000) return (num / 10000).toFixed(0) + '만'
  return num.toLocaleString()
}

export default function JiipListPage() {
  const router = useRouter()
  const { company: currentCompany, role, adminSelectedCompanyId } = useApp()

  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchContracts = async () => {
    if (!currentCompany?.id && role !== 'god_admin') return
    setLoading(true)

    let query = supabase
      .from('jiip_contracts')
      .select(`*, car:cars ( number, model )`)

    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (currentCompany?.id) {
      query = query.eq('company_id', currentCompany.id)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) console.error('데이터 로딩 실패:', error.message)
    else setContracts(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchContracts() }, [currentCompany, role, adminSelectedCompanyId])

  // 통계 계산
  const totalInvest = contracts.reduce((sum, item) => sum + (item.invest_amount || 0), 0)
  const activeContracts = contracts.filter(c => c.status === 'active')
  const endedContracts = contracts.filter(c => c.status !== 'active')
  const monthlyPayout = activeContracts.reduce((sum, c) => sum + (c.admin_fee || 0), 0)

  // 필터 + 검색
  const filteredContracts = contracts.filter(item => {
    if (statusFilter === 'active' && item.status !== 'active') return false
    if (statusFilter === 'ended' && item.status === 'active') return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return (
        (item.car?.number || '').toLowerCase().includes(term) ||
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
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen">
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.025em', margin: 0 }}>🤝 위수탁(지입) 정산</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>지입 차량 정산 및 수익 배분 관리</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <button
            onClick={() => router.push('/jiip/new')}
            className="flex items-center gap-2 bg-steel-600 text-white px-3 py-2 text-sm md:px-5 md:py-3 md:text-base rounded-xl font-bold hover:bg-steel-700 transition-colors"
          >
            + 신규 계약 등록
          </button>
        </div>
      </div>

      {/* 📊 KPI 대시보드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white p-3 md:p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
          <p className="text-xs text-gray-400 font-bold">전체 계약</p>
          <p className="text-xl md:text-2xl font-black text-gray-900 mt-1">{contracts.length}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
        <div className="bg-green-50 p-3 md:p-4 rounded-xl border border-green-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('active')}>
          <p className="text-xs text-green-600 font-bold">운영 중</p>
          <p className="text-xl md:text-2xl font-black text-green-700 mt-1">{activeContracts.length}<span className="text-sm text-green-500 ml-0.5">건</span></p>
        </div>
        <div className="bg-blue-50 p-3 md:p-4 rounded-xl border border-blue-100">
          <p className="text-xs text-blue-500 font-bold">총 투자 유치금</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#1d4ed8', marginTop: 4 }}>{formatSimpleMoney(totalInvest)}<span className="text-sm text-blue-400 ml-0.5">원</span></p>
        </div>
        <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-100">
          <p className="text-xs text-red-500 font-bold">월 관리비 합계</p>
          <p style={{ fontSize: 20, fontWeight: 900, color: '#dc2626', marginTop: 4 }}>{formatSimpleMoney(monthlyPayout)}<span className="text-sm text-red-400 ml-0.5">원</span></p>
        </div>
        <div className="bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('ended')}>
          <p className="text-xs text-gray-500 font-bold">종료 계약</p>
          <p className="text-xl md:text-2xl font-black text-gray-500 mt-1">{endedContracts.length}<span className="text-sm text-gray-400 ml-0.5">건</span></p>
        </div>
      </div>

      {/* 필터 + 검색 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
          {[
            { key: 'all', label: '전체', count: contracts.length },
            { key: 'active', label: '운영 중', count: activeContracts.length },
            { key: 'ended', label: '종료', count: endedContracts.length },
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
          placeholder="차량번호, 차주명, 연락처 검색..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, flex: 1, minWidth: 150, outline: 'none' }}
        />
      </div>

      {/* 리스트 테이블 */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af', fontWeight: 700 }}>데이터를 불러오는 중...</div>
        ) : filteredContracts.length === 0 ? (
          <div style={{ padding: 80, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚛</div>
            <p style={{ color: '#111827', fontWeight: 700, fontSize: 18 }}>등록된 지입 계약이 없습니다.</p>
            <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>우측 상단 버튼을 눌러 첫 번째 계약을 등록해보세요.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>계약 차량</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>투자자(차주)</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>투자금 / 수익률</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>월 관리비</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>지급일</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.map((item, idx) => (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/jiip/${item.id}`)}
                      style={{ borderBottom: idx < filteredContracts.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
                      className="hover:bg-steel-50/30 transition-colors"
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 800, color: '#111827', fontSize: 15 }}>{item.car?.number || '차량 미지정'}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.car?.model}</div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 700, color: '#374151' }}>{item.investor_name}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.investor_phone}</div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 800, color: '#2d5fa8' }}>{f(item.invest_amount)}원</div>
                        <span style={{ fontSize: 11, background: '#eff6ff', color: '#2d5fa8', padding: '2px 6px', borderRadius: 4, fontWeight: 700, marginTop: 2, display: 'inline-block' }}>
                          {item.share_ratio}% 배분
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: 700, color: '#4b5563', fontSize: 14 }}>
                        {f(item.admin_fee)}원
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: 700, color: '#6b7280', fontSize: 14 }}>
                        매월 {item.payout_day}일
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: item.status === 'active' ? '#dcfce7' : '#f3f4f6',
                          color: item.status === 'active' ? '#16a34a' : '#9ca3af',
                        }}>
                          {item.status === 'active' ? '운영 중' : '종료'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
