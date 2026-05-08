import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { normName as commonNormName, isMetaTransaction, isNonPersonClient } from '@/lib/match-helpers'

/**
 * /api/finance/transactions/auto-match-employee
 *
 * 통장 거래 (입금 + 지급 양방향) → 직원 자동 매칭.
 *
 * 매칭 키: client_name = profiles.name 또는 ride_employees.name
 *
 * 양방향:
 *   - 입금 (type='income'): 직원 → FMI (정산금/회수)
 *   - 지급 (type='expense'): FMI → 직원 (급여/식대/경비/대여)
 *
 * 매칭 결과:
 *   1) transactions.related_type='employee', related_id=직원.id
 *   2) transaction_assignments INSERT — 'employee' 다중
 *
 * POST body: { dryRun?: false, source?: 'profile'|'ride'|'both' (default 'both') }
 */

export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface EmployeeRow {
  id: string
  source: 'profile' | 'ride'
  name: string
  department: string | null
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

// M-V2: 공통 normName (은행 prefix 자동 제거)
const normName = commonNormName

// 비-인명 prefix (NON_PERSON) — 매칭 시도 자체 skip
// (보험사 / 카드사 / 페이 / 모바일 이체 등은 직원 매칭 영역 X)
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
    const source: 'profile' | 'ride' | 'both' = body.source || 'both'

    // ── 0) 마스터 데이터 — 직원 이름 사전 ──
    // schema.prisma 가 stale 또는 컬럼명 불확실 → raw SQL 사용
    const employees: EmployeeRow[] = []
    if (source === 'profile' || source === 'both') {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, name, department FROM profiles
            WHERE is_active = 1 AND name IS NOT NULL AND name != ''`
        )
        for (const r of rows) {
          employees.push({
            id: String(r.id),
            source: 'profile',
            name: String(r.name),
            department: r.department || null,
          })
        }
      } catch (e: any) {
        console.warn('[employee] profiles load failed:', e?.message)
      }
    }
    if (source === 'ride' || source === 'both') {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, name, department FROM ride_employees
            WHERE is_active = 1 AND name IS NOT NULL AND name != ''`
        )
        for (const r of rows) {
          employees.push({
            id: String(r.id),
            source: 'ride',
            name: String(r.name),
            department: r.department || null,
          })
        }
      } catch (e: any) {
        console.warn('[employee] ride_employees load failed:', e?.message)
      }
    }

    // 정규화된 이름 → EmployeeRow[] (동명 다수 처리)
    const nameMap: Record<string, EmployeeRow[]> = {}
    for (const emp of employees) {
      const k = normName(emp.name)
      if (!k) continue
      if (!nameMap[k]) nameMap[k] = []
      nameMap[k].push(emp)
    }

    // ── 1) 매칭 후보 — 미매칭 통장 거래 (양방향) ──
    const candidates = await prisma.$queryRaw<Array<any>>`
      SELECT id, transaction_date, amount, type, client_name, description, category
        FROM transactions
       WHERE deleted_at IS NULL
         AND (related_type IS NULL OR related_id IS NULL)
         AND client_name IS NOT NULL AND client_name != ''
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
      // M-V2: 메타 거래 (공용/급여/3.3 등) 자동 skip
      if (isMetaTransaction(clientRaw)) {
        result.no_pattern++
        continue
      }
      // M-V2.1: NON_PERSON 분리 — 은행 prefix 뒤 한글이면 통과
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
            reason: `직원 사전에 「${clientRaw}」 없음`,
          })
        }
        continue
      }
      // 동명 다수 → multi (자동 매칭 보류)
      // profile + ride 둘 다 같은 사람이면 (profile_id FK 존재) 한 사람으로 간주 — 우선 profile
      const unique = Array.from(new Map(matches.map(m => [`${m.source}:${m.id}`, m])).values())
      if (unique.length > 1) {
        // profile + ride 동명일 가능성 — 일단 profile 우선
        const profileFirst = unique.filter(m => m.source === 'profile')
        if (profileFirst.length === 1) {
          // profile 1건, ride 다수 — profile 로 매칭 (ride 는 profile 의 직원일 가능성)
        } else {
          result.multi++
          if (result.multi_samples.length < 100) {
            result.multi_samples.push({
              tx_id: tx.id,
              client_name: clientRaw,
              candidates: unique.map(m => ({ source: m.source, id: m.id, name: m.name, department: m.department })),
            })
          }
          continue
        }
      }

      // pick — profile 우선, 없으면 ride 의 첫번째
      const pick = unique.find(m => m.source === 'profile') || unique[0]
      result.matched++
      if (result.samples.length < 100) {
        result.samples.push({
          tx_id: tx.id,
          tx_type: tx.type,
          client_name: clientRaw,
          matched_source: pick.source,
          matched_id: pick.id,
          name: pick.name,
          department: pick.department,
          amount: Number(tx.amount || 0),
        })
      }

      if (dryRun) continue

      try {
        // (a) transactions.related_type='employee'
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET related_type = ?, related_id = ?, updated_at = NOW() WHERE id = ?`,
          'employee', pick.id, tx.id,
        )
        // (b) transaction_assignments INSERT — employee
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO transaction_assignments
             (id, transaction_id, assignment_type, assignment_id, ratio, source, created_at, updated_at)
           VALUES (?, ?, 'employee', ?, 100.00, 'auto', NOW(), NOW())`,
          randomUUID(), tx.id, pick.id,
        )
        result.applied++
      } catch (e: any) {
        console.error('[auto-match-employee] apply failed:', tx.id, e?.message)
        if (result.failed_samples.length < 100) {
          result.failed_samples.push({
            tx_id: tx.id,
            client_name: clientRaw,
            reason: `apply 실패: ${e?.message?.slice(0, 80)}`,
          })
        }
      }
    }

    // 매칭 성공 — 사람별 분산 정렬 (특정 직원 100건 외 다른 사람도 보이도록)
    if (result.samples.length > 0) {
      const byName: Record<string, any[]> = {}
      for (const s of result.samples) {
        const k = s.name || s.client_name
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
      source,
      dry_run: dryRun,
      ...result,
      employees_loaded: employees.length,
      // 사전 명단 (검수용 — 누가 등록되어 있는지 확인)
      employee_names: employees.map(e => `${e.name}(${e.source === 'profile' ? '계정' : '라이드'}${e.department ? '/' + e.department : ''})`).sort(),
      message: dryRun
        ? `dry-run — 매칭 가능 ${result.matched}건 (사전 ${employees.length}명: ${employees.map(e => e.name).slice(0, 10).join(', ')}${employees.length > 10 ? '...' : ''})`
        : `${result.applied}건 매칭 적용 (matched=${result.matched}, multi=${result.multi}, no_candidate=${result.no_candidate}, no_pattern=${result.no_pattern})`,
    })
  } catch (e: any) {
    console.error('[auto-match-employee POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
