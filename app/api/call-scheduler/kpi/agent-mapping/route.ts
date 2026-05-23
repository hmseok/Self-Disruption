// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/agent-mapping — CX KPI 상담원 매칭 설정
//   KT 엑셀의 상담사 ID(agent_kt_id) ↔ 콜센터 워커(cs_workers) 연결.
//   이름 매칭(동명이인·표기차로 깨짐) 대신 매니저가 직접 매핑 →
//   cs_workers.kt_id 에 영속화 (migration 2026-05-21_cs_workers_kt_id).
//
//   GET  : kt_agents(cs_call_records ∪ cs_agent_productivity distinct ID),
//          workers(cs_workers 활성), matched_count, unmatched_kt
//   POST : body { mappings:[{ worker_id, kt_id }] } → cs_workers.kt_id UPDATE
//          같은 kt_id 중복 배정 차단 (다른 워커가 쓰던 kt_id 는 비움)
//
//   호환: MySQL 8.0 / $queryRaw tagged template / graceful try-catch
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
interface WorkerRow {
  id: string
  name: string
  kt_id: string | null
}

// ───────────────────────────── GET ─────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // ── KT 상담사 ID 수집 (cs_call_records ∪ cs_agent_productivity) ──
  // 두 테이블에서 distinct agent_kt_id 별 행수·대표이름·활성여부 집계.
  // UNION ALL 로 한 번에 묶고 GROUP BY agent_kt_id.
  //   call_rows : cs_call_records 행수
  //   prod_rows : cs_agent_productivity 행수
  //   active    : 생산성 is_active=1 행 존재 OR 전체 행수>0 (활성 ID 추정)
  let ktAgents: KtAgent[] = []
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        u.agent_kt_id                                    AS kt_id,
        MAX(u.agent_name)                                AS agent_name,
        COALESCE(SUM(u.is_call), 0)                      AS call_rows,
        COALESCE(SUM(u.is_prod), 0)                      AS prod_rows,
        COUNT(*)                                         AS total_rows,
        MAX(u.is_active_flag)                            AS active_flag
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
      const callRows = Number(r.call_rows ?? 0)
      const prodRows = Number(r.prod_rows ?? 0)
      const totalRows = Number(r.total_rows ?? 0)
      return {
        kt_id: String(r.kt_id || ''),
        agent_name: String(r.agent_name || ''),
        call_rows: callRows,
        prod_rows: prodRows,
        total_rows: totalRows,
        // 활성 ID 추정: 생산성 is_active 행 존재 또는 데이터 행이 있으면 활성
        active: Number(r.active_flag ?? 0) === 1 || totalRows > 0,
      }
    })
  } catch {
    // cs_call_records / cs_agent_productivity 미적재 — graceful 빈 배열
    ktAgents = []
  }

  // ── 콜센터 워커 목록 (활성) ──────────────────────────────────────
  let workers: WorkerRow[] = []
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, kt_id
      FROM cs_workers
      WHERE is_active = 1
      ORDER BY name ASC
    `
    workers = rows.map(r => ({
      id: String(r.id),
      name: String(r.name || ''),
      kt_id: r.kt_id ? String(r.kt_id) : null,
    }))
  } catch {
    // cs_workers 미적재 — graceful 빈 배열
    workers = []
  }

  // ── 매칭 통계 ────────────────────────────────────────────────────
  // 워커가 현재 잡고 있는 kt_id 집합
  const usedKtIds = new Set(
    workers.map(w => w.kt_id).filter((v): v is string => !!v)
  )
  // unmatched_kt: KT ID 중 어떤 워커에도 안 묶인 것
  const unmatchedKt = ktAgents
    .filter(a => !usedKtIds.has(a.kt_id))
    .map(a => a.kt_id)
  // matched_count: 워커-매칭이 실제 KT ID 와 연결된 수
  const ktIdSet = new Set(ktAgents.map(a => a.kt_id))
  const matchedCount = workers.filter(
    w => w.kt_id && ktIdSet.has(w.kt_id)
  ).length

  return NextResponse.json({
    data: serialize({
      kt_agents: ktAgents,
      workers,
      matched_count: matchedCount,
      unmatched_kt: unmatchedKt,
    }),
    error: null,
  })
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const input = Array.isArray(body?.mappings) ? body.mappings : []
    if (input.length === 0) {
      return NextResponse.json({ error: '저장할 매칭이 없습니다.' }, { status: 400 })
    }

    // 입력 정규화 — worker_id 별 마지막 값 우선 (중복 worker_id 시)
    const desired = new Map<string, string | null>()
    for (const m of input) {
      const workerId = String(m?.worker_id || '').trim()
      if (!workerId) continue
      const raw = m?.kt_id
      const ktId = (raw === null || raw === undefined || String(raw).trim() === '')
        ? null
        : String(raw).trim()
      desired.set(workerId, ktId)
    }
    if (desired.size === 0) {
      return NextResponse.json({ error: '유효한 매칭이 없습니다.' }, { status: 400 })
    }

    // 같은 kt_id 가 입력 안에서 두 워커에 중복 배정됐는지 검증
    const ktSeen = new Map<string, string>()
    for (const [workerId, ktId] of desired) {
      if (!ktId) continue
      if (ktSeen.has(ktId)) {
        return NextResponse.json({
          error: `KT ID "${ktId}" 가 두 명 이상의 워커에 중복 배정되었습니다. 한 KT ID 는 한 워커에만 연결할 수 있습니다.`,
        }, { status: 400 })
      }
      ktSeen.set(ktId, workerId)
    }

    let updated = 0
    let cleared = 0
    let released = 0
    const errors: string[] = []

    for (const [workerId, ktId] of desired) {
      try {
        if (ktId) {
          // 새로 배정하는 kt_id 를 쓰던 다른 워커는 먼저 비움 (중복 차단)
          const releasedRows = await prisma.$executeRaw`
            UPDATE cs_workers
            SET kt_id = NULL, updated_at = NOW()
            WHERE kt_id = ${ktId} AND id <> ${workerId}
          `
          if (Number(releasedRows) > 0) released += Number(releasedRows)

          const affected = await prisma.$executeRaw`
            UPDATE cs_workers
            SET kt_id = ${ktId}, updated_at = NOW()
            WHERE id = ${workerId}
          `
          if (Number(affected) > 0) updated++
          else errors.push(`워커 없음: ${workerId}`)
        } else {
          // kt_id 빈 값 — 매칭 해제
          const affected = await prisma.$executeRaw`
            UPDATE cs_workers
            SET kt_id = NULL, updated_at = NOW()
            WHERE id = ${workerId}
          `
          if (Number(affected) > 0) cleared++
        }
      } catch (e: any) {
        errors.push(`${workerId}: ${e?.message || '저장 실패'}`)
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
