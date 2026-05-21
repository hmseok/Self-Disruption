// ═══════════════════════════════════════════════════════════════════
// GET  /api/ride-employees — 직원 목록 (검색/필터)
// POST /api/ride-employees — 신규 직원 등록
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

// 2026-05-16 (PR-HR-2) — department_id / promotion_target 컬럼 추가 (JOIN 없음 — V1.5).
// 부서명은 호출측이 /api/ride-departments/tree 와 department_id 로 매핑.
const SELECT_COLS = `
  id, name, profile_id, department, department_id, position, promotion_target, employment_type,
  DATE_FORMAT(hire_date, '%Y-%m-%d')   AS hire_date,
  DATE_FORMAT(resign_date, '%Y-%m-%d') AS resign_date,
  phone, email, color_tone, group_label, memo,
  public_token, public_token_issued_at,
  is_active, created_at, updated_at
`

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const sp = request.nextUrl.searchParams
    const q = (sp.get('q') || '').trim()
    const dept = (sp.get('department') || '').trim()         // free text — backward compat
    const deptId = (sp.get('department_id') || '').trim()     // FK 기반 필터
    const includeInactive = sp.get('include_inactive') === '1'

    const where: string[] = []
    const params: any[] = []
    if (!includeInactive) where.push('is_active = 1')
    if (dept) { where.push('department = ?'); params.push(dept) }
    if (deptId) { where.push('department_id = ?'); params.push(deptId) }
    if (q) {
      where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)')
      const like = `%${q}%`
      params.push(like, like, like)
    }
    const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''
    const sql = `SELECT ${SELECT_COLS} FROM ride_employees ${whereSql} ORDER BY is_active DESC, department ASC, name ASC`
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
    const data = rows.map(r => ({ ...r, is_active: Boolean(r.is_active) }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

const COLOR_TONES = ['blue', 'gray', 'green', 'amber', 'violet', 'red', 'none'] as const

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const name: string = String(body?.name || '').trim()
    if (!name) return NextResponse.json({ error: '이름은 필수' }, { status: 400 })

    const id = crypto.randomUUID()
    const department: string | null = body?.department ?? null
    const department_id: string | null = body?.department_id ?? null    // PR-HR-2
    const position: string | null = body?.position ?? null
    const promotion_target: string | null = body?.promotion_target ?? null  // PR-HR-2
    const employment_type: string | null = body?.employment_type ?? null
    const hire_date: string | null = body?.hire_date ?? null
    const phone: string | null = body?.phone ?? null
    const email: string | null = body?.email ?? null
    const color_tone: string = COLOR_TONES.includes(body?.color_tone) ? body.color_tone : 'none'
    const group_label: string | null = body?.group_label ?? null
    const memo: string | null = body?.memo ?? null
    const profile_id: string | null = body?.profile_id ?? null

    await prisma.$executeRaw`
      INSERT INTO ride_employees
        (id, name, profile_id, department, department_id, position, promotion_target,
         employment_type, hire_date, phone, email, color_tone, group_label, memo,
         is_active, created_at, updated_at)
      VALUES
        (${id}, ${name}, ${profile_id}, ${department}, ${department_id}, ${position}, ${promotion_target},
         ${employment_type}, ${hire_date ? new Date(hire_date) : null},
         ${phone}, ${email}, ${color_tone}, ${group_label}, ${memo}, 1, NOW(), NOW())
    `
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, profile_id, department, department_id, position, promotion_target, employment_type,
             DATE_FORMAT(hire_date, '%Y-%m-%d') AS hire_date,
             DATE_FORMAT(resign_date, '%Y-%m-%d') AS resign_date,
             phone, email, color_tone, group_label, memo,
             public_token, public_token_issued_at,
             is_active, created_at, updated_at
      FROM ride_employees WHERE id = ${id} LIMIT 1
    `
    const created = rows[0] ? { ...rows[0], is_active: Boolean(rows[0].is_active) } : null
    return NextResponse.json({ data: serialize(created), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
