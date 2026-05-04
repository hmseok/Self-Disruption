// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/me — 본인(또는 매니저가 선택한) 워커의 일정
//
// 인증 모드:
//   1) Authorization: Bearer <jwt>  + worker_id (옵션)
//      → 로그인 매니저가 아무 워커 선택 가능
//   2) ?token=<32hex>
//      → 비로그인 영구 링크. ride_employees.public_token 으로 직원 식별.
//      → status='published' 스케줄만 노출
//
// 쿼리:
//   ?year=2026&month=5  (없으면 가장 최근 published)
//   ?worker_id=<uuid>   (로그인 매니저만)
//   ?token=<hex>        (비로그인)
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const token = sp.get('token')
    const yearStr = sp.get('year')
    const monthStr = sp.get('month')
    let workerIdParam = sp.get('worker_id')

    let employeeId: string | null = null
    let publicMode = false       // true = 비로그인 토큰, draft 보지 못함
    let isManager = false        // 로그인 매니저면 worker_id 임의 선택 가능

    if (token) {
      // ── 토큰 모드 ──────────────────────────────────────────────────
      publicMode = true
      const empRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM ride_employees
        WHERE public_token = ${token} AND is_active = 1
        LIMIT 1
      `
      if (empRows.length === 0) {
        return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 401 })
      }
      employeeId = empRows[0].id
    } else {
      // ── 로그인 모드 ────────────────────────────────────────────────
      const user = await verifyUser(request)
      if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
      isManager = String(user.role || '') === 'admin' || String(user.role || '') === 'manager'

      // 본인 employee 매핑 (profile_id 기반)
      const empRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM ride_employees
        WHERE profile_id = ${user.id} AND is_active = 1
        LIMIT 1
      `
      employeeId = empRows[0]?.id || null
      // 매니저인데 worker_id 명시 → 다른 워커 조회 가능
    }

    // employee_id → worker_id 매핑
    let workerId: string | null = null
    if (workerIdParam && (isManager || publicMode === false)) {
      // 매니저만 임의 워커 선택 — 토큰 모드에서는 무시
      if (isManager) workerId = workerIdParam
    }
    if (!workerId && employeeId) {
      const wRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_workers
        WHERE employee_id = ${employeeId} AND is_active = 1
        LIMIT 1
      `
      workerId = wRows[0]?.id || null
    }
    if (!workerId) {
      return NextResponse.json({
        data: { worker: null, schedule: null, assignments: [], slots: [], stats: null },
        error: null,
      })
    }

    // 워커 정보 + employee 조인
    const workerInfo = await prisma.$queryRaw<any[]>`
      SELECT w.id AS worker_id, w.name AS worker_name, w.color_tone, w.group_label,
             e.id AS employee_id, e.name AS employee_name, e.department, e.position,
             e.phone, e.email
      FROM cs_workers w
      LEFT JOIN ride_employees e ON e.id = w.employee_id
      WHERE w.id = ${workerId} LIMIT 1
    `
    const worker = workerInfo[0] || null

    // 대상 스케줄 결정
    let schedule: any = null
    if (yearStr && monthStr) {
      const y = Number(yearStr); const m = Number(monthStr)
      let sRows: any[]
      if (publicMode) {
        sRows = await prisma.$queryRaw<any[]>`
          SELECT id, year, month, title, status, published_at
          FROM cs_schedules
          WHERE year = ${y} AND month = ${m} AND status = 'published'
          LIMIT 1
        `
      } else {
        sRows = await prisma.$queryRaw<any[]>`
          SELECT id, year, month, title, status, published_at
          FROM cs_schedules
          WHERE year = ${y} AND month = ${m}
          LIMIT 1
        `
      }
      schedule = sRows[0] || null
    } else {
      // 최근 (토큰 모드는 published 만, 로그인은 draft 도 OK)
      if (publicMode) {
        const sRows = await prisma.$queryRaw<any[]>`
          SELECT id, year, month, title, status, published_at
          FROM cs_schedules
          WHERE status = 'published'
          ORDER BY year DESC, month DESC LIMIT 1
        `
        schedule = sRows[0] || null
      } else {
        const sRows = await prisma.$queryRaw<any[]>`
          SELECT id, year, month, title, status, published_at
          FROM cs_schedules
          ORDER BY year DESC, month DESC LIMIT 1
        `
        schedule = sRows[0] || null
      }
    }

    if (!schedule) {
      return NextResponse.json({
        data: { worker, schedule: null, assignments: [], slots: [], stats: null },
        error: null,
      })
    }

    // 본인 배정만
    const assignRows = await prisma.$queryRaw<any[]>`
      SELECT a.id,
             DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date,
             a.shift_slot_id, a.special_code,
             CAST(a.computed_hours AS DECIMAL(4,2)) AS computed_hours,
             s.code AS slot_code, s.label AS slot_label,
             TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
             TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
             s.is_overnight
      FROM cs_assignments a
      JOIN cs_shift_slots s ON s.id = a.shift_slot_id
      WHERE a.schedule_id = ${schedule.id} AND a.worker_id = ${workerId}
      ORDER BY a.work_date ASC, s.sort_order ASC
    `
    const assignments = assignRows.map(r => ({
      ...r,
      computed_hours: Number(r.computed_hours || 0),
      is_overnight: Boolean(r.is_overnight),
    }))

    // 통계
    let totalHours = 0
    let shiftCount = 0
    let overnightCount = 0
    let halfCount = 0
    let freeCount = 0
    let offCount = 0
    for (const a of assignments) {
      if (a.special_code === 'off') { offCount++; continue }
      shiftCount++
      totalHours += Number(a.computed_hours || 0)
      if (a.is_overnight) overnightCount++
      if (a.special_code === 'am_half' || a.special_code === 'pm_half') halfCount++
      if (a.special_code === 'am_free' || a.special_code === 'pm_free') freeCount++
    }
    const stats = {
      shift_count: shiftCount,
      total_hours: Math.round(totalHours * 100) / 100,
      overnight_count: overnightCount,
      half_count: halfCount,
      free_count: freeCount,
      off_count: offCount,
    }

    return NextResponse.json({
      data: serialize({
        worker,
        schedule,
        assignments,
        stats,
        public_mode: publicMode,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
