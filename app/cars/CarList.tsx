'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

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

  const formatMoney = (amount?: number) => amount?.toLocaleString() || '0'

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

  const statusLabel = (s: string) => s === 'available' ? '대기' : s === 'rented' ? '대여' : s === 'maintenance' ? '정비' : s
  const statusBadge = (s: string) => s === 'available' ? 'si-badge-green' : s === 'rented' ? 'si-badge-blue' : 'si-badge-red'

  // Admin이 회사 미선택 시
  if (role === 'admin' && !adminSelectedCompanyId) {
    return (
      <div className="page-bg">
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-6">
          <div className="si-card p-12 md:p-20 text-center">
            <span className="text-4xl block mb-3">🏢</span>
            <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: '전체', value: stats.total, key: 'all', badge: 'glass-border-blue', icon: '🚗', color: 'text-steel-700' },
              { label: '대기중', value: stats.available, key: 'available', badge: 'glass-border-green', icon: '✅', color: 'text-emerald-600' },
              { label: '대여중', value: stats.rented, key: 'rented', badge: 'glass-border-blue', icon: '🔑', color: 'text-blue-600' },
              { label: '정비/사고', value: stats.maintenance, key: 'maintenance', badge: 'glass-border-amber', icon: '🔧', color: 'text-amber-600' },
              { label: '가동률', value: `${utilizationRate}%`, key: '_util', badge: 'glass-border-purple', icon: '📊', color: utilizationRate >= 70 ? 'text-emerald-600' : 'text-amber-600' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => s.key !== '_util' && setFilter(s.key)}
                className={`glass-3 ${s.badge} rounded-xl p-3 md:p-4 text-center transition-all hover:scale-[1.02] ${filter === s.key ? 'ring-2 ring-steel-400/40 shadow-md' : ''}`}
              >
                <div className="text-base mb-1">{s.icon}</div>
                <div className={`text-xl md:text-2xl font-black ${s.color}`}>
                  {loading ? '-' : s.value}
                </div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">{s.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* ── 정비/사고 경고 배너 ── */}
        {maintenanceCars.length > 0 && (
          <div className="glass-3 glass-border-red rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🔧</span>
              <h3 className="font-bold text-red-700 text-sm">정비/사고 차량 ({maintenanceCars.length}대)</h3>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {maintenanceCars.slice(0, 8).map(car => (
                <button
                  key={car.id}
                  onClick={() => router.push(`/cars/${car.id}`)}
                  className="glass-4 border border-red-200/60 rounded-lg px-3 py-2 flex-shrink-0 hover:shadow-md transition-all text-left"
                >
                  <div className="font-bold text-gray-800 text-sm">{car.number}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{car.brand} {car.model}</div>
                </button>
              ))}
              {maintenanceCars.length > 8 && (
                <div className="si-badge-red rounded-lg px-3 py-2 flex-shrink-0 flex items-center text-xs font-bold">
                  +{maintenanceCars.length - 8}대
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 최근 등록 배너 ── */}
        {recentCars.length > 0 && (
          <div className="glass-3 glass-border-blue rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🆕</span>
              <h3 className="font-bold text-steel-700 text-sm">최근 7일 신규 등록 ({recentCars.length}대)</h3>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentCars.slice(0, 8).map(car => (
                <button
                  key={car.id}
                  onClick={() => router.push(`/cars/${car.id}`)}
                  className="glass-4 border border-steel-200/60 rounded-lg px-3 py-2 flex-shrink-0 hover:shadow-md transition-all text-left"
                >
                  <div className="font-bold text-gray-800 text-sm">{car.number}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">{car.brand}</span>
                    <span className="text-[10px] text-steel-500 font-bold">{car.created_at.split('T')[0]}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 메인 테이블 카드 ── */}
        <div className="si-card">
          {/* 검색 + 액션 바 */}
          <div className="si-search-bar">
            <div className="flex-1 max-w-sm">
              <input
                type="text"
                placeholder="차량번호, 브랜드, 모델 검색..."
                className="si-input text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400 hidden sm:inline">
                검색결과 <strong className="text-gray-600">{filteredCars.length}</strong>대
              </span>
              <button
                onClick={() => {
                  if (role === 'admin' && !adminSelectedCompanyId) {
                    alert('⚠️ 좌측 상단에서 회사를 먼저 선택해주세요.')
                    return
                  }
                  router.push('/cars/new')
                }}
                className="si-btn si-btn-primary text-xs"
              >
                + 차량 등록
              </button>
            </div>
          </div>

          {/* 탭 필터 */}
          <div className="si-tabs">
            {[
              { key: 'all', label: '전체' },
              { key: 'available', label: '대기중' },
              { key: 'rented', label: '대여중' },
              { key: 'maintenance', label: '정비/사고' },
              ...(stats.consignment > 0 ? [{ key: 'consignment', label: '지입차량' }] : []),
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`si-tab ${filter === t.key ? 'si-tab-active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 테이블 콘텐츠 */}
          {loading ? (
            <div className="p-20 text-center text-gray-400 flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mb-3"></div>
              <span className="text-sm">차량 데이터를 불러오는 중...</span>
            </div>
          ) : filteredCars.length === 0 ? (
            <div className="p-12 md:p-20 text-center">
              <span className="text-3xl block mb-3">🚗</span>
              <p className="text-gray-400 text-sm">
                {searchTerm ? '검색 결과가 없습니다.' : '등록된 차량이 없습니다.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="si-table">
                  <thead>
                    <tr>
                      <th>차량번호</th>
                      <th>차종</th>
                      <th>연식</th>
                      <th className="text-center">구분</th>
                      <th className="text-center">상태</th>
                      <th className="text-right">취득가액</th>
                      <th className="text-center">등록일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCars.map((car) => (
                      <tr
                        key={car.id}
                        onClick={() => router.push(`/cars/${car.id}`)}
                        className="cursor-pointer group"
                      >
                        <td className="font-black text-gray-900 text-base group-hover:text-steel-600 transition-colors">
                          {car.number}
                        </td>
                        <td>
                          <div className="font-bold text-gray-800 text-sm">{car.brand}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{car.model}</div>
                        </td>
                        <td>
                          <span className="font-medium text-gray-600 text-sm">{car.year}년</span>
                          <span className="text-xs text-gray-400 block">{car.fuel}</span>
                        </td>
                        <td className="text-center">
                          <div className="flex flex-wrap justify-center gap-1">
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
                          {car.is_used && (car.purchase_mileage || 0) > 0 && (
                            <span className="text-[10px] text-gray-400 block mt-1">
                              구입시 {((car.purchase_mileage || 0) / 10000).toFixed(1)}만km
                            </span>
                          )}
                        </td>
                        <td className="text-center">
                          <span className={`si-badge ${statusBadge(car.status)}`}>
                            {statusLabel(car.status)}
                          </span>
                        </td>
                        <td className="text-right font-bold text-gray-700 text-sm">
                          {formatMoney(car.purchase_price)}원
                        </td>
                        <td className="text-center text-xs text-gray-400">
                          {car.created_at.split('T')[0]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-gray-100/80">
                {filteredCars.map((car) => (
                  <button
                    key={car.id}
                    onClick={() => router.push(`/cars/${car.id}`)}
                    className="w-full text-left px-4 py-3.5 hover:bg-steel-50/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`si-badge ${statusBadge(car.status)}`}>
                          {statusLabel(car.status)}
                        </span>
                        <span className={`si-badge ${car.is_used ? 'si-badge-amber' : 'si-badge-blue'}`}>
                          {car.is_used ? '중고' : '신차'}
                        </span>
                        <span className={`si-badge ${car.is_commercial === false ? 'si-badge-teal' : 'si-badge-steel'}`}>
                          {car.is_commercial === false ? '비영업' : '영업'}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400">{car.created_at.split('T')[0]}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <div className="font-black text-gray-900 text-base mb-0.5">{car.number}</div>
                        <div className="text-sm text-gray-600 font-bold">{car.brand} {car.model}</div>
                        <div className="text-xs text-gray-400">{car.year}년 · {car.fuel}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-steel-600 text-sm">{formatMoney(car.purchase_price)}원</span>
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
