// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/schedules — 월별 스케줄 목록
// POST /api/call-scheduler/schedules — 신규 월 스케줄 생성
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

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    // 스케줄 + 충원율 집계 (목록 카드용)
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        s.id, s.year, s.month, s.title, s.status, s.source,
        s.published_at, s.published_by, s.note, s.created_at, s.updated_at,
        (SELECT COUNT(*) FROM cs_assignments a WHERE a.schedule_id = s.id) AS total_cells,
        (SELECT COUNT(*) FROM cs_assignments a
            WHERE a.schedule_id = s.id AND a.worker_id IS NOT NULL
            AND a.special_code != 'off') AS filled_cells,
        (SELECT COUNT(DISTINCT a.worker_id) FROM cs_assignments a
            WHERE a.schedule_id = s.id AND a.worker_id IS NOT NULL) AS worker_count
      FROM cs_schedules s
      ORDER BY s.year DESC, s.month DESC
    `
    const data = rows.map(r => ({
      ...r,
      total_cells: Number(r.total_cells || 0),
      filled_cells: Number(r.filled_cells || 0),
      worker_count: Number(r.worker_count || 0),
      fill_rate: r.total_cells > 0 ? Number(r.filled_cells) / Number(r.total_cells) : 0,
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const year = Number(body?.year)
    const month = Number(body?.month)
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'year, month(1-12) 필수' }, { status: 400 })
    }
    const title: string | null = body?.title ?? `${year}년 ${month}월 근무표`
    const note: string | null = body?.note ?? null
    const cloneFromId: string | null = body?.clone_from ?? null

    // 중복 체크
    const exists = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_schedules WHERE year = ${year} AND month = ${month} LIMIT 1
    `
    if (exists.length > 0) {
      return NextResponse.json(
        { error: `${year}년 ${month}월 스케줄이 이미 존재합니다.` },
        { status: 409 },
      )
    }

    const id = crypto.randomUUID()
    await prisma.$executeRaw`
      INSERT INTO cs_schedules
        (id, year, month, title, status, source, note, created_at, updated_at)
      VALUES
        (${id}, ${year}, ${month}, ${title}, 'draft', 'manual', ${note}, NOW(), NOW())
    `

    // (선택) 전월 복제 — clone_from 스케줄의 worker_id 패턴을 새 월의 같은 요일에 복사
    let clonedCount = 0
    if (cloneFromId) {
      // 일자→요일 매핑 후 같은 (요일, slot) 의 worker_id 채우기
      // MVP 단순 구현: 동일 요일 인덱스의 첫 번째 매칭만 복제
      const sourceRows = await prisma.$queryRaw<any[]>`
        SELECT
          DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
          shift_slot_id, worker_id, special_code
        FROM cs_assignments
        WHERE schedule_id = ${cloneFromId}
      `
      // 요일별 (slot → worker_id) 우선순위 맵 생성
      type Key = string // `${dow}_${slotId}`
      const map = new Map<Key, { worker_id: string | null; special_code: string }>()
      for (const r of sourceRows) {
        const dow = new Date(r.work_date + 'T00:00:00').getDay()
        const k: Key = `${dow}_${r.shift_slot_id}`
        if (!map.has(k)) map.set(k, { worker_id: r.worker_id, special_code: r.special_code })
      }
      // 새 월의 모든 (date, slot) 조합 INSERT
      const slots = await prisma.$queryRaw<any[]>`
        SELECT id, TIME_FORMAT(start_time,'%H:%i:%s') AS start_time,
               TIME_FORMAT(end_time,'%H:%i:%s') AS end_time, is_overnight
        FROM cs_shift_slots WHERE is_active = 1 ORDER BY sort_order
      `
      const lastDay = new Date(year, month, 0).getDate()
      const inserts: string[] = []
      const params: any[] = []
      for (let d = 1; d <= lastDay; d++) {
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dow = new Date(isoDate + 'T00:00:00').getDay()
        for (const slot of slots) {
          const k = `${dow}_${slot.id}`
          const seed = map.get(k)
          if (!seed) continue
          const aId = crypto.randomUUID()
          // computed_hours 재계산 (간단)
          let hours = 0
          if (seed.special_code !== 'off' && seed.special_code !== 'am_free' && seed.special_code !== 'pm_free') {
            const [sh, sm] = String(slot.start_time).split(':').map(Number)
            let [eh, em] = String(slot.end_time).split(':').map(Number)
            if (slot.is_overnight) eh += 24
            hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60
            if (seed.special_code === 'am_half' || seed.special_code === 'pm_half') hours = hours / 2
          }
          await prisma.$executeRaw`
            INSERT INTO cs_assignments
              (id, schedule_id, work_date, shift_slot_id, worker_id, special_code, computed_hours, created_at, updated_at)
            VALUES
              (${aId}, ${id}, ${isoDate}, ${slot.id}, ${seed.worker_id}, ${seed.special_code}, ${hours}, NOW(), NOW())
          `
          clonedCount++
        }
      }
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, year, month, title, status, source, published_at, published_by, note, created_at, updated_at
      FROM cs_schedules WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json(
      { data: serialize(rows[0]), cloned: clonedCount, error: null },
      { status: 201 },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
