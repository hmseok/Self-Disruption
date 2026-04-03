'use client'
import { auth } from '@/lib/firebase'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function CarListPage() {
  const router = useRouter()
  const [cars, setCars] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 🔍 필터 및 검색 상태
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const fetchCars = async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : ''
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const response = await fetch('/api/cars', { headers })
      const { data } = await response.json()
      setCars(data || [])
      setLoading(false)
    }
    fetchCars()
  }, [])

  // 🔥 필터링 + 검색 로직 동시에 적용
  const filteredCars = cars.filter(car => {
    // 1. 상태 필터 (전체/대기/대여)
    const statusMatch = filter === 'all' || car.status === filter

    // 2. 검색어 필터 (차량번호 or 브랜드 or 모델명)
    const searchLower = searchTerm.toLowerCase()
    const searchMatch =
        car.number.toLowerCase().includes(searchLower) ||
        car.brand.toLowerCase().includes(searchLower) ||
        car.model.toLowerCase().includes(searchLower)

    return statusMatch && searchMatch
  })

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 animate-fade-in">

      {/* 상단 헤더 영역 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">🚙 차량 관리 대장</h1>
          <p className="text-gray-500 mt-2">총 보유: <span className="font-bold text-blue-600">{cars.length}</span>대 / 검색됨: {filteredCars.length}대</p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            {/* 검색창 */}
            <input
                type="text"
                placeholder="🔍 차량번호, 모델명 검색..."
                className="px-4 py-3 border rounded-xl min-w-[250px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <Link href="/cars/new" className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black shadow-lg text-center whitespace-nowrap">
              + 차량 등록
            </Link>
        </div>
      </div>

      {/* 탭 필터 (엑셀 시트 느낌) */}
      <div className="flex border-b mb-0">
        {['all', 'available', 'rented', 'maintenance'].map(t => (
            <button
                key={t}
                onClick={()=>setFilter(t)}
                className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${filter === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
                {t === 'all' ? '전체 보기' : t === 'available' ? '대기중' : t === 'rented' ? '대여중' : '정비/사고'}
            </button>
        ))}
      </div>

      {/* 📋 리스트형 테이블 (썸네일 제거됨) */}
      <div className="bg-white shadow-sm border border-t-0 rounded-b-xl overflow-hidden">
        {loading ? <div className="p-20 text-center text-gray-400">로딩 중...</div> : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase tracking-wider border-b">
                <tr>
                    {/* 썸네일 헤더 제거됨 */}
                    <th className="p-4">차량번호</th>
                    <th className="p-4">차종 (브랜드/모델)</th>
                    <th className="p-4">연식 / 연료</th>
                    <th className="p-4 text-center">상태</th>
                    <th className="p-4 text-right">취득가액</th>
                    <th className="p-4 text-center">등록일</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {filteredCars.map((car) => (
                    <tr
                        key={car.id}
                        onClick={() => router.push(`/cars/${car.id}`)} // 행 클릭 시 이동
                        className="hover:bg-blue-50 cursor-pointer transition-colors group"
                    >
                        {/* 썸네일 셀 제거됨 */}
                        <td className="p-4 font-black text-gray-900 text-lg group-hover:text-blue-600">
                            {car.number}
                        </td>
                        <td className="p-4">
                            <div className="font-bold text-gray-800">{car.brand}</div>
                            <div className="text-xs text-gray-500">{car.model} {car.trim}</div>
                        </td>
                        <td className="p-4 text-sm font-medium text-gray-600">
                            {car.year}년식 <br/>
                            <span className="text-xs text-gray-400">{car.fuel}</span>
                        </td>
                        <td className="p-4 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                car.status === 'available' ? 'bg-green-100 text-green-700' :
                                car.status === 'rented' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'
                            }`}>
                                {car.status === 'available' ? '대기' : car.status === 'rented' ? '대여' : car.status}
                            </span>
                        </td>
                        <td className="p-4 text-right font-bold text-gray-700">
                            {f(car.purchase_price)}원
                        </td>
                        <td className="p-4 text-center text-xs text-gray-400">
                            {car.created_at.split('T')[0]}
                        </td>
                    </tr>
                ))}

                {filteredCars.length === 0 && (
                    <tr>
                        <td colSpan={6} className="p-20 text-center text-gray-400">
                            검색 결과가 없습니다.
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