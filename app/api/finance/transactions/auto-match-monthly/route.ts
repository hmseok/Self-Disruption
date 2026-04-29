import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
// /api/finance/transactions/auto-match-monthly
//
// 월 정기 거래 자동 매칭 (지입/투자/급여 통합 API)
// type 파라미터로 분기:
//   jiip   → jiip_contracts (admin_fee + payout_day)
//   invest → general_investments (invest_amount × rate / 12 + payment_day)
//   salary → payslips/employee_salaries (gross_salary + payment_day)
//
// POST body: { type: 'jiip'|'invest'|'salary', dryRun?: false, dateTolerance?: 3 }
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type MatchType = 'jiip' | 'invest' | 'salary'

interface MonthlyEntity {
  id: string
  car_id?: string | null
  monthly_amount: number
  payment_day: number
  client_name?: string | null  // investor_name / employee name
  related_type: 'jiip' | 'invest' | 'employee'
}

async function loadEntities(type: MatchType): Promise<MonthlyEntity[]> {
  if (type === 'jiip') {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, car_id, investor_name AS client_name,
             COALESCE(admin_fee, monthly_management_fee, 0) AS monthly_amount,
             payout_day AS payment_day
        FROM jiip_contracts
       WHERE status = 'active' AND COALESCE(admin_fee, monthly_management_fee, 0) > 0
    `)
    return rows.map(r => ({
      id: r.id, car_id: r.car_id, monthly_amount: Number(r.monthly_amount),
      payment_day: Number(r.payment_day) || 1, client_name: r.client_name,
      related_type: 'jiip',
    }))
  }
  if (type === 'invest') {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, car_id, investor_name AS client_name,
             COALESCE(invest_amount, 0) AS invest_amount,
             COALESCE(interest_rate, 0) AS interest_rate,
             payment_day
        FROM general_investments
       WHERE status = 'active' AND invest_amount > 0 AND interest_rate > 0
    `)
    return rows.map(r => ({
      id: r.id, car_id: r.car_id,
      // 월 이자 = 원금 × 연이율 / 12 / 100
      monthly_amount: Math.round(Number(r.invest_amount) * Number(r.interest_rate) / 1200),
      payment_day: Number(r.payment_day) || 1, client_name: r.client_name,
      related_type: 'invest',
    }))
  }
  // salary
  const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT es.id, p.name AS client_name,
             COALESCE(es.base_salary, 0) AS monthly_amount,
             COALESCE(es.payment_day, 25) AS payment_day
        FROM employee_salaries es
        LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = es.employee_id COLLATE utf8mb4_unicode_ci
       WHERE es.is_active = 1 AND es.base_salary > 0
  `)
  return rows.map((r: any) => ({
    id: r.id, monthly_amount: Number(r.monthly_amount),
    payment_day: Number(r.payment_day), client_name: r.client_name,
    related_type: 'employee',
  }))
}

function categoryFilter(type: MatchType): string {
  if (type === 'jiip') return `category IN ('지입 관리비/수수료')`
  if (type === 'invest') return `category IN ('이자/잡이익', '이자비용(대출/투자)', '대표인출/가지급금')`
  return `category IN ('급여(정규직)', '일용직급여', '용역비(3.3%)')`
}

function expenseOrIncome(type: MatchType): "'expense'" | "'income'" | 'NULL' {
  if (type === 'jiip') return "'income'"   // 지입 관리비는 회사 입금
  if (type === 'invest') return "'expense'" // 투자자에게 이자 지급
  return "'expense'"  // 급여 지급
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const type: MatchType = body.type
    if (!['jiip', 'invest', 'salary'].includes(type)) {
      return NextResponse.json({ error: 'type: jiip | invest | salary' }, { status: 400 })
    }
    const dryRun = body.dryRun === true
    const dateTolerance = Math.max(0, Math.min(15, Number(body.dateTolerance) || 3))
    const amountTolerance = Math.max(0, Math.min(50000, Number(body.amountTolerance) || 1000))

    // 후보 거래
    const txDirection = expenseOrIncome(type)
    const candidates = await prisma.$queryRawUnsafe<Array<{
      id: string; transaction_date: any; amount: any;
      client_name: string | null; description: string | null;
      related_type: string | null;
    }>>(`
      SELECT id, transaction_date, amount, client_name, description, related_type
        FROM transactions
       WHERE deleted_at IS NULL
         AND type = ${txDirection}
         AND (related_id IS NULL OR related_type IS NULL OR related_type NOT IN ('jiip', 'invest', 'employee'))
         AND ${categoryFilter(type)}
       ORDER BY transaction_date DESC
       LIMIT 5000
    `)

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true, dry_run: dryRun, type,
        total_candidates: 0, planned: 0, applied: 0,
        skipped_no_match: 0, skipped_ambiguous: 0,
        message: '매칭 대상 없음',
      })
    }

    const entities = await loadEntities(type)

    interface Plan {
      tx_id: string; entity_id: string; car_id: string | null;
      amount: number; related_type: 'jiip' | 'invest' | 'employee';
    }
    const plans: Plan[] = []
    let skipNoMatch = 0
    let skipAmbiguous = 0
    const skipExamples: any[] = []

    for (const tx of candidates) {
      const txAmount = Number(tx.amount || 0)
      const txDate = new Date(tx.transaction_date)
      const txDay = txDate.getDate()
      const txText = `${tx.client_name || ''} ${tx.description || ''}`.toLowerCase()

      const matches = entities.filter(e => {
        if (Math.abs(e.monthly_amount - txAmount) > amountTolerance) return false
        const dayDiff = Math.abs(e.payment_day - txDay)
        if (dayDiff > dateTolerance && dayDiff < 28 - dateTolerance) return false
        return true
      })

      if (matches.length === 0) {
        skipNoMatch++
        if (skipExamples.length < 10) skipExamples.push({ reason: 'no_match', tx_id: tx.id, amount: txAmount })
        continue
      }
      // 이름 키워드 우선
      let best = matches[0]
      let bestScore = 0
      for (const m of matches) {
        let score = 0
        const cn = (m.client_name || '').toLowerCase()
        if (cn && cn.length >= 2 && txText.includes(cn.slice(0, 2))) score += 10
        if (m.monthly_amount === txAmount) score += 5
        if (m.payment_day === txDay) score += 3
        if (score > bestScore) { best = m; bestScore = score }
      }
      const ties = matches.filter(m => {
        let score = 0
        const cn = (m.client_name || '').toLowerCase()
        if (cn && cn.length >= 2 && txText.includes(cn.slice(0, 2))) score += 10
        if (m.monthly_amount === txAmount) score += 5
        if (m.payment_day === txDay) score += 3
        return score === bestScore
      })
      if (ties.length > 1 && bestScore < 10) {
        skipAmbiguous++
        if (skipExamples.length < 10) skipExamples.push({ reason: 'ambiguous', tx_id: tx.id, candidates: ties.length })
        continue
      }
      plans.push({
        tx_id: tx.id, entity_id: best.id, car_id: best.car_id || null,
        amount: txAmount, related_type: best.related_type,
      })
    }

    let applied = 0
    let allocCreated = 0
    if (!dryRun) {
      for (const plan of plans) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE transactions
                SET related_type=?, related_id=?, updated_at=NOW()
              WHERE id=?`,
            plan.related_type, plan.entity_id, plan.tx_id
          )
          applied++
          if (plan.car_id) {
            try {
              await prisma.$executeRawUnsafe(
                `INSERT INTO transaction_vehicle_allocations
                   (id, transaction_id, car_id, amount, source_type, source_ref_id, note)
                 VALUES (?, ?, ?, ?, 'auto', ?, ?)
                 ON DUPLICATE KEY UPDATE amount=VALUES(amount), source_ref_id=VALUES(source_ref_id)`,
                randomUUID(), plan.tx_id, plan.car_id, plan.amount, plan.entity_id,
                `${plan.related_type} 자동 분배 100%`
              )
              allocCreated++
            } catch (e: any) {
              console.warn('[auto-match-monthly] allocation 실패:', e?.message)
            }
          }
        } catch (e: any) {
          console.error('[auto-match-monthly]', plan.tx_id, e?.message)
        }
      }
    }

    return NextResponse.json({
      ok: true, dry_run: dryRun, type,
      total_candidates: candidates.length,
      planned: plans.length,
      applied,
      allocation_created: allocCreated,
      skipped_no_match: skipNoMatch,
      skipped_ambiguous: skipAmbiguous,
      skip_examples: skipExamples,
    })
  } catch (e: any) {
    console.error('[auto-match-monthly]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
