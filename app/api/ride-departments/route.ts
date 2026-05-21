// ═══════════════════════════════════════════════════════════════════
// GET  /api/ride-departments — 부서 목록 (트리 단일 레벨, 매니저 이름 JOIN)
// POST /api/ride-departments — 신규 부서
// ═══════════════════════════════════════════════════════════════════
//
// 본 라우트는 라이드케어 (외주) 부서 마스터.
// FMI 본사 부서는 /api/departments (RBAC) 와 별개.
//
// Rule 23 graceful fallback: 테이블 미적용 시 빈 배열 + _migration_pending=true
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

const COLOR_TONES = new Set(['blue', 'gray', 'green', 'amber', 'violet', 'red', 'slate', 'none'])

// graceful fallback — 테이블 미적용 시
function migrationPending(err: any): boolean {
  const msg = String(err?.message || '')
  return /ride_departments.*doesn'?t exist/i.test(msg) || /Table.*ride_departments/i.test(msg)
}

// ───────────────────────────────────────────────────────────────────
// GET /api/ride-departments
//   ?include_inactive=1  비활성도 포함
//   ?parent_id=<uuid>    특정 부모 부서의 자식만
//   응답: { data: [...], error: null }
//        부서 각 row 에 employee_count (활성 직원 수) 포함
// ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const includeInactive = sp.get('include_inactive') === '1'
    const parentId = sp.get('parent_id')

    const where: string[] = []
    const params: any[] = []
    if (!includeInactive) where.push('rd.is_active = 1')
    if (parentId === 'null') {
      where.push('rd.parent_id IS NULL')
    } else if (parentId) {
      where.push('rd.parent_id = ?')
      params.push(parentId)
    }
    const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''

    // 부서장 이름 JOIN + 활성 직원 수 집계 (LEFT JOIN — 부서장 미지정 부서도 표시)
    const sql = `
      SELECT
        rd.id, rd.name, rd.parent_id, rd.leader_employee_id,
        rd.color_tone, rd.sort_order, rd.description,
        rd.is_active, rd.created_at, rd.updated_at,
        ldr.name AS leader_name,
        (
          SELECT COUNT(*) FROM ride_employees re
           WHERE re.department_id = rd.id AND re.is_active = 1
        ) AS employee_count
      FROM ride_departments rd
      LEFT JOIN ride_employees ldr ON ldr.id = rd.leader_employee_id
      ${whereSql}
      ORDER BY rd.sort_order ASC, rd.name ASC
    `
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
    const data = rows.map(r => ({
      ...r,
      is_active: Boolean(r.is_active),
      employee_count: Number(r.employee_count || 0),
    }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    if (migrationPending(e)) {
      return NextResponse.json({ data: [], error: null, _migration_pending: true })
    }
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

// ───────────────────────────────────────────────────────────────────
// POST /api/ride-departments
//   body: { name, parent_id?, leader_employee_id?, color_tone?, sort_order?, description? }
//   응답: { data: { ...새 부서 row }, error: null }
// ───────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()
    const name = String(body?.name || '').trim()
    if (!name) return NextResponse.json({ error: '부서명은 필수' }, { status: 400 })

    const id = crypto.randomUUID()
    const parentId: string | null = body?.parent_id ?? null
    // leader_employee_id — body.leader_employee_id 우선, 하위호환으로 body.manager_id 도 허용
    const leaderEmployeeId: string | null = body?.leader_employee_id ?? body?.manager_id ?? null
    const colorTone: string = COLOR_TONES.has(body?.color_tone) ? body.color_tone : 'slate'
    const sortOrder: number = Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0
    const description: string | null = body?.description ?? null

    await prisma.$executeRaw`
      INSERT INTO ride_departments
        (id, name, parent_id, leader_employee_id, color_tone, sort_order, description, is_active, created_at, updated_at)
      VALUES
        (${id}, ${name}, ${parentId}, ${leaderEmployeeId}, ${colorTone}, ${sortOrder}, ${description}, 1, NOW(), NOW())
    `

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, parent_id, leader_employee_id, color_tone, sort_order, description,
             is_active, created_at, updated_at
        FROM ride_departments WHERE id = ${id} LIMIT 1
    `
    const created = rows[0] ? { ...rows[0], is_active: Boolean(rows[0].is_active) } : null
    return NextResponse.json({ data: serialize(created), error: null }, { status: 201 })
  } catch (e: any) {
    // UNIQUE 위반 — 같은 부서명 존재
    if (/Duplicate entry/i.test(String(e?.message))) {
      return NextResponse.json({ error: '같은 이름의 부서가 이미 존재합니다.' }, { status: 409 })
    }
    if (migrationPending(e)) {
      return NextResponse.json({ error: '마이그 미적용 — ride_departments 테이블 없음', _migration_pending: true }, { status: 503 })
    }
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
