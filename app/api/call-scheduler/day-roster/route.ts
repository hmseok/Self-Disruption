// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/day-roster
//   특정 일자의 모든 시프트 + 워커 (동료 보기용)
//   ?date=YYYY-MM-DD&schedule_id=...
//   ?token=<32hex>  (비로그인 영구 링크 모드 — 본인 토큰으로 검증)
//
//   토큰 모드: published 스케줄에 한해서만 동작
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
    const date = sp.get('date')
    const scheduleIdParam = sp.get('schedule_id')

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date 형식: YYYY-MM-DD' }, { status: 400 })
    }

    let publicMode = false
    if (token) {
      // 토큰 검증
      const empRows = await prisma.$queryRaw<any[]>`
        SELECT id FROM ride_employees
        WHERE public_token = ${token} AND is_active = 1 LIMIT 1
      `
      if (empRows.length === 0) {
        return NextResponse.json({ error: '유효하지 않은 링크' }, { status: 401 })
      }
      publicMode = true
    } else {
      const user = await verifyUser(request)
      if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }

    // 스케줄 결정 — 명시되면 사용, 없으면 그 날짜에 걸친 published(또는 모든) 스케줄
    let scheduleId = scheduleIdParam
    if (!scheduleId) {
      const y = Number(date.split('-')[0])
      const m = Number(date.split('-')[1])
      let sRows: any[]
      if (publicMode) {
        sRows = await prisma.$queryRaw<any[]>`
          SELECT id FROM cs_schedules
          WHERE year = ${y} AND month = ${m} AND status = 'published'
          LIMIT 1
        `
      } else {
        sRows = await prisma.$queryRaw<any[]>`
          SELECT id FROM cs_schedules
          WHERE year = ${y} AND month = ${m}
          ORDER BY status = 'published' DESC, updated_at DESC
          LIMIT 1
        `
      }
      scheduleId = sRows[0]?.id || null
    }

    if (!scheduleId) {
      return NextResponse.json({
        data: { date, schedule_id: null, slots: [] }, error: null,
      })
    }

    // 토큰 모드면 published 만 허용 — 다시 검증
    if (publicMode) {
      const sCheck = await prisma.$queryRaw<any[]>`
        SELECT status FROM cs_schedules WHERE id = ${scheduleId} LIMIT 1
      `
      if (sCheck[0]?.status !== 'published') {
        return NextResponse.json({
          data: { date, schedule_id: null, slots: [] }, error: null,
        })
      }
    }

    // 슬롯별 그룹핑된 배정 + 워커 정보
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        a.id AS assignment_id, a.special_code,
        CAST(a.computed_hours AS DECIMAL(4,2)) AS computed_hours,
        s.id AS slot_id, s.code AS slot_code, s.label AS slot_label,
        TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(s.end_time, '%H:%i')   AS end_time,
        s.is_overnight, s.sort_order AS slot_sort,
        w.id AS worker_id, w.name AS worker_name,
        w.color_tone, w.group_label
      FROM cs_assignments a
      JOIN cs_shift_slots s ON s.id = a.shift_slot_id
      LEFT JOIN cs_workers w ON w.id = a.worker_id
      WHERE a.schedule_id = ${scheduleId} AND a.work_date = ${date}
      ORDER BY s.sort_order ASC, w.name ASC
    `

    // 슬롯별 그룹핑
    const slotMap = new Map<string, any>()
    for (const r of rows) {
      let entry = slotMap.get(r.slot_id)
      if (!entry) {
        entry = {
          slot_id: r.slot_id,
          code: r.slot_code,
          label: r.slot_label,
          start_time: r.start_time,
          end_time: r.end_time,
          is_overnight: Boolean(r.is_overnight),
          sort_order: Number(r.slot_sort),
          workers: [],
        }
        slotMap.set(r.slot_id, entry)
      }
      if (r.worker_id) {
        entry.workers.push({
          assignment_id: r.assignment_id,
          worker_id: r.worker_id,
          name: r.worker_name,
          color_tone: r.color_tone,
          group_label: r.group_label,
          special_code: r.special_code,
          computed_hours: Number(r.computed_hours || 0),
        })
      }
    }

    const slots = Array.from(slotMap.values()).sort((a, b) => a.sort_order - b.sort_order)
    return NextResponse.json({
      data: serialize({ date, schedule_id: scheduleId, slots }), error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
