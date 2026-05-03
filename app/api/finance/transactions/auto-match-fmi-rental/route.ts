import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/finance/transactions/auto-match-fmi-rental
 *
 * 통장 입금 (보험사) → 대차건 (fmi_rentals) 자동 매칭.
 *
 * mode='insurance' (default): 보험대차
 *   입금자명 패턴: "[보험사약어][고객차량뒷자리]" — 예: "하나5285"
 *   매칭 키: customer_car_number LIKE '%5285' AND insurance_company LIKE '%하나%'
 *
 * mode='general': 일반대차 (Phase 2 — 패턴 보강 필요, 현재 placeholder)
 *
 * 매칭 결과 (다중 — 사용자 5차원 분리 원칙):
 *   1) transactions.related_type='fmi_rental', related_id=대차건.id
 *   2) transaction_assignments INSERT — type='car', id=vehicle_id (FMI 보유 차량)
 *
 * POST body: { mode?: 'insurance'|'general', dryRun?: false, amountTolerance?: 0.05 }
 */

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 보험사 약어 사전 (실제 입금자명에 들어오는 약어)
// insurance_company 컬럼은 정식 명칭이므로 LIKE '%약어%' 로 부분 일치
const INSURER_ABBR: Record<string, string[]> = {
  '하나':   ['하나'],          // 하나손해보험
  'DB':    ['DB', '디비'],     // DB손해보험
  '디비':   ['DB', '디비'],
  '현대':   ['현대해상', '현대'],
  'KB':    ['KB'],             // KB손해보험
  '케이비': ['KB'],
  '삼성':   ['삼성화재', '삼성'],
  '메리츠': ['메리츠'],
  '롯데':   ['롯데'],
  '흥국':   ['흥국'],
  '악사':   ['악사', 'AXA'],
  'AXA':   ['AXA', '악사'],
  '한화':   ['한화'],
  '농협':   ['농협', 'NH'],
  'NH':    ['NH', '농협'],
  '캐롯':   ['캐롯'],
  '공제':   ['공제'],          // 전국렌터카공제조합
  '렌터카': ['공제', '렌터카'],
  'KRMA':  ['KRMA', '공제'],
}

interface ParsedClient {
  abbr: string
  last4: string
  insurerKeywords: string[]
}

/**
 * 입금자명 파싱:
 *   "하나5285"     → { abbr:'하나', last4:'5285' }
 *   "DB1234"       → { abbr:'DB',   last4:'1234' }
 *   "현대 1234"    → { abbr:'현대', last4:'1234' }
 *   "하나손해보험5285" → { abbr:'하나', last4:'5285' } (긴 형태도 prefix 매칭)
 */
function parseClientName(raw: string | null | undefined): ParsedClient | null {
  if (!raw) return null
  const s = String(raw).trim()
  // 4자리 숫자 추출 (마지막 등장)
  const numMatch = s.match(/(\d{3,4})\s*$/) // 3~4자리 (3자리도 일부 차량)
  if (!numMatch) return null
  const last4 = numMatch[1]
  const beforeNum = s.slice(0, numMatch.index!).trim().replace(/[\s\-_]+$/, '')
  if (!beforeNum) return null

  // 약어 사전에서 prefix 매칭 (긴 약어 우선)
  const sortedAbbrs = Object.keys(INSURER_ABBR).sort((a, b) => b.length - a.length)
  for (const abbr of sortedAbbrs) {
    if (beforeNum.startsWith(abbr)) {
      return { abbr, last4, insurerKeywords: INSURER_ABBR[abbr] }
    }
  }
  // prefix 사전에 없으면 — 한글/영문 prefix 추출 시도 (정식 사명 직접 매칭)
  const prefixMatch = beforeNum.match(/^([가-힣A-Za-z]+)/)
  if (prefixMatch) {
    return { abbr: prefixMatch[1], last4, insurerKeywords: [prefixMatch[1]] }
  }
  return null
}

interface MatchResult {
  matched: number
  multi: number
  no_candidate: number
  no_pattern: number
  already_matched: number
  total_candidates: number
  applied: number
  samples: Array<{
    tx_id: string
    client_name: string
    parsed: ParsedClient
    rental_id: string | null
    vehicle_id: string | null
    customer_car_number: string | null
    insurance_company: string | null
    confidence: 'HIGH' | 'MEDIUM' | 'NONE'
  }>
  failed_samples: Array<{
    tx_id: string
    client_name: string
    reason: string
  }>
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const mode: 'insurance' | 'general' = body.mode || 'insurance'
    const dryRun = body.dryRun === true
    const amountTolerance = Math.max(0, Math.min(0.5, Number(body.amountTolerance) || 0.05))

    if (mode === 'general') {
      // Phase 2 — 패턴 보강 필요 (사용자 Q1 답)
      return NextResponse.json({
        mode,
        applied: 0,
        skipped: 0,
        message: '일반대차 매칭은 Phase 2 — 패턴 사례 수집 후 활성화 예정',
      })
    }

    // ── 1) 매칭 후보 — 통장 입금 거래 미매칭 (보험대차 후보) ──
    //   - type='income' (보험금 입금)
    //   - related_type IS NULL (미매칭)
    //   - client_name 또는 description 에 4자리 숫자
    const candidatesRaw = await prisma.$queryRaw<Array<any>>`
      SELECT id, transaction_date, amount, client_name, description, category
        FROM transactions
       WHERE deleted_at IS NULL
         AND type = 'income'
         AND (related_type IS NULL OR related_id IS NULL)
         AND (client_name REGEXP '[0-9]{3,4}' OR description REGEXP '[0-9]{3,4}')
       ORDER BY transaction_date DESC
       LIMIT 5000
    `

    const result: MatchResult = {
      matched: 0,
      multi: 0,
      no_candidate: 0,
      no_pattern: 0,
      already_matched: 0,
      total_candidates: candidatesRaw.length,
      applied: 0,
      samples: [],
      failed_samples: [],
    }

    // ── 2) 각 거래 매칭 시도 ──
    for (const tx of candidatesRaw) {
      const clientRaw = String(tx.client_name || '').trim()
      const descRaw = String(tx.description || '').trim()
      // client_name 우선, 못 잡으면 description
      const parsed = parseClientName(clientRaw) || parseClientName(descRaw)
      if (!parsed) {
        result.no_pattern++
        if (result.failed_samples.length < 10) {
          result.failed_samples.push({
            tx_id: tx.id,
            client_name: clientRaw || descRaw,
            reason: '패턴 미일치 — 약어+4자리숫자 형태 아님',
          })
        }
        continue
      }

      // ── 3) fmi_rentals 검색 ──
      // customer_car_number LIKE '%[last4]'
      // AND insurance_company LIKE '%[keyword]%' (어느 keyword 든 일치)
      const insurerLike = parsed.insurerKeywords.map(k => `'%${k}%'`).join(', ')
      // SQL injection 방지 — 약어는 사전에서 온 값이므로 안전. 그래도 escape
      const safeInsurerKeywords = parsed.insurerKeywords.map(k => k.replace(/[%_'"\\]/g, ''))
      const carNumberLike = `%${parsed.last4.replace(/[%_'"\\]/g, '')}`

      // 매칭 — sql-fn-lint-allow: REGEXP (단순 동일 약어 OR 검색 안전)
      const candidates = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT id, vehicle_id, customer_car_number, insurance_company,
                final_claim_amount, total_rental_fee, dispatch_date, status
           FROM fmi_rentals
          WHERE customer_car_number LIKE ?
            AND (${safeInsurerKeywords.map(() => 'insurance_company LIKE ?').join(' OR ')})
          ORDER BY ABS(DATEDIFF(COALESCE(dispatch_date, NOW()), ?)) ASC
          LIMIT 5`,
        carNumberLike,
        ...safeInsurerKeywords.map(k => `%${k}%`),
        tx.transaction_date,
      )

      if (candidates.length === 0) {
        result.no_candidate++
        if (result.failed_samples.length < 10) {
          result.failed_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            reason: `대차건 없음 — 차량 ${parsed.last4} + 보험 ${parsed.abbr} 조합 매칭 안 됨`,
          })
        }
        continue
      }

      // ── 4) 후보 평가 ──
      let pick: any = null
      let confidence: 'HIGH' | 'MEDIUM' | 'NONE' = 'NONE'
      if (candidates.length === 1) {
        pick = candidates[0]
        confidence = 'HIGH'
      } else {
        // 다수 후보 — 입금금액 ≈ final_claim_amount 비교 (5% 오차)
        const txAmount = Math.abs(Number(tx.amount || 0))
        const closest = candidates
          .map((c) => ({
            row: c,
            amountDiff: c.final_claim_amount
              ? Math.abs(Number(c.final_claim_amount) - txAmount) / Math.max(txAmount, 1)
              : Infinity,
          }))
          .sort((a, b) => a.amountDiff - b.amountDiff)[0]
        if (closest.amountDiff <= amountTolerance) {
          pick = closest.row
          confidence = 'MEDIUM'
        } else {
          result.multi++
          if (result.failed_samples.length < 10) {
            result.failed_samples.push({
              tx_id: tx.id,
              client_name: clientRaw,
              reason: `다수 후보 ${candidates.length}건 — 금액 일치 후보 없음 (입금=${txAmount})`,
            })
          }
          continue
        }
      }

      // ── 5) 매칭 적용 ──
      if (!pick.vehicle_id) {
        result.no_candidate++
        continue
      }

      result.matched++
      if (result.samples.length < 10) {
        result.samples.push({
          tx_id: tx.id,
          client_name: clientRaw,
          parsed,
          rental_id: pick.id,
          vehicle_id: pick.vehicle_id,
          customer_car_number: pick.customer_car_number,
          insurance_company: pick.insurance_company,
          confidence,
        })
      }

      if (dryRun) continue

      try {
        // (a) transactions.related_type='fmi_rental'
        await prisma.$executeRaw`
          UPDATE transactions
             SET related_type = 'fmi_rental', related_id = ${pick.id}, updated_at = NOW()
           WHERE id = ${tx.id}
        `
        // (b) transaction_assignments INSERT — 차량 매칭 추가 (다중)
        // UNIQUE (transaction_id, assignment_type, assignment_id) 위반 방지: ON DUPLICATE 무시
        await prisma.$executeRaw`
          INSERT IGNORE INTO transaction_assignments
            (id, transaction_id, assignment_type, assignment_id, ratio, source, created_at, updated_at)
          VALUES
            (${randomUUID()}, ${tx.id}, 'car', ${pick.vehicle_id}, 100.00, 'auto', NOW(), NOW())
        `
        result.applied++
      } catch (e: any) {
        console.error('[auto-match-fmi-rental] apply failed:', tx.id, e.message)
        if (result.failed_samples.length < 10) {
          result.failed_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            reason: `apply 실패: ${e.message?.slice(0, 80)}`,
          })
        }
      }
    }

    // ── 6) 자가 검증 (CLAUDE.md 규칙 10) ──
    let verifiedCount = 0
    if (!dryRun && result.applied > 0) {
      const verify = await prisma.$queryRaw<Array<any>>`
        SELECT COUNT(*) AS cnt
          FROM transactions
         WHERE related_type = 'fmi_rental'
           AND updated_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      `
      verifiedCount = Number(verify[0]?.cnt || 0)
    }

    return NextResponse.json({
      mode,
      ...result,
      verified_recently: verifiedCount,
      message: dryRun
        ? `dry-run — 매칭 후보 ${result.matched}건`
        : `${result.applied}건 매칭 적용 (검증: ${verifiedCount}건)`,
    })
  } catch (e: any) {
    console.error('[auto-match-fmi-rental POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
