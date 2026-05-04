// ═══════════════════════════════════════════════════════════════════
// GET    /api/ride-employees/[id] — 상세
// PATCH  /api/ride-employees/[id] — 수정
// DELETE /api/ride-employees/[id] — soft delete (is_active=0, resign_date=NOW())
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
  'name', 'profile_id', 'department', 'position', 'employment_type',
  'hire_date', 'resign_date', 'phone', 'email',
  'color_tone', 'group_label', 'memo', 'is_active',
])
const COLOR_TONES = new Set(['blue', 'gray', 'green', 'amber', 'violet', 'red', 'none'])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id } = await context.params
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, profile_id, department, position, employment_type,
             DATE_FORMAT(hire_date, '%Y-%m-%d') AS hire_date,
             DATE_FORMAT(resign_date, '%Y-%m-%d') AS resign_date,
             phone, email, color_tone, group_label, memo,
             public_token, public_token_issued_at,
             is_active, created_at, updated_at
      FROM ride_employees WHERE id = ${id} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }
    const data = { ...rows[0], is_active: Boolean(rows[0].is_active) }
    return NextResponse.json({ data: serialize(data), error: null })
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

    const sets: string[] = []
    const params: any[] = []
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED_COLS.has(k)) continue
      if (k === 'color_tone' && !COLOR_TONES.has(String(v))) continue
      if (k === 'hire_date' || k === 'resign_date') {
        sets.push(`${k} = ?`)
        params.push(v ? new Date(String(v)) : null)
      } else if (k === 'is_active') {
        sets.push(`${k} = ?`)
        params.push(v ? 1 : 0)
      } else {
        sets.push(`${k} = ?`)
        params.push(v ?? null)
      }
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')
    const sql = `UPDATE ride_employees SET ${sets.join(', ')} WHERE id = ?`
    params.push(id)
    await prisma.$executeRawUnsafe(sql, ...params)

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, profile_id, department, position, employment_type,
             DATE_FORMAT(hire_date, '%Y-%m-%d') AS hire_date,
             DATE_FORMAT(resign_date, '%Y-%m-%d') AS resign_date,
             phone, email, color_tone, group_label, memo,
             public_token, public_token_issued_at,
             is_active, created_at, updated_at
      FROM ride_employees WHERE id = ${id} LIMIT 1
    `
    const data = rows[0] ? { ...rows[0], is_active: Boolean(rows[0].is_active) } : null
    return NextResponse.json({ data: serialize(data), error: null })
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
    // soft delete — is_active=0, resign_date=오늘
    await prisma.$executeRaw`
      UPDATE ride_employees
      SET is_active = 0,
          resign_date = COALESCE(resign_date, CURDATE()),
          updated_at = NOW()
      WHERE id = ${id}
    `
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
