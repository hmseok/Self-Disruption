import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { normName as commonNormName, isMetaTransaction, isNonPersonClient } from '@/lib/match-helpers'

/**
 * /api/finance/transactions/auto-match-freelancer
 *
 * 통장 거래 (입금 + 지급 양방향) → 프리랜서 자동 매칭.
 *
 * 매칭 키: client_name = freelancers.name (활성)
 *
 * 양방향:
 *   - 입금 (type='income'): 프리랜서 → FMI (정산금/회수)
 *   - 지급 (type='expense'): FMI → 프리랜서 (용역비/수수료)
 *
 * 매칭 결과:
 *   1) transactions.related_type='freelancer', related_id=freelancer.id
 *   2) transaction_assignments INSERT — 'freelancer'
 *
 * 동명이인 우선순위:
 *   - linked_profile_id 있으면 → 직원 매처가 우선 처리해야 함 (skip)
 *   - 즉 본 매처는 외부 프리랜서 (linked_profile_id NULL) 만 매칭
 *
 * POST body: { dryRun?: false }
 */

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface FreelancerRow {
  id: string
  name: string
  bank_name: string | null
  linked_profile_id: string | null
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

// M-V2: 공통 normName 사용 (은행 prefix 자동 제거 + 회사명 정규화)
const normName = commonNormName

// 비-인명 prefix (보험사 / 카드사 / 페이 / 모바일이체) — skip
const NON_PERSON_PREFIXES = new Set([
  '카드자동집금', '카드사', '뱅킹', '펌뱅킹', '타행', '타행건별', '타행대량',
  '인터넷', '모바일', '모바일이체', '업무폰환불', '업무폰',
  '카카오', '네이버', '토스', '페이코', '페이플',
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

    // ── 0) 마스터 데이터 — 프리랜서 사전 ──
    let freelancers: FreelancerRow[] = []
    try {
      const rows = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT id, name, bank_name, linked_profile_id FROM freelancers
          WHERE is_active = 1 AND name IS NOT NULL AND name != ''`
      )
      freelancers = rows.map(r => ({
        id: String(r.id),
        name: String(r.name),
        bank_name: r.bank_name || null,
        linked_profile_id: r.linked_profile_id ? String(r.linked_profile_id) : null,
      }))
    } catch (e: any) {
      console.warn('[freelancer] freelancers load failed:', e?.message)
    }

    // 정규화된 이름 → FreelancerRow[]
    const nameMap: Record<string, FreelancerRow[]> = {}
    for (const f of freelancers) {
      const k = normName(f.name)
      if (!k) continue
      if (!nameMap[k]) nameMap[k] = []
      nameMap[k].push(f)
    }

    // ── 1) 매칭 후보 — 미매칭 통장 거래만 (PR-UX8: 카드 거래 제외) ──
    // 프리랜서 = 외부 인력 → 통장으로 송금 받음 (용역비/정산금)
    // 카드 사용 거래는 직원 매처가 처리 (카드 사용자 추적)
    const candidates = await prisma.$queryRaw<Array<any>>`
      SELECT id, transaction_date, amount, type, client_name, description, category, imported_from
        FROM transactions
       WHERE deleted_at IS NULL
         AND (related_type IS NULL OR related_id IS NULL)
         AND client_name IS NOT NULL AND client_name != ''
         AND (imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank' OR imported_from = 'codef_bank')
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
      // M-V2.1: NON_PERSON 분리 — 은행 prefix 뒤 한글이면 통과 (「농협임미자」 → 임미자)
      if (isNonPersonClient(clientRaw)) {
        result.no_pattern++
        continue
      }
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
            reason: `프리랜서 사전에 「${clientRaw}」 없음`,
          })
        }
        continue
      }
      // 동명 다수 → multi (자동 매칭 보류)
      if (matches.length > 1) {
        result.multi++
        if (result.multi_samples.length < 100) {
          result.multi_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            candidates: matches.map(m => ({ id: m.id, name: m.name, bank: m.bank_name })),
          })
        }
        continue
      }

      const pick = matches[0]

      // linked_profile_id 있으면 — 본 회사 직원이라 직원 매처가 처리해야 함
      // 외부 프리랜서만 본 매처에서 매칭 (사용자가 명시적으로 link 한 경우 우선)
      // 단 직원 매처가 매칭 못 한 거래라면 (related_type 여전히 null) 본 매처가 보강
      // 즉 link 있어도 매칭은 진행 (UI 안 매칭 우선순위는 차후 정리)

      result.matched++
      if (result.samples.length < 100) {
        result.samples.push({
          tx_id: tx.id,
          tx_type: tx.type,
          client_name: clientRaw,
          matched_id: pick.id,
          name: pick.name,
          bank_name: pick.bank_name,
          linked_profile: pick.linked_profile_id ? '직원 link 있음' : null,
          amount: Number(tx.amount || 0),
        })
      }

      if (dryRun) continue

      try {
        // (a) transactions.related_type='freelancer'
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET related_type = ?, related_id = ?, updated_at = NOW() WHERE id = ?`,
          'freelancer', pick.id, tx.id,
        )
        // (b) transaction_assignments INSERT — freelancer
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO transaction_assignments
             (id, transaction_id, assignment_type, assignment_id, ratio, source, created_at, updated_at)
           VALUES (?, ?, 'freelancer', ?, 100.00, 'auto', NOW(), NOW())`,
          randomUUID(), tx.id, pick.id,
        )
        result.applied++
      } catch (e: any) {
        console.error('[auto-match-freelancer] apply failed:', tx.id, e?.message)
        if (result.failed_samples.length < 100) {
          result.failed_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            reason: `apply 실패: ${e?.message?.slice(0, 80)}`,
          })
        }
      }
    }

    // 사람별 분산 정렬 (라운드 로빈)
    if (result.samples.length > 0) {
      const byName: Record<string, any[]> = {}
      for (const s of result.samples) {
        const k = s.name || s.client_name
        if (!byName[k]) byName[k] = []
        byName[k].push(s)
      }
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
      dry_run: dryRun,
      ...result,
      freelancers_loaded: freelancers.length,
      freelancer_names: freelancers.map(f => `${f.name}${f.linked_profile_id ? '(🟢직원)' : ''}`).sort(),
      message: dryRun
        ? `dry-run — 매칭 가능 ${result.matched}건 (사전 ${freelancers.length}명: ${freelancers.map(f => f.name).slice(0, 10).join(', ')}${freelancers.length > 10 ? '...' : ''})`
        : `${result.applied}건 매칭 적용 (matched=${result.matched}, multi=${result.multi}, no_candidate=${result.no_candidate}, no_pattern=${result.no_pattern})`,
    })
  } catch (e: any) {
    console.error('[auto-match-freelancer POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
