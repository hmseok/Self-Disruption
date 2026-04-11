'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'
import NeuStatCards, { StatCardItem } from '../components/NeuStatCards'
import NeuSearchBar from '../components/NeuSearchBar'
import NeuFilterTabs from '../components/NeuFilterTabs'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../components/NeuDataTable'

// ═══════════════════════════════════════════════════════════════
// 계약 관리 — 공유 컴포넌트 기반
// ═══════════════════════════════════════════════════════════════

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

type Contract = {
  id: string
  customer_id: string
  customer_name?: string
  car_id: string
  status: string
  start_date: string
  end_date: string
  deposit?: number
  monthly_rent?: number
  created_at: string
  car?: {
    id: string
    number: string
    brand: string
    model: string
    image_url?: string
  }
  customer?: {
    id: string
    name: string
  }
  totalCount?: number
  paidCount?: number
}

// ── 상태 뱃지 ──
function ContractStatusBadge({ contract }: { contract: Contract }) {
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 56,
        height: 6,
        background: '#f1f5f9',
        borderRadius: 99,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          background: '#10b981',
          borderRadius: 99,
          width: `${pct}%`,
          transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{paid}/{total}</span>
    </div>
  )
}

type ContractStatusFilter = 'all' | 'active' | 'expiring' | 'ended' | 'cancelled'
type SortOption = 'latest' | 'customer' | 'expiry' | 'rent'

export default function ContractListMain() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const router = useRouter()
  const [contracts, setContracts] = useState<Contract[]>([])
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

  // ── NeuStatCards 데이터 ──
  const statItems: StatCardItem[] = [
    { key: 'all', label: '전체', value: contractStats.total, unit: '건', icon: '📋', color: 'blue' },
    { key: 'active', label: '진행중', value: contractStats.active, unit: '건', icon: '✅', color: 'green' },
    { key: 'expiring', label: '만료임박', value: contractStats.expiringSoon, unit: '건', icon: '⏳', color: 'amber' },
    { key: 'ended', label: '종료', value: contractStats.ended, unit: '건', icon: '📁', color: 'slate' },
    { key: 'cancelled', label: '해지', value: contractStats.cancelled, unit: '건', icon: '🚫', color: 'red' },
  ]

  // ── NeuFilterTabs 데이터 ──
  const filterTabs = [
    { key: 'all', label: '전체', count: contractStats.total },
    { key: 'active', label: '진행중', count: contractStats.active },
    { key: 'expiring', label: '만료임박', count: contractStats.expiringSoon },
    { key: 'ended', label: '종료', count: contractStats.ended },
    { key: 'cancelled', label: '해지', count: contractStats.cancelled },
  ]

  // ── NeuDataTable 컬럼 ──
  const columns: TableColumn<Contract>[] = [
    {
      key: 'status',
      label: '상태',
      width: 100,
      render: (contract) => <ContractStatusBadge contract={contract} />,
    },
    {
      key: 'customer',
      label: '고객명',
      render: (contract) => (
        <span style={{ fontWeight: 900, fontSize: 14, color: '#0f2440' }}>
          {contract.customer?.name || contract.customer_name}
        </span>
      ),
    },
    {
      key: 'car',
      label: '차량',
      render: (contract) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#f1f5f9',
            overflow: 'hidden',
            border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {contract.car?.image_url ? (
              <img src={contract.car.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 8, color: '#64748b' }}>No Img</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#0f2440' }}>{contract.car?.number || '-'}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{contract.car?.brand} {contract.car?.model}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'period',
      label: '계약기간',
      render: (contract) => (
        <span style={{ fontSize: 13, color: '#64748b' }}>
          {formatDate(contract.start_date)} ~ {formatDate(contract.end_date)}
        </span>
      ),
    },
    {
      key: 'deposit',
      label: '보증금',
      align: 'right',
      render: (contract) => (
        <span style={{ fontSize: 13, color: '#64748b' }}>{f(contract.deposit)}원</span>
      ),
    },
    {
      key: 'rent',
      label: '월 렌트료',
      align: 'right',
      render: (contract) => (
        <div>
          <span style={{ fontWeight: 900, fontSize: 14, color: '#3b6eb5' }}>
            {f(Math.round((contract.monthly_rent || 0) * 1.1))}원
          </span>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>/월 (VAT포함)</div>
        </div>
      ),
    },
    {
      key: 'payment',
      label: '수납',
      align: 'center',
      render: (contract) => <ProgressBar paid={contract.paidCount || 0} total={contract.totalCount || 0} />,
    },
    {
      key: 'date',
      label: '계약일',
      align: 'center',
      render: (contract) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(contract.created_at)}</span>
      ),
    },
  ]

  // ── 모바일 카드 설정 ──
  const mobileCard: MobileCardConfig<Contract> = {
    title: (contract) => contract.customer?.name || contract.customer_name,
    subtitle: (contract) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span>{contract.car?.brand} {contract.car?.model} {contract.car?.number ? `(${contract.car.number})` : ''}</span>
        <span>{formatDate(contract.start_date)} ~ {formatDate(contract.end_date)}</span>
      </div>
    ),
    trailing: (contract) => (
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: '#3b6eb5' }}>
          {f(Math.round((contract.monthly_rent || 0) * 1.1))}원
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>/월 VAT포함</div>
        <div style={{ marginTop: 6 }}>
          <ProgressBar paid={contract.paidCount || 0} total={contract.totalCount || 0} />
        </div>
      </div>
    ),
    badges: (contract) => (
      <>
        <ContractStatusBadge contract={contract} />
      </>
    ),
  }

  // ── Admin 회사 미선택 ──
  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="page-bg">
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-6">
          <div style={{
            background: 'rgba(255,255,255,0.72)',
            borderRadius: 16,
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '6px 6px 18px rgba(140,170,210,0.14), -6px -6px 18px rgba(255,255,255,0.47)',
            padding: '48px 20px',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>🏢</span>
            <p style={{ color: '#8aabc7', fontWeight: 600, fontSize: 14 }}>좌측 상단에서 회사를 먼저 선택해주세요</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-bg">
      <div className="max-w-7xl mx-auto py-6 px-4 md:py-8 md:px-6">

        {/* ── KPI 스탯 카드 ── */}
        {contracts.length > 0 && (
          <NeuStatCards
            items={statItems}
            activeKey={contractStatusFilter}
            onSelect={(key) => setContractStatusFilter(key as ContractStatusFilter)}
            columns={5}
          />
        )}

        {/* ── 검색바 ── */}
        <NeuSearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="고객명, 차량번호, 브랜드 검색..."
          resultText={`검색결과 ${filteredContracts.length}건`}
          extra={
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 12,
              borderLeft: '1px solid rgba(0,0,0,0.06)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>정렬</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                style={{
                  padding: '8px 10px',
                  fontSize: 12,
                  background: 'rgba(255,255,255,0.60)',
                  border: '1px solid rgba(0,0,0,0.05)',
                  borderRadius: 8,
                  color: '#1e293b',
                  fontWeight: 500,
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: '2px 2px 6px rgba(140,170,210,0.10), -2px -2px 6px rgba(255,255,255,0.40)',
                  transition: 'all 0.2s',
                }}
              >
                <option value="latest">최신순</option>
                <option value="customer">고객명순</option>
                <option value="expiry">만료일순</option>
                <option value="rent">렌트료순</option>
              </select>
            </div>
          }
        />

        {/* ── 필터 탭 ── */}
        <NeuFilterTabs
          tabs={filterTabs}
          activeKey={contractStatusFilter}
          onSelect={(key) => setContractStatusFilter(key as ContractStatusFilter)}
        />

        {/* ── 데이터 테이블 ── */}
        <NeuDataTable
          columns={columns}
          data={filteredContracts}
          rowKey={(contract) => contract.id}
          onRowClick={(contract) => router.push(`/contracts/${contract.id}`)}
          loading={loading}
          emptyIcon="📋"
          emptyMessage={searchTerm ? '검색 결과가 없습니다.' : '계약 내역이 없습니다.'}
          mobileCard={mobileCard}
        />

      </div>
    </div>
  )
}
