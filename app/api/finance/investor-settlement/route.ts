import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════
// PHASE 4 — 투자자별 정산 요약 API
//
// GET /api/finance/investor-settlement?month=YYYY-MM
//   모든 투자자(지입+일반투자)의 월간 정산 현황
//   차량 손익 기반 정산액 계산 + 실제 정산 여부 확인
// ═══════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

interface SettlementItem {
  contractId: string
  contractType: 'jiip' | 'invest'
  investorName: string
  carId: string | null
  carNumber: string
  carModel: string
  // 계산된 정산
  vehicleRevenue: number
  vehicleExpense: number
  vehicleProfit: number
  // 정산 내역
  settlementAmount: number   // 정산해야 할 금액
  paidAmount: number         // 실제 정산된 금액
  isPaid: boolean
  // 계약 정보
  adminFee?: number
  shareRatio?: number
  investAmount?: number
  interestRate?: number
  monthlyInterest?: number
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
    SELECT id, number, brand, model FROM cars WHERE status != 'deleted'
  `
  const carMap = new Map(cars.map(c => [c.id, c]))

  // 차량별 월간 수입/지출
  const txData = await prisma.$queryRawUnsafe<Array<{
    related_id: string; type: string; amount: number
  }>>(
    `SELECT related_id, type, amount
     FROM transactions
     WHERE related_type = 'car'
       AND transaction_date >= ? AND transaction_date <= ?
       AND deleted_at IS NULL`,
    startDate, endDate
  )

  const carPnl = new Map<string, { revenue: number; expense: number }>()
  for (const tx of txData) {
    if (!carPnl.has(tx.related_id)) carPnl.set(tx.related_id, { revenue: 0, expense: 0 })
    const p = carPnl.get(tx.related_id)!
    const amt = Math.abs(Number(tx.amount) || 0)
    if (tx.type === 'income') p.revenue += amt
    else p.expense += amt
  }

  // 지입 계약
  const jiipContracts = await prisma.$queryRaw<Array<{
    id: string; car_id: string; investor_name: string
    admin_fee: number; share_ratio: number
  }>>`
    SELECT id, car_id, investor_name, admin_fee, share_ratio
    FROM jiip_contracts WHERE status = 'active'
  `

  // 일반 투자
  const investments = await prisma.$queryRaw<Array<{
    id: string; car_id: string; investor_name: string
    invest_amount: number; interest_rate: number
  }>>`
    SELECT id, car_id, investor_name, invest_amount, interest_rate
    FROM general_investments WHERE status = 'active'
  `

  // 실제 정산 거래 (해당 월)
  const paidTxData = await prisma.$queryRawUnsafe<Array<{
    related_type: string; related_id: string; amount: number
  }>>(
    `SELECT related_type, related_id, amount
     FROM transactions
     WHERE related_type IN ('jiip_share', 'invest')
       AND transaction_date >= ? AND transaction_date <= ?
       AND deleted_at IS NULL`,
    startDate, endDate
  )

  const paidMap = new Map<string, number>()
  for (const tx of paidTxData) {
    const key = `${tx.related_type}:${tx.related_id}`
    paidMap.set(key, (paidMap.get(key) || 0) + Math.abs(Number(tx.amount) || 0))
  }

  // 정산 아이템 생성
  const items: SettlementItem[] = []

  // 지입 정산: (차량수입 - 차량비용 - 관리비) × (1 - FMI몫%)
  for (const j of jiipContracts) {
    const car = carMap.get(j.car_id)
    const pnl = carPnl.get(j.car_id) || { revenue: 0, expense: 0 }
    const adminFee = Number(j.admin_fee) || 0
    const shareRatio = Number(j.share_ratio) || 0
    const profit = pnl.revenue - pnl.expense
    const distributable = Math.max(0, profit - adminFee)
    const investorShare = Math.round(distributable * (1 - shareRatio / 100))
    const paid = paidMap.get(`jiip_share:${j.id}`) || 0

    items.push({
      contractId: j.id,
      contractType: 'jiip',
      investorName: j.investor_name || '',
      carId: j.car_id,
      carNumber: car?.number || '',
      carModel: car ? `${car.brand || ''} ${car.model || ''}`.trim() : '',
      vehicleRevenue: pnl.revenue,
      vehicleExpense: pnl.expense,
      vehicleProfit: profit,
      settlementAmount: investorShare,
      paidAmount: paid,
      isPaid: paid >= investorShare && investorShare > 0,
      adminFee,
      shareRatio,
    })
  }

  // 투자 이자 정산: 투자금 × 연이율 / 12
  for (const inv of investments) {
    const car = carMap.get(inv.car_id)
    const pnl = carPnl.get(inv.car_id) || { revenue: 0, expense: 0 }
    const investAmount = Number(inv.invest_amount) || 0
    const rate = Number(inv.interest_rate) || 0
    const monthlyInterest = Math.round(investAmount * rate / 100 / 12)
    const paid = paidMap.get(`invest:${inv.id}`) || 0

    items.push({
      contractId: inv.id,
      contractType: 'invest',
      investorName: inv.investor_name || '',
      carId: inv.car_id,
      carNumber: car?.number || '',
      carModel: car ? `${car.brand || ''} ${car.model || ''}`.trim() : '',
      vehicleRevenue: pnl.revenue,
      vehicleExpense: pnl.expense,
      vehicleProfit: pnl.revenue - pnl.expense,
      settlementAmount: monthlyInterest,
      paidAmount: paid,
      isPaid: paid >= monthlyInterest && monthlyInterest > 0,
      investAmount,
      interestRate: rate,
      monthlyInterest,
    })
  }

  // 요약
  const totalSettlement = items.reduce((s, i) => s + i.settlementAmount, 0)
  const totalPaid = items.reduce((s, i) => s + i.paidAmount, 0)
  const jiipItems = items.filter(i => i.contractType === 'jiip')
  const investItems = items.filter(i => i.contractType === 'invest')

  return NextResponse.json(serialize({
    month,
    summary: {
      totalInvestors: new Set(items.map(i => i.investorName)).size,
      totalContracts: items.length,
      jiipContracts: jiipItems.length,
      investContracts: investItems.length,
      totalSettlement,
      totalPaid,
      totalUnpaid: totalSettlement - totalPaid,
      completionRate: totalSettlement > 0 ? Math.round(totalPaid / totalSettlement * 100) : 100,
    },
    items,
  }))
}
