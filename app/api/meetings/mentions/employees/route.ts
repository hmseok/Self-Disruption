import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/mentions/employees — @멘션 후보 검색 (PR-MTG-V2-C-Ride)
//
// 데이터 소스: ride_employees (Ride Inc. 인사 마스터 — /hr/people 동일)
// → 기존 /api/meetings/mentions/profiles 대체 (profiles = 인증 계정 ≠ 직원)
//
// GET ?q=&limit= → [{ id, name, department, position, employment_type, color_tone, group_label, profile_id }]
// 활성 직원만 (is_active = 1), 이름 prefix 우선 + 부서/직책 부분 매칭
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)))

    if (!q) {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, department, position, employment_type, color_tone, group_label, profile_id
           FROM ride_employees
          WHERE is_active = 1
            AND name IS NOT NULL AND name <> ''
          ORDER BY name ASC
          LIMIT ?`,
        limit
      )
      return NextResponse.json({ data: serialize(rows), error: null })
    }

    const like = `${q}%`
    const fuzzy = `%${q}%`
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, department, position, employment_type, color_tone, group_label, profile_id,
              CASE WHEN name LIKE ? THEN 0 ELSE 1 END AS match_prio
         FROM ride_employees
        WHERE is_active = 1
          AND name IS NOT NULL AND name <> ''
          AND (name LIKE ? OR department LIKE ? OR position LIKE ? OR group_label LIKE ?)
        ORDER BY match_prio ASC, name ASC
        LIMIT ?`,
      like, fuzzy, fuzzy, fuzzy, fuzzy, limit
    )
    const out = rows.map(({ match_prio, ...rest }) => rest)
    return NextResponse.json({ data: serialize(out), error: null })
  } catch (e: any) {
    console.error('[GET /api/meetings/mentions/employees]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
