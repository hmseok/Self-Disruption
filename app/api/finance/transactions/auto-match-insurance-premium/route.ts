import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/finance/transactions/auto-match-insurance-premium
 *
 * 통장 보험료 출금 → 차량별 분담금 자동 분배 (PR-UX9, 2026-05-09).
 *
 * 매칭 로직:
 *   1. 통장 출금 (type='expense', imported_from LIKE 'excel_bank%')
 *   2. 보험사 키워드 (DB / 디비 / 메리츠 / 현대 / 삼성 / KB / 한화 등)
 *   3. 출금일 기준 활성 분납계획서 (insurance_payment_plan) 조회
 *   4. 보험사 일치하는 차량 분담금 비율로 transaction_assignments 다중 INSERT
 *      - 비율 기준: 각 차량의 monthly_premium / 합계 monthly_premium * 100
 *      - 또는 amount 가 합계 monthly_premium 과 일치 시 = 정확한 분배
 *
 * POST body: { dryRun?: false }
 */
export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 보험사 키워드 → 정규화된 명칭
const INSURER_KEYWORDS: Record<string, string[]> = {
  'DB': ['DB', '디비', 'DB손해보험'],
  '메리츠': ['메리츠', '메츠', '메리츠화재'],
  '현대': ['현대', '현대해상'],
  '삼성': ['삼성', '삼성화재'],
  'KB': ['KB', 'kb', '국민손해보험', 'KB손해보험'],
  '한화': ['한화', '한화손해보험', '캐롯', '한화캐롯'],
  '롯데': ['롯데', '롯데손해보험'],
  '흥국': ['흥국', '흥국화재'],
  '농협': ['농협', '농협손해보험', 'NH'],
  'AXA': ['AXA', '악사'],
}

// 통장 거래 client_name 에서 보험사 추출
function detectInsurer(clientName: string): string | null {
  const s = String(clientName || '').trim()
  for (const [canonical, keywords] of Object.entries(INSURER_KEYWORDS)) {
    for (const kw of keywords) {
      if (s.includes(kw)) return canonical
    }
  }
  return null
}

interface MatchResult {
  matched: number
  multi_vehicle: number
  no_plan: number
  amount_mismatch: number
  total_candidates: number
  applied: number
  samples: Array<any>
  failed_samples: Array<any>
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const amountTolerance = Math.max(0.01, Math.min(0.5, Number(body.amountTolerance) || 0.1))

    // ── 활성 분납계획서 로드 ──
    let plans: Array<{
      id: string; vehicle_id: string; insurance_company: string;
      monthly_premium: number; period_start: string; period_end: string;
    }> = []
    try {
      const rows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT id, vehicle_id, insurance_company, monthly_premium, period_start, period_end
           FROM insurance_payment_plan
          WHERE status = 'active'`,
      )
      plans = rows.map(r => ({
        id: String(r.id),
        vehicle_id: String(r.vehicle_id),
        insurance_company: String(r.insurance_company || ''),
        monthly_premium: Number(r.monthly_premium || 0),
        period_start: String(r.period_start),
        period_end: String(r.period_end),
      }))
    } catch (e: any) {
      return NextResponse.json({
        error: 'insurance_payment_plan 테이블 미적용 — migrations/2026-05-09_insurance_payment_plan.sql 실행 필요',
      }, { status: 503 })
    }

    if (plans.length === 0) {
      return NextResponse.json({
        applied: 0, total_candidates: 0,
        message: '활성 분납계획서 0건 — /finance/insurance-plan 페이지에서 차량별 분납 등록 필요',
      })
    }

    // ── 매칭 후보 — 통장 출금 + 보험사 ──
    const candidates = await prisma.$queryRaw<Array<any>>`
      SELECT id, transaction_date, amount, client_name, description, category, imported_from
        FROM transactions
       WHERE deleted_at IS NULL
         AND type = 'expense'
         AND (related_type IS NULL OR related_id IS NULL)
         AND (imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank')
         AND client_name IS NOT NULL AND client_name != ''
       ORDER BY transaction_date DESC
       LIMIT 5000
    `

    const result: MatchResult = {
      matched: 0,
      multi_vehicle: 0,
      no_plan: 0,
      amount_mismatch: 0,
      total_candidates: candidates.length,
      applied: 0,
      samples: [],
      failed_samples: [],
    }

    for (const tx of candidates) {
      const clientRaw = String(tx.client_name || '').trim()
      const insurer = detectInsurer(clientRaw)
      if (!insurer) continue // 보험사 X — skip silently

      const txDate = String(tx.transaction_date || '').slice(0, 10)
      const txAmount = Math.abs(Number(tx.amount || 0))

      // 출금일 기준 활성 분납계획서 — 보험사 일치
      const matchingPlans = plans.filter(p =>
        p.insurance_company === insurer
        && p.period_start <= txDate
        && p.period_end >= txDate
      )

      if (matchingPlans.length === 0) {
        result.no_plan++
        if (result.failed_samples.length < 50) {
          result.failed_samples.push({
            tx_id: tx.id, client_name: clientRaw, amount: txAmount,
            reason: `${insurer} 활성 분납계획서 없음 (${txDate})`,
          })
        }
        continue
      }

      // 합계 monthly_premium 과 amount 비교
      const totalMonthly = matchingPlans.reduce((s, p) => s + p.monthly_premium, 0)
      const amountDiff = totalMonthly > 0
        ? Math.abs(txAmount - totalMonthly) / totalMonthly
        : 1

      if (amountDiff > amountTolerance) {
        result.amount_mismatch++
        if (result.failed_samples.length < 50) {
          result.failed_samples.push({
            tx_id: tx.id, client_name: clientRaw, amount: txAmount,
            reason: `금액 mismatch — 출금 ${txAmount} vs 합계 ${totalMonthly} (${insurer} ${matchingPlans.length}대)`,
          })
        }
        continue
      }

      // 매칭 성공 — 차량별 분담금 분배
      result.matched++
      if (matchingPlans.length > 1) result.multi_vehicle++

      if (result.samples.length < 50) {
        result.samples.push({
          tx_id: tx.id, client_name: clientRaw, amount: txAmount,
          insurer, vehicle_count: matchingPlans.length, total_monthly: totalMonthly,
          vehicles: matchingPlans.map(p => ({
            vehicle_id: p.vehicle_id, monthly_premium: p.monthly_premium,
            ratio: Math.round(p.monthly_premium / totalMonthly * 1000) / 10, // %
          })),
        })
      }

      if (dryRun) continue

      try {
        // (a) 1차 매칭 — transactions.related_type='car' (다중 차량 → 첫 차량으로 표기 — legacy)
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET related_type = 'car', related_id = ?, updated_at = NOW() WHERE id = ?`,
          matchingPlans[0].vehicle_id, tx.id,
        )
        // (b) transaction_assignments — 차량별 분담금 비율로 다중 INSERT
        for (const plan of matchingPlans) {
          const ratio = totalMonthly > 0
            ? Math.round((plan.monthly_premium / totalMonthly) * 10000) / 100  // 2 decimal places
            : (100 / matchingPlans.length)
          await prisma.$executeRawUnsafe(
            `INSERT IGNORE INTO transaction_assignments
               (id, transaction_id, assignment_type, assignment_id, ratio, source, note, created_at, updated_at)
             VALUES (?, ?, 'car', ?, ?, 'auto', ?, NOW(), NOW())`,
            randomUUID(), tx.id, plan.vehicle_id, ratio,
            `보험료 분담 (${insurer}, plan ${plan.id.slice(0, 8)})`,
          )
        }
        result.applied++
      } catch (e: any) {
        console.error('[auto-match-insurance-premium] apply failed:', tx.id, e?.message)
        if (result.failed_samples.length < 50) {
          result.failed_samples.push({
            tx_id: tx.id, client_name: clientRaw,
            reason: `apply 실패: ${e?.message?.slice(0, 100)}`,
          })
        }
      }
    }

    return NextResponse.json({
      ...result,
      dry_run: dryRun,
      plans_loaded: plans.length,
      message: dryRun
        ? `dry-run — 매칭 가능 ${result.matched}건 (다중차량 ${result.multi_vehicle} / 계획없음 ${result.no_plan} / 금액불일치 ${result.amount_mismatch})`
        : `${result.applied}건 매칭 적용 — 차량별 보험료 분담금 분배`,
    })
  } catch (e: any) {
    console.error('[auto-match-insurance-premium POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
