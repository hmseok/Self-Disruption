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

// Phase N-73 — 시프트 식별 색상 (palette ColorTone 14색 + 'none')
const COLOR_TONES = new Set([
  'none', 'blue', 'sky', 'indigo', 'violet', 'pink', 'red',
  'orange', 'amber', 'lime', 'green', 'teal', 'gray', 'slate',
])
function normalizeTone(v: any): string {
  const t = String(v ?? 'none')
  return COLOR_TONES.has(t) ? t : 'none'
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  }
  try {
    // PR-2SS-b/e — 안전 가드 + 시간 분해 컬럼 graceful (PR-2SS-d revert 후 seniority 제거)
    let hasSafetyCols = true
    let hasBreakdownCols = true
    let hasColorCol = true   // Phase N-73 — 시프트 색상 (마이그 미적용 시 'none')
    try {
      await prisma.$queryRaw<any[]>`SELECT next_day_blocking_hours FROM cs_shift_slots LIMIT 1`
    } catch { hasSafetyCols = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT night_period_start FROM cs_shift_slots LIMIT 1`
    } catch { hasBreakdownCols = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT color_tone FROM cs_shift_slots LIMIT 1`
    } catch { hasColorCol = false }

    const includeInactive = request.nextUrl.searchParams.get('include_inactive') === '1'
    // 컬럼 목록을 detection 결과로 조립 (whitelist 만 — SQL injection 무관)
    const cols = [
      'id', 'code', 'label',
      "TIME_FORMAT(start_time, '%H:%i:%s') AS start_time",
      "TIME_FORMAT(end_time, '%H:%i:%s') AS end_time",
      'is_overnight', 'category', 'sort_order', 'is_active',
    ]
    if (hasSafetyCols) cols.push('next_day_blocking_hours', 'max_consecutive_days')
    if (hasBreakdownCols) cols.push(
      "TIME_FORMAT(night_period_start, '%H:%i:%s') AS night_period_start",
      "TIME_FORMAT(night_period_end, '%H:%i:%s') AS night_period_end",
      'night_premium_rate',
    )
    cols.push(hasColorCol ? 'color_tone' : "'none' AS color_tone")
    const sql = `SELECT ${cols.join(', ')} FROM cs_shift_slots`
      + (includeInactive
        ? ' ORDER BY is_active DESC, sort_order ASC'
        : ' WHERE is_active = 1 ORDER BY sort_order ASC')
    const rows = await prisma.$queryRawUnsafe<any[]>(sql)
    const data = rows.map(r => ({
      ...r,
      is_overnight: Boolean(r.is_overnight),
      is_active: Boolean(r.is_active),
      // PR-2SS-b — graceful 디폴트
      next_day_blocking_hours: hasSafetyCols && r.next_day_blocking_hours != null
        ? Number(r.next_day_blocking_hours) : 0,
      max_consecutive_days: hasSafetyCols && r.max_consecutive_days != null
        ? Number(r.max_consecutive_days) : null,
      // PR-2SS-d revert — min_seniority_months 폐기
      // PR-2SS-e — 시간 분해 graceful
      night_period_start: hasBreakdownCols ? (r.night_period_start ?? null) : null,
      night_period_end: hasBreakdownCols ? (r.night_period_end ?? null) : null,
      night_premium_rate: hasBreakdownCols && r.night_premium_rate != null
        ? Number(r.night_premium_rate) : 0,
      // Phase N-73 — 시프트 색상 graceful
      color_tone: normalizeTone(r.color_tone),
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
    // PR-2SS-b — 안전 가드 (overnight 디폴트 16h / 3일)
    const nextDayBlocking: number = body?.next_day_blocking_hours != null
      ? Math.max(0, Math.min(48, Number(body.next_day_blocking_hours) || 0))
      : (is_overnight ? 16 : 0)
    const maxConsec: number | null = body?.max_consecutive_days != null && body.max_consecutive_days !== ''
      ? Math.max(1, Math.min(31, Number(body.max_consecutive_days) || 0)) || null
      : (is_overnight ? 3 : null)
    // PR-2SS-d revert — min_seniority_months 폐기
    // Phase N-73 — 시프트 색상 — 사용자 미지정('none')이면 category 기본색 부여
    //   (마이그레이션의 카테고리 기본색 로직과 동일 — 신규 슬롯도 색 보장)
    const CATEGORY_TONE: Record<string, string> = {
      day: 'sky', evening: 'orange', overnight: 'indigo',
    }
    const requestedTone = normalizeTone(body?.color_tone)
    const colorTone: string = requestedTone === 'none'
      ? (CATEGORY_TONE[category] || 'none')
      : requestedTone

    // code 중복 체크
    const dup = await prisma.$queryRaw<any[]>`
      SELECT id FROM cs_shift_slots WHERE code = ${code} LIMIT 1
    `
    if (dup.length > 0) {
      return NextResponse.json({ error: `code "${code}" 중복` }, { status: 409 })
    }

    // PR-2SS-b — 안전 가드 컬럼 graceful (d revert 후 seniority 제거)
    let hasSafetyCols = true
    try {
      await prisma.$queryRaw<any[]>`SELECT next_day_blocking_hours FROM cs_shift_slots LIMIT 1`
    } catch { hasSafetyCols = false }
    // Phase N-73 — color_tone 컬럼 graceful
    let hasColorCol = true
    try {
      await prisma.$queryRaw<any[]>`SELECT color_tone FROM cs_shift_slots LIMIT 1`
    } catch { hasColorCol = false }

    const id = crypto.randomUUID()
    if (hasSafetyCols) {
      await prisma.$executeRaw`
        INSERT INTO cs_shift_slots
          (id, code, label, start_time, end_time, is_overnight, category, sort_order, is_active,
           next_day_blocking_hours, max_consecutive_days, created_at, updated_at)
        VALUES
          (${id}, ${code}, ${label}, ${start_time}, ${end_time},
           ${is_overnight ? 1 : 0}, ${category}, ${sort_order}, 1,
           ${nextDayBlocking}, ${maxConsec}, NOW(), NOW())
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO cs_shift_slots
          (id, code, label, start_time, end_time, is_overnight, category, sort_order, is_active, created_at, updated_at)
        VALUES
          (${id}, ${code}, ${label}, ${start_time}, ${end_time},
           ${is_overnight ? 1 : 0}, ${category}, ${sort_order}, 1, NOW(), NOW())
      `
    }
    // Phase N-73 — 색상은 INSERT 후 별도 UPDATE (컬럼 graceful — 분기 폭증 방지)
    if (hasColorCol) {
      await prisma.$executeRaw`
        UPDATE cs_shift_slots SET color_tone = ${colorTone} WHERE id = ${id}
      `
    }
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, code, label,
        TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
        is_overnight, category, sort_order, is_active,
        ${hasColorCol ? 'color_tone' : "'none' AS color_tone"}
      FROM cs_shift_slots WHERE id = ? LIMIT 1`,
      id,
    )
    const created = rows[0]
      ? {
          ...rows[0],
          is_overnight: Boolean(rows[0].is_overnight),
          is_active: Boolean(rows[0].is_active),
          color_tone: normalizeTone(rows[0].color_tone),
        }
      : null
    return NextResponse.json({ data: serialize(created), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
