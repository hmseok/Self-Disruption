// ═══════════════════════════════════════════════════════════════════
// PUT    /api/call-scheduler/assignments — 셀 upsert (PR-2OO 멀티 워커)
//   body: {
//     schedule_id, work_date, shift_slot_id,
//     worker_id|null, special_code, note?,
//     assignment_id?  ← 기존 row 명시 (수정 모드)
//   }
//   동작:
//     - assignment_id 있으면 → 그 row UPDATE
//     - 없으면 → (schedule, date, slot, worker_id) 키 upsert (1셀 N워커 허용)
// DELETE /api/call-scheduler/assignments?id=...
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

const SPECIAL_CODES = ['none', 'am_free', 'pm_free', 'am_half', 'pm_half', 'off'] as const
type Special = typeof SPECIAL_CODES[number]

export async function PUT(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const schedule_id: string = String(body?.schedule_id || '')
    const work_date: string = String(body?.work_date || '')
    const shift_slot_id: string = String(body?.shift_slot_id || '')
    const worker_id: string | null = body?.worker_id || null
    const special_code: Special = SPECIAL_CODES.includes(body?.special_code) ? body.special_code : 'none'
    const note: string | null = body?.note ?? null
    const assignment_id: string | null = body?.assignment_id || null

    if (!schedule_id || !work_date || !shift_slot_id) {
      return NextResponse.json({ error: 'schedule_id, work_date, shift_slot_id 필수' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
      return NextResponse.json({ error: 'work_date 형식: YYYY-MM-DD' }, { status: 400 })
    }

    // 슬롯 조회 → computed_hours 계산
    const slotRows = await prisma.$queryRaw<any[]>`
      SELECT TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
             TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
             is_overnight
      FROM cs_shift_slots WHERE id = ${shift_slot_id} LIMIT 1
    `
    if (slotRows.length === 0) {
      return NextResponse.json({ error: '슬롯을 찾을 수 없습니다.' }, { status: 404 })
    }
    const slot = slotRows[0]
    const computed_hours = computeHours(
      slot.start_time, slot.end_time, Boolean(slot.is_overnight), special_code,
    )

    // 기존 row 조회 — PR-2OO: assignment_id 있으면 그 row, 없으면 (schedule, date, slot, worker) 키
    let existing: any[]
    if (assignment_id) {
      existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_assignments WHERE id = ${assignment_id} LIMIT 1
      `
    } else if (worker_id) {
      existing = await prisma.$queryRaw<any[]>`
        SELECT id FROM cs_assignments
        WHERE schedule_id = ${schedule_id}
          AND work_date = ${work_date}
          AND shift_slot_id = ${shift_slot_id}
          AND worker_id = ${worker_id}
        LIMIT 1
      `
    } else {
      // worker_id null 인 빈 셀 — 항상 새 row 로 처리 (멀티 NULL 허용)
      existing = []
    }

    let id: string
    if (existing.length > 0) {
      id = existing[0].id
      await prisma.$executeRaw`
        UPDATE cs_assignments
        SET worker_id = ${worker_id},
            special_code = ${special_code},
            computed_hours = ${computed_hours},
            note = ${note},
            updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      id = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO cs_assignments
          (id, schedule_id, work_date, shift_slot_id, worker_id, special_code, computed_hours, note, created_at, updated_at)
        VALUES
          (${id}, ${schedule_id}, ${work_date}, ${shift_slot_id}, ${worker_id}, ${special_code}, ${computed_hours}, ${note}, NOW(), NOW())
      `
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, schedule_id,
             DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
             shift_slot_id, worker_id, special_code,
             CAST(computed_hours AS DECIMAL(4,2)) AS computed_hours,
             note
      FROM cs_assignments WHERE id = ${id} LIMIT 1
    `
    const updated = rows[0]
      ? { ...rows[0], computed_hours: Number(rows[0].computed_hours || 0) }
      : null
    return NextResponse.json({ data: serialize(updated), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 쿼리 필수' }, { status: 400 })
    await prisma.$executeRaw`DELETE FROM cs_assignments WHERE id = ${id}`
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// ── helper ─────────────────────────────────────────────────────────
function computeHours(
  startTime: string,
  endTime: string,
  isOvernight: boolean,
  special: Special,
): number {
  if (special === 'off' || special === 'am_free' || special === 'pm_free') return 0
  const [sh, sm] = startTime.split(':').map(Number)
  let [eh, em] = endTime.split(':').map(Number)
  if (isOvernight) eh += 24
  let hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60
  if (hours < 0) hours = 0
  if (special === 'am_half' || special === 'pm_half') hours = hours / 2
  return Math.round(hours * 100) / 100
}
