// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/shift-slots — 시프트 라인 마스터 목록
// POST /api/call-scheduler/shift-slots — 신규 시프트 추가
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

const CATEGORIES = ['day', 'evening', 'overnight'] as const

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }
  try {
    const includeInactive = request.nextUrl.searchParams.get('include_inactive') === '1'
    const rows = includeInactive
      ? await prisma.$queryRaw<any[]>`
          SELECT id, code, label,
            TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time,   '%H:%i:%s') AS end_time,
            is_overnight, category, sort_order, is_active
          FROM cs_shift_slots
          ORDER BY is_active DESC, sort_order ASC`
      : await prisma.$queryRaw<any[]>`
          SELECT id, code, label,
            TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time,   '%H:%i:%s') AS end_time,
            is_overnight, category, sort_order, is_active
          FROM cs_shift_slots
          WHERE is_active = 1
          ORDER BY sort_order ASC`
    const data = rows.map(r => ({
      ...r,
      is_overnight: Boolean(r.is_overnight),
      is_active: Boolean(r.is_active),
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// "HH:MM" → "HH:MM:00"
function normalizeTime(t: string): string {
  if (!t) return '00:00:00'
  const parts = t.split(':')
  const h = (parts[0] || '00').padStart(2, '0')
  const m = (parts[1] || '00').padStart(2, '0')
  const s = (parts[2] || '00').padStart(2, '0')
  return `${h}:${m}:${s}`
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const code: string = String(body?.code || '').trim()
    const label: string = String(body?.label || '').trim()
    const startTimeRaw = String(body?.start_time || '')
    const endTimeRaw = String(body?.end_time || '')
    if (!code || !label) return NextResponse.json({ error: 'code/label 필수' }, { status: 400 })
    if (!/^\d{1,2}:\d{2}/.test(startTimeRaw) || !/^\d{1,2}:\d{2}/.test(endTimeRaw)) {
      return NextResponse.json({ error: '시간 형식: HH:MM' }, { status: 400 })
    }

    const start_time = normalizeTime(startTimeRaw)
    const end_time = normalizeTime(endTimeRaw)
    const is_overnight: boolean = Boolean(body?.is_overnight)
    const category: string = CATEGORIES.includes(body?.category) ? body.category : 'day'
    const sort_order: number = Number(body?.sort_order) || 0

    // code 중복 체크
    const dup = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_shift_slots WHERE code = ${code} LIMIT 1
    `
    if (dup.length > 0) {
      return NextResponse.json({ error: `code "${code}" 중복` }, { status: 409 })
    }

    const id = crypto.randomUUID()
    await prisma.$executeRaw`
      INSERT INTO cs_shift_slots
        (id, code, label, start_time, end_time, is_overnight, category, sort_order, is_active, created_at, updated_at)
      VALUES
        (${id}, ${code}, ${label}, ${start_time}, ${end_time},
         ${is_overnight ? 1 : 0}, ${category}, ${sort_order}, 1, NOW(), NOW())
    `
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, code, label,
        TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
        is_overnight, category, sort_order, is_active
      FROM cs_shift_slots WHERE id = ${id} LIMIT 1
    `
    const created = rows[0]
      ? { ...rows[0], is_overnight: Boolean(rows[0].is_overnight), is_active: Boolean(rows[0].is_active) }
      : null
    return NextResponse.json({ data: serialize(created), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
