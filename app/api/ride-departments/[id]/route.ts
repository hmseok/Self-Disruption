// ═══════════════════════════════════════════════════════════════════
// GET    /api/ride-departments/[id] — 부서 상세
// PATCH  /api/ride-departments/[id] — 부서 갱신
// DELETE /api/ride-departments/[id] — soft delete (직원 남아있으면 차단)
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
  'name', 'parent_id', 'leader_employee_id', 'color_tone', 'sort_order', 'description', 'is_active',
])
const COLOR_TONES = new Set(['blue', 'gray', 'green', 'amber', 'violet', 'red', 'slate', 'none'])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id } = await context.params
    const rows = await prisma.$queryRaw<any[]>`
      SELECT rd.id, rd.name, rd.parent_id, rd.leader_employee_id,
             rd.color_tone, rd.sort_order, rd.description,
             rd.is_active, rd.created_at, rd.updated_at,
             ldr.name AS leader_name,
             (SELECT COUNT(*) FROM ride_employees re
               WHERE re.department_id = rd.id AND re.is_active = 1) AS employee_count
        FROM ride_departments rd
        LEFT JOIN ride_employees ldr ON ldr.id = rd.leader_employee_id
       WHERE rd.id = ${id} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: '부서를 찾을 수 없습니다.' }, { status: 404 })
    }
    const data = {
      ...rows[0],
      is_active: Boolean(rows[0].is_active),
      employee_count: Number(rows[0].employee_count || 0),
    }
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
      if (k === 'is_active') {
        sets.push(`${k} = ?`)
        params.push(v ? 1 : 0)
      } else if (k === 'sort_order') {
        sets.push(`${k} = ?`)
        params.push(Number.isFinite(Number(v)) ? Number(v) : 0)
      } else if (k === 'parent_id' && v === id) {
        // 자기 자신을 부모로 설정 차단
        return NextResponse.json({ error: '자기 자신을 부모로 설정할 수 없습니다.' }, { status: 400 })
      } else {
        sets.push(`${k} = ?`)
        params.push(v ?? null)
      }
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')
    const sql = `UPDATE ride_departments SET ${sets.join(', ')} WHERE id = ?`
    params.push(id)
    await prisma.$executeRawUnsafe(sql, ...params)

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, parent_id, leader_employee_id, color_tone, sort_order, description,
             is_active, created_at, updated_at
        FROM ride_departments WHERE id = ${id} LIMIT 1
    `
    const data = rows[0] ? { ...rows[0], is_active: Boolean(rows[0].is_active) } : null
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    if (/Duplicate entry/i.test(String(e?.message))) {
      return NextResponse.json({ error: '같은 이름의 부서가 이미 존재합니다.' }, { status: 409 })
    }
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// soft delete — is_active=0
// 안전 가드:
//   1) 활성 직원이 남아있으면 차단 (Rule 14 — 동형 패턴: ride_employees.id soft delete 와 같은 의미)
//   2) 자식 부서가 활성 상태면 차단
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { id } = await context.params

    // 가드 1: 활성 직원 카운트
    const empRows = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) AS cnt FROM ride_employees WHERE department_id = ${id} AND is_active = 1
    `
    const empCount = Number(empRows[0]?.cnt || 0)
    if (empCount > 0) {
      return NextResponse.json({
        error: `해당 부서에 활성 직원 ${empCount}명이 남아있습니다. 다른 부서로 이동 후 삭제해주세요.`
      }, { status: 409 })
    }

    // 가드 2: 활성 자식 부서 카운트
    const childRows = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) AS cnt FROM ride_departments WHERE parent_id = ${id} AND is_active = 1
    `
    const childCount = Number(childRows[0]?.cnt || 0)
    if (childCount > 0) {
      return NextResponse.json({
        error: `해당 부서에 하위 부서 ${childCount}개가 남아있습니다. 하위 부서 정리 후 삭제해주세요.`
      }, { status: 409 })
    }

    // soft delete
    await prisma.$executeRaw`
      UPDATE ride_departments SET is_active = 0, updated_at = NOW() WHERE id = ${id}
    `
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
