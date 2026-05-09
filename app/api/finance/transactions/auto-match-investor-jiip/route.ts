import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { normName as commonNormName, isMetaTransaction, isNonPersonClient } from '@/lib/match-helpers'

/**
 * /api/finance/transactions/auto-match-investor-jiip
 *
 * 통장 거래 (입금 + 지급 양방향) → 투자자 / 지입자 자동 매칭.
 *
 * 매칭 키: client_name = general_investments.investor_name 또는 jiip_contracts.investor_name
 *
 * 양방향:
 *   - 입금 (type='income'): 투자자/지입자 → FMI (정산 입금 / 투자금)
 *   - 지급 (type='expense'): FMI → 투자자/지입자 (이자 / 정산금)
 *
 * 매칭 결과:
 *   1) transactions.related_type='invest' or 'jiip', related_id=계약.id
 *   2) transaction_assignments INSERT — 'invest'/'jiip' (다중)
 *   3) 차량 자동 추가 (계약.car_id 있는 경우) — 'car' 다중 매칭
 *
 * POST body: { dryRun?: false, mode?: 'invest'|'jiip'|'both' (default 'both') }
 */

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface InvestorRow {
  id: string
  type: 'invest' | 'jiip'
  investor_name: string
  car_id: string | null
}

interface MatchResult {
  matched: number
  multi: number
  no_pattern: number
  no_candidate: number
  total_candidates: number
  applied: number
  samples: Array<any>
  failed_samples: Array<any>
  multi_samples: Array<any>
}

// 이름 정규화 — 공백/(주)/주식회사 등 제거 후 비교
// M-V2: 공통 normName (은행 prefix 자동 제거)
const normName = commonNormName

// 비-인명 prefix (NON_PERSON) — 매칭 시도 자체 skip
const NON_PERSON_PREFIXES = new Set([
  '카드자동집금', '카드사', '뱅킹', '펌뱅킹', '타행', '타행건별', '타행대량',
  '인터넷', '모바일', '모바일이체', '업무폰환불', '업무폰',
  '카카오', '네이버', '토스', '페이코', '페이플',
  // 보험사 (auto-match-fmi-rental 처리 영역 — 중복 방지)
  '하나', '디비', 'DB', '현대', '삼성', 'KB', 'kb', '메리츠', '메츠',
  '롯데', '흥국', '악사', 'AXA', '한화', '캐롯', '한화캐롯', '농협',
  '택공', '택시공제', '렌공', '공제', '화물공제', '버스공제', '배달공제',
])

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const mode: 'invest' | 'jiip' | 'both' = body.mode || 'both'

    // ── 0) 마스터 데이터 — 투자자 / 지입자 이름 사전 ──
    // schema.prisma 가 stale (id 가 String 으로 정의됐지만 실제 DB 는 INT) — raw SQL 사용
    const investors: InvestorRow[] = []
    if (mode === 'invest' || mode === 'both') {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, investor_name, car_id FROM general_investments
            WHERE status = 'active' AND investor_name IS NOT NULL AND investor_name != ''`
        )
        for (const r of rows) {
          investors.push({
            id: String(r.id),
            type: 'invest',
            investor_name: String(r.investor_name),
            car_id: r.car_id ? String(r.car_id) : null,
          })
        }
      } catch (e: any) {
        console.warn('[investor-jiip] general_investments load failed:', e?.message)
      }
    }
    if (mode === 'jiip' || mode === 'both') {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, investor_name, car_id FROM jiip_contracts
            WHERE status = 'active' AND investor_name IS NOT NULL AND investor_name != ''`
        )
        for (const r of rows) {
          investors.push({
            id: String(r.id),
            type: 'jiip',
            investor_name: String(r.investor_name),
            car_id: r.car_id ? String(r.car_id) : null,
          })
        }
      } catch (e: any) {
        console.warn('[investor-jiip] jiip_contracts load failed:', e?.message)
      }
    }

    // 정규화된 이름 → InvestorRow[] (동명 다수 처리)
    const nameMap: Record<string, InvestorRow[]> = {}
    for (const inv of investors) {
      const k = normName(inv.investor_name)
      if (!k) continue
      if (!nameMap[k]) nameMap[k] = []
      nameMap[k].push(inv)
    }

    // ── 1) 매칭 후보 — 미매칭 통장 거래만 (PR-UX8: 카드 거래 제외) ──
    // 투자/지입은 통장으로만 거래 (입금/지급) — 카드 사용은 절대 매칭 X
    const candidates = await prisma.$queryRaw<Array<any>>`
      SELECT id, transaction_date, amount, type, client_name, description, category, imported_from
        FROM transactions
       WHERE deleted_at IS NULL
         AND (related_type IS NULL OR related_id IS NULL)
         AND client_name IS NOT NULL AND client_name != ''
         AND (imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank')
       ORDER BY transaction_date DESC
       LIMIT 5000
    `

    const result: MatchResult = {
      matched: 0,
      multi: 0,
      no_pattern: 0,
      no_candidate: 0,
      total_candidates: candidates.length,
      applied: 0,
      samples: [],
      failed_samples: [],
      multi_samples: [],
    }

    for (const tx of candidates) {
      const clientRaw = String(tx.client_name || '').trim()
      // M-V2: 메타 거래 (공용/급여/3.3/당직비/정산 등) 자동 skip
      if (isMetaTransaction(clientRaw)) {
        result.no_pattern++
        continue
      }
      // M-V2.1: NON_PERSON 분리 — 은행 prefix 뒤 한글이면 통과 (「농협박진숙」 → 박진숙)
      if (isNonPersonClient(clientRaw)) {
        result.no_pattern++
        continue
      }
      // 4자리 숫자만 있는 client_name (보험사 매칭 영역) skip
      if (/\d{3,4}/.test(clientRaw)) {
        result.no_pattern++
        continue
      }

      const k = normName(clientRaw)
      if (!k || k.length < 2) {
        result.no_pattern++
        continue
      }
      const matches = nameMap[k]
      if (!matches || matches.length === 0) {
        result.no_candidate++
        if (result.failed_samples.length < 100) {
          result.failed_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            reason: `투자자/지입자 사전에 「${clientRaw}」 없음`,
          })
        }
        continue
      }
      // 동명 다수 → multi (자동 매칭 보류)
      if (matches.length > 1) {
        // 단, 같은 type+id 면 중복 제거
        const unique = Array.from(new Map(matches.map(m => [`${m.type}:${m.id}`, m])).values())
        if (unique.length > 1) {
          result.multi++
          if (result.multi_samples.length < 100) {
            result.multi_samples.push({
              tx_id: tx.id,
              client_name: clientRaw,
              candidates: unique.map(m => ({ type: m.type, id: m.id, car_id: m.car_id })),
            })
          }
          continue
        }
      }

      const pick = matches[0]
      result.matched++
      if (result.samples.length < 100) {
        result.samples.push({
          tx_id: tx.id,
          tx_type: tx.type,
          client_name: clientRaw,
          matched_type: pick.type,
          matched_id: pick.id,
          investor_name: pick.investor_name,
          car_id: pick.car_id,
          amount: Number(tx.amount || 0),
        })
      }

      if (dryRun) continue

      try {
        // (a) transactions.related_type='invest' or 'jiip'
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET related_type = ?, related_id = ?, updated_at = NOW() WHERE id = ?`,
          pick.type, pick.id, tx.id,
        )
        // (b) transaction_assignments INSERT — invest/jiip
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO transaction_assignments
             (id, transaction_id, assignment_type, assignment_id, ratio, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, 100.00, 'auto', NOW(), NOW())`,
          randomUUID(), tx.id, pick.type, pick.id,
        )
        // (c) 차량 자동 매칭 (car_id 있으면)
        if (pick.car_id) {
          await prisma.$executeRawUnsafe(
            `INSERT IGNORE INTO transaction_assignments
               (id, transaction_id, assignment_type, assignment_id, ratio, source, created_at, updated_at)
             VALUES (?, ?, 'car', ?, 100.00, 'auto', NOW(), NOW())`,
            randomUUID(), tx.id, pick.car_id,
          )
        }
        result.applied++
      } catch (e: any) {
        console.error('[auto-match-investor-jiip] apply failed:', tx.id, e?.message)
        if (result.failed_samples.length < 100) {
          result.failed_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            reason: `apply 실패: ${e?.message?.slice(0, 80)}`,
          })
        }
      }
    }

    // 매칭 성공 — 사람별 분산 정렬 (석호민 100건 외 다른 사람도 보이도록)
    if (result.samples.length > 0) {
      const byName: Record<string, any[]> = {}
      for (const s of result.samples) {
        const k = s.investor_name || s.client_name
        if (!byName[k]) byName[k] = []
        byName[k].push(s)
      }
      // 라운드 로빈 — 각 사람 1건씩 순환 추출
      const balanced: any[] = []
      const keys = Object.keys(byName)
      let idx = 0
      while (balanced.length < result.samples.length) {
        const k = keys[idx % keys.length]
        const list = byName[k]
        if (list.length > 0) balanced.push(list.shift())
        if (keys.every(kk => byName[kk].length === 0)) break
        idx++
      }
      result.samples = balanced
    }

    return NextResponse.json({
      mode,
      dry_run: dryRun,
      ...result,
      investors_loaded: investors.length,
      // 사전 명단 (검수용 — 누가 등록되어 있는지 확인)
      investor_names: investors.map(i => `${i.investor_name}(${i.type === 'invest' ? '투자' : '지입'})`).sort(),
      message: dryRun
        ? `dry-run — 매칭 가능 ${result.matched}건 (사전 ${investors.length}명: ${investors.map(i => i.investor_name).slice(0, 10).join(', ')}${investors.length > 10 ? '...' : ''})`
        : `${result.applied}건 매칭 적용 (matched=${result.matched}, multi=${result.multi}, no_candidate=${result.no_candidate}, no_pattern=${result.no_pattern})`,
    })
  } catch (e: any) {
    console.error('[auto-match-investor-jiip POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
