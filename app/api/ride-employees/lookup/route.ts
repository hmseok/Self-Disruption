// ═══════════════════════════════════════════════════════════════════
// GET /api/ride-employees/lookup?email=&name=
//   이메일/이름으로 ride_employee 후보 list (최대 20)
//
// PR-HR-6 (2026-05-26, hr 세션) — 매핑 헬퍼 API.
// 메인 세션 PR-MULTI-BRAND P3+d (FMI 「라이드주식회사」 폐기) 의존:
//   FMI 외부 매니저 row 의 이메일/이름 → ride_employees 매칭 후보.
//   email 우선 (정확 매칭, LOWER 비교), name 차순 (정확 일치).
//   둘 다 비어있으면 400.
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const email = (sp.get('email') || '').trim()
    const name = (sp.get('name') || '').trim()
    const includeInactive = sp.get('include_inactive') === '1'

    if (!email && !name) {
      return NextResponse.json({ error: 'email 또는 name 쿼리 필요' }, { status: 400 })
    }

    const where: string[] = []
    const params: any[] = []
    if (!includeInactive) where.push('re.is_active = 1')
    if (email) { where.push('LOWER(re.email) = LOWER(?)'); params.push(email) }
    if (name) { where.push('re.name = ?'); params.push(name) }
    const whereSql = 'WHERE ' + where.join(' AND ')

    const sql = `
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
        ${whereSql}
       ORDER BY re.is_active DESC, re.name ASC
       LIMIT 20
    `
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
    const data = rows.map(r => ({ ...r, is_active: Boolean(r.is_active) }))
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
