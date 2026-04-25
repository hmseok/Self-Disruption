import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// ═══════════════════════════════════════════════════════════
// PHASE 5 — 투자자 리포트 자동 생성 API
//
// POST /api/finance/investor-report
//   월간 투자자별 리포트를 자동 생성 → settlement_shares에 저장
//   → 토큰 기반 공유 링크 생성
//
// GET /api/finance/investor-report?month=YYYY-MM
//   해당 월 생성된 리포트 목록 조회
// ═══════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

function toMySQLDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function generateToken(): string {
  return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, (c) => {
    const replacements: Record<string, string> = { '+': '-', '/': '_', '=': '' }
    return replacements[c] || c
  }).slice(0, 12)
}

// ── POST: 투자자 리포트 일괄 생성 ──
export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { month, investor_names } = body
  // month: 'YYYY-MM', investor_names: string[] (없으면 전체)

  const targetMonth = month || new Date().toISOString().slice(0, 7)
  const [year, monthNum] = targetMonth.split('-').map(Number)
  const lastDay = new Date(year, monthNum, 0).getDate()
  const startDate = `${targetMonth}-01`
  const endDate = `${targetMonth}-${String(lastDay).padStart(2, '0')}`

  // ── 데이터 수집 ──
  const cars = await prisma.$queryRaw<Array<{
    id: string; number: string; brand: string; model: string
  }>>`SELECT id, number, brand, model FROM cars WHERE status != 'deleted'`
  const carMap = new Map(cars.map(c => [c.id, c]))

  // 차량별 거래
  const txData = await prisma.$queryRawUnsafe<Array<{
    related_id: string; type: string; amount: number; category: string | null
    description: string; transaction_date: string; client_name: string
  }>>(
    `SELECT related_id, type, amount, category, description, transaction_date, client_name
     FROM transactions
     WHERE related_type = 'car'
       AND transaction_date >= ? AND transaction_date <= ?
       AND deleted_at IS NULL
     ORDER BY transaction_date ASC`,
    startDate, endDate
  )

  // 차량별 P&L + 거래 목록 정리
  const carPnl = new Map<string, { revenue: number; expense: number; transactions: any[] }>()
  for (const tx of txData) {
    if (!carPnl.has(tx.related_id)) carPnl.set(tx.related_id, { revenue: 0, expense: 0, transactions: [] })
    const p = carPnl.get(tx.related_id)!
    const amt = Math.abs(Number(tx.amount) || 0)
    if (tx.type === 'income') p.revenue += amt
    else p.expense += amt
    p.transactions.push({
      date: String(tx.transaction_date).slice(0, 10),
      description: tx.description || tx.client_name || '',
      amount: amt,
      type: tx.type,
      category: tx.category || '미분류',
    })
  }

  // 지입 계약
  const jiipContracts = await prisma.$queryRaw<Array<{
    id: string; car_id: string; investor_name: string
    admin_fee: number; share_ratio: number
    bank_name: string | null; account_number: string | null; account_holder: string | null
  }>>`
    SELECT id, car_id, investor_name, admin_fee, share_ratio, bank_name, account_number, account_holder
    FROM jiip_contracts WHERE status = 'active'
  `

  // 일반 투자
  const investments = await prisma.$queryRaw<Array<{
    id: string; car_id: string; investor_name: string
    invest_amount: number; interest_rate: number
    bank_name: string | null; account_number: string | null; account_holder: string | null
  }>>`
    SELECT id, car_id, investor_name, invest_amount, interest_rate, bank_name, account_number, account_holder
    FROM general_investments WHERE status = 'active'
  `

  // 실제 정산 거래
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

  // ── 투자자별 리포트 데이터 구성 ──
  type InvestorReport = {
    name: string
    items: any[]
    transactionDetails: Record<string, any[]>
    totalAmount: number
    bankInfo: any
  }

  const reportMap = new Map<string, InvestorReport>()

  // 지입
  for (const j of jiipContracts) {
    if (investor_names && !investor_names.includes(j.investor_name)) continue

    const car = carMap.get(j.car_id)
    const pnl = carPnl.get(j.car_id) || { revenue: 0, expense: 0, transactions: [] }
    const adminFee = Number(j.admin_fee) || 0
    const shareRatio = Number(j.share_ratio) || 0
    const profit = pnl.revenue - pnl.expense
    const distributable = Math.max(0, profit - adminFee)
    const investorShare = Math.round(distributable * (1 - shareRatio / 100))
    const paid = paidMap.get(`jiip_share:${j.id}`) || 0

    const name = j.investor_name || '미지정'
    if (!reportMap.has(name)) {
      reportMap.set(name, { name, items: [], transactionDetails: {}, totalAmount: 0, bankInfo: null })
    }
    const report = reportMap.get(name)!

    report.items.push({
      type: 'jiip',
      monthLabel: `${targetMonth} 지입 정산`,
      amount: investorShare,
      carNumber: car?.number || '',
      carId: j.car_id,
      detail: `수입 ${pnl.revenue.toLocaleString()}원 - 비용 ${pnl.expense.toLocaleString()}원 - 관리비 ${adminFee.toLocaleString()}원 = 배분대상 ${distributable.toLocaleString()}원 × ${100 - shareRatio}%`,
      breakdown: {
        revenue: pnl.revenue,
        expense: pnl.expense,
        adminFee,
        netProfit: profit,
        distributable,
        shareRatio,
        investorPayout: investorShare,
      },
    })

    report.totalAmount += investorShare
    if (pnl.transactions.length > 0) {
      report.transactionDetails[`${j.car_id}_${targetMonth}`] = pnl.transactions
    }
    if (j.bank_name && !report.bankInfo) {
      report.bankInfo = { bank_name: j.bank_name, account_holder: j.account_holder, account_number: j.account_number }
    }
  }

  // 투자
  for (const inv of investments) {
    if (investor_names && !investor_names.includes(inv.investor_name)) continue

    const car = carMap.get(inv.car_id)
    const investAmount = Number(inv.invest_amount) || 0
    const rate = Number(inv.interest_rate) || 0
    const monthlyInterest = Math.round(investAmount * rate / 100 / 12)

    const name = inv.investor_name || '미지정'
    if (!reportMap.has(name)) {
      reportMap.set(name, { name, items: [], transactionDetails: {}, totalAmount: 0, bankInfo: null })
    }
    const report = reportMap.get(name)!

    report.items.push({
      type: 'invest',
      monthLabel: `${targetMonth} 투자 이자`,
      amount: monthlyInterest,
      carNumber: car?.number || '',
      carId: inv.car_id,
      detail: `투자원금 ${investAmount.toLocaleString()}원 × 연 ${rate}% ÷ 12개월`,
    })

    report.totalAmount += monthlyInterest
    if (inv.bank_name && !report.bankInfo) {
      report.bankInfo = { bank_name: inv.bank_name, account_holder: inv.account_holder, account_number: inv.account_number }
    }
  }

  // ── settlement_shares에 저장 + 토큰 생성 ──
  const results: Array<{ investor: string; token: string; url: string; totalAmount: number; itemCount: number }> = []

  for (const [name, report] of reportMap) {
    if (report.items.length === 0) continue

    const token = generateToken()
    const now = toMySQLDatetime(new Date())
    const expiresAt = toMySQLDatetime(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))

    try {
      await prisma.$executeRaw`
        INSERT INTO settlement_shares
        (token, recipient_name, settlement_month, total_amount,
         items, transaction_details, bank_info,
         message, created_at, expires_at, view_count)
        VALUES (
          ${token}, ${name}, ${targetMonth}, ${report.totalAmount},
          ${JSON.stringify(report.items)},
          ${JSON.stringify(report.transactionDetails)},
          ${JSON.stringify(report.bankInfo)},
          ${`${targetMonth} 정산 리포트 (자동 생성)`},
          ${now}, ${expiresAt}, ${0}
        )
      `

      results.push({
        investor: name,
        token,
        url: `/settlement/view/${token}`,
        totalAmount: report.totalAmount,
        itemCount: report.items.length,
      })
    } catch (e) {
      console.error(`[investor-report] ${name} 생성 실패:`, e)
    }
  }

  return NextResponse.json({
    ok: true,
    month: targetMonth,
    generated: results.length,
    reports: results,
  })
}

// ── GET: 생성된 리포트 목록 조회 ──
export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month') || ''

  let rows: any[]
  if (month) {
    rows = await prisma.$queryRaw<any[]>`
      SELECT token, recipient_name, settlement_month, total_amount,
             view_count, created_at, expires_at
      FROM settlement_shares
      WHERE settlement_month = ${month}
        AND message LIKE '%자동 생성%'
      ORDER BY created_at DESC
    `
  } else {
    rows = await prisma.$queryRaw<any[]>`
      SELECT token, recipient_name, settlement_month, total_amount,
             view_count, created_at, expires_at
      FROM settlement_shares
      WHERE message LIKE '%자동 생성%'
      ORDER BY created_at DESC
      LIMIT 100
    `
  }

  return NextResponse.json(serialize({
    reports: rows.map(r => ({
      ...r,
      url: `/settlement/view/${r.token}`,
    })),
  }))
}
