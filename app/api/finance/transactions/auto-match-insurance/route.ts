import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
// /api/finance/transactions/auto-match-insurance
//
// 미매칭 보험성 거래를 insurance_payment_schedule 와 매칭하여
//   - transactions.related_type='insurance', related_id=contract_id
//   - insurance_payment_schedule.status='matched', matched_tx_id
//   - transaction_vehicle_allocations 자동 생성 (insurance allocations 비율로)
//
// 매칭 키:
//   amount (오차 1원 허용)
//   AND due_date BETWEEN tx.transaction_date - 7일 ~ +7일
//   AND insurer 일치 (client_name LIKE insurer% 또는 무조건 매칭)
//
// POST body: { dryRun?: false, dateTolerance?: 7 }
// ═══════════════════════════════════════════════════════════════

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const INSURER_KEYWORDS = [
  '전국렌터카공제조합', '렌터카공제', 'KRMA',
  '삼성화재', 'KB손해보험', 'KB손보', 'DB손해보험', 'DB손보',
  '현대해상', '메리츠', '한화손해', '한화손보', '롯데손해', '흥국화재',
]

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const dateTolerance = Math.max(0, Math.min(30, Number(body.dateTolerance) || 7))

    // ── 1) 미매칭 보험성 거래 후보 ──
    //   - 보험사 키워드 client_name/description 매칭
    //   - 또는 category가 보험 관련
    //   - related_id가 NULL이거나 'insurance'가 아님
    const insurerLikePatterns = INSURER_KEYWORDS.map(k => `%${k}%`)
    const placeholders = insurerLikePatterns.map(() => '?').join(' OR client_name LIKE ').replace(/^/, 'client_name LIKE ')
    const descPlaceholders = insurerLikePatterns.map(() => '?').join(' OR description LIKE ').replace(/^/, 'description LIKE ')

    const candidatesSql = `
      SELECT id, transaction_date, type, amount, client_name, description, category
        FROM transactions
       WHERE deleted_at IS NULL
         AND type = 'expense'
         AND (related_id IS NULL OR related_type IS NULL OR related_type != 'insurance')
         AND (
           ${placeholders}
           OR ${descPlaceholders}
           OR category IN ('차량보험료', '화물공제/적재물보험', '보험료(일반)')
         )
       ORDER BY transaction_date DESC
       LIMIT 5000
    `
    const candidates = await prisma.$queryRawUnsafe<Array<{
      id: string; transaction_date: any; type: string; amount: any;
      client_name: string | null; description: string | null; category: string | null;
    }>>(candidatesSql, ...insurerLikePatterns, ...insurerLikePatterns)

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true, dry_run: dryRun,
        total_candidates: 0, planned: 0, applied: 0,
        skipped_no_schedule: 0, skipped_ambiguous: 0,
        message: '매칭 대상 없음 (미매칭 보험성 거래 없음)',
      })
    }

    // ── 2) 미매칭 schedule 모두 로드 (메모리 인덱싱) ──
    const schedules = await prisma.$queryRawUnsafe<Array<{
      id: string; contract_id: string; installment_no: number;
      due_date: any; amount: any; status: string;
      insurance_company: string;
    }>>(`
      SELECT s.id, s.contract_id, s.installment_no, s.due_date, s.amount, s.status,
             c.insurance_company
        FROM insurance_payment_schedule s
        JOIN insurance_contracts c ON c.id = s.contract_id
       WHERE s.status = 'pending'
       ORDER BY s.due_date ASC
    `)

    // ── 3) contract_id → allocations 미리 로드 ──
    const allocations = await prisma.$queryRawUnsafe<Array<{
      contract_id: string; car_id: string | null; vin: string | null;
      premium_amount: any; ratio: any;
    }>>(`
      SELECT contract_id, car_id, vin, premium_amount, ratio
        FROM insurance_vehicle_allocations
    `)
    const allocByContract = new Map<string, typeof allocations>()
    for (const a of allocations) {
      if (!allocByContract.has(a.contract_id)) allocByContract.set(a.contract_id, [])
      allocByContract.get(a.contract_id)!.push(a)
    }

    // ── 4) 각 후보 거래에 대해 매칭 schedule 찾기 ──
    interface MatchPlan {
      tx_id: string
      contract_id: string
      schedule_id: string
      car_allocations: Array<{ car_id: string; amount: number; source_ref_id: string }>
    }
    const plans: MatchPlan[] = []
    let skipNoSchedule = 0
    let skipAmbiguous = 0
    const skipExamples: any[] = []

    for (const tx of candidates) {
      const txAmount = Number(tx.amount || 0)
      const txDate = new Date(tx.transaction_date)
      const matches = schedules.filter(s => {
        const schAmt = Number(s.amount || 0)
        if (Math.abs(schAmt - txAmount) > 1) return false
        const schDate = new Date(s.due_date)
        const diffDays = Math.abs(schDate.getTime() - txDate.getTime()) / 86400_000
        if (diffDays > dateTolerance) return false
        // insurer 키워드 매칭 (client_name/description 에 보험사명 포함되어 있으면 우선)
        const txText = `${tx.client_name || ''} ${tx.description || ''}`.toLowerCase()
        const insurer = (s.insurance_company || '').toLowerCase()
        // 명확히 다른 보험사가 명시된 경우만 제외, 아니면 통과
        if (insurer && txText && !txText.includes(insurer.slice(0, 3))) {
          // KRMA의 경우 "렌터카공제"로 줄여 표현되기도
          const altKey = insurer.includes('렌터카') ? '렌터카공제' : insurer.slice(0, 3)
          if (!txText.includes(altKey.toLowerCase())) {
            // insurer 미스매치 가능 — 여전히 통과시키되 점수 낮춤 (지금은 통과)
          }
        }
        return true
      })

      if (matches.length === 0) {
        skipNoSchedule++
        if (skipExamples.length < 10) skipExamples.push({
          reason: 'no_schedule', tx_id: tx.id, amount: txAmount,
          date: String(tx.transaction_date).slice(0, 10),
          merchant: tx.client_name || tx.description,
        })
        continue
      }
      if (matches.length > 1) {
        // 여러 schedule 후보 — 가장 가까운 날짜 우선
        matches.sort((a, b) => Math.abs(new Date(a.due_date).getTime() - txDate.getTime()) - Math.abs(new Date(b.due_date).getTime() - txDate.getTime()))
        // 1순위와 2순위 차이가 1일 미만이면 모호 처리 (안전)
        const d1 = Math.abs(new Date(matches[0].due_date).getTime() - txDate.getTime())
        const d2 = Math.abs(new Date(matches[1].due_date).getTime() - txDate.getTime())
        if (Math.abs(d1 - d2) < 86400_000) {
          skipAmbiguous++
          if (skipExamples.length < 10) skipExamples.push({
            reason: 'ambiguous', tx_id: tx.id, amount: txAmount,
            candidates: matches.length,
          })
          continue
        }
      }

      const sch = matches[0]
      const allocs = allocByContract.get(sch.contract_id) || []
      // 차량 분담 — schedule 비율 만큼 배분
      // schedule.amount 가 contract의 일부이므로, 각 차량 ratio 기준으로 schedule.amount × ratio 분배
      const carAllocations = allocs
        .filter(a => a.car_id)
        .map(a => ({
          car_id: a.car_id!,
          amount: Math.round(Number(sch.amount) * Number(a.ratio || 0)),
          source_ref_id: sch.id,
        }))
        .filter(x => x.amount > 0)

      plans.push({
        tx_id: tx.id,
        contract_id: sch.contract_id,
        schedule_id: sch.id,
        car_allocations: carAllocations,
      })
    }

    // ── 5) 적용 ──
    let applied = 0
    let allocationCreated = 0
    if (!dryRun && plans.length > 0) {
      for (const plan of plans) {
        try {
          // (a) transactions UPDATE
          await prisma.$executeRawUnsafe(
            `UPDATE transactions
                SET related_type='insurance', related_id=?, updated_at=NOW()
              WHERE id=?`,
            plan.contract_id, plan.tx_id
          )
          // (b) schedule UPDATE
          await prisma.$executeRawUnsafe(
            `UPDATE insurance_payment_schedule
                SET status='matched', matched_tx_id=?, matched_at=NOW(), updated_at=NOW()
              WHERE id=?`,
            plan.tx_id, plan.schedule_id
          )
          applied++
          // (c) transaction_vehicle_allocations INSERT (단일 차량은 굳이 insert할 필요 없지만 일관성 유지)
          for (const ca of plan.car_allocations) {
            try {
              await prisma.$executeRawUnsafe(
                `INSERT INTO transaction_vehicle_allocations
                   (id, transaction_id, car_id, amount, source_type, source_ref_id, note)
                 VALUES (?, ?, ?, ?, 'insurance', ?, '보험 자동 분배')
                 ON DUPLICATE KEY UPDATE amount=VALUES(amount), source_ref_id=VALUES(source_ref_id)`,
                randomUUID(), plan.tx_id, ca.car_id, ca.amount, ca.source_ref_id
              )
              allocationCreated++
            } catch (e: any) {
              console.warn('[auto-match-insurance] allocation insert 실패:', e?.message)
            }
          }
        } catch (e: any) {
          console.error('[auto-match-insurance] 매칭 실패:', plan.tx_id, e?.message)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_candidates: candidates.length,
      planned: plans.length,
      applied,
      allocation_created: allocationCreated,
      skipped_no_schedule: skipNoSchedule,
      skipped_ambiguous: skipAmbiguous,
      skip_examples: skipExamples,
    })
  } catch (e: any) {
    console.error('[auto-match-insurance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
