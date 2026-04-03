'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'
import DarkHeader from '../components/DarkHeader'

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// ✅ DB 컬럼명에 맞춰서 타입 정의 수정 (cars 테이블 기준)
type Car = {
  id: string
  number: string        // 차량번호
  brand: string         // 제조사
  model: string         // 모델명
  trim?: string         // 트림
  year: string          // 연식
  fuel: string          // 연료
  status: string        // 상태 (available, rented 등)
  purchase_price?: number // 취득가액
  is_used?: boolean       // 중고차 여부
  purchase_mileage?: number // 구입 시 주행거리 (km)
  mileage?: number        // 현재 주행거리
  is_commercial?: boolean  // 영업용 여부
  ownership_type?: string  // 소유구분: company/consignment/leased_in
  created_at: string
}

export default function CarListPage() {
const router = useRouter()
const { company, role, adminSelectedCompanyId } = useApp()

  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)

  // 🔍 필터 및 검색 상태
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // 1. DB에서 차량 목록 가져오기 (/api/cars 경유 → MySQL)
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

  // 🔥 필터링 + 검색 로직
  const filteredCars = cars.filter(car => {
    // 1. 상태 필터 (+ 소유구분 필터)
    const statusMatch = filter === 'all' || car.status === filter
      || (filter === 'consignment' && car.ownership_type === 'consignment')
      || (filter === 'leased_in' && car.ownership_type === 'leased_in')

    // 2. 검색어 필터
    const searchLower = searchTerm.toLowerCase()
    const searchMatch =
        (car.number || '').toLowerCase().includes(searchLower) ||
        (car.brand || '').toLowerCase().includes(searchLower) ||
        (car.model || '').toLowerCase().includes(searchLower)

    return statusMatch && searchMatch
  })

  // 숫자 포맷팅 (예: 50,000,000원)
  const formatMoney = (amount?: number) => amount?.toLocaleString() || '0'

  // 📊 KPI 통계
  const stats = {
    total: cars.length,
    available: cars.filter(c => c.status === 'available').length,
    rented: cars.filter(c => c.status === 'rented').length,
    maintenance: cars.filter(c => c.status === 'maintenance').length,
    consignment: cars.filter(c => c.ownership_type === 'consignment').length,
    totalValue: cars.reduce((s, c) => s + (c.purchase_price || 0), 0),
    avgValue: cars.length > 0 ? Math.round(cars.reduce((s, c) => s + (c.purchase_price || 0), 0) / cars.length) : 0,
  }

  // 정비/사고 차량 목록
  const maintenanceCars = cars.filter(c => c.status === 'maintenance')

  // 최근 7일 등록 차량
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentCars = cars.filter(c => new Date(c.created_at) >= sevenDaysAgo)

  // 운용률 계산
  const utilizationRate = stats.total > 0 ? Math.round(((stats.rented) / stats.total) * 100) : 0

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
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50 animate-fade-in">

      {/* DarkHeader 컴포넌트로 대체 */}
      {cars.length > 0 && (
        <>
          <DarkHeader
            icon="🚙"
            title="전체 차량 대장"
            subtitle={`총 보유: ${cars.length}대 / 검색됨: ${filteredCars.length}대`}
            stats={[
              {
                label: '전체',
                value: stats.total,
                color: '#334155',
                bgColor: '#fff',
                borderColor: '#e2e8f0',
                labelColor: '#94a3b8',
                onClick: () => setFilter('all'),
              },
              {
                label: '대기중',
                value: stats.available,
                color: '#059669',
                bgColor: '#ecfdf5',
                borderColor: '#bbf7d0',
                labelColor: '#6ee7b7',
                onClick: () => setFilter('available'),
              },
              {
                label: '대여중',
                value: stats.rented,
                color: '#2563eb',
                bgColor: '#eff6ff',
                borderColor: '#bfdbfe',
                labelColor: '#93c5fd',
                onClick: () => setFilter('rented'),
              },
              {
                label: '정비/사고',
                value: stats.maintenance,
                color: '#d97706',
                bgColor: '#fffbeb',
                borderColor: '#fde68a',
                labelColor: '#fcd34d',
                onClick: () => setFilter('maintenance'),
              },
              ...(stats.consignment > 0 ? [{
                label: '지입차량',
                value: stats.consignment,
                color: '#7c3aed',
                bgColor: '#f5f3ff',
                borderColor: '#ddd6fe',
                labelColor: '#c4b5fd',
                onClick: () => setFilter('consignment'),
              }] : []),
            ]}
            actions={[
              {
                label: '+ 등록',
                onClick: () => {
                  if (role === 'admin' && !adminSelectedCompanyId) {
                    alert('⚠️ 좌측 상단에서 회사를 먼저 선택해주세요.')
                    return
                  }
                  router.push('/cars/new')
                },
                variant: 'primary',
              },
            ]}
          >
            {/* 검색창을 children으로 전달 */}
            <div style={{ padding: '12px 20px', background: '#ffffff', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="🔍 검색..."
                className="flex-1 px-3 md:px-4 py-2.5 md:py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-steel-500 shadow-sm text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </DarkHeader>

          {/* ⚠️ 정비/사고 차량 경고 배너 */}
          {maintenanceCars.length > 0 && (
            <div className="mb-4 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4 md:p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🔧</span>
                <h3 className="font-bold text-red-800 text-sm">정비/사고 차량 ({maintenanceCars.length}대) — 확인 필요</h3>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {maintenanceCars.slice(0, 8).map(car => (
                  <div
                    key={car.id}
                    onClick={() => router.push(`/cars/${car.id}`)}
                    className="bg-white border border-red-200 rounded-xl px-3 py-2 flex-shrink-0 cursor-pointer hover:shadow-md transition-all hover:border-red-400"
                  >
                    <div className="font-bold text-gray-800 text-sm">{car.number}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{car.brand} {car.model}</div>
                  </div>
                ))}
                {maintenanceCars.length > 8 && (
                  <div className="bg-red-100 rounded-xl px-3 py-2 flex-shrink-0 flex items-center text-red-700 text-xs font-bold">
                    +{maintenanceCars.length - 8}대 더
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 🆕 최근 등록 차량 배너 */}
          {recentCars.length > 0 && (
            <div className="mb-4 bg-gradient-to-r from-steel-50 to-blue-50 border border-steel-200 rounded-2xl p-4 md:p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🆕</span>
                <h3 className="font-bold text-steel-800 text-sm">최근 7일 신규 등록 ({recentCars.length}대)</h3>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recentCars.slice(0, 8).map(car => (
                  <div
                    key={car.id}
                    onClick={() => router.push(`/cars/${car.id}`)}
                    className="bg-white border border-steel-200 rounded-xl px-3 py-2 flex-shrink-0 cursor-pointer hover:shadow-md transition-all hover:border-steel-400"
                  >
                    <div className="font-bold text-gray-800 text-sm">{car.number}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{car.brand}</span>
                      <span className="text-[10px] text-steel-500 font-bold">{car.created_at.split('T')[0]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 탭 필터 */}
      <div className="flex border-b border-gray-200 mb-0 overflow-x-auto">
        {[
          { key: 'all', label: '전체' },
          { key: 'available', label: '대기중' },
          { key: 'rented', label: '대여중' },
          { key: 'maintenance', label: '정비/사고' }
        ].map(t => (
            <button
                key={t.key}
                onClick={()=>setFilter(t.key)}
                className={`px-3 md:px-6 py-2.5 md:py-3 font-bold text-xs md:text-sm border-b-2 transition-colors whitespace-nowrap ${
                    filter === t.key
                    ? 'border-steel-600 text-steel-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
            >
                {t.label}
            </button>
        ))}
      </div>

      {/* 📋 리스트형 테이블 */}
      <div className="bg-white shadow-sm border border-t-0 border-gray-200 rounded-b-xl overflow-hidden">
        {loading ? (
            <div className="p-20 text-center text-gray-400 flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-steel-600 mb-2"></div>
                차량 데이터를 불러오는 중...
            </div>
        ) : filteredCars.length === 0 ? (
            <div className="p-12 md:p-20 text-center text-gray-400 text-sm">
                {role === 'admin' && !adminSelectedCompanyId ? (
                  <div>
                    <span className="text-4xl block mb-3">🏢</span>
                    <p className="font-bold text-gray-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
                    <p className="text-xs mt-1">슈퍼어드민은 회사를 선택한 후 차량을 조회/등록할 수 있습니다.</p>
                  </div>
                ) : searchTerm ? '검색 결과가 없습니다.' : '등록된 차량이 없습니다.'}
            </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block" style={{ overflowX: 'auto' }}>
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider border-b border-gray-100">
                    <tr>
                        <th className="p-3 md:p-4">차량번호</th>
                        <th className="p-3 md:p-4">차종</th>
                        <th className="p-3 md:p-4">연식</th>
                        <th className="p-3 md:p-4 text-center">구분</th>
                        <th className="p-3 md:p-4 text-center">상태</th>
                        <th className="p-3 md:p-4 text-right">취득가액</th>
                        <th className="p-3 md:p-4 text-center">등록일</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredCars.map((car) => (
                        <tr
                            key={car.id}
                            onClick={() => router.push(`/cars/${car.id}`)}
                            className="hover:bg-steel-50 cursor-pointer transition-colors group"
                        >
                            <td className="p-3 md:p-4 font-black text-gray-900 text-sm md:text-lg group-hover:text-steel-600">
                                {car.number}
                            </td>
                            <td className="p-3 md:p-4">
                                <div className="font-bold text-gray-800 text-xs md:text-sm">{car.brand}</div>
                                <div className="text-[10px] md:text-xs text-gray-500">{car.model}</div>
                            </td>
                            <td className="p-3 md:p-4 text-xs md:text-sm font-medium text-gray-600">
                                {car.year}년
                                <span className="text-[10px] text-gray-400 block">{car.fuel}</span>
                            </td>
                            <td className="p-3 md:p-4 text-center">
                                <div className="flex flex-wrap justify-center gap-1">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold ${
                                      car.is_used ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                      {car.is_used ? '중고' : '신차'}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold ${
                                      car.is_commercial === false ? 'bg-teal-100 text-teal-700' : 'bg-steel-100 text-steel-600'
                                  }`}>
                                      {car.is_commercial === false ? '비영업' : '영업'}
                                  </span>
                                  {car.ownership_type && car.ownership_type !== 'company' && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold ${
                                      car.ownership_type === 'consignment' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                                    }`}>
                                      {car.ownership_type === 'consignment' ? '지입' : '임차'}
                                    </span>
                                  )}
                                </div>
                                {car.is_used && (car.purchase_mileage || 0) > 0 && (
                                    <span className="text-[10px] text-gray-400 block mt-0.5">
                                        구입시 {((car.purchase_mileage || 0) / 10000).toFixed(1)}만km
                                    </span>
                                )}
                            </td>
                            <td className="p-3 md:p-4 text-center">
                                <span className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold ${
                                    car.status === 'available' ? 'bg-green-100 text-green-700' :
                                    car.status === 'rented' ? 'bg-blue-100 text-blue-700' :
                                    'bg-red-100 text-red-600'
                                }`}>
                                    {car.status === 'available' ? '대기' :
                                     car.status === 'rented' ? '대여' :
                                     car.status}
                                </span>
                            </td>
                            <td className="p-3 md:p-4 text-right font-bold text-gray-700 text-xs md:text-sm">
                                {formatMoney(car.purchase_price)}원
                            </td>
                            <td className="p-3 md:p-4 text-center text-xs text-gray-400">
                                {car.created_at.split('T')[0]}
                            </td>
                        </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {/* Mobile Card View */}
            <div className="md:hidden" style={{ padding: '8px 12px' }}>
              {filteredCars.map((car) => (
                <div key={car.id} onClick={() => router.push(`/cars/${car.id}`)}
                  style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${car.status === 'available' ? 'bg-green-100 text-green-700' : car.status === 'rented' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                        {car.status === 'available' ? '대기' : car.status === 'rented' ? '대여' : car.status}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${car.is_used ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {car.is_used ? '중고' : '신차'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${car.is_commercial === false ? 'bg-teal-100 text-teal-700' : 'bg-steel-100 text-steel-600'}`}>
                        {car.is_commercial === false ? '비영업' : '영업'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{car.created_at.split('T')[0]}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontWeight: 900, color: '#111827', fontSize: 16, marginBottom: 2 }}>{car.number}</div>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 700 }}>{car.brand} {car.model}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{car.year}년 · {car.fuel}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 900, color: '#2d5fa8', fontSize: 14 }}>{formatMoney(car.purchase_price)}원</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}