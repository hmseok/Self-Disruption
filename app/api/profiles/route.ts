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

    // profiles 테이블 실제 컬럼: id, email, name, role, is_active, is_approved, phone, department, position, password_hash
    // employee_name/position_id/department_id 는 존재하지 않을 수 있으므로 SELECT * 사용
    let query = 'SELECT * FROM profiles'
    const conditions: string[] = []

    if (isActive === 'true') {
      conditions.push('is_active = 1')
    } else if (isActive === 'false') {
      conditions.push('is_active = 0')
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY name'

    const data = await prisma.$queryRawUnsafe<any[]>(query)
    // 하위 호환: employee_name 필드가 없으면 name으로 매핑
    const mapped = (data || []).map((p: any) => ({
      ...p,
      employee_name: p.employee_name || p.name || '',
    }))
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
