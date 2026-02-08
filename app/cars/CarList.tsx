'use client'

import { supabase } from '../utils/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '../context/AppContext'

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
  created_at: string
}

export default function CarListPage() {
const router = useRouter()
const { company, role } = useApp()

  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)

  // 🔍 필터 및 검색 상태
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // 1. DB에서 차량 목록 가져오기 (테이블명: cars)
  useEffect(() => {
    const fetchCars = async () => {
      let query = supabase
        .from('cars') // 👈 여기가 핵심! vehicles -> cars 로 수정
        .select('*')

      if (role !== 'god_admin' && company) {
        query = query.eq('company_id', company.id)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        console.error('데이터 로딩 실패:', error)
      } else {
        setCars(data || [])
      }
      setLoading(false)
    }
    fetchCars()
  }, [company, role])

  // 🔥 필터링 + 검색 로직
  const filteredCars = cars.filter(car => {
    // 1. 상태 필터
    const statusMatch = filter === 'all' || car.status === filter

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

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 min-h-screen bg-gray-50 animate-fade-in">

      {/* 상단 헤더 영역 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-6 md:mb-8 gap-3 md:gap-4">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-gray-900">🚙 차량 관리 대장</h1>
          <p className="text-gray-500 mt-1 md:mt-2 text-sm">
            총 보유: <span className="font-bold text-indigo-600">{cars.length}</span>대 /
            검색됨: {filteredCars.length}대
          </p>
        </div>

        <div className="flex gap-2 md:gap-3 w-full md:w-auto items-center">
            {/* 검색창 */}
            <input
                type="text"
                placeholder="🔍 검색..."
                className="px-3 md:px-4 py-2.5 md:py-3 border border-gray-300 rounded-xl flex-1 md:flex-none md:min-w-[250px] focus:outline-none focus:border-indigo-500 shadow-sm text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            {/* 차량 등록 버튼 */}
            <button className="bg-gray-900 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-black shadow-lg text-center whitespace-nowrap text-sm flex-shrink-0">
              + 등록
            </button>

        </div>
      </div>

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
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
            >
                {t.label}
            </button>
        ))}
      </div>

      {/* 📋 리스트형 테이블 */}
      <div className="bg-white shadow-sm border border-t-0 border-gray-200 rounded-b-xl overflow-x-auto">
        {loading ? (
            <div className="p-20 text-center text-gray-400 flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                차량 데이터를 불러오는 중...
            </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead className="bg-gray-50 text-gray-500 font-bold text-[10px] md:text-xs uppercase tracking-wider border-b border-gray-100">
                <tr>
                    <th className="p-3 md:p-4">차량번호</th>
                    <th className="p-3 md:p-4">차종</th>
                    <th className="p-3 md:p-4 hidden sm:table-cell">연식</th>
                    <th className="p-3 md:p-4 text-center">상태</th>
                    <th className="p-3 md:p-4 text-right hidden sm:table-cell">취득가액</th>
                    <th className="p-3 md:p-4 text-center hidden md:table-cell">등록일</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {filteredCars.map((car) => (
                    <tr
                        key={car.id}
                        className="hover:bg-indigo-50 cursor-pointer transition-colors group"
                    >
                        <td className="p-3 md:p-4 font-black text-gray-900 text-sm md:text-lg group-hover:text-indigo-600">
                            {car.number}
                        </td>
                        <td className="p-3 md:p-4">
                            <div className="font-bold text-gray-800 text-xs md:text-sm">{car.brand}</div>
                            <div className="text-[10px] md:text-xs text-gray-500">{car.model}</div>
                        </td>
                        <td className="p-3 md:p-4 text-xs md:text-sm font-medium text-gray-600 hidden sm:table-cell">
                            {car.year}년
                            <span className="text-[10px] text-gray-400 block">{car.fuel}</span>
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
                        <td className="p-3 md:p-4 text-right font-bold text-gray-700 text-xs md:text-sm hidden sm:table-cell">
                            {formatMoney(car.purchase_price)}원
                        </td>
                        <td className="p-3 md:p-4 text-center text-xs text-gray-400 hidden md:table-cell">
                            {car.created_at.split('T')[0]}
                        </td>
                    </tr>
                ))}

                {filteredCars.length === 0 && (
                    <tr>
                        <td colSpan={6} className="p-12 md:p-20 text-center text-gray-400 text-sm">
                            {searchTerm ? '검색 결과가 없습니다.' : '등록된 차량이 없습니다.'}
                        </td>
                    </tr>
                )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}