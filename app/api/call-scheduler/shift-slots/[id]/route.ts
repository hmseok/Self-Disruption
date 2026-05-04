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
])
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

    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED_COLS.has(k)) continue
      if (k === 'category' && !CATEGORIES.has(String(v))) continue
      if (k === 'start_time' || k === 'end_time') {
        sets.push(`${k} = ?`); params.push(normalizeTime(String(v))); continue
      }
      if (k === 'is_overnight' || k === 'is_active') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
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

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, code, label,
        TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
        is_overnight, category, sort_order, is_active
      FROM cs_shift_slots WHERE id = ${id} LIMIT 1
    `
    const updated = rows[0]
      ? { ...rows[0], is_overnight: Boolean(rows[0].is_overnight), is_active: Boolean(rows[0].is_active) }
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
