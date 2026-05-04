// ═══════════════════════════════════════════════════════════════════
// GET    /api/call-scheduler/schedules/[id]
//   → 스케줄 + 슬롯 + 근무자 + 모든 배정 + KPI + 배포 이력
// PATCH  /api/call-scheduler/schedules/[id]   { status?, title?, note? }
// DELETE /api/call-scheduler/schedules/[id]   — 캐스케이드로 배정/배포 함께 제거
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const STATUS_VALUES = ['draft', 'published', 'archived'] as const
type Status = typeof STATUS_VALUES[number]

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })

    // 1) 스케줄
    const schedRows = await prisma.$queryRaw<any[]>`
      SELECT id, year, month, title, status, source, published_at, published_by, note, created_at, updated_at
      FROM cs_schedules WHERE id = ${id} LIMIT 1
    `
    if (schedRows.length === 0) {
      return NextResponse.json({ error: '스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }
    const schedule = schedRows[0]

    // 2) 슬롯 마스터
    const slotsRows = await prisma.$queryRaw<any[]>`
      SELECT id, code, label,
             TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
             TIME_FORMAT(end_time, '%H:%i:%s')   AS end_time,
             is_overnight, category, sort_order, is_active
      FROM cs_shift_slots WHERE is_active = 1 ORDER BY sort_order ASC
    `
    const slots = slotsRows.map(r => ({
      ...r,
      is_overnight: Boolean(r.is_overnight),
      is_active: Boolean(r.is_active),
    }))

    // 3) 근무자
    const workersRows = await prisma.$queryRaw<any[]>`
      SELECT id, name, profile_id, color_tone, group_label, phone, email, is_active
      FROM cs_workers WHERE is_active = 1 ORDER BY group_label DESC, name ASC
    `
    const workers = workersRows.map(r => ({ ...r, is_active: Boolean(r.is_active) }))

    // 4) 배정 (그리드)
    const assignRows = await prisma.$queryRaw<any[]>`
      SELECT id, schedule_id,
             DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
             shift_slot_id, worker_id, special_code,
             CAST(computed_hours AS DECIMAL(4,2)) AS computed_hours,
             note
      FROM cs_assignments WHERE schedule_id = ${id}
    `
    const assignments = assignRows.map(r => ({
      ...r,
      computed_hours: Number(r.computed_hours || 0),
    }))

    // 5) 배포 이력
    const distRows = await prisma.$queryRaw<any[]>`
      SELECT id, schedule_id, channel, recipient_count, recipients_snapshot, status,
             response_meta, sent_at, sent_by, created_at
      FROM cs_distributions WHERE schedule_id = ${id} ORDER BY created_at DESC
    `
    const distributions = distRows.map(r => ({
      ...r,
      recipient_count: Number(r.recipient_count || 0),
    }))

    // 6) KPI 집계
    const kpi = computeKpi(id, slots, workers, assignments)

    return NextResponse.json({
      data: serialize({
        schedule,
        slots,
        workers,
        assignments,
        kpi,
        distributions,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json()

    const updates: string[] = []
    if (typeof body?.title === 'string') updates.push(`title=${JSON.stringify(body.title)}`)
    if (typeof body?.note === 'string') updates.push(`note=${JSON.stringify(body.note)}`)
    if (STATUS_VALUES.includes(body?.status)) {
      const status = body.status as Status
      // PostgreSQL 금지 — MySQL tagged template 만 사용
      if (status === 'published') {
        await prisma.$executeRaw`
          UPDATE cs_schedules
          SET status = 'published', published_at = NOW(), published_by = ${user.id}, updated_at = NOW()
          WHERE id = ${id}
        `
      } else {
        await prisma.$executeRaw`
          UPDATE cs_schedules SET status = ${status}, updated_at = NOW() WHERE id = ${id}
        `
      }
    }
    if (typeof body?.title === 'string') {
      await prisma.$executeRaw`
        UPDATE cs_schedules SET title = ${body.title}, updated_at = NOW() WHERE id = ${id}
      `
    }
    if (typeof body?.note === 'string') {
      await prisma.$executeRaw`
        UPDATE cs_schedules SET note = ${body.note}, updated_at = NOW() WHERE id = ${id}
      `
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, year, month, title, status, source, published_at, published_by, note, created_at, updated_at
      FROM cs_schedules WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    await prisma.$executeRaw`DELETE FROM cs_schedules WHERE id = ${id}`
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// ── KPI 계산 (서버 측) ─────────────────────────────────────────────
function computeKpi(scheduleId: string, slots: any[], workers: any[], assignments: any[]) {
  const workerMap = new Map<string, any>(workers.map(w => [w.id, w]))
  const slotMap = new Map<string, any>(slots.map(s => [s.id, s]))

  const workerKpiMap = new Map<string, any>()
  for (const w of workers) {
    workerKpiMap.set(w.id, {
      worker_id: w.id,
      name: w.name,
      group_label: w.group_label,
      color_tone: w.color_tone,
      shift_count: 0,
      total_hours: 0,
      overnight_count: 0,
      half_count: 0,
      free_count: 0,
      off_count: 0,
    })
  }

  const slotFillMap = new Map<string, any>()
  for (const s of slots) {
    slotFillMap.set(s.id, {
      slot_id: s.id, code: s.code, label: s.label, filled: 0, total: 0, fill_rate: 0,
    })
  }

  let totalAssignments = 0
  let filledAssignments = 0
  let halfCount = 0
  let freeCount = 0
  let offCount = 0

  for (const a of assignments) {
    totalAssignments++
    const slot = slotMap.get(a.shift_slot_id)
    if (!slot) continue
    const slotKpi = slotFillMap.get(a.shift_slot_id)
    slotKpi.total++

    const isFilled = !!a.worker_id && a.special_code !== 'off'
    if (isFilled) {
      filledAssignments++
      slotKpi.filled++
    }

    if (a.special_code === 'am_half' || a.special_code === 'pm_half') halfCount++
    if (a.special_code === 'am_free' || a.special_code === 'pm_free') freeCount++
    if (a.special_code === 'off') offCount++

    if (a.worker_id && workerKpiMap.has(a.worker_id)) {
      const wk = workerKpiMap.get(a.worker_id)
      if (a.special_code !== 'off') {
        wk.shift_count++
        wk.total_hours += Number(a.computed_hours || 0)
        if (slot.is_overnight) wk.overnight_count++
      }
      if (a.special_code === 'am_half' || a.special_code === 'pm_half') wk.half_count++
      if (a.special_code === 'am_free' || a.special_code === 'pm_free') wk.free_count++
      if (a.special_code === 'off') wk.off_count++
    }
  }

  for (const sk of slotFillMap.values()) {
    sk.fill_rate = sk.total > 0 ? sk.filled / sk.total : 0
  }

  // 0시간 워커 제외하고 평균
  const activeWorkers = Array.from(workerKpiMap.values()).filter(w => w.shift_count > 0)
  const avgHours = activeWorkers.length > 0
    ? activeWorkers.reduce((s, w) => s + w.total_hours, 0) / activeWorkers.length
    : 0

  return {
    schedule_id: scheduleId,
    worker_count: activeWorkers.length,
    total_assignments: totalAssignments,
    filled_assignments: filledAssignments,
    fill_rate: totalAssignments > 0 ? filledAssignments / totalAssignments : 0,
    avg_hours_per_worker: Math.round(avgHours * 100) / 100,
    unfilled_slots: totalAssignments - filledAssignments,
    half_count: halfCount,
    free_count: freeCount,
    off_count: offCount,
    workers: Array.from(workerKpiMap.values())
      .map(w => ({ ...w, total_hours: Math.round(w.total_hours * 100) / 100 }))
      .sort((a, b) => b.total_hours - a.total_hours),
    slots: Array.from(slotFillMap.values()),
  }
}
