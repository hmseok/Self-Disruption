// ═══════════════════════════════════════════════════════════════════
// PATCH  /api/call-scheduler/holidays/[id]
// DELETE /api/call-scheduler/holidays/[id]
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const ALLOWED = new Set(['holiday_date', 'name', 'type', 'is_paid', 'exclude_auto', 'color_tone', 'memo'])
const TYPES = new Set(['national', 'company', 'family', 'custom'])
const COLOR_TONES = new Set(['blue', 'gray', 'green', 'amber', 'violet', 'red', 'none'])

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
      if (!ALLOWED.has(k)) continue
      if (k === 'type' && !TYPES.has(String(v))) continue
      if (k === 'color_tone' && !COLOR_TONES.has(String(v))) continue
      if (k === 'is_paid' || k === 'exclude_auto') {
        sets.push(`${k} = ?`); params.push(v ? 1 : 0); continue
      }
      sets.push(`${k} = ?`); params.push(v ?? null)
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')
    const sql = `UPDATE cs_holidays SET ${sets.join(', ')} WHERE id = ?`
    params.push(id)
    await prisma.$executeRawUnsafe(sql, ...params)

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
             name, type, is_paid, exclude_auto, color_tone, memo, created_at, updated_at
      FROM cs_holidays WHERE id = ${id} LIMIT 1
    `
    const updated = rows[0]
      ? { ...rows[0], is_paid: Boolean(rows[0].is_paid), exclude_auto: Boolean(rows[0].exclude_auto) }
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
    await prisma.$executeRaw`DELETE FROM cs_holidays WHERE id = ${id}`
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
