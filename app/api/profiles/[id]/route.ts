import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

/**
 * PATCH /api/profiles/[id]
 * 직원(프로필) 정보 수정
 *
 * 실제 DB 컬럼: id, email, name, phone, role, avatar_url, is_active, is_approved,
 *               password_hash, department, position, is_super_admin, status,
 *               position_id, department_id, employee_name, withdrawn_at, withdrawn_by,
 *               team, regions, availability, max_cases, specialities
 *
 * 동적 UPDATE — 전달된 필드만, 존재 컬럼만 업데이트.
 * employee_name 은 name 과 동기화 (둘 다 존재하는 경우 둘 다 업데이트).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const body = await request.json()

    // role 변경 시 권한 검증: admin/master만 role 변경 가능, admin 역할은 admin만 부여 가능
    if ('role' in body) {
      if (!['admin', 'master'].includes(user.role)) {
        return NextResponse.json({ error: '역할 변경은 관리자만 가능합니다.' }, { status: 403 })
      }
      if (body.role === 'admin' && user.role !== 'admin') {
        return NextResponse.json({ error: 'admin 역할은 최고관리자만 부여할 수 있습니다.' }, { status: 403 })
      }
    }

    // 실제 존재 컬럼 감지 (스키마 드리프트 대응)
    const existingCols: string[] = (await prisma.$queryRawUnsafe<any[]>(
      `SHOW COLUMNS FROM profiles`
    )).map((c: any) => c.Field)

    // 화이트리스트 (클라이언트가 임의 컬럼 덮어쓰기 방지)
    const allowed = [
      'name', 'employee_name', 'email', 'phone',
      'role', 'is_active', 'is_approved', 'status',
      'department', 'position', 'department_id', 'position_id',
      'avatar_url', 'team', 'regions', 'availability', 'max_cases', 'specialities',
    ]

    const sets: string[] = []
    const values: any[] = []

    // name ↔ employee_name 동기화: body.employee_name 만 주어진 경우 name에도 반영
    const nameValue = body.employee_name ?? body.name
    if (nameValue !== undefined) {
      if (existingCols.includes('name')) {
        sets.push('name = ?')
        values.push(nameValue === '' ? null : nameValue)
      }
      if (existingCols.includes('employee_name')) {
        sets.push('employee_name = ?')
        values.push(nameValue === '' ? null : nameValue)
      }
    }

    for (const key of allowed) {
      if (key === 'name' || key === 'employee_name') continue // 위에서 처리
      if (key in body && existingCols.includes(key)) {
        sets.push(`${key} = ?`)
        let v = body[key]
        if (v === '') v = null
        if (typeof v === 'boolean') v = v ? 1 : 0
        values.push(v)
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ data: { id }, error: null })
    }
    if (existingCols.includes('updated_at')) {
      sets.push('updated_at = NOW()')
    }
    values.push(id)

    await prisma.$executeRawUnsafe(
      `UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`,
      ...values
    )

    const updated = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(updated[0]), error: null })
  } catch (e: any) {
    console.error('[PATCH /api/profiles/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * DELETE /api/profiles/[id]
 * 프로필 비활성 처리 (소프트 삭제 — 실제 row는 유지)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    await prisma.$executeRaw`
      UPDATE profiles SET is_active = 0, withdrawn_at = NOW(), withdrawn_by = ${user.id}
      WHERE id = ${id}
    `
    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[DELETE /api/profiles/[id]]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * GET /api/profiles/[id]
 * 단일 프로필 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const { id } = await params

    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(rows[0] || null), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
