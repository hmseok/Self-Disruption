// ═══════════════════════════════════════════════════════════════════
// GET    /api/call-scheduler/shift-groups/[id] — 상세 + 멤버 목록
// PATCH  /api/call-scheduler/shift-groups/[id] — 수정
// DELETE /api/call-scheduler/shift-groups/[id] — soft delete (is_active=0)
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
  'name', 'category', 'shift_slot_id', 'pattern_type', 'custom_days',
  'generation_strategy', 'rotation_size', 'rotation_period_days',
  'color_tone', 'description', 'sort_order', 'is_active',
  'skip_on_holidays',  // N-16
])
const PATTERNS = new Set(['all_days', 'all_weekdays', 'weekends_only', 'custom'])
const STRATEGIES = new Set(['all_members', 'rotation'])
const COLOR_TONES = new Set([
  'blue', 'gray', 'green', 'amber', 'violet', 'red', 'none',
  'indigo', 'sky', 'teal', 'lime', 'orange', 'pink', 'slate',
])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const grpRows = await prisma.$queryRaw<any[]>`
      SELECT g.id, g.name, g.shift_slot_id, g.pattern_type, g.custom_days,
             g.generation_strategy, g.rotation_size, g.rotation_period_days,
             g.color_tone, g.description, g.sort_order, g.is_active,
             g.created_at, g.updated_at,
             s.code AS slot_code, s.label AS slot_label,
             TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
             TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
             s.is_overnight
      FROM cs_shift_groups g
      JOIN cs_shift_slots s ON s.id = g.shift_slot_id
      WHERE g.id = ${id} LIMIT 1
    `
    if (grpRows.length === 0) {
      return NextResponse.json({ error: '그룹을 찾을 수 없습니다.' }, { status: 404 })
    }
    const memberRows = await prisma.$queryRaw<any[]>`
      SELECT m.id, m.worker_id, m.priority,
             w.name AS worker_name, w.color_tone AS worker_tone, w.group_label
      FROM cs_group_members m
      JOIN cs_workers w ON w.id = m.worker_id
      WHERE m.group_id = ${id}
      ORDER BY m.priority ASC, w.name ASC
    `

    const group = {
      ...grpRows[0],
      is_active: Boolean(grpRows[0].is_active),
      is_overnight: Boolean(grpRows[0].is_overnight),
      rotation_size: grpRows[0].rotation_size != null ? Number(grpRows[0].rotation_size) : null,
      rotation_period_days: Number(grpRows[0].rotation_period_days || 1),
    }
    return NextResponse.json({
      data: serialize({ group, members: memberRows }),
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

    // category 컬럼 존재 확인 (graceful)
    let hasCategory = true
    try {
      await prisma.$queryRaw<any[]>`SELECT category FROM cs_shift_groups LIMIT 1`
    } catch {
      hasCategory = false
    }
    // N-16 — skip_on_holidays 컬럼 존재 확인 (graceful)
    let hasSkipOnHolidays = true
    try {
      await prisma.$queryRaw<any[]>`SELECT skip_on_holidays FROM cs_shift_groups LIMIT 1`
    } catch { hasSkipOnHolidays = false }

    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED_COLS.has(k)) continue
      if (k === 'category' && !hasCategory) continue  // 마이그레이션 미적용 시 skip
      if (k === 'skip_on_holidays' && !hasSkipOnHolidays) continue  // N-16 — graceful
      if (k === 'pattern_type' && !PATTERNS.has(String(v))) continue
      if (k === 'generation_strategy' && !STRATEGIES.has(String(v))) continue
      if (k === 'color_tone' && !COLOR_TONES.has(String(v))) continue
      if (k === 'is_active' || k === 'skip_on_holidays') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
      }
      sets.push(`${k} = ?`); params.push(v ?? null)
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')
    const sql = `UPDATE cs_shift_groups SET ${sets.join(', ')} WHERE id = ?`
    params.push(id)
    await prisma.$executeRawUnsafe(sql, ...params)

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, shift_slot_id, pattern_type, custom_days,
             generation_strategy, rotation_size, rotation_period_days,
             color_tone, description, sort_order, is_active, created_at, updated_at
      FROM cs_shift_groups WHERE id = ${id} LIMIT 1
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
    await prisma.$executeRaw`
      UPDATE cs_shift_groups SET is_active = 0, updated_at = NOW() WHERE id = ${id}
    `
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
