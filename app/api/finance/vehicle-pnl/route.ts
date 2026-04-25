import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════
// PHASE 4 — 차량별 손익(P&L) 통합 집계 API
//
// GET /api/finance/vehicle-pnl?month=YYYY-MM
//   전체 차량의 월간 수입/지출/순이익 + 카테고리별 비용 내역
//   투자자 리포트 (PHASE 5) 데이터 소스
// ═══════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

interface VehiclePnl {
  car_id: string
  car_number: string
  car_model: string
  revenue: number
  expense: number
  operatingProfit: number
  categories: Record<string, number>
  transactionCount: number
}

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7)
  const [year, monthNum] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNum, 0).getDate()
  const startDate = `${month}-01`
  const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

  // 차량 목록
  const cars = await prisma.$queryRaw<Array<{
    id: string; number: string; brand: string; model: string
  }>>`
    SELECT id, number, brand, model FROM cars WHERE status != 'deleted' ORDER BY number
  `

  // 해당 월 전체 차량 거래
  const txData = await prisma.$queryRawUnsafe<Array<{
    related_id: string
    type: string
    amount: number
    category: string | null
  }>>(
    `SELECT related_id, type, amount, category
     FROM transactions
     WHERE related_type = 'car'
       AND transaction_date >= ? AND transaction_date <= ?
       AND deleted_at IS NULL`,
    startDate, endDate
  )

  // 차량별 집계
  const pnlMap = new Map<string, VehiclePnl>()

  for (const car of cars) {
    pnlMap.set(car.id, {
      car_id: car.id,
      car_number: car.number,
      car_model: `${car.brand || ''} ${car.model || ''}`.trim(),
      revenue: 0,
      expense: 0,
      operatingProfit: 0,
      categories: {},
      transactionCount: 0,
    })
  }

  for (const tx of txData) {
    const pnl = pnlMap.get(tx.related_id)
    if (!pnl) continue

    const amount = Math.abs(Number(tx.amount) || 0)
    const cat = tx.category || '미분류'

    if (tx.type === 'income') {
      pnl.revenue += amount
    } else {
      pnl.expense += amount
    }

    pnl.categories[cat] = (pnl.categories[cat] || 0) + amount
    pnl.transactionCount++
  }

  // operatingProfit 계산
  for (const pnl of pnlMap.values()) {
    pnl.operatingProfit = pnl.revenue - pnl.expense
  }

  const vehicles = Array.from(pnlMap.values())
    .filter(v => v.transactionCount > 0 || true) // 거래 없는 차량도 포함
    .sort((a, b) => a.car_number.localeCompare(b.car_number))

  // 전체 합계
  const totalRevenue = vehicles.reduce((s, v) => s + v.revenue, 0)
  const totalExpense = vehicles.reduce((s, v) => s + v.expense, 0)
  const totalProfit = totalRevenue - totalExpense
  const activeVehicles = vehicles.filter(v => v.transactionCount > 0).length

  return NextResponse.json(serialize({
    month,
    summary: {
      totalVehicles: vehicles.length,
      activeVehicles,
      totalRevenue,
      totalExpense,
      totalProfit,
    },
    vehicles,
  }))
}
