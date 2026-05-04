// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/leave-quotas?year=2026&worker_id=...
//   발급 + 사용 합산 + 잔여 자동 계산
// POST /api/call-scheduler/leave-quotas
//   { worker_id, year, month?, leave_type, granted_days, carried_over_days?, memo? }
// PUT  /api/call-scheduler/leave-quotas/bulk
//   { year, month?, leave_type, granted_days, worker_ids[] }
//   여러 워커에 일괄 발급 (upsert by uq key)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const TYPES = ['annual', 'familyday', 'sick', 'unpaid', 'family', 'other'] as const

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const sp = request.nextUrl.searchParams
    const year = Number(sp.get('year') || new Date().getFullYear())
    const workerId = sp.get('worker_id')

    // 1) 발급 정보
    let quotas: any[]
    if (workerId) {
      quotas = await prisma.$queryRaw<any[]>`
        SELECT id, worker_id, year, month, leave_type,
               CAST(granted_days AS DECIMAL(4,1))      AS granted_days,
               CAST(carried_over_days AS DECIMAL(4,1)) AS carried_over_days,
               memo, created_at, updated_at
        FROM cs_leave_quotas
        WHERE worker_id = ${workerId} AND year = ${year}
        ORDER BY leave_type ASC, COALESCE(month, 0) ASC
      `
    } else {
      quotas = await prisma.$queryRaw<any[]>`
        SELECT id, worker_id, year, month, leave_type,
               CAST(granted_days AS DECIMAL(4,1))      AS granted_days,
               CAST(carried_over_days AS DECIMAL(4,1)) AS carried_over_days,
               memo, created_at, updated_at
        FROM cs_leave_quotas
        WHERE year = ${year}
        ORDER BY worker_id, leave_type ASC, COALESCE(month, 0) ASC
      `
    }

    // 2) 사용 합산 (cs_leaves) — 해당 year 의 approved 만
    // am_pm='full' 종일 = end-start+1 (date 단위)
    // am_pm='am'|'pm' 반차 = 0.5
    // am_pm='custom' = hours / 8 (시간 단위)
    let usedRows: any[]
    if (workerId) {
      usedRows = await prisma.$queryRaw<any[]>`
        SELECT worker_id, leave_type,
               YEAR(start_date) AS year,
               MONTH(start_date) AS month,
               SUM(CASE
                    WHEN am_pm = 'full'   THEN DATEDIFF(end_date, start_date) + 1
                    WHEN am_pm = 'custom' THEN COALESCE(hours, 0) / 8
                    ELSE 0.5 END) AS used_days
        FROM cs_leaves
        WHERE worker_id = ${workerId}
          AND YEAR(start_date) = ${year}
          AND status = 'approved'
        GROUP BY worker_id, leave_type, YEAR(start_date), MONTH(start_date)
      `
    } else {
      usedRows = await prisma.$queryRaw<any[]>`
        SELECT worker_id, leave_type,
               YEAR(start_date) AS year,
               MONTH(start_date) AS month,
               SUM(CASE
                    WHEN am_pm = 'full'   THEN DATEDIFF(end_date, start_date) + 1
                    WHEN am_pm = 'custom' THEN COALESCE(hours, 0) / 8
                    ELSE 0.5 END) AS used_days
        FROM cs_leaves
        WHERE YEAR(start_date) = ${year}
          AND status = 'approved'
        GROUP BY worker_id, leave_type, YEAR(start_date), MONTH(start_date)
      `
    }

    // 3) 발급에 사용량 매핑 (잔여 계산)
    // - quota.month = NULL: 같은 worker/year/type 의 모든 사용량 합산
    // - quota.month = N:    같은 worker/year/type/month 의 사용량
    const enriched = quotas.map((q: any) => {
      let used = 0
      for (const u of usedRows) {
        if (u.worker_id !== q.worker_id) continue
        if (u.leave_type !== q.leave_type) continue
        if (Number(u.year) !== Number(q.year)) continue
        if (q.month != null && Number(u.month) !== Number(q.month)) continue
        used += Number(u.used_days || 0)
      }
      const granted = Number(q.granted_days || 0)
      const carry = Number(q.carried_over_days || 0)
      const total = granted + carry
      const remaining = total - used
      return {
        ...q,
        granted_days: granted,
        carried_over_days: carry,
        total_days: total,
        used_days: Math.round(used * 10) / 10,
        remaining_days: Math.round(remaining * 10) / 10,
      }
    })

    return NextResponse.json({ data: serialize(enriched), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const worker_id = String(body?.worker_id || '')
    const year = Number(body?.year)
    const month = body?.month != null ? Number(body.month) : null
    const leave_type = String(body?.leave_type || '')
    const granted_days = Number(body?.granted_days || 0)
    const carried_over_days = Number(body?.carried_over_days || 0)
    const memo = body?.memo ?? null

    if (!worker_id || !year || !TYPES.includes(leave_type as any)) {
      return NextResponse.json({ error: 'worker_id, year, leave_type 필수' }, { status: 400 })
    }

    // upsert (uq key): 있으면 UPDATE, 없으면 INSERT
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_leave_quotas
      WHERE worker_id = ${worker_id} AND year = ${year}
        AND leave_type = ${leave_type}
        AND (month <=> ${month})
      LIMIT 1
    `
    let id: string
    if (existing.length > 0) {
      id = existing[0].id
      await prisma.$executeRaw`
        UPDATE cs_leave_quotas
        SET granted_days = ${granted_days},
            carried_over_days = ${carried_over_days},
            memo = ${memo}, updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      id = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO cs_leave_quotas
          (id, worker_id, year, month, leave_type, granted_days, carried_over_days, memo, created_at, updated_at)
        VALUES
          (${id}, ${worker_id}, ${year}, ${month}, ${leave_type},
           ${granted_days}, ${carried_over_days}, ${memo}, NOW(), NOW())
      `
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, worker_id, year, month, leave_type,
             CAST(granted_days AS DECIMAL(4,1)) AS granted_days,
             CAST(carried_over_days AS DECIMAL(4,1)) AS carried_over_days,
             memo, created_at, updated_at
      FROM cs_leave_quotas WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
