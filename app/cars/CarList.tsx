'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'
import NeuStatCards, { StatCardItem } from '../components/NeuStatCards'
import NeuSearchBar from '../components/NeuSearchBar'
import NeuFilterTabs from '../components/NeuFilterTabs'
import NeuDataTable, { TableColumn, MobileCardConfig } from '../components/NeuDataTable'

// ═══════════════════════════════════════════════════════════════
// 차량 관리 — 공유 컴포넌트 기반 (기준 페이지)
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

type Car = {
  id: string
  number: string
  brand: string
  model: string
  trim?: string
  year: string
  fuel: string
  status: string
  purchase_price?: number
  is_used?: boolean
  purchase_mileage?: number
  mileage?: number
  is_commercial?: boolean
  ownership_type?: string
  created_at: string
}

export default function CarListPage() {
  const router = useRouter()
  const { company, role, adminSelectedCompanyId } = useApp()

  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const fetchCars = async () => {
      try {
        const headers = await getAuthHeader()
        const params = new URLSearchParams()
        if (adminSelectedCompanyId) params.set('company_id', adminSelectedCompanyId)
        const res = await fetch(`/api/cars?${params}`, { headers })
        const json = await res.json()
        if (json.error) {
          console.error('데이터 로딩 실패:', json.error)
        } else {
          setCars(json.data || [])
        }
      } catch (error) {
        console.error('데이터 로딩 실패:', error)
      }
      setLoading(false)
    }
    fetchCars()
  }, [company, role, adminSelectedCompanyId])

  // ── 필터링 ──
  const filteredCars = cars.filter(car => {
    const statusMatch = filter === 'all' || car.status === filter
      || (filter === 'consignment' && car.ownership_type === 'consignment')
      || (filter === 'leased_in' && car.ownership_type === 'leased_in')
    const searchLower = searchTerm.toLowerCase()
    const searchMatch =
      (car.number || '').toLowerCase().includes(searchLower) ||
      (car.brand || '').toLowerCase().includes(searchLower) ||
      (car.model || '').toLowerCase().includes(searchLower)
    return statusMatch && searchMatch
  })

  // ── 통계 ──
  const stats = {
    total: cars.length,
    available: cars.filter(c => c.status === 'available').length,
    rented: cars.filter(c => c.status === 'rented').length,
    maintenance: cars.filter(c => c.status === 'maintenance').length,
    consignment: cars.filter(c => c.ownership_type === 'consignment').length,
  }
  const maintenanceCars = cars.filter(c => c.status === 'maintenance')
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentCars = cars.filter(c => new Date(c.created_at) >= sevenDaysAgo)
  const utilizationRate = stats.total > 0 ? Math.round((stats.rented / stats.total) * 100) : 0

  // ── 유틸 ──
  const formatMoney = (amount?: number | string) => (Number(amount) || 0).toLocaleString()
  const statusLabel = (s: string) => s === 'available' ? '대기' : s === 'rented' ? '대여' : s === 'maintenance' ? '정비' : s
  const statusBadge = (s: string) => s === 'available' ? 'si-badge-green' : s === 'rented' ? 'si-badge-blue' : 'si-badge-red'

  // ── NeuStatCards 데이터 ──
  const statItems: StatCardItem[] = [
    { key: 'all', label: '전체', value: stats.total, unit: '대', icon: '🚗', color: 'blue' },
    { key: 'available', label: '대기중', value: stats.available, unit: '대', icon: '✅', color: 'green' },
    { key: 'rented', label: '대여중', value: stats.rented, unit: '대', icon: '🔑', color: 'blue' },
    { key: 'maintenance', label: '정비/사고', value: stats.maintenance, unit: '대', icon: '🔧', color: 'amber' },
    { key: '_util', label: '가동률', value: `${utilizationRate}%`, format: false, icon: '📊', color: utilizationRate >= 70 ? 'green' : 'amber' },
  ]

  // ── NeuFilterTabs 데이터 ──
  const filterTabs = [
    { key: 'all', label: '전체', count: stats.total },
    { key: 'available', label: '대기중', count: stats.available },
    { key: 'rented', label: '대여중', count: stats.rented },
    { key: 'maintenance', label: '정비/사고', count: stats.maintenance },
    ...(stats.consignment > 0 ? [{ key: 'consignment', label: '지입차량', count: stats.consignment }] : []),
  ]

  // ── NeuDataTable 컬럼 ──
  const columns: TableColumn<Car>[] = [
    {
      key: 'number',
      label: '차량번호',
      render: (car) => (
        <span style={{ fontWeight: 900, fontSize: 15, color: '#0f2440' }}>{car.number}</span>
      ),
    },
    {
      key: 'model',
      label: '차종',
      render: (car) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{car.brand}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{car.model}</div>
        </div>
      ),
    },
    {
      key: 'year',
      label: '연식',
      render: (car) => (
        <div>
          <span style={{ fontWeight: 500, fontSize: 13, color: '#1e293b' }}>{car.year}년</span>
          <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>{car.fuel}</span>
        </div>
      ),
    },
    {
      key: 'type',
      label: '구분',
      align: 'center',
      render: (car) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 3 }}>
          <span className={`si-badge ${car.is_used ? 'si-badge-amber' : 'si-badge-blue'}`}>
            {car.is_used ? '중고' : '신차'}
          </span>
          <span className={`si-badge ${car.is_commercial === false ? 'si-badge-teal' : 'si-badge-steel'}`}>
            {car.is_commercial === false ? '비영업' : '영업'}
          </span>
          {car.ownership_type && car.ownership_type !== 'company' && (
            <span className={`si-badge ${car.ownership_type === 'consignment' ? 'si-badge-amber' : 'si-badge-purple'}`}>
              {car.ownership_type === 'consignment' ? '지입' : '임차'}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: '상태',
      align: 'center',
      render: (car) => (
        <span className={`si-badge ${statusBadge(car.status)}`}>{statusLabel(car.status)}</span>
      ),
    },
    {
      key: 'price',
      label: '취득가액',
      align: 'right',
      render: (car) => (
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{formatMoney(car.purchase_price)}원</span>
      ),
    },
    {
      key: 'date',
      label: '등록일',
      align: 'center',
      render: (car) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{car.created_at.split('T')[0]}</span>
      ),
    },
  ]

  // ── 모바일 카드 설정 ──
  const mobileCard: MobileCardConfig<Car> = {
    title: (car) => car.number,
    subtitle: (car) => `${car.brand} ${car.model} · ${car.year}년 · ${car.fuel}`,
    trailing: (car) => (
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 900, fontSize: 13, color: '#3b6eb5' }}>{formatMoney(car.purchase_price)}원</div>
        <div style={{ fontSize: 10, color: '#8aabc7', marginTop: 2 }}>{car.created_at.split('T')[0]}</div>
      </div>
    ),
    badges: (car) => (
      <>
        <span className={`si-badge ${statusBadge(car.status)}`}>{statusLabel(car.status)}</span>
        <span className={`si-badge ${car.is_used ? 'si-badge-amber' : 'si-badge-blue'}`}>
          {car.is_used ? '중고' : '신차'}
        </span>
        <span className={`si-badge ${car.is_commercial === false ? 'si-badge-teal' : 'si-badge-steel'}`}>
          {car.is_commercial === false ? '비영업' : '영업'}
        </span>
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
        {cars.length > 0 && (
          <NeuStatCards
            items={statItems}
            activeKey={filter}
            onSelect={(key) => key !== '_util' && setFilter(key)}
            columns={5}
          />
        )}

        {/* ── 정비/사고 경고 배너 ── */}
        {maintenanceCars.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.72)',
            border: '1.5px solid rgba(239,68,68,0.15)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 12,
            boxShadow: '4px 4px 12px rgba(140,170,210,0.14), -4px -4px 12px rgba(255,255,255,0.47)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>🔧</span>
              <h3 style={{ fontWeight: 700, color: '#dc2626', fontSize: 13 }}>
                정비/사고 차량 ({maintenanceCars.length}대)
              </h3>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {maintenanceCars.slice(0, 8).map(car => (
                <button
                  key={car.id}
                  onClick={() => router.push(`/cars/${car.id}`)}
                  style={{
                    background: 'rgba(255,255,255,0.60)',
                    border: '1px solid rgba(239,68,68,0.12)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    flexShrink: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: '2px 2px 6px rgba(140,170,210,0.08), -2px -2px 6px rgba(255,255,255,0.35)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{car.number}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{car.brand} {car.model}</div>
                </button>
              ))}
              {maintenanceCars.length > 8 && (
                <div style={{
                  background: '#fee2e2',
                  borderRadius: 10,
                  padding: '8px 12px',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#dc2626',
                }}>
                  +{maintenanceCars.length - 8}대
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 최근 등록 배너 ── */}
        {recentCars.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.72)',
            border: '1.5px solid rgba(59,130,246,0.12)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 12,
            boxShadow: '4px 4px 12px rgba(140,170,210,0.14), -4px -4px 12px rgba(255,255,255,0.47)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>🆕</span>
              <h3 style={{ fontWeight: 700, color: '#3b6eb5', fontSize: 13 }}>
                최근 7일 신규 등록 ({recentCars.length}대)
              </h3>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {recentCars.slice(0, 8).map(car => (
                <button
                  key={car.id}
                  onClick={() => router.push(`/cars/${car.id}`)}
                  style={{
                    background: 'rgba(255,255,255,0.60)',
                    border: '1px solid rgba(59,130,246,0.10)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    flexShrink: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: '2px 2px 6px rgba(140,170,210,0.08), -2px -2px 6px rgba(255,255,255,0.35)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{car.number}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{car.brand}</span>
                    <span style={{ fontSize: 10, color: '#3b6eb5', fontWeight: 700 }}>{car.created_at.split('T')[0]}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 검색바 ── */}
        <NeuSearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="차량번호, 브랜드, 모델 검색..."
          resultText={`검색결과 ${filteredCars.length}대`}
          actions={[{
            label: '+ 차량 등록',
            variant: 'primary',
            onClick: () => {
              if (role === 'admin' && !adminSelectedCompanyId) {
                alert('⚠️ 좌측 상단에서 회사를 먼저 선택해주세요.')
                return
              }
              router.push('/cars/new')
            },
          }]}
        />

        {/* ── 필터 탭 ── */}
        <NeuFilterTabs
          tabs={filterTabs}
          activeKey={filter}
          onSelect={setFilter}
        />

        {/* ── 데이터 테이블 ── */}
        <NeuDataTable
          columns={columns}
          data={filteredCars}
          rowKey={(car) => car.id}
          onRowClick={(car) => router.push(`/cars/${car.id}`)}
          loading={loading}
          emptyIcon="🚗"
          emptyMessage={searchTerm ? '검색 결과가 없습니다.' : '등록된 차량이 없습니다.'}
          mobileCard={mobileCard}
        />

      </div>
    </div>
  )
}
