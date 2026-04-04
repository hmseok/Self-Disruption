import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/cars/[id]/settlement?month=YYYY-MM
// Returns all data needed for CarSettlementTab in one request
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id: carId } = params
    const { searchParams } = request.nextUrl
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

    const [year, monthNum] = month.split('-').map(Number)
    const lastDay = new Date(year, monthNum, 0).getDate()
    const startDate = `${month}-01`
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`
    const past12Start = `${year - 1}-${String(monthNum).padStart(2, '0')}-01`

    const [txData, queueData, jiipData, investData, loanData, allSettleData, carTxHistData, investTxDepositsData] = await Promise.all([
      // 당월 거래내역
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, transaction_date, type, category, client_name, description, amount, payment_method, related_type, related_id
         FROM transactions
         WHERE related_type = 'car' AND related_id = ?
           AND transaction_date >= ? AND transaction_date <= ?
         ORDER BY transaction_date DESC`,
        String(carId), startDate, endDate
      ),
      // classification_queue
      prisma.$queryRaw<any[]>`
        SELECT id, source_data, final_category, final_matched_type, final_matched_id, status
        FROM classification_queue
        WHERE final_matched_type = 'car' AND final_matched_id = ${String(carId)}
          AND status IN ('confirmed', 'auto_confirmed')
      `,
      // 지입 계약
      prisma.$queryRaw<any[]>`
        SELECT id, investor_name, admin_fee, payout_day, share_ratio, contract_start_date, status
        FROM jiip_contracts
        WHERE car_id = ${carId} AND status = 'active'
      `,
      // 투자 계약
      prisma.$queryRaw<any[]>`
        SELECT id, investor_name, invest_amount, interest_rate, payment_day, contract_start_date, status
        FROM general_investments
        WHERE car_id = ${carId} AND status = 'active'
      `,
      // 대출
      prisma.$queryRaw<any[]>`
        SELECT id, finance_name, type, monthly_payment, payment_date, start_date, end_date
        FROM loans
        WHERE car_id = ${carId}
      `,
      // 전체 정산 거래 (미수 확인용)
      prisma.$queryRawUnsafe<any[]>(
        `SELECT related_type, related_id, transaction_date, amount
         FROM transactions
         WHERE related_type IN ('jiip_share', 'invest', 'loan')
           AND transaction_date >= ?`,
        past12Start
      ),
      // 차량 거래 히스토리 (월별 수입/비용 계산용)
      prisma.$queryRawUnsafe<any[]>(
        `SELECT type, amount, transaction_date, category
         FROM transactions
         WHERE related_type = 'car' AND related_id = ?
           AND transaction_date >= ?`,
        String(carId), past12Start
      ),
      // 투자 관련 통장 거래 내역
      prisma.$queryRaw<any[]>`
        SELECT id, transaction_date, amount, type, related_type, related_id
        FROM transactions
        WHERE related_type = 'invest'
        ORDER BY transaction_date ASC
      `,
    ])

    return NextResponse.json({
      data: serialize({
        transactions: txData,
        classificationQueue: queueData,
        jiipContracts: jiipData,
        investments: investData,
        loans: loanData,
        allSettlements: allSettleData,
        carTxHistory: carTxHistData,
        investTxDeposits: investTxDepositsData,
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/cars/[id]/settlement]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
