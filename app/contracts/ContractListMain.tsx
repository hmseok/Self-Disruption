'use client'
import { useApp } from '../context/AppContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// ============================================================================
// CONTRACT STATUS BADGE
// ============================================================================
function ContractStatusBadge({ contract }: { contract: any }) {
  const paidCount = contract.paidCount || 0
  const totalCount = contract.totalCount || 0
  if (contract.status === 'completed') {
    return <span className="px-2 py-1 rounded-md text-xs font-black bg-green-600 text-white">완납</span>
  }
  if (['ended', 'expired'].includes(contract.status)) {
    return <span className="px-2 py-1 rounded-md text-xs font-bold bg-gray-200 text-gray-600">종료</span>
  }
  if (['cancelled', 'terminated'].includes(contract.status)) {
    return <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-600">해지</span>
  }
  if (paidCount > 0) {
    return <span className="px-2 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-700">수납 {paidCount}/{totalCount}</span>
  }
  return <span className="px-2 py-1 rounded-md text-xs font-bold bg-steel-600 text-white">진행중</span>
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
type ContractStatusFilter = 'all' | 'active' | 'expiring' | 'ended' | 'cancelled'
type SortOption = 'latest' | 'customer' | 'expiry' | 'rent'

export default function ContractListMain() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [contractStatusFilter, setContractStatusFilter] = useState<ContractStatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('latest')

  const f = (n: number) => Math.round(n || 0).toLocaleString()
  const formatDate = (dateString: string) => dateString?.split('T')[0] || ''

  const companyId = role === 'admin' ? adminSelectedCompanyId : company?.id

  // ── Fetch data ──
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) { setLoading(false); return }

      try {
        const headers = await getAuthHeader()
        const res = await fetch('/api/contracts', { headers })
        const json = await res.json()
        if (json.error) {
          console.error('계약 목록 로드 실패:', json.error)
          return
        }
        const allContracts = json.data || []

        const contractIds = allContracts.map((c: any) => c.id)
        let paymentsData: any[] = []
        if (contractIds.length > 0) {
          const payRes = await fetch(`/api/contracts/payment-schedule?ids=${contractIds.join(',')}`, { headers })
          const payJson = await payRes.json()
          paymentsData = payJson.data || []
        }

        const customerIds = allContracts.map((c: any) => c.customer_id).filter(Boolean)
        const uniqueCustomerIds = [...new Set(customerIds)]
        let customersData: any[] = []
        if (uniqueCustomerIds.length > 0) {
          const custRes = await fetch(`/api/customers?ids=${uniqueCustomerIds.join(',')}`, { headers })
          const custJson = await custRes.json()
          customersData = custJson.data || []
        }
        const customersMap = new Map()
        customersData?.forEach((c: any) => customersMap.set(c.id, c))

        const carIds = allContracts.map((c: any) => c.car_id).filter(Boolean)
        const uniqueCarIds = [...new Set(carIds)]
        let carsData: any[] = []
        if (uniqueCarIds.length > 0) {
          const carRes = await fetch(`/api/cars?ids=${uniqueCarIds.join(',')}`, { headers })
          const carJson = await carRes.json()
          carsData = carJson.data || []
        }

        const combinedContracts = allContracts.map((contract: any) => {
          const payments = paymentsData.filter(p => p.contract_id === contract.id)
          return {
            ...contract,
            car: carsData.find(c => c.id === contract.car_id),
            customer: customersMap.get(contract.customer_id),
            totalCount: payments.length,
            paidCount: payments.filter(p => p.status === 'paid').length,
          }
        })

        setContracts(combinedContracts)
      } catch (error) {
        console.error('Error fetching contracts:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [companyId])

  // ── Stats ──
  const now = new Date()
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const todayStr = now.toISOString().split('T')[0]

  const contractStats = {
    total: contracts.length,
    active: contracts.filter(c => c.status === 'active').length,
    expiringSoon: contracts.filter(c => c.status === 'active' && c.end_date && c.end_date <= thirtyDaysLater && c.end_date >= todayStr).length,
    ended: contracts.filter(c => ['ended', 'completed', 'expired'].includes(c.status)).length,
    cancelled: contracts.filter(c => ['cancelled', 'terminated'].includes(c.status)).length,
  }

  // ── Filter + Sort ──
  const filteredContracts = contracts
    .filter(c => {
      if (contractStatusFilter === 'active' && c.status !== 'active') return false
      if (contractStatusFilter === 'expiring' && !(c.status === 'active' && c.end_date && c.end_date <= thirtyDaysLater && c.end_date >= todayStr)) return false
      if (contractStatusFilter === 'ended' && !['ended', 'completed', 'expired'].includes(c.status)) return false
      if (contractStatusFilter === 'cancelled' && !['cancelled', 'terminated'].includes(c.status)) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return (
          (c.customer?.name || c.customer_name || '').toLowerCase().includes(term) ||
          (c.car?.number || '').toLowerCase().includes(term) ||
          (c.car?.brand || '').toLowerCase().includes(term) ||
          (c.car?.model || '').toLowerCase().includes(term)
        )
      }
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'customer': return (a.customer?.name || a.customer_name || '').localeCompare(b.customer?.name || b.customer_name || '')
        case 'expiry': return (a.end_date || '').localeCompare(b.end_date || '')
        case 'rent': return (b.monthly_rent || 0) - (a.monthly_rent || 0)
        default: return 0 // latest — already sorted by id desc from DB
      }
    })

  // ============================================================================
  // RENDER
  // ============================================================================
  if (role === 'admin' && !adminSelectedCompanyId) {
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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', minHeight: '100vh', background: '#f9fafb' }}>

      {/* ── 칩 필터 + 정렬 + 검색 (C 스타일) ── */}
      {!loading && (
        <div style={{ marginBottom: 16 }}>
          {/* 칩 필터 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {([
              { id: 'all' as ContractStatusFilter, label: '전체', count: contractStats.total },
              { id: 'active' as ContractStatusFilter, label: '진행중', count: contractStats.active },
              { id: 'expiring' as ContractStatusFilter, label: '만료임박', count: contractStats.expiringSoon },
              { id: 'ended' as ContractStatusFilter, label: '종료', count: contractStats.ended },
              { id: 'cancelled' as ContractStatusFilter, label: '해지', count: contractStats.cancelled },
            ]).map(chip => (
              <button
                key={chip.id}
                onClick={() => setContractStatusFilter(chip.id)}
                style={{
                  padding: '6px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  background: contractStatusFilter === chip.id ? '#2d5fa8' : '#f3f4f6',
                  color: contractStatusFilter === chip.id ? '#fff' : '#6b7280',
                }}
              >
                {contractStatusFilter === chip.id && '● '}{chip.label}
                <span style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 700,
                  background: contractStatusFilter === chip.id ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                  color: contractStatusFilter === chip.id ? '#fff' : '#6b7280',
                  padding: '1px 7px', borderRadius: 10,
                }}>{chip.count}</span>
              </button>
            ))}
          </div>

          {/* 정렬 + 검색 */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>정렬:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                style={{
                  padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
                  fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer', background: '#fff',
                }}
              >
                <option value="latest">최신순</option>
                <option value="customer">고객명순</option>
                <option value="expiry">만료일순</option>
                <option value="rent">렌트료순</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="🔍 고객명, 차량번호, 브랜드 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                flex: 1, padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 13, outline: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            />
          </div>
        </div>
      )}

      {/* ── 표준 테이블 (A 스타일) ── */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' }}>
        {loading ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>로딩 중...</div>
        ) : filteredContracts.length === 0 ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            {contracts.length === 0 ? '계약 내역이 없습니다.' : '해당 조건의 계약이 없습니다.'}
          </div>
        ) : (<>
          {/* 데스크톱 */}
          <div className="hidden md:block" style={{ overflowX: 'auto' }}>
            <table className="w-full text-left text-sm" style={{ minWidth: 800 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', paddingLeft: 24, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>상태</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>고객명</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>차량</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>계약기간</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>보증금</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>월 렌트료</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>수납</th>
                  <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>계약일</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((c, idx) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/contracts/${c.id}`)}
                    style={{ cursor: 'pointer', borderBottom: idx < filteredContracts.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px', paddingLeft: 24 }}><ContractStatusBadge contract={c} /></td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>{c.customer?.name || c.customer_name}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f3f4f6', overflow: 'hidden', border: '1px solid #e5e7eb', flexShrink: 0 }}>
                          {c.car?.image_url ? (
                            <img src={c.car.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 9, color: '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>No Img</span>
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#111827', fontSize: 12 }}>{c.car?.number || '-'}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{c.car?.brand} {c.car?.model}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#4b5563', fontSize: 13 }}>
                      {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280', fontSize: 13 }}>{f(c.deposit)}원</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 900, color: '#2d5fa8' }}>{f(Math.round((c.monthly_rent || 0) * 1.1))}원</span>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>/월 (VAT포함)</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <div style={{ width: 60, height: 6, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: '#22c55e', borderRadius: 999, transition: 'all 0.3s', width: `${c.totalCount > 0 ? (c.paidCount / c.totalCount) * 100 : 0}%` }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700 }}>{c.paidCount}/{c.totalCount}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>{formatDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 모바일 카드형 */}
          <div className="md:hidden" style={{ padding: '8px 12px' }}>
            {filteredContracts.map((c) => (
              <div key={c.id} onClick={() => router.push(`/contracts/${c.id}`)}
                style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <ContractStatusBadge contract={c} />
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(c.created_at)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: 14, marginBottom: 2 }}>{c.customer?.name || c.customer_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{c.car?.brand} {c.car?.model} {c.car?.number ? `(${c.car.number})` : ''}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(c.start_date)} ~ {formatDate(c.end_date)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <span style={{ fontWeight: 900, color: '#2d5fa8', fontSize: 15 }}>{f(Math.round((c.monthly_rent || 0) * 1.1))}원</span>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>/월 VAT포함</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                      <div style={{ width: 40, height: 5, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: '#22c55e', borderRadius: 999, width: `${c.totalCount > 0 ? (c.paidCount / c.totalCount) * 100 : 0}%` }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700 }}>{c.paidCount}/{c.totalCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  )
}
