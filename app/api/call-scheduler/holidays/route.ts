// ═══════════════════════════════════════════════════════════════════
// GET  /api/call-scheduler/holidays — 휴일 목록 (year 필터)
// POST /api/call-scheduler/holidays — 신규 휴일 추가
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

const TYPES = ['national', 'company', 'family', 'custom'] as const
const COLOR_TONES = ['blue', 'gray', 'green', 'amber', 'violet', 'red', 'none'] as const

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const sp = request.nextUrl.searchParams
    const year = sp.get('year')
    let rows: any[]
    if (year) {
      const y = Number(year)
      const start = `${y}-01-01`
      const end = `${y}-12-31`
      rows = await prisma.$queryRaw<any[]>`
        SELECT id,
               DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
               name, type, is_paid, exclude_auto, color_tone, memo,
               created_at, updated_at
        FROM cs_holidays
        WHERE holiday_date BETWEEN ${start} AND ${end}
        ORDER BY holiday_date ASC
      `
    } else {
      rows = await prisma.$queryRaw<any[]>`
        SELECT id,
               DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
               name, type, is_paid, exclude_auto, color_tone, memo,
               created_at, updated_at
        FROM cs_holidays
        ORDER BY holiday_date ASC
      `
    }
    const data = rows.map(r => ({
      ...r,
      is_paid: Boolean(r.is_paid),
      exclude_auto: Boolean(r.exclude_auto),
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
    const holiday_date: string = String(body?.holiday_date || '')
    const name: string = String(body?.name || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
      return NextResponse.json({ error: '날짜 형식: YYYY-MM-DD' }, { status: 400 })
    }
    if (!name) return NextResponse.json({ error: '이름 필수' }, { status: 400 })

    const type: string = TYPES.includes(body?.type) ? body.type : 'company'
    const color_tone: string = COLOR_TONES.includes(body?.color_tone) ? body.color_tone : 'red'
    const is_paid: boolean = body?.is_paid !== false
    const exclude_auto: boolean = body?.exclude_auto !== false
    const memo: string | null = body?.memo ?? null

    const id = crypto.randomUUID()
    await prisma.$executeRaw`
      INSERT INTO cs_holidays
        (id, holiday_date, name, type, is_paid, exclude_auto, color_tone, memo, created_at, updated_at)
      VALUES
        (${id}, ${holiday_date}, ${name}, ${type},
         ${is_paid ? 1 : 0}, ${exclude_auto ? 1 : 0},
         ${color_tone}, ${memo}, NOW(), NOW())
    `
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
             name, type, is_paid, exclude_auto, color_tone, memo, created_at, updated_at
      FROM cs_holidays WHERE id = ${id} LIMIT 1
    `
    const created = rows[0]
      ? { ...rows[0], is_paid: Boolean(rows[0].is_paid), exclude_auto: Boolean(rows[0].exclude_auto) }
      : null
    return NextResponse.json({ data: serialize(created), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
