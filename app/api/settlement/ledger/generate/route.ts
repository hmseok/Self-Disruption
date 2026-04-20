import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * POST /api/settlement/ledger/generate
 * Body: { month: 'YYYY-MM' (생성 대상 운영월), force?: boolean }
 *
 * 지입: 해당 운영월의 차량 수입/지출 집계 → 배분금 계산 → ledger upsert
 * 투자: 해당 운영월의 원금 × 이율/12 → 이자 계산 → ledger upsert
 *
 * 이미 존재하는 (contract_type, contract_id, settlement_month) 행은
 * force=true가 아니면 건너뜀. status='paid' 인 행은 force여도 건너뜀.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const month: string = body.month
    const force: boolean = !!body.force

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month(YYYY-MM) 필수' }, { status: 400 })
    }

    const monthStart = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const nextMonth = new Date(y, m, 1) // JS month is 0-indexed: y-m-1 = first day of NEXT month
    const monthEndExclusive = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

    const nowIso = new Date()
    const generatedBy = (user as any).email || (user as any).id || 'system'

    const results: any[] = []

    // ────── 1. 지입 계약 ──────
    const jiipList = await prisma.$queryRaw<any[]>`
      SELECT id, car_id, investor_name, share_ratio, admin_fee, tax_type, contract_start_date, contract_end_date, status
        FROM jiip_contracts
       WHERE status='active'
    `

    for (const j of jiipList) {
      // 운영월 시작 ≥ 계약 시작 and ≤ 계약 종료
      const startOk = !j.contract_start_date || j.contract_start_date.toISOString().slice(0, 7) <= month
      const endOk = !j.contract_end_date || j.contract_end_date.toISOString().slice(0, 7) >= month
      if (!startOk || !endOk) continue

      // 차량 수입/지출 집계 (운영월 기준)
      const agg = await prisma.$queryRaw<any[]>`
        SELECT type, SUM(amount) AS total
          FROM transactions
         WHERE related_type='car' AND related_id=${String(j.car_id)}
           AND transaction_date >= ${monthStart}
           AND transaction_date < ${monthEndExclusive}
           AND (deleted_at IS NULL)
         GROUP BY type
      `
      let revenue = 0, expense = 0
      for (const r of agg) {
        if (r.type === 'income') revenue = Number(r.total || 0)
        else if (r.type === 'expense') expense = Number(r.total || 0)
      }

      const adminFee = Number(j.admin_fee || 0)
      const shareRatio = Number(j.share_ratio || 0)
      const taxType = j.tax_type || '사업소득(3.3%)'
      const taxRate = taxType.includes('3.3') ? 0.033 : taxType.includes('27.5') ? 0.275 : 0

      const netProfit = revenue - expense
      const distributable = Math.max(0, netProfit - adminFee)
      const investorShare = Math.floor(distributable * shareRatio / 100)
      const taxAmount = Math.floor(investorShare * taxRate)
      const netPayout = investorShare - taxAmount

      const breakdown = {
        revenue, expense, adminFee, netProfit, distributable,
        shareRatio, investorShare, taxType, taxRate, taxAmount, netPayout,
      }

      // upsert
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id, status FROM settlement_ledger
         WHERE contract_type='jiip' AND contract_id=${String(j.id)} AND settlement_month=${month}
         LIMIT 1
      `
      if (existing[0]) {
        if (existing[0].status === 'paid') {
          results.push({ type: 'jiip', id: j.id, name: j.investor_name, action: 'skip-paid', amount: Number(existing[0].due_amount || 0) })
          continue
        }
        if (!force) {
          results.push({ type: 'jiip', id: j.id, name: j.investor_name, action: 'skip-exists' })
          continue
        }
        await prisma.$executeRaw`
          UPDATE settlement_ledger
             SET due_amount=${netPayout}, breakdown=${JSON.stringify(breakdown)},
                 updated_at=${nowIso}, generated_by=${generatedBy}
           WHERE id=${existing[0].id}
        `
        results.push({ type: 'jiip', id: j.id, name: j.investor_name, action: 'updated', amount: netPayout })
      } else {
        const lid = randomUUID()
        await prisma.$executeRaw`
          INSERT INTO settlement_ledger
            (id, contract_type, contract_id, recipient_name, settlement_month,
             due_amount, paid_amount, status, breakdown, generated_at, generated_by, updated_at)
          VALUES (${lid}, 'jiip', ${String(j.id)}, ${j.investor_name}, ${month},
                  ${netPayout}, 0, 'pending', ${JSON.stringify(breakdown)}, ${nowIso}, ${generatedBy}, ${nowIso})
        `
        results.push({ type: 'jiip', id: j.id, name: j.investor_name, action: 'inserted', amount: netPayout })
      }
    }

    // ────── 3. 대여 계약 (회사 → 외부, 이자 수입) ──────
    const loanOutList = await prisma.$queryRaw<any[]>`
      SELECT id, borrower_name, principal_amount, current_balance, interest_rate, tax_type,
             contract_start_date, contract_end_date, grace_period_months, repayment_type, status
        FROM company_loans_out
       WHERE status='active' OR status IS NULL
    `

    for (const ln of loanOutList) {
      const startOk = !ln.contract_start_date || ln.contract_start_date.toISOString().slice(0, 7) <= month
      const endOk = !ln.contract_end_date || ln.contract_end_date.toISOString().slice(0, 7) >= month
      if (!startOk || !endOk) continue

      // 거치기간 체크
      if (ln.grace_period_months && ln.contract_start_date) {
        const startY = ln.contract_start_date.getFullYear()
        const startM = ln.contract_start_date.getMonth() + 1
        const graceEnd = new Date(startY, startM - 1 + Number(ln.grace_period_months), 1)
        const mDate = new Date(y, m - 1, 1)
        if (mDate < graceEnd) continue
      }

      const principal = Number(ln.current_balance || ln.principal_amount || 0)
      const rate = Number(ln.interest_rate || 0)
      const monthlyInterest = Math.floor(principal * (rate / 100) / 12)
      if (monthlyInterest <= 0) continue

      // 대여는 회사가 받는 이자이므로 세금은 대출자가 원천징수하지 않음 (단순 이자수입)
      // breakdown에 세액 표시만 하고 실제 미수액은 gross 유지
      const taxType = ln.tax_type || '이자소득(27.5%)'
      const taxRate = taxType.includes('3.3') ? 0.033 : taxType.includes('27.5') ? 0.275 : 0
      const taxAmount = Math.floor(monthlyInterest * taxRate)
      const netExpected = monthlyInterest - taxAmount

      const breakdown = {
        direction: 'inbound',  // 회사 기준 수입
        principal, rate, monthlyInterest, taxType, taxRate, taxAmount, netExpected,
        repaymentType: ln.repayment_type,
      }

      const existing = await prisma.$queryRaw<any[]>`
        SELECT id, status FROM settlement_ledger
         WHERE contract_type='loan_out' AND contract_id=${String(ln.id)} AND settlement_month=${month}
         LIMIT 1
      `
      if (existing[0]) {
        if (existing[0].status === 'paid') {
          results.push({ type: 'loan_out', id: ln.id, name: ln.borrower_name, action: 'skip-paid' })
          continue
        }
        if (!force) {
          results.push({ type: 'loan_out', id: ln.id, name: ln.borrower_name, action: 'skip-exists' })
          continue
        }
        await prisma.$executeRaw`
          UPDATE settlement_ledger
             SET due_amount=${netExpected}, breakdown=${JSON.stringify(breakdown)},
                 updated_at=${nowIso}, generated_by=${generatedBy}
           WHERE id=${existing[0].id}
        `
        results.push({ type: 'loan_out', id: ln.id, name: ln.borrower_name, action: 'updated', amount: netExpected })
      } else {
        const lid = randomUUID()
        await prisma.$executeRaw`
          INSERT INTO settlement_ledger
            (id, contract_type, contract_id, recipient_name, settlement_month,
             due_amount, paid_amount, status, breakdown, generated_at, generated_by, updated_at)
          VALUES (${lid}, 'loan_out', ${String(ln.id)}, ${ln.borrower_name}, ${month},
                  ${netExpected}, 0, 'pending', ${JSON.stringify(breakdown)}, ${nowIso}, ${generatedBy}, ${nowIso})
        `
        results.push({ type: 'loan_out', id: ln.id, name: ln.borrower_name, action: 'inserted', amount: netExpected })
      }
    }

    // ────── 2. 투자 계약 ──────
    const investList = await prisma.$queryRaw<any[]>`
      SELECT id, investor_name, invest_amount, current_balance, interest_rate, tax_type,
             contract_start_date, contract_end_date, grace_period_months, status
        FROM general_investments
       WHERE status='active' OR status IS NULL
    `

    for (const inv of investList) {
      const startOk = !inv.contract_start_date || inv.contract_start_date.toISOString().slice(0, 7) <= month
      const endOk = !inv.contract_end_date || inv.contract_end_date.toISOString().slice(0, 7) >= month
      if (!startOk || !endOk) continue

      // 거치기간 체크
      if (inv.grace_period_months && inv.contract_start_date) {
        const startY = inv.contract_start_date.getFullYear()
        const startM = inv.contract_start_date.getMonth() + 1
        const graceEnd = new Date(startY, startM - 1 + Number(inv.grace_period_months), 1)
        const mDate = new Date(y, m - 1, 1)
        if (mDate < graceEnd) continue
      }

      // 단순화: 운영월 말일 잔액 = current_balance (실제로는 일별 추적 필요하지만 MVP)
      const principal = Number(inv.current_balance || inv.invest_amount || 0)
      const rate = Number(inv.interest_rate || 0)
      const monthlyInterest = Math.floor(principal * (rate / 100) / 12)
      if (monthlyInterest <= 0) continue

      const taxType = inv.tax_type || '이자소득(27.5%)'
      const taxRate = taxType.includes('3.3') ? 0.033 : taxType.includes('27.5') ? 0.275 : 0
      const taxAmount = Math.floor(monthlyInterest * taxRate)
      const netPayout = monthlyInterest - taxAmount

      const breakdown = {
        principal, rate, monthlyInterest, taxType, taxRate, taxAmount, netPayout,
      }

      const existing = await prisma.$queryRaw<any[]>`
        SELECT id, status FROM settlement_ledger
         WHERE contract_type='invest' AND contract_id=${String(inv.id)} AND settlement_month=${month}
         LIMIT 1
      `
      if (existing[0]) {
        if (existing[0].status === 'paid') {
          results.push({ type: 'invest', id: inv.id, name: inv.investor_name, action: 'skip-paid' })
          continue
        }
        if (!force) {
          results.push({ type: 'invest', id: inv.id, name: inv.investor_name, action: 'skip-exists' })
          continue
        }
        await prisma.$executeRaw`
          UPDATE settlement_ledger
             SET due_amount=${netPayout}, breakdown=${JSON.stringify(breakdown)},
                 updated_at=${nowIso}, generated_by=${generatedBy}
           WHERE id=${existing[0].id}
        `
        results.push({ type: 'invest', id: inv.id, name: inv.investor_name, action: 'updated', amount: netPayout })
      } else {
        const lid = randomUUID()
        await prisma.$executeRaw`
          INSERT INTO settlement_ledger
            (id, contract_type, contract_id, recipient_name, settlement_month,
             due_amount, paid_amount, status, breakdown, generated_at, generated_by, updated_at)
          VALUES (${lid}, 'invest', ${String(inv.id)}, ${inv.investor_name}, ${month},
                  ${netPayout}, 0, 'pending', ${JSON.stringify(breakdown)}, ${nowIso}, ${generatedBy}, ${nowIso})
        `
        results.push({ type: 'invest', id: inv.id, name: inv.investor_name, action: 'inserted', amount: netPayout })
      }
    }

    const summary = {
      month,
      inserted: results.filter(r => r.action === 'inserted').length,
      updated: results.filter(r => r.action === 'updated').length,
      skipped: results.filter(r => r.action.startsWith('skip')).length,
      total: results.length,
    }

    return NextResponse.json({ data: { summary, results }, error: null })
  } catch (e: any) {
    console.error('[POST /api/settlement/ledger/generate]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
