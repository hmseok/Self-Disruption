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

// 보험사 약어 사전 (입금자명 약어 → fmi_rentals.insurance_company 매핑)
// 사용자 확인 매핑 (2026-05-03):
//   택공 → 택시공제 (개인택시공제 / 법인택시공제 둘 다 매칭)
//   DB손보 / DB / 디비 → 디비
//   인터넷 / 라이드 → 비-보험금 (skip — 일반 송금)
const INSURER_ABBR: Record<string, string[]> = {
  // ── 사용자 확인 매핑 ──
  'DB손보': ['디비'],
  'DB':    ['디비'],
  '디비':   ['디비'],
  '택공':   ['택시공제', '개인택시공제', '법인택시공제'],
  // ── 일반 보험사 (DB 학습 사전과 자동 매칭 됨) ──
  '하나':   ['하나'],
  '현대':   ['현대'],
  '삼성':   ['삼성'],
  'KB':    ['kb', 'KB'],
  'kb':    ['kb'],
  '케이비': ['kb'],
  '메리츠': ['메리츠'],
  '메츠':   ['메리츠'],          // 메리츠화재 줄임말
  '롯데':   ['롯데'],
  '흥국':   ['흥국'],
  '악사':   ['악사', 'AXA'],
  'AXA':   ['악사', 'AXA'],
  '한화':   ['한화'],
  '농협':   ['농협', 'NH'],
  'NH':    ['NH', '농협'],
  '캐롯':   ['캐롯'],
  '한화캐롯': ['한화', '캐롯'],
  // ── 공제 ──
  '렌공':   ['렌공'],
  '공제':   ['공제'],
  '화물공제': ['화물공제'],
  '버스공제': ['버스공제'],
  '배달공제': ['배달공제'],
  // ── 기타 ──
  'KRMA':  ['KRMA', '공제'],
  '루이':   ['루이'],
  '미청구': ['미청구'],
}

// 비-보험금 입금 — 매칭 시도 자체 skip (오탐 방지)
const NON_INSURER_PREFIXES = new Set([
  '인터넷', '라이드', '라이드주식회사', '카드자동집금', '페이플',
  '카드사', '뱅킹', '펌뱅킹', '타행', '타행건별', '타행대량',
  '정산', '월정', '월급', '급여', '인세', '세금', '국세', '지방세',
  '카카오', '네이버', '토스', '페이코',
  // 사용자 보고 (2026-05-04): 모바일 이체 / 업무폰 환불 — 보험금 X
  '모바일', '모바일이체', '업무폰환불', '업무폰',
  // 박진숙 등 개인명 — 투자자 목록에서 별도 매칭 (auto-match-monthly invest 모드)
  // 단, 「박진숙」 자체는 첫 한글 prefix 가 'X자리숫자' 형태 아니어서 패턴 미일치로 자동 skip
])

interface ParsedClient {
  abbr: string
  last4: string
  insurerKeywords: string[]
}

/**
 * 입금자명 파싱 (동적 사전 + 하드코딩 사전 + prefix 추출 3중):
 *   "하나5285"             → { abbr:'하나', last4:'5285' }
 *   "DB1234"               → { abbr:'DB',   last4:'1234' }
 *   "현대 1234"            → { abbr:'현대', last4:'1234' }
 *   "하나손해보험5285"      → { abbr:'하나', last4:'5285' } (긴 형태)
 *   "삼성3513 펌뱅킹 [...]" → { abbr:'삼성', last4:'3513' } (부가정보 무시)
 *   "택공54허3916"         → { abbr:'택공', last4:'3916' } (차량번호 풀 형태도 뒤 4자리)
 */
function parseClientName(raw: string | null | undefined, dynamicAbbrs: string[]): ParsedClient | null {
  if (!raw) return null
  const s = String(raw).trim()

  // 비-보험금 prefix 차단 (인터넷/라이드/카드자동집금/페이플 등)
  for (const skip of NON_INSURER_PREFIXES) {
    if (s.startsWith(skip)) return null
  }

  // 약어 사전 — 사용자 확정 + 동적 (긴 약어 우선)
  const dictAbbrs = Array.from(new Set([...dynamicAbbrs, ...Object.keys(INSURER_ABBR)]))
    .sort((a, b) => b.length - a.length) // 「DB손보」 「하나손해보험」 처럼 긴 약어 우선

  for (const abbr of dictAbbrs) {
    // abbr 직후 (공백 0~2개) 3~4자리 숫자
    const reg = new RegExp('^' + abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(\\d{3,4})')
    const m = s.match(reg)
    if (m) {
      // INSURER_ABBR 사전에 있으면 keywords 사용, 없으면 abbr 자체 (동적 사전은 DB 약어와 일치)
      const keywords = INSURER_ABBR[abbr] || [abbr]
      // skip 사전에 명시된 abbr 은 매칭 시도 안 함
      if (NON_INSURER_PREFIXES.has(abbr)) return null
      return { abbr, last4: m[1], insurerKeywords: keywords }
    }
  }

  // fallback: 마지막 4자리 숫자 + 그 앞 prefix 추출
  const numMatch = s.match(/(\d{3,4})\s*(?:[\s\[\]].*)?$/)
  if (!numMatch) return null
  const last4 = numMatch[1]
  const beforeNum = s.slice(0, numMatch.index!).trim().replace(/[\s\-_]+$/, '')
  if (!beforeNum) return null

  // 한글/영문 prefix 추출
  const prefixMatch = beforeNum.match(/^([가-힣A-Za-z]+)/)
  if (prefixMatch) {
    const abbr = prefixMatch[1]
    if (NON_INSURER_PREFIXES.has(abbr)) return null
    const keywords = INSURER_ABBR[abbr] || [abbr]
    return { abbr, last4, insurerKeywords: keywords }
  }
  return null
}

interface MatchResult {
  matched: number      // HIGH/MEDIUM 자동 매칭
  low_confidence: number // LOW (보험사 mismatch — 자동 매칭 안 함, 검수용)
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
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  }>
  failed_samples: Array<{
    tx_id: string
    client_name: string
    reason: string
  }>
  low_confidence_samples: Array<{
    tx_id: string
    client_name: string
    parsed_insurer: string
    actual_insurer: string
    customer_car_number: string
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

    // ── 0) 동적 약어 사전 — fmi_rentals.insurance_company DISTINCT ──
    //    실제 DB 에 저장된 보험사명을 약어 사전에 추가 (하드코딩 사전 보강)
    let dynamicAbbrs: string[] = []
    try {
      const insurerRows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT DISTINCT insurance_company AS insurer
           FROM fmi_rentals
          WHERE insurance_company IS NOT NULL AND insurance_company != ''`
      )
      dynamicAbbrs = insurerRows
        .map(r => String(r.insurer).trim())
        .filter(s => s.length > 0 && s.length <= 16)
    } catch (e: any) {
      console.warn('[auto-match-fmi-rental] dynamic abbrs fetch failed:', e?.message)
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
      low_confidence: 0,
      multi: 0,
      no_candidate: 0,
      no_pattern: 0,
      already_matched: 0,
      total_candidates: candidatesRaw.length,
      applied: 0,
      samples: [],
      failed_samples: [],
      low_confidence_samples: [],
    }

    // ── 2) 각 거래 매칭 시도 ──
    for (const tx of candidatesRaw) {
      const clientRaw = String(tx.client_name || '').trim()
      const descRaw = String(tx.description || '').trim()
      // client_name 우선, 못 잡으면 description
      const parsed = parseClientName(clientRaw, dynamicAbbrs) || parseClientName(descRaw, dynamicAbbrs)
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

      // ── 3) fmi_rentals 검색 — 차량 우선 + 보험사 점수 ──
      // 1단계: customer_car_number LIKE '%[last4]' 모든 차량 후보 검색
      // 2단계: insurance_company 일치도 점수 — 일치 1, 불일치 0
      // → 보험사 mismatch 케이스도 후보로 보존 (사용자 검수 가능)
      const safeInsurerKeywords = parsed.insurerKeywords.map(k => k.replace(/[%_'"\\]/g, ''))
      const carNumberLike = `%${parsed.last4.replace(/[%_'"\\]/g, '')}`
      const insurerCaseClauses = safeInsurerKeywords.map(() => 'insurance_company LIKE ?').join(' OR ')

      // customer_car_number (사고 차량) OR vehicle_car_number (FMI 보유 차량) 양쪽 검색
      // 입금자명의 last4 가 어느 쪽이든 매칭되도록 확장
      const candidates = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT id, vehicle_id, customer_car_number, vehicle_car_number, insurance_company,
                final_claim_amount, total_rental_fee, dispatch_date, status,
                CASE WHEN ${insurerCaseClauses} THEN 1 ELSE 0 END AS insurer_match
           FROM fmi_rentals
          WHERE (customer_car_number LIKE ? OR vehicle_car_number LIKE ?)
          ORDER BY insurer_match DESC,
                   ABS(DATEDIFF(COALESCE(dispatch_date, NOW()), ?)) ASC
          LIMIT 10`,
        ...safeInsurerKeywords.map(k => `%${k}%`),
        carNumberLike,
        carNumberLike,
        tx.transaction_date,
      )

      if (candidates.length === 0) {
        result.no_candidate++
        if (result.failed_samples.length < 10) {
          result.failed_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            reason: `대차건 없음 — 차량 ${parsed.last4} 자체가 fmi_rentals 에 없음`,
          })
        }
        continue
      }

      // ── 4) 후보 평가 ──
      // 보험사 일치 후보 (insurer_match=1) 우선
      const insurerMatched = candidates.filter((c: any) => Number(c.insurer_match) === 1)
      const insurerOnly = candidates.filter((c: any) => Number(c.insurer_match) === 0)

      let pick: any = null
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'NONE'

      if (insurerMatched.length === 1) {
        pick = insurerMatched[0]
        confidence = 'HIGH'
      } else if (insurerMatched.length > 1) {
        // 보험사 일치 다수 — 금액 비교
        const txAmount = Math.abs(Number(tx.amount || 0))
        const closest = insurerMatched
          .map((c: any) => ({
            row: c,
            amountDiff: c.final_claim_amount
              ? Math.abs(Number(c.final_claim_amount) - txAmount) / Math.max(txAmount, 1)
              : Infinity,
          }))
          .sort((a: any, b: any) => a.amountDiff - b.amountDiff)[0]
        if (closest.amountDiff <= amountTolerance) {
          pick = closest.row
          confidence = 'MEDIUM'
        } else {
          result.multi++
          if (result.failed_samples.length < 10) {
            result.failed_samples.push({
              tx_id: tx.id,
              client_name: clientRaw,
              reason: `다수 후보 ${insurerMatched.length}건 (보험사 일치) — 금액 mismatch (입금=${txAmount})`,
            })
          }
          continue
        }
      } else if (insurerOnly.length > 0) {
        // 보험사 mismatch 케이스 — LOW confidence (자동 매칭 안 함, 사용자 검수용)
        result.low_confidence++
        const sample = insurerOnly[0]
        if (result.low_confidence_samples.length < 10) {
          result.low_confidence_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            parsed_insurer: parsed.abbr,
            actual_insurer: String(sample.insurance_company || '-'),
            customer_car_number: String(sample.customer_car_number || '-'),
          })
        }
        confidence = 'LOW'
        // ★ LOW 는 적용 안 함 — 사용자가 dry-run 결과 보고 결정
        continue
      }

      // ── 5) 매칭 적용 ──
      // 1차 (fmi_rental) 매칭은 항상 진행 — 사고 대차건 자체는 매칭됨
      // 2차 (우리 차량 cars lookup) 실패해도 1차는 그대로 — 「미지급」 으로 별도 카운트
      // cars 실제 컬럼명: 'number' (schema.prisma 의 car_number 는 stale)
      let vehicleId: string | null = pick.vehicle_id ? String(pick.vehicle_id).trim() : null
      let vehicleLookupFailed = false
      if (!vehicleId && pick.vehicle_car_number) {
        const rawCarNum = String(pick.vehicle_car_number).trim()
        const normalized = rawCarNum.replace(/\s+/g, '')
        const last4 = rawCarNum.match(/\d{3,4}$/)?.[0] || ''
        try {
          // 1) 정확 일치 — cars.number 컬럼 (raw SQL — schema.prisma stale)
          let carRows = await prisma.$queryRawUnsafe<Array<any>>(
            `SELECT id FROM cars WHERE number = ? LIMIT 1`, // sql-lint-allow: number — cars 실제 컬럼 (schema 와 다름)
            rawCarNum,
          )
          // 2) 공백 제거 후 비교
          if (!carRows[0] && normalized !== rawCarNum) {
            carRows = await prisma.$queryRawUnsafe<Array<any>>(
              `SELECT id FROM cars WHERE REPLACE(number, ' ', '') = ? LIMIT 1`, // sql-lint-allow: number
              normalized,
            )
          }
          // 3) last4 매칭 — 1대일 때만
          if (!carRows[0] && last4) {
            const last4Rows = await prisma.$queryRawUnsafe<Array<any>>(
              `SELECT id FROM cars WHERE number LIKE ? LIMIT 2`, // sql-lint-allow: number
              `%${last4}`,
            )
            if (last4Rows.length === 1) carRows = last4Rows
          }
          if (carRows[0]?.id) vehicleId = String(carRows[0].id)
        } catch (e: any) {
          console.warn('[fmi-rental] cars lookup error:', e?.message)
        }
        if (!vehicleId) vehicleLookupFailed = true
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
        // (a) 1차 매칭 — transactions.related_type='fmi_rental' (사고 대차건)
        await prisma.$executeRaw`
          UPDATE transactions
             SET related_type = 'fmi_rental', related_id = ${pick.id}, updated_at = NOW()
           WHERE id = ${tx.id}
        `
        // (b) 2차 매칭 — transaction_assignments INSERT 차량 (FMI 보유 차량)
        await prisma.$executeRaw`
          INSERT IGNORE INTO transaction_assignments
            (id, transaction_id, assignment_type, assignment_id, ratio, source, created_at, updated_at)
          VALUES
            (${randomUUID()}, ${tx.id}, 'car', ${pick.vehicle_id}, 100.00, 'auto', NOW(), NOW())
        `
        // (c) 3차 매칭 — 그 차량의 지입/투자 계약 자동 추가 (있는 경우)
        try {
          const jiip = await prisma.jiipContract.findFirst({
            where: { car_id: String(pick.vehicle_id), status: 'active' },
            select: { id: true },
          })
          if (jiip?.id) {
            await prisma.$executeRaw`
              INSERT IGNORE INTO transaction_assignments
                (id, transaction_id, assignment_type, assignment_id, ratio, source, created_at, updated_at)
              VALUES
                (${randomUUID()}, ${tx.id}, 'jiip', ${jiip.id}, 100.00, 'auto', NOW(), NOW())
            `
          }
        } catch {}
        try {
          const invest = await prisma.generalInvestment.findFirst({
            where: { car_id: String(pick.vehicle_id), status: 'active' },
            select: { id: true },
          })
          if (invest?.id) {
            await prisma.$executeRaw`
              INSERT IGNORE INTO transaction_assignments
                (id, transaction_id, assignment_type, assignment_id, ratio, source, created_at, updated_at)
              VALUES
                (${randomUUID()}, ${tx.id}, 'invest', ${invest.id}, 100.00, 'auto', NOW(), NOW())
            `
          }
        } catch {}
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
      dry_run: dryRun,
      verified_recently: verifiedCount,
      dynamic_abbrs_count: dynamicAbbrs.length,
      dynamic_abbrs_sample: dynamicAbbrs.slice(0, 20),
      message: dryRun
        ? `dry-run — 매칭 가능 ${result.matched}건 (적용 안 함)`
        : `${result.applied}건 매칭 적용 (검증: ${verifiedCount}건)`,
    })
  } catch (e: any) {
    console.error('[auto-match-fmi-rental POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
