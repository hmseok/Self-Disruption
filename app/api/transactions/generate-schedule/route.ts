import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// POST /api/transactions/generate-schedule
// Body: { month: 'YYYY-MM', company_id?: string }
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { month, company_id } = await request.json()
    if (!month) return NextResponse.json({ error: 'month 필요 (YYYY-MM)' }, { status: 400 })

    const companyId = company_id || user.company_id
    const [year, monthNum] = month.split('-').map(Number)
    const lastDay = new Date(year, monthNum, 0).getDate()
    const fromDate = `${month}-01`
    const toDate = `${month}-${String(lastDay).padStart(2, '0')}`

    // 데이터 병렬 로드
    const [investors, jiips, loans, existingTxs] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT * FROM general_investments WHERE status = 'active' AND company_id = ${companyId}`,
      prisma.$queryRaw<any[]>`SELECT * FROM jiip_contracts WHERE status = 'active' AND company_id = ${companyId}`,
      prisma.$queryRaw<any[]>`
        SELECT l.*, c.number as car_number FROM loans l
        LEFT JOIN cars c ON l.car_id = c.id
        WHERE l.company_id = ${companyId}
      `,
      prisma.$queryRaw<any[]>`
        SELECT related_id, category FROM transactions
        WHERE company_id = ${companyId}
          AND transaction_date >= ${fromDate}
          AND transaction_date <= ${toDate}
      `,
    ])

    const existingSet = new Set(existingTxs.map((t: any) => `${t.related_id}-${t.category}`))
    const newTxs: any[] = []
    let skippedCount = 0

    // 1. 투자자 이자
    for (const inv of investors) {
      if (existingSet.has(`${inv.id}-투자이자`)) { skippedCount++; continue }
      newTxs.push({
        transaction_date: `${month}-${String(inv.payment_day || 10).padStart(2, '0')}`,
        type: 'expense', status: 'pending', category: '투자이자',
        client_name: `${inv.investor_name} (이자)`, description: `${month}월 정기 이자`,
        amount: Math.floor((Number(inv.invest_amount) * (Number(inv.interest_rate) / 100)) / 12),
        payment_method: '통장', related_type: 'invest', related_id: String(inv.id),
        company_id: companyId,
      })
    }

    // 2. 지입료
    for (const jiip of jiips) {
      if (existingSet.has(`${jiip.id}-지입정산금`)) { skippedCount++; continue }
      newTxs.push({
        transaction_date: `${month}-${String(jiip.payout_day || 10).padStart(2, '0')}`,
        type: 'expense', status: 'pending', category: '지입정산금',
        client_name: `${jiip.investor_name} (정산)`, description: `${month}월 운송료 정산`,
        amount: 0, payment_method: '통장', related_type: 'jiip', related_id: String(jiip.id),
        company_id: companyId,
      })
    }

    // 3. 대출금
    const startDt = new Date(fromDate)
    const endDt = new Date(toDate)
    for (const loan of loans) {
      const ls = loan.start_date ? new Date(loan.start_date) : null
      const le = loan.end_date ? new Date(loan.end_date) : null
      if ((ls && ls > endDt) || (le && le < startDt)) continue
      if (existingSet.has(`${loan.id}-대출상환`)) { skippedCount++; continue }
      newTxs.push({
        transaction_date: `${month}-${String(loan.payment_date || 25).padStart(2, '0')}`,
        type: 'expense', status: 'pending',
        category: loan.type === '리스' ? '리스료' : '대출원리금',
        client_name: `${loan.finance_name} (${loan.car_number || ''})`,
        description: `${month}월 ${loan.type} 납입`,
        amount: Number(loan.monthly_payment) || 0,
        payment_method: '통장', related_type: 'loan', related_id: String(loan.id),
        company_id: companyId,
      })
    }

    // 일괄 insert
    for (const tx of newTxs) {
      const id = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO transactions (
          id, company_id, transaction_date, type, status, category,
          client_name, description, amount, payment_method,
          related_type, related_id, created_at, updated_at
        ) VALUES (
          ${id}, ${tx.company_id}, ${tx.transaction_date}, ${tx.type}, ${tx.status},
          ${tx.category}, ${tx.client_name}, ${tx.description}, ${tx.amount},
          ${tx.payment_method}, ${tx.related_type}, ${tx.related_id}, NOW(), NOW()
        )
      `
    }

    return NextResponse.json({
      created: newTxs.length,
      skipped: skippedCount,
      message: newTxs.length > 0
        ? `신규 ${newTxs.length}건 생성 완료!`
        : skippedCount > 0 ? '이미 모든 내역이 생성되어 있습니다.' : '생성할 대상이 없습니다.',
    })
  } catch (e: any) {
    console.error('[POST /api/transactions/generate-schedule]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
