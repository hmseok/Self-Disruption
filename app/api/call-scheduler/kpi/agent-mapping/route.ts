// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/agent-mapping — CX KPI 상담원 매칭 설정
//   콜센터 워커(cs_workers) ↔ 외부 식별자 2종 연결 — 매니저 직접 매핑.
//     · KT 상담사 ID   → cs_workers.kt_id          (생산성·상담이력 매핑)
//     · Cafe24 접수자  → cs_workers.cafe24_user_id (사고·긴급출동 접수 귀속)
//
//   GET  : kt_agents(cs_call_records ∪ cs_agent_productivity distinct ID),
//          cafe24_users(aceesosh ∪ acrotpth 접수자 ∪ picuserm 이름),
//          workers(cs_workers 활성), 매칭 통계
//   POST : body { mappings:[{ worker_id, kt_id, cafe24_user_id }] }
//          → cs_workers.kt_id / cafe24_user_id UPDATE.
//          같은 식별자 중복 배정 차단 (다른 워커가 쓰던 값은 비움)
//
//   호환: MySQL 8.0 / $queryRaw / Cafe24 MariaDB 10.1 read-only / graceful
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

interface KtAgent {
  kt_id: string
  agent_name: string
  call_rows: number
  prod_rows: number
  total_rows: number
  active: boolean
}
interface Cafe24User {
  user_id: string
  name: string
  intake_count: number
}
interface WorkerRow {
  id: string
  name: string
  kt_id: string | null
  cafe24_user_id: string | null
}

// ───────────────────────────── GET ─────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // ── KT 상담사 ID 수집 (cs_call_records ∪ cs_agent_productivity) ──
  let ktAgents: KtAgent[] = []
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        u.agent_kt_id                AS kt_id,
        MAX(u.agent_name)            AS agent_name,
        COALESCE(SUM(u.is_call), 0)  AS call_rows,
        COALESCE(SUM(u.is_prod), 0)  AS prod_rows,
        COUNT(*)                     AS total_rows,
        MAX(u.is_active_flag)        AS active_flag
      FROM (
        SELECT agent_kt_id, agent_name, 1 AS is_call, 0 AS is_prod, 0 AS is_active_flag
        FROM cs_call_records
        WHERE agent_kt_id IS NOT NULL AND agent_kt_id <> ''
        UNION ALL
        SELECT agent_kt_id, agent_name, 0 AS is_call, 1 AS is_prod,
               CASE WHEN is_active = 1 OR login_sec > 0 THEN 1 ELSE 0 END AS is_active_flag
        FROM cs_agent_productivity
        WHERE agent_kt_id IS NOT NULL AND agent_kt_id <> ''
      ) AS u
      GROUP BY u.agent_kt_id
      ORDER BY total_rows DESC, kt_id ASC
    `
    ktAgents = rows.map(r => {
      const totalRows = Number(r.total_rows ?? 0)
      return {
        kt_id: String(r.kt_id || ''),
        agent_name: String(r.agent_name || ''),
        call_rows: Number(r.call_rows ?? 0),
        prod_rows: Number(r.prod_rows ?? 0),
        total_rows: totalRows,
        active: Number(r.active_flag ?? 0) === 1 || totalRows > 0,
      }
    })
  } catch {
    ktAgents = [] // cs_call_records / cs_agent_productivity 미적재 — graceful
  }

  // ── Cafe24 접수자 수집 (aceesosh ∪ acrotpth, 최근 180일) ──────────
  // 사고접수(acrotpth.otptgnus) / 긴급출동접수(aceesosh.esosgnus) 의
  // 등록자 코드별 접수 건수 + picuserm 이름.
  let cafe24Users: Cafe24User[] = []
  let cafe24Ok = false
  try {
    const { cafe24Db } = await import('@/lib/cafe24-db')
    // 최근 180일 — YYYYMMDD
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 180)
    const pad = (n: number) => String(n).padStart(2, '0')
    const cutoffYmd =
      `${cutoff.getFullYear()}${pad(cutoff.getMonth() + 1)}${pad(cutoff.getDate())}`

    // (A) 접수자 코드별 건수
    const gnusRows = await cafe24Db.query(
      `SELECT g.gnus AS user_id, SUM(g.c) AS cnt
         FROM (
           SELECT esosgnus AS gnus, COUNT(*) AS c FROM aceesosh
            WHERE esosmddt >= ? AND esosgnus IS NOT NULL AND esosgnus <> ''
            GROUP BY esosgnus
           UNION ALL
           SELECT otptgnus AS gnus, COUNT(*) AS c FROM acrotpth
            WHERE otptmddt >= ? AND otptgnus IS NOT NULL AND otptgnus <> ''
            GROUP BY otptgnus
         ) g
        GROUP BY g.gnus
        ORDER BY cnt DESC`,
      [cutoffYmd, cutoffYmd],
    )
    const gnusList = gnusRows
      .map(r => String(r.user_id || ''))
      .filter(Boolean)

    // (B) picuserm 이름 — 코드 IN (...)
    const nameByCode = new Map<string, string>()
    if (gnusList.length > 0) {
      const placeholders = gnusList.map(() => '?').join(',')
      const nameRows = await cafe24Db.query(
        `SELECT userpidn, username FROM picuserm WHERE userpidn IN (${placeholders})`,
        gnusList,
      )
      for (const r of nameRows) {
        const code = String(r.userpidn || '')
        if (code && !nameByCode.has(code)) {
          nameByCode.set(code, String(r.username || ''))
        }
      }
    }

    cafe24Users = gnusRows.map(r => {
      const code = String(r.user_id || '')
      return {
        user_id: code,
        name: nameByCode.get(code) || '',
        intake_count: Number(r.cnt || 0),
      }
    }).filter(u => u.user_id)
    cafe24Ok = true
  } catch {
    // Cafe24 미연결 / 환경변수 부재 — graceful 빈 배열
    cafe24Users = []
    cafe24Ok = false
  }

  // ── 콜센터 워커 목록 (활성) ──────────────────────────────────────
  let workers: WorkerRow[] = []
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, kt_id, cafe24_user_id
      FROM cs_workers
      WHERE is_active = 1
      ORDER BY name ASC
    `
    workers = rows.map(r => ({
      id: String(r.id),
      name: String(r.name || ''),
      kt_id: r.kt_id ? String(r.kt_id) : null,
      cafe24_user_id: r.cafe24_user_id ? String(r.cafe24_user_id) : null,
    }))
  } catch {
    workers = [] // cs_workers 미적재 (또는 cafe24_user_id 컬럼 미적용) — graceful
  }

  // ── 매칭 통계 — KT ──
  const usedKtIds = new Set(
    workers.map(w => w.kt_id).filter((v): v is string => !!v),
  )
  const ktIdSet = new Set(ktAgents.map(a => a.kt_id))
  const unmatchedKt = ktAgents.filter(a => !usedKtIds.has(a.kt_id)).map(a => a.kt_id)
  const matchedCount = workers.filter(w => w.kt_id && ktIdSet.has(w.kt_id)).length

  // ── 매칭 통계 — Cafe24 ──
  const usedCafe24 = new Set(
    workers.map(w => w.cafe24_user_id).filter((v): v is string => !!v),
  )
  const cafe24IdSet = new Set(cafe24Users.map(u => u.user_id))
  const unmatchedCafe24 = cafe24Users
    .filter(u => !usedCafe24.has(u.user_id))
    .map(u => u.user_id)
  const cafe24MatchedCount = workers.filter(
    w => w.cafe24_user_id && cafe24IdSet.has(w.cafe24_user_id),
  ).length

  return NextResponse.json({
    data: serialize({
      kt_agents: ktAgents,
      cafe24_users: cafe24Users,
      cafe24_ok: cafe24Ok,
      workers,
      matched_count: matchedCount,
      unmatched_kt: unmatchedKt,
      cafe24_matched_count: cafe24MatchedCount,
      unmatched_cafe24: unmatchedCafe24,
    }),
    error: null,
  })
}

// ───────────────────────────── POST ────────────────────────────
// body { mappings:[{ worker_id, kt_id?, cafe24_user_id? }] }
// 각 항목 — 키가 있으면 그 컬럼을 desired 값으로 갱신(빈문자/null=해제).
//   kt_id / cafe24_user_id 각각 같은 값 중복 배정 차단.
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const input = Array.isArray(body?.mappings) ? body.mappings : []
    if (input.length === 0) {
      return NextResponse.json({ error: '저장할 매칭이 없습니다.' }, { status: 400 })
    }

    // 컬럼별 desired 맵 — worker_id → 값(string) 또는 null(해제)
    const norm = (raw: unknown): string | null =>
      (raw === null || raw === undefined || String(raw).trim() === '')
        ? null : String(raw).trim()

    const ktDesired = new Map<string, string | null>()
    const cafe24Desired = new Map<string, string | null>()
    for (const m of input) {
      const workerId = String(m?.worker_id || '').trim()
      if (!workerId) continue
      if ('kt_id' in (m || {})) ktDesired.set(workerId, norm(m.kt_id))
      if ('cafe24_user_id' in (m || {})) {
        cafe24Desired.set(workerId, norm(m.cafe24_user_id))
      }
    }
    if (ktDesired.size === 0 && cafe24Desired.size === 0) {
      return NextResponse.json({ error: '유효한 매칭이 없습니다.' }, { status: 400 })
    }

    // 입력 안 같은 값 중복 배정 검증
    const checkDup = (desired: Map<string, string | null>, label: string): string | null => {
      const seen = new Map<string, string>()
      for (const [workerId, val] of desired) {
        if (!val) continue
        if (seen.has(val)) {
          return `${label} "${val}" 가 두 명 이상의 워커에 중복 배정되었습니다.`
        }
        seen.set(val, workerId)
      }
      return null
    }
    const ktDup = checkDup(ktDesired, 'KT ID')
    if (ktDup) return NextResponse.json({ error: ktDup }, { status: 400 })
    const cafeDup = checkDup(cafe24Desired, 'Cafe24 사용자')
    if (cafeDup) return NextResponse.json({ error: cafeDup }, { status: 400 })

    let updated = 0
    let cleared = 0
    let released = 0
    const errors: string[] = []

    // ── KT ID 갱신 ──
    for (const [workerId, ktId] of ktDesired) {
      try {
        if (ktId) {
          const rel = await prisma.$executeRaw`
            UPDATE cs_workers SET kt_id = NULL, updated_at = NOW()
            WHERE kt_id = ${ktId} AND id <> ${workerId}
          `
          if (Number(rel) > 0) released += Number(rel)
          const aff = await prisma.$executeRaw`
            UPDATE cs_workers SET kt_id = ${ktId}, updated_at = NOW()
            WHERE id = ${workerId}
          `
          if (Number(aff) > 0) updated++
          else errors.push(`워커 없음: ${workerId}`)
        } else {
          const aff = await prisma.$executeRaw`
            UPDATE cs_workers SET kt_id = NULL, updated_at = NOW()
            WHERE id = ${workerId}
          `
          if (Number(aff) > 0) cleared++
        }
      } catch (e: any) {
        errors.push(`KT ${workerId}: ${e?.message || '저장 실패'}`)
      }
    }

    // ── Cafe24 사용자 갱신 ──
    for (const [workerId, cafeId] of cafe24Desired) {
      try {
        if (cafeId) {
          const rel = await prisma.$executeRaw`
            UPDATE cs_workers SET cafe24_user_id = NULL, updated_at = NOW()
            WHERE cafe24_user_id = ${cafeId} AND id <> ${workerId}
          `
          if (Number(rel) > 0) released += Number(rel)
          const aff = await prisma.$executeRaw`
            UPDATE cs_workers SET cafe24_user_id = ${cafeId}, updated_at = NOW()
            WHERE id = ${workerId}
          `
          if (Number(aff) > 0) updated++
          else errors.push(`워커 없음: ${workerId}`)
        } else {
          const aff = await prisma.$executeRaw`
            UPDATE cs_workers SET cafe24_user_id = NULL, updated_at = NOW()
            WHERE id = ${workerId}
          `
          if (Number(aff) > 0) cleared++
        }
      } catch (e: any) {
        errors.push(`Cafe24 ${workerId}: ${e?.message || '저장 실패'}`)
      }
    }

    return NextResponse.json({
      data: serialize({ updated, cleared, released, errors }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
