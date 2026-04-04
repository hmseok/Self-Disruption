'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Car {
  id: number; number: string; brand: string; model: string;
  trim: string; year: number; fuel: string; status: string;
  purchase_price: number; created_at: string; image_url?: string;
}

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

export default function DashboardPage() {
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)

  // 📊 대시보드용 숫자 상태
  const [stats, setStats] = useState({
    totalCars: 0,
    rented: 0,
    available: 0,
    monthlyRevenue: 0, // 월 매출 (렌트료)
    monthlyExpense: 0, // 월 지출 (할부+보험)
    netProfit: 0       // 순수익
  })

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      try {
        // 1. 차량 목록 가져오기
        const carsRes = await fetch('/api/cars', {
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
        })
        const carsJson = await carsRes.json()
        const carList = carsJson.data || []
        setCars(carList)

        // 2. 활성 계약(매출) 가져오기
        const quotesRes = await fetch('/api/quotes?status=active', {
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
        })
        const quotesJson = await quotesRes.json()
        const totalRevenue = quotesJson.data?.reduce((sum: number, q: any) => sum + (q.rent_fee || 0), 0) || 0

        // 3. 금융 비용(지출 1) 가져오기
        const financeRes = await fetch('/api/financial-products', {
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
        })
        const financeJson = await financeRes.json()
        const totalFinance = financeJson.data?.reduce((sum: number, f: any) => sum + (f.monthly_payment || 0), 0) || 0

        // 4. 보험료(지출 2) 가져오기 (연납 -> 월 환산)
        const insuranceRes = await fetch('/api/insurance-contracts', {
          headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
        })
        const insuranceJson = await insuranceRes.json()
        const totalInsurance = insuranceJson.data?.reduce((sum: number, i: any) => sum + Math.round((i.total_premium || 0) / 12), 0) || 0

        // 5. 통계 집계
        setStats({
          totalCars: carList.length,
          rented: carList.filter((c: any) => c.status === 'rented').length, // status가 rented인 차
          available: carList.filter((c: any) => c.status === 'available').length, // status가 available인 차
          monthlyRevenue: totalRevenue,
          monthlyExpense: totalFinance + totalInsurance,
          netProfit: totalRevenue - (totalFinance + totalInsurance)
        })
      } catch (error) {
        console.error('Dashboard data fetch error:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const f = (n: number) => n?.toLocaleString() || '0'

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-10 md:px-6 bg-gray-50/50 min-h-screen animate-fade-in">

      {/* 1. 상단 경영 대시보드 (New!) */}
      <div className="mb-12">
        <h1 className="text-3xl font-black text-gray-900 mb-6">📊 경영 현황판</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

            {/* 카드 1: 차량 보유 현황 */}
            <div className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col justify-between h-40">
                <span className="text-gray-500 font-bold text-sm">총 보유 차량</span>
                <div className="flex items-end gap-2">
                    <span className="text-4xl font-black text-gray-900">{stats.totalCars}</span>
                    <span className="text-gray-500 mb-1 font-bold">대</span>
                </div>
                <div className="text-xs font-bold text-gray-400 flex gap-2">
                    <span className="text-green-600">대기 {stats.available}</span>
                    <span className="text-steel-600">대여중 {stats.rented}</span>
                </div>
            </div>

            {/* 카드 2: 월 예상 매출 */}
            <div className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col justify-between h-40">
                <span className="text-gray-500 font-bold text-sm">이번 달 예상 매출</span>
                <div className="text-steel-600">
                    <span className="text-3xl font-black">{f(stats.monthlyRevenue)}</span>
                    <span className="text-sm font-bold ml-1">원</span>
                </div>
                <div className="text-xs text-gray-400">활성 렌트 계약 기준</div>
            </div>

            {/* 카드 3: 월 고정 지출 */}
            <div className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col justify-between h-40">
                <span className="text-gray-500 font-bold text-sm">월 고정 지출 (할부+보험)</span>
                <div className="text-red-500">
                    <span className="text-3xl font-black">{f(stats.monthlyExpense)}</span>
                    <span className="text-sm font-bold ml-1">원</span>
                </div>
                <div className="text-xs text-gray-400">숨만 쉬어도 나가는 돈</div>
            </div>

            {/* 카드 4: 월 순수익 (하이라이트) */}
            <div className="bg-steel-900 text-white p-6 rounded-3xl shadow-lg flex flex-col justify-between h-40 ring-4 ring-gray-100">
                <span className="text-yellow-400 font-bold text-sm">💰 이번 달 순수익</span>
                <div>
                    <span className="text-4xl font-black">{f(stats.netProfit)}</span>
                    <span className="text-sm font-bold ml-1 text-gray-400">원</span>
                </div>
                <div className="text-xs text-gray-400 font-bold">매출 - 고정지출</div>
            </div>
        </div>
      </div>

      {/* 2. 하단 차량 관리 리스트 (기존 기능) */}
      <div className="flex justify-between items-center mb-6 border-t pt-10">
        <div>
            <h2 className="text-2xl font-black text-gray-900">🚙 차량 관리</h2>
            <div className="flex gap-4 mt-2 text-sm font-bold text-gray-500">
                <Link href="/quotes" className="hover:text-steel-600 hover:underline">📄 견적/계약 대장 &gt;</Link>
                <Link href="/customers" className="hover:text-steel-600 hover:underline">👥 고객 관리 &gt;</Link>
            </div>
        </div>
        <Link href="/cars/new" className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-steel-800 transition-colors shadow-lg">
          + 차량 등록
        </Link>
      </div>

      {loading ? <div className="p-20 text-center text-gray-400">데이터 분석 중...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cars.map((car) => (
            <Link
              key={car.id}
              href={`/cars/${car.id}`}
              className="block bg-white p-6 rounded-2xl border-2 border-gray-100 hover:border-steel-500 hover:shadow-xl transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                    {/* 썸네일 이미지 (있으면 표시) */}
                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden border">
                        {car.image_url ? <img src={car.image_url} className="w-full h-full object-cover"/> : <span className="flex h-full items-center justify-center text-xs text-gray-300">No img</span>}
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-gray-900 group-hover:text-steel-600 transition-colors">{car.number}</h3>
                        <p className="text-gray-500 font-medium text-sm">{car.brand} {car.model} {car.trim}</p>
                    </div>
                </div>
                <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  car.status === 'available' ? 'bg-green-100 text-green-700' :
                  car.status === 'rented' ? 'bg-steel-100 text-steel-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {car.status === 'available' ? '대기중' : car.status === 'rented' ? '대여중' : car.status}
                </span>
              </div>

              <div className="flex justify-between items-end border-t pt-4">
                <div>
                  <p className="text-xs text-gray-400">연식/연료</p>
                  <p className="font-bold text-gray-700">{car.year}년 / {car.fuel}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">취득가액</p>
                  <p className="text-xl font-black text-gray-800">{f(car.purchase_price)}원</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}