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

// ── 상태 뱃지 ──
function ContractStatusBadge({ contract }: { contract: any }) {
  const paidCount = contract.paidCount || 0
  const totalCount = contract.totalCount || 0
  if (contract.status === 'completed') {
    return <span className="si-badge si-badge-green">완납</span>
  }
  if (['ended', 'expired'].includes(contract.status)) {
    return <span className="si-badge si-badge-gray">종료</span>
  }
  if (['cancelled', 'terminated'].includes(contract.status)) {
    return <span className="si-badge si-badge-red">해지</span>
  }
  if (paidCount > 0) {
    return <span className="si-badge si-badge-blue">수납 {paidCount}/{totalCount}</span>
  }
  return <span className="si-badge si-badge-steel">진행중</span>
}

// ── 진행률 바 ──
function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? (paid / total) * 100 : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-500 font-bold">{paid}/{total}</span>
    </div>
  )
}

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
        if (json.error) { console.error('계약 목록 로드 실패:', json.error); return }
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
        default: return 0
      }
    })

  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="page-bg">
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-6">
          <div className="si-card p-12 md:p-20 text-center">
            <span className="text-4xl block mb-3">🏢</span>
            <p className="font-bold text-slate-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-bg">
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-8 md:px-6">

        {/* ── KPI 스탯 카드 ── */}
        {!loading && contracts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {([
              { label: '전체', value: contractStats.total, key: 'all' as ContractStatusFilter, badge: 'glass-border-blue', icon: '📋', color: 'text-blue-400' },
              { label: '진행중', value: contractStats.active, key: 'active' as ContractStatusFilter, badge: 'glass-border-green', icon: '✅', color: 'text-emerald-400' },
              { label: '만료임박', value: contractStats.expiringSoon, key: 'expiring' as ContractStatusFilter, badge: 'glass-border-amber', icon: '⏳', color: 'text-amber-400' },
              { label: '종료', value: contractStats.ended, key: 'ended' as ContractStatusFilter, badge: 'glass-border-blue', icon: '📁', color: 'text-slate-500' },
              { label: '해지', value: contractStats.cancelled, key: 'cancelled' as ContractStatusFilter, badge: 'glass-border-red', icon: '🚫', color: 'text-red-400' },
            ]).map(s => (
              <button
                key={s.key}
                onClick={() => setContractStatusFilter(s.key)}
                className={`glass-3 ${s.badge} rounded-xl p-3 md:p-4 text-center transition-all hover:scale-[1.02] ${contractStatusFilter === s.key ? 'ring-2 ring-steel-400/40 shadow-md' : ''}`}
              >
                <div className="text-base mb-1">{s.icon}</div>
                <div className={`text-xl md:text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* ── 메인 테이블 카드 ── */}
        <div className="si-card">
          {/* 검색 + 정렬 바 */}
          <div className="si-search-bar">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">정렬</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="si-input text-xs !w-auto !py-1.5 !px-2.5"
              >
                <option value="latest">최신순</option>
                <option value="customer">고객명순</option>
                <option value="expiry">만료일순</option>
                <option value="rent">렌트료순</option>
              </select>
            </div>
            <div className="flex-1 max-w-sm">
              <input
                type="text"
                placeholder="고객명, 차량번호, 브랜드 검색..."
                className="si-input text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <span className="text-xs text-slate-500 hidden sm:inline">
              <strong className="text-slate-600">{filteredContracts.length}</strong>건
            </span>
          </div>

          {/* 탭 필터 */}
          <div className="si-tabs">
            {([
              { key: 'all' as ContractStatusFilter, label: '전체' },
              { key: 'active' as ContractStatusFilter, label: '진행중' },
              { key: 'expiring' as ContractStatusFilter, label: '만료임박' },
              { key: 'ended' as ContractStatusFilter, label: '종료' },
              { key: 'cancelled' as ContractStatusFilter, label: '해지' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setContractStatusFilter(t.key)}
                className={`si-tab ${contractStatusFilter === t.key ? 'si-tab-active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 테이블 콘텐츠 */}
          {loading ? (
            <div className="p-20 text-center text-slate-500 flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mb-3"></div>
              <span className="text-sm">계약 데이터를 불러오는 중...</span>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="p-12 md:p-20 text-center">
              <span className="text-3xl block mb-3">📋</span>
              <p className="text-slate-500 text-sm">
                {contracts.length === 0 ? '계약 내역이 없습니다.' : '해당 조건의 계약이 없습니다.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="si-table" style={{ minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th>상태</th>
                      <th>고객명</th>
                      <th>차량</th>
                      <th>계약기간</th>
                      <th className="text-right">보증금</th>
                      <th className="text-right">월 렌트료</th>
                      <th className="text-center">수납</th>
                      <th className="text-center">계약일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContracts.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/contracts/${c.id}`)}
                        className="cursor-pointer group"
                      >
                        <td><ContractStatusBadge contract={c} /></td>
                        <td className="font-bold text-slate-800 group-hover:text-blue-400 transition-colors">
                          {c.customer?.name || c.customer_name}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg bg-gray-50 overflow-hidden border border-black/[0.06] flex-shrink-0 flex items-center justify-center">
                              {c.car?.image_url ? (
                                <img src={c.car.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[8px] text-slate-600">No Img</span>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-slate-700 text-xs">{c.car?.number || '-'}</div>
                              <div className="text-[11px] text-slate-500">{c.car?.brand} {c.car?.model}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-slate-400 text-xs">
                          {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
                        </td>
                        <td className="text-right text-slate-400 text-sm">{f(c.deposit)}원</td>
                        <td className="text-right">
                          <span className="font-black text-blue-400">{f(Math.round((c.monthly_rent || 0) * 1.1))}원</span>
                          <div className="text-[10px] text-slate-500">/월 (VAT포함)</div>
                        </td>
                        <td className="text-center">
                          <ProgressBar paid={c.paidCount} total={c.totalCount} />
                        </td>
                        <td className="text-center text-xs text-slate-500">{formatDate(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-gray-200">
                {filteredContracts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/contracts/${c.id}`)}
                    className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <ContractStatusBadge contract={c} />
                      <span className="text-[11px] text-slate-500">{formatDate(c.created_at)}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 text-sm mb-0.5">{c.customer?.name || c.customer_name}</div>
                        <div className="text-xs text-slate-400">{c.car?.brand} {c.car?.model} {c.car?.number ? `(${c.car.number})` : ''}</div>
                        <div className="text-[11px] text-slate-500">{formatDate(c.start_date)} ~ {formatDate(c.end_date)}</div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <span className="font-black text-blue-400 text-sm">{f(Math.round((c.monthly_rent || 0) * 1.1))}원</span>
                        <div className="text-[10px] text-slate-500">/월 VAT포함</div>
                        <div className="mt-1 flex justify-end">
                          <ProgressBar paid={c.paidCount} total={c.totalCount} />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
