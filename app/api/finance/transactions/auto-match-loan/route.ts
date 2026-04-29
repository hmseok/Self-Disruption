import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// /api/finance/transactions/auto-match-loan
//
// 미매칭 보험성 거래를 loans 와 매칭하여
//   - transactions.related_type='loan', related_id=loan_id
//   - 차량 보유 대출이면 transaction_vehicle_allocations 에도 100% 분배
//
// 매칭 키:
//   amount = monthly_payment (±1원 또는 ±5% 가변)
//   AND transaction_date day = payment_date (±3일)
//   AND finance_name 키워드 거래에 포함 (선택, 점수)
//
// POST body: { dryRun?: false, dateTolerance?: 3, amountTolerance?: 1 }
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FINANCE_KEYWORDS = [
  '캐피탈', '캐피털', '카드', '리스', '할부',
  '현대캐피탈', 'KB캐피탈', '신한캐피탈', '롯데캐피탈',
  '오케이캐피탈', '메리츠캐피탈', '하나캐피탈',
]

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const dateTolerance = Math.max(0, Math.min(15, Number(body.dateTolerance) || 3))
    const amountTolerance = Math.max(0, Math.min(100000, Number(body.amountTolerance) || 1))

    // ── 1) 미매칭 후보 거래 ──
    //   - related_id NULL 또는 related_type != 'loan'
    //   - 카테고리 또는 설명/거래처에 금융 키워드 포함
    const keywordLikes = FINANCE_KEYWORDS.map(k => `%${k}%`)
    const orClient = keywordLikes.map(() => 'client_name LIKE ?').join(' OR ')
    const orDesc = keywordLikes.map(() => 'description LIKE ?').join(' OR ')

    const candidatesSql = `
      SELECT id, transaction_date, type, amount, client_name, description, category
        FROM transactions
       WHERE deleted_at IS NULL
         AND type = 'expense'
         AND (related_id IS NULL OR related_type IS NULL OR related_type != 'loan')
         AND (
           ${orClient}
           OR ${orDesc}
           OR category IN ('차량할부/리스료', '원금상환', '이자비용(대출/투자)')
         )
       ORDER BY transaction_date DESC
       LIMIT 5000
    `
    const candidates = await prisma.$queryRawUnsafe<Array<{
      id: string; transaction_date: any; type: string; amount: any;
      client_name: string | null; description: string | null; category: string | null;
    }>>(candidatesSql, ...keywordLikes, ...keywordLikes)

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true, dry_run: dryRun,
        total_candidates: 0, planned: 0, applied: 0,
        skipped_no_match: 0, skipped_ambiguous: 0,
        message: '매칭 대상 없음',
      })
    }

    // ── 2) 모든 대출 미리 로드 ──
    const loans = await prisma.$queryRawUnsafe<Array<{
      id: string; car_id: string | null; finance_name: string;
      monthly_payment: any; payment_date: number; start_date: any; end_date: any;
    }>>(`
      SELECT id, car_id, finance_name, monthly_payment, payment_date, start_date, end_date
        FROM loans
       WHERE monthly_payment > 0
    `)

    // ── 3) 매칭 ──
    interface MatchPlan {
      tx_id: string
      loan_id: string
      car_id: string | null
      tx_amount: number
      finance_name: string
    }
    const plans: MatchPlan[] = []
    let skipNoMatch = 0
    let skipAmbiguous = 0
    const skipExamples: any[] = []

    for (const tx of candidates) {
      const txAmount = Number(tx.amount || 0)
      const txDate = new Date(tx.transaction_date)
      const txDay = txDate.getDate()
      const txText = `${tx.client_name || ''} ${tx.description || ''}`.toLowerCase()

      const matches = loans.filter(l => {
        // 금액 매칭 (정확 또는 ±tolerance)
        const monthly = Number(l.monthly_payment || 0)
        if (Math.abs(monthly - txAmount) > amountTolerance) return false
        // 결제일 매칭 (±dateTolerance)
        const dayDiff = Math.abs(Number(l.payment_date) - txDay)
        if (dayDiff > dateTolerance && dayDiff < 28 - dateTolerance) return false  // 월말 wrap
        // 기간 내인지 확인
        if (l.start_date && new Date(l.start_date) > txDate) return false
        if (l.end_date && new Date(l.end_date) < txDate) return false
        return true
      })

      if (matches.length === 0) {
        skipNoMatch++
        if (skipExamples.length < 10) skipExamples.push({
          reason: 'no_match', tx_id: tx.id, amount: txAmount,
          merchant: tx.client_name || tx.description,
        })
        continue
      }

      // 여러 후보 중 finance_name 키워드 일치하는 것 우선
      let best = matches[0]
      let bestScore = 0
      for (const m of matches) {
        let score = 0
        const fname = (m.finance_name || '').toLowerCase()
        if (fname && txText.includes(fname.slice(0, 3))) score += 10
        if (Number(m.monthly_payment) === txAmount) score += 5
        if (Number(m.payment_date) === txDay) score += 3
        if (score > bestScore) { best = m; bestScore = score }
      }

      // 점수 동률 다수면 모호
      const ties = matches.filter(m => {
        let score = 0
        const fname = (m.finance_name || '').toLowerCase()
        if (fname && txText.includes(fname.slice(0, 3))) score += 10
        if (Number(m.monthly_payment) === txAmount) score += 5
        if (Number(m.payment_date) === txDay) score += 3
        return score === bestScore
      })
      if (ties.length > 1 && bestScore < 10) {
        skipAmbiguous++
        if (skipExamples.length < 10) skipExamples.push({
          reason: 'ambiguous', tx_id: tx.id, candidates: ties.length,
        })
        continue
      }

      plans.push({
        tx_id: tx.id, loan_id: best.id, car_id: best.car_id,
        tx_amount: txAmount, finance_name: best.finance_name,
      })
    }

    // ── 4) 적용 ──
    let applied = 0
    let allocCreated = 0
    if (!dryRun) {
      for (const plan of plans) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE transactions
                SET related_type='loan', related_id=?, updated_at=NOW()
              WHERE id=?`,
            plan.loan_id, plan.tx_id
          )
          applied++
          // 차량 분배 (대출이 차량 연결된 경우 100% 그 차량으로)
          if (plan.car_id) {
            try {
              const allocId = (await import('crypto')).randomUUID()
              await prisma.$executeRawUnsafe(
                `INSERT INTO transaction_vehicle_allocations
                   (id, transaction_id, car_id, amount, source_type, source_ref_id, note)
                 VALUES (?, ?, ?, ?, 'auto', ?, '대출 자동 분배 100%')
                 ON DUPLICATE KEY UPDATE amount=VALUES(amount), source_ref_id=VALUES(source_ref_id)`,
                allocId, plan.tx_id, plan.car_id, plan.tx_amount, plan.loan_id
              )
              allocCreated++
            } catch (e: any) {
              console.warn('[auto-match-loan] allocation 실패:', e?.message)
            }
          }
        } catch (e: any) {
          console.error('[auto-match-loan]', plan.tx_id, e?.message)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_candidates: candidates.length,
      planned: plans.length,
      applied,
      allocation_created: allocCreated,
      skipped_no_match: skipNoMatch,
      skipped_ambiguous: skipAmbiguous,
      skip_examples: skipExamples,
    })
  } catch (e: any) {
    console.error('[auto-match-loan]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
