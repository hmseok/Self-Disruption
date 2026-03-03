'use client'
import { supabase } from '../utils/supabase'
import { useApp } from '../context/AppContext'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════
// 투자 정산 관리 — 통합 페이지 (위수탁 + 일반투자)
// 헤더: 컴팩트 요약바 (D안) + 화이트 탭
// ═══════════════════════════════════════════════════════════════

const f = (n: number) => n ? n.toLocaleString() : '0'
const formatSimpleMoney = (num: number) => {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '억'
  if (num >= 10000) return (num / 10000).toFixed(0) + '만'
  return num.toLocaleString()
}

type TabKey = 'jiip' | 'invest'

export default function InvestUnifiedPage() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()

  // 탭 (URL ?tab=invest 지원)
  const initialTab = (searchParams.get('tab') as TabKey) || 'jiip'
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  // ── 지입 데이터 ──
  const [jiipList, setJiipList] = useState<any[]>([])
  const [jiipLoading, setJiipLoading] = useState(true)
  const [jiipFilter, setJiipFilter] = useState('all')
  const [jiipSearch, setJiipSearch] = useState('')

  // ── 투자 데이터 ──
  const [investList, setInvestList] = useState<any[]>([])
  const [investLoading, setInvestLoading] = useState(true)
  const [investFilter, setInvestFilter] = useState('all')
  const [investSearch, setInvestSearch] = useState('')

  // ── 데이터 패치 ──
  const fetchJiip = async () => {
    if (!company?.id && role !== 'god_admin') return
    setJiipLoading(true)
    let query = supabase.from('jiip_contracts').select(`*, car:cars ( number, model )`)
    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company?.id) {
      query = query.eq('company_id', company.id)
    }
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) console.error('지입 데이터 로딩 실패:', error.message)
    else setJiipList(data || [])
    setJiipLoading(false)
  }

  const fetchInvest = async () => {
    if (!company && role !== 'god_admin') return
    setInvestLoading(true)
    let query = supabase.from('general_investments').select('*')
    if (role === 'god_admin') {
      if (adminSelectedCompanyId) query = query.eq('company_id', adminSelectedCompanyId)
    } else if (company) {
      query = query.eq('company_id', company.id)
    }
    const { data } = await query.order('created_at', { ascending: false })
    setInvestList(data || [])
    setInvestLoading(false)
  }

  useEffect(() => {
    fetchJiip()
    fetchInvest()
  }, [company, role, adminSelectedCompanyId])

  // ── 통계 계산 ──
  const totalContracts = jiipList.length + investList.length
  const jiipActive = jiipList.filter(c => c.status === 'active')
  const investActive = investList.filter(c => c.status === 'active')
  const activeCount = jiipActive.length + investActive.length

  const totalInvest = jiipList.reduce((s, c) => s + (c.invest_amount || 0), 0)
    + investList.reduce((s, c) => s + (c.invest_amount || 0), 0)

  const monthlyJiip = jiipActive.reduce((s, c) => s + (c.admin_fee || 0), 0)
  const monthlyInvest = investList.reduce((s, c) => s + ((c.invest_amount || 0) * (c.interest_rate || 0) / 100 / 12), 0)
  const monthlyTotal = monthlyJiip + monthlyInvest

  // ── 지입 필터 ──
  const jiipEnded = jiipList.filter(c => c.status !== 'active')
  const filteredJiip = jiipList.filter(item => {
    if (jiipFilter === 'active' && item.status !== 'active') return false
    if (jiipFilter === 'ended' && item.status === 'active') return false
    if (jiipSearch) {
      const t = jiipSearch.toLowerCase()
      return (item.car?.number || '').toLowerCase().includes(t) ||
        (item.investor_name || '').toLowerCase().includes(t) ||
        (item.investor_phone || '').includes(t)
    }
    return true
  })

  // ── 투자 필터 ──
  const today = new Date()
  const ninetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
  const investEnded = investList.filter(i => i.status !== 'active')
  const investExpiring = investList.filter(i => {
    if (!i.contract_end_date) return false
    const end = new Date(i.contract_end_date)
    return end >= today && end <= ninetyDays
  })
  const investAvgRate = investList.length > 0
    ? investList.reduce((s, c) => s + (c.interest_rate || 0), 0) / investList.length : 0

  const filteredInvest = investList.filter(item => {
    if (investFilter === 'active' && item.status !== 'active') return false
    if (investFilter === 'ended' && item.status === 'active') return false
    if (investFilter === 'expiring') {
      if (!item.contract_end_date) return false
      const end = new Date(item.contract_end_date)
      if (end < today || end > ninetyDays) return false
    }
    if (investSearch) {
      const t = investSearch.toLowerCase()
      return (item.investor_name || '').toLowerCase().includes(t) ||
        (item.investor_phone || '').includes(t)
    }
    return true
  })

  // 탭 전환
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab)
    router.replace(`/invest?tab=${tab}`, { scroll: false })
  }

  // ── god_admin 회사 미선택 ──
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

      {/* ═══ 컴팩트 요약바 (D안) ═══ */}
      <div style={{
        background: '#2d5fa8',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderRadius: '12px 12px 0 0',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          총 계약 <b style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>{totalContracts}건</b>
        </span>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          운용 중 <b style={{ color: '#6ee7b7', fontSize: 14, fontWeight: 900 }}>{activeCount}건</b>
        </span>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          총 투자금 <b style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>{formatSimpleMoney(totalInvest)}</b>
        </span>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
          월 관리비 <b style={{ color: '#fca5a5', fontSize: 14, fontWeight: 900 }}>{formatSimpleMoney(monthlyTotal)}</b>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            style={{
              background: 'rgba(255,255,255,0.12)', color: '#e0ecf8',
              border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px',
              borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            📥 내보내기
          </button>
          <button
            onClick={() => router.push(activeTab === 'jiip' ? '/jiip/new' : '/invest/general/new')}
            style={{
              background: '#fff', color: '#2d5fa8', border: 'none',
              padding: '6px 12px', borderRadius: 7, fontSize: 11,
              fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            + 신규 등록
          </button>
        </div>
      </div>

      {/* ═══ 화이트 탭 (위수탁 / 투자) ═══ */}
      <div style={{
        display: 'flex', gap: 0, background: '#fff',
        borderBottom: '2px solid #e2e8f0', padding: '0 24px',
      }}>
        {([
          { key: 'jiip' as TabKey, label: '🤝 위수탁(지입)', count: jiipList.length },
          { key: 'invest' as TabKey, label: '💼 투자/펀딩', count: investList.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            style={{
              padding: '12px 20px', fontSize: 13, fontWeight: 700,
              color: activeTab === tab.key ? '#0f172a' : '#94a3b8',
              cursor: 'pointer', background: 'none',
              borderBottom: activeTab === tab.key ? '3px solid #2d5fa8' : '3px solid transparent',
              marginBottom: -2,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
              borderLeft: 'none', borderRight: 'none', borderTop: 'none',
            }}
          >
            {tab.label}
            <span style={{
              padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
              background: activeTab === tab.key ? 'rgba(45,95,168,0.1)' : '#e2e8f0',
              color: activeTab === tab.key ? '#2d5fa8' : '#64748b',
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════
           지입 탭
           ═══════════════════════════════════════ */}
      {activeTab === 'jiip' && (
        <div style={{ background: '#fff', borderRadius: '0 0 16px 16px', border: '1px solid #e5e7eb', borderTop: 'none' }}>
          {/* 필터 바 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 8, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: '전체', count: jiipList.length },
              { key: 'active', label: '운영중', count: jiipActive.length },
              { key: 'ended', label: '종료', count: jiipEnded.length },
            ].map(chip => (
              <button
                key={chip.key}
                onClick={() => setJiipFilter(chip.key)}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  background: jiipFilter === chip.key ? 'rgba(45,95,168,0.08)' : '#f8fafc',
                  color: jiipFilter === chip.key ? '#2d5fa8' : '#64748b',
                  border: jiipFilter === chip.key ? '1px solid rgba(45,95,168,0.3)' : '1px solid #e2e8f0',
                }}
              >
                {chip.label} <span style={{ fontWeight: 900, marginLeft: 3 }}>{chip.count}</span>
              </button>
            ))}
            <input
              type="text"
              placeholder="차량번호, 차주명, 연락처 검색..."
              value={jiipSearch}
              onChange={e => setJiipSearch(e.target.value)}
              style={{
                marginLeft: 'auto', padding: '7px 14px', border: '1px solid #e2e8f0',
                borderRadius: 8, fontSize: 13, minWidth: 180, outline: 'none',
                background: '#f8fafc', color: '#0f172a',
              }}
            />
          </div>

          {/* 테이블 */}
          {jiipLoading ? (
            <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af', fontWeight: 700 }}>데이터를 불러오는 중...</div>
          ) : filteredJiip.length === 0 ? (
            <div style={{ padding: 80, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🚛</div>
              <p style={{ color: '#111827', fontWeight: 700, fontSize: 18 }}>
                {jiipList.length === 0 ? '등록된 지입 계약이 없습니다.' : '해당 조건의 계약이 없습니다.'}
              </p>
              <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>상단 버튼을 눌러 첫 번째 계약을 등록해보세요.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    {['계약 차량', '투자자(차주)', '투자금 / 배분율', '월 관리비', '지급일'].map(h => (
                      <th key={h} style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJiip.map((item, idx) => (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/jiip/${item.id}`)}
                      style={{ borderBottom: idx < filteredJiip.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
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
          )}

          {/* 하단 요약 */}
          {filteredJiip.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc',
              borderRadius: '0 0 16px 16px', fontSize: 12, color: '#64748b', fontWeight: 600,
            }}>
              <span>
                총 약정: <b style={{ color: '#111827' }}>{formatSimpleMoney(jiipList.reduce((s, c) => s + (c.invest_amount || 0), 0))}</b>
                {' · '}월 관리비: <b style={{ color: '#111827' }}>{formatSimpleMoney(monthlyJiip)}</b>
                {' · '}평균 배분율: <b style={{ color: '#111827' }}>
                  {jiipList.length > 0 ? (jiipList.reduce((s, c) => s + (c.share_ratio || 0), 0) / jiipList.length).toFixed(1) : 0}%
                </b>
              </span>
              <span>{filteredJiip.length}건</span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
           투자 탭
           ═══════════════════════════════════════ */}
      {activeTab === 'invest' && (
        <div style={{ background: '#fff', borderRadius: '0 0 16px 16px', border: '1px solid #e5e7eb', borderTop: 'none' }}>
          {/* 필터 바 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 8, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: '전체', count: investList.length },
              { key: 'active', label: '운용중', count: investActive.length },
              { key: 'expiring', label: '만기임박', count: investExpiring.length },
              { key: 'ended', label: '종료', count: investEnded.length },
            ].map(chip => (
              <button
                key={chip.key}
                onClick={() => setInvestFilter(chip.key)}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  background: investFilter === chip.key ? 'rgba(45,95,168,0.08)' : '#f8fafc',
                  color: investFilter === chip.key ? '#2d5fa8' : '#64748b',
                  border: investFilter === chip.key ? '1px solid rgba(45,95,168,0.3)' : '1px solid #e2e8f0',
                }}
              >
                {chip.label} <span style={{ fontWeight: 900, marginLeft: 3 }}>{chip.count}</span>
              </button>
            ))}
            <input
              type="text"
              placeholder="투자자명, 연락처 검색..."
              value={investSearch}
              onChange={e => setInvestSearch(e.target.value)}
              style={{
                marginLeft: 'auto', padding: '7px 14px', border: '1px solid #e2e8f0',
                borderRadius: 8, fontSize: 13, minWidth: 180, outline: 'none',
                background: '#f8fafc', color: '#0f172a',
              }}
            />
          </div>

          {/* 테이블 */}
          {investLoading ? (
            <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af', fontWeight: 700 }}>데이터 로딩 중...</div>
          ) : filteredInvest.length === 0 ? (
            <div style={{ padding: 80, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
              <p style={{ color: '#111827', fontWeight: 700, fontSize: 18 }}>
                {investList.length === 0 ? '아직 등록된 일반 투자가 없습니다.' : '해당 조건의 투자 정보가 없습니다.'}
              </p>
              <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>상단 버튼을 눌러 첫 번째 투자를 등록해보세요.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left text-sm" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>투자자 정보</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'right' }}>투자 원금</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' }}>이자율 (연)</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' }}>이자 지급일</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' }}>계약 기간</th>
                    <th style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvest.map((item, idx) => {
                    const endDate = item.contract_end_date ? new Date(item.contract_end_date) : null
                    const daysLeft = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
                    return (
                      <tr
                        key={item.id}
                        onClick={() => router.push(`/invest/general/${item.id}`)}
                        style={{ borderBottom: idx < filteredInvest.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
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
          )}

          {/* 하단 요약 */}
          {filteredInvest.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc',
              borderRadius: '0 0 16px 16px', fontSize: 12, color: '#64748b', fontWeight: 600,
            }}>
              <span>
                총 투자금: <b style={{ color: '#111827' }}>{formatSimpleMoney(investList.reduce((s, c) => s + (c.invest_amount || 0), 0))}</b>
                {' · '}월 이자: <b style={{ color: '#111827' }}>{formatSimpleMoney(monthlyInvest)}</b>
                {' · '}평균 이자율: <b style={{ color: '#111827' }}>{investAvgRate.toFixed(1)}%</b>
              </span>
              <span>{filteredInvest.length}건</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
