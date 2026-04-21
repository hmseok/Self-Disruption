import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/profiles — 프로필 목록 (단독 ERP: company_id 불필요)
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const isActive = searchParams.get('is_active')

    // profiles 기본 SELECT + positions/departments LEFT JOIN
    // UI는 emp.position?.name / emp.department?.name 형태를 기대하므로 서브오브젝트로 감싼다.
    const conditions: string[] = []
    if (isActive === 'true') conditions.push('p.is_active = 1')
    else if (isActive === 'false') conditions.push('p.is_active = 0')
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // JOIN 실패 시 폴백 쿼리 준비
    let data: any[] = []
    try {
      data = await prisma.$queryRawUnsafe<any[]>(`
        SELECT p.*,
               pos.id   AS _pos_id,   pos.name   AS _pos_name,   pos.level AS _pos_level,
               dept.id  AS _dept_id,  dept.name  AS _dept_name
        FROM profiles p
        LEFT JOIN positions   pos  ON p.position_id   = pos.id
        LEFT JOIN departments dept ON p.department_id = dept.id
        ${whereSql}
        ORDER BY COALESCE(p.employee_name, p.name, p.email)
      `)
    } catch (joinErr: any) {
      console.warn('[profiles] JOIN 실패, 기본 SELECT 폴백:', joinErr?.message)
      const fallbackSql = `SELECT * FROM profiles ${whereSql.replace(/\bp\./g,'')} ORDER BY COALESCE(employee_name, name, email)`
      data = await prisma.$queryRawUnsafe<any[]>(fallbackSql)
    }

    const mapped = (data || []).map((p: any) => {
      // 이메일 로컬파트 폴백 (employee_name/name 둘 다 null이어도 미설정 표시 방지)
      const fallbackName = p.employee_name || p.name || (p.email ? String(p.email).split('@')[0] : '')
      const position = p._pos_id ? { id: p._pos_id, name: p._pos_name, level: p._pos_level } : null
      const department = p._dept_id ? { id: p._dept_id, name: p._dept_name } : null
      // 언더스코어 임시 필드 제거
      const { _pos_id, _pos_name, _pos_level, _dept_id, _dept_name, ...rest } = p
      return {
        ...rest,
        employee_name: fallbackName,
        position,
        department,
      }
    })
    return NextResponse.json({ data: serialize(mapped), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/profiles
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    const fields = ['email', 'name', 'phone', 'position', 'department', 'role', 'is_active']
    const cols = ['id', ...fields.filter(f => body[f] !== undefined)]
    const vals = [id, ...fields.filter(f => body[f] !== undefined).map(f => body[f] ?? null)]

    await prisma.$executeRawUnsafe(
      `INSERT INTO profiles (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, NOW(), NOW())`,
      ...vals
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]), error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
