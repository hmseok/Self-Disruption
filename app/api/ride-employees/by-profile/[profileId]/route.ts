// ═══════════════════════════════════════════════════════════════════
// GET /api/ride-employees/by-profile/[profileId]
//   profile_id → ride_employee 1:1 조회 (없으면 null)
//
// PR-HR-6 (2026-05-26, hr 세션) — 매핑 헬퍼 API.
// 메인 세션 PR-MULTI-BRAND P3+b/c/d 의존 (회사 판별):
//   profileId → ride_employee 있으면 RIDE, 없으면 FMI.
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ profileId: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const { profileId } = await context.params
    if (!profileId) return NextResponse.json({ data: null, error: null })

    const rows = await prisma.$queryRaw<any[]>`
      SELECT re.id, re.name, re.profile_id,
             re.department, re.department_id, re.position, re.promotion_target,
             re.employment_type,
             DATE_FORMAT(re.hire_date, '%Y-%m-%d')   AS hire_date,
             DATE_FORMAT(re.resign_date, '%Y-%m-%d') AS resign_date,
             re.phone, re.email, re.color_tone, re.group_label, re.memo,
             re.is_active, re.created_at, re.updated_at,
             rd.name AS department_name, rd.color_tone AS department_color
        FROM ride_employees re
        LEFT JOIN ride_departments rd ON rd.id = re.department_id
       WHERE re.profile_id = ${profileId}
       LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ data: null, error: null })
    }
    const data = { ...rows[0], is_active: Boolean(rows[0].is_active) }
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
