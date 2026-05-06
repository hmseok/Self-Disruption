// ═══════════════════════════════════════════════════════════════════
// PATCH  /api/call-scheduler/shift-slots/[id] — 시프트 수정
// DELETE /api/call-scheduler/shift-slots/[id] — soft delete (is_active=0)
//   ※ 그룹/배정에서 참조 중일 수 있으므로 hard delete 안 함
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const ALLOWED_COLS = new Set([
  'code', 'label', 'start_time', 'end_time',
  'is_overnight', 'category', 'sort_order', 'is_active',
  // PR-2SS-b — 안전 가드
  'next_day_blocking_hours', 'max_consecutive_days',
  // PR-2SS-d — 최소 경력
  'min_seniority_months',
  // PR-2SS-e — 시간 분해
  'night_period_start', 'night_period_end', 'night_premium_rate',
])
// PR-2SS-b — 안전 가드 컬럼 (graceful 검사 대상)
const SAFETY_COLS = new Set(['next_day_blocking_hours', 'max_consecutive_days'])
// PR-2SS-d — 경력 컬럼 (별도 graceful)
const SENIORITY_COLS = new Set(['min_seniority_months'])
// PR-2SS-e — 시간 분해 컬럼
const BREAKDOWN_COLS = new Set(['night_period_start', 'night_period_end', 'night_premium_rate'])
const CATEGORIES = new Set(['day', 'evening', 'overnight'])

function normalizeTime(t: string): string {
  if (!t) return '00:00:00'
  const parts = t.split(':')
  const h = (parts[0] || '00').padStart(2, '0')
  const m = (parts[1] || '00').padStart(2, '0')
  const s = (parts[2] || '00').padStart(2, '0')
  return `${h}:${m}:${s}`
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

    // PR-2SS-b/d/e — 안전 가드 + 경력 + 시간 분해 컬럼 graceful
    let hasSafetyCols = true
    let hasSeniorityCol = true
    let hasBreakdownCols = true
    try {
      await prisma.$queryRaw<any[]>`SELECT next_day_blocking_hours FROM cs_shift_slots LIMIT 1`
    } catch { hasSafetyCols = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT min_seniority_months FROM cs_shift_slots LIMIT 1`
    } catch { hasSeniorityCol = false }
    try {
      await prisma.$queryRaw<any[]>`SELECT night_period_start FROM cs_shift_slots LIMIT 1`
    } catch { hasBreakdownCols = false }

    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED_COLS.has(k)) continue
      if (SAFETY_COLS.has(k) && !hasSafetyCols) continue
      if (SENIORITY_COLS.has(k) && !hasSeniorityCol) continue
      if (BREAKDOWN_COLS.has(k) && !hasBreakdownCols) continue
      if (k === 'category' && !CATEGORIES.has(String(v))) continue
      if (k === 'start_time' || k === 'end_time') {
        sets.push(`${k} = ?`); params.push(normalizeTime(String(v))); continue
      }
      if (k === 'is_overnight' || k === 'is_active') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
      }
      if (k === 'next_day_blocking_hours') {
        const n = v == null || v === '' ? 0 : Math.max(0, Math.min(48, Number(v) || 0))
        sets.push(`${k} = ?`); params.push(n); continue
      }
      if (k === 'max_consecutive_days') {
        const n = v == null || v === '' ? null : Math.max(1, Math.min(31, Number(v) || 0)) || null
        sets.push(`${k} = ?`); params.push(n); continue
      }
      if (k === 'min_seniority_months') {
        const n = v == null || v === '' ? 0 : Math.max(0, Math.min(120, Number(v) || 0))
        sets.push(`${k} = ?`); params.push(n); continue
      }
      // PR-2SS-e — 시간 분해
      if (k === 'night_period_start' || k === 'night_period_end') {
        const t = v == null || v === '' ? null : normalizeTime(String(v))
        sets.push(`${k} = ?`); params.push(t); continue
      }
      if (k === 'night_premium_rate') {
        const r = v == null || v === '' ? 0 : Math.max(0, Math.min(2, Number(v) || 0))
        sets.push(`${k} = ?`); params.push(r); continue
      }
      sets.push(`${k} = ?`); params.push(v ?? null)
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')
    const sql = `UPDATE cs_shift_slots SET ${sets.join(', ')} WHERE id = ?`
    params.push(id)
    await prisma.$executeRawUnsafe(sql, ...params)

    const rows = (hasSafetyCols && hasSeniorityCol)
      ? await prisma.$queryRaw<any[]>`
          SELECT id, code, label,
            TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
            is_overnight, category, sort_order, is_active,
            next_day_blocking_hours, max_consecutive_days, min_seniority_months
          FROM cs_shift_slots WHERE id = ${id} LIMIT 1
        `
      : hasSafetyCols
      ? await prisma.$queryRaw<any[]>`
          SELECT id, code, label,
            TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
            is_overnight, category, sort_order, is_active,
            next_day_blocking_hours, max_consecutive_days
          FROM cs_shift_slots WHERE id = ${id} LIMIT 1
        `
      : await prisma.$queryRaw<any[]>`
          SELECT id, code, label,
            TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
            is_overnight, category, sort_order, is_active
          FROM cs_shift_slots WHERE id = ${id} LIMIT 1
        `
    const updated = rows[0]
      ? {
          ...rows[0],
          is_overnight: Boolean(rows[0].is_overnight),
          is_active: Boolean(rows[0].is_active),
          next_day_blocking_hours: hasSafetyCols && rows[0].next_day_blocking_hours != null
            ? Number(rows[0].next_day_blocking_hours) : 0,
          max_consecutive_days: hasSafetyCols && rows[0].max_consecutive_days != null
            ? Number(rows[0].max_consecutive_days) : null,
          min_seniority_months: hasSeniorityCol && rows[0].min_seniority_months != null
            ? Number(rows[0].min_seniority_months) : 0,
        }
      : null
    return NextResponse.json({ data: serialize(updated), error: null })
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
    // 사용 중 체크 (lint 가 서브쿼리 컨텍스트 혼동하는 것 회피 — 두 번 분리 호출)
    const asnRows = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) AS cnt FROM cs_assignments WHERE shift_slot_id = ${id}
    `
    const grpRows = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) AS cnt FROM cs_shift_groups WHERE shift_slot_id = ${id} AND is_active = 1
    `
    const asnCount = Number(asnRows[0]?.cnt || 0)
    const grpCount = Number(grpRows[0]?.cnt || 0)
    if (asnCount > 0 || grpCount > 0) {
      // soft delete
      await prisma.$executeRaw`
        UPDATE cs_shift_slots SET is_active = 0, updated_at = NOW() WHERE id = ${id}
      `
      return NextResponse.json({
        data: { id, deleted: true, soft: true, asn_count: asnCount, grp_count: grpCount },
        error: null,
      })
    } else {
      // hard delete (사용처 없음)
      await prisma.$executeRaw`DELETE FROM cs_shift_slots WHERE id = ${id}`
      return NextResponse.json({ data: { id, deleted: true, soft: false }, error: null })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
