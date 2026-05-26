/**
 * /api/ride-assets/profile-options
 *
 * GET — 권한자(자산 관리자) 지정 대상 목록 = 활성 로그인 계정(profiles)
 *       권한자는 로그인하여 자산을 관리하므로 profiles 계정이어야 함.
 *       (ride_employees 는 로그인 계정이 아니라 권한자 대상 아님)
 *
 * admin 전용.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface ProfileOption {
  id: string
  name: string
  department: string | null
  role: string | null
  is_admin_already: boolean
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ success: false, data: [], error: 'forbidden — admin only' }, { status: 403 })
  }

  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string
      name: string | null
      employee_name: string | null
      email: string | null
      department: string | null
      role: string | null
    }>>`
      SELECT id, name, employee_name, email, department, role
        FROM profiles
       WHERE is_active = 1
       ORDER BY COALESCE(NULLIF(name, ''), employee_name, email)
    `

    // 이미 권한자로 등록된 user_id 표시용
    let existingAdminIds = new Set<string>()
    try {
      const admins = await prisma.$queryRaw<Array<{ user_id: string }>>`
        SELECT user_id FROM ride_asset_admins
      `
      existingAdminIds = new Set(admins.map(a => a.user_id))
    } catch { /* 테이블 미적용 시 무시 */ }

    const data: ProfileOption[] = rows.map(r => ({
      id: r.id,
      name: (r.name && r.name.trim()) || r.employee_name || r.email || '(이름 미정)',
      department: r.department,
      role: r.role,
      is_admin_already: existingAdminIds.has(r.id),
    }))

    return NextResponse.json({ success: true, data, meta: { count: data.length } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-assets/profile-options GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}
