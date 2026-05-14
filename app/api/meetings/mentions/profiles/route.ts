import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/mentions/profiles — @멘션 후보 검색 (PR-MTG-V2-C-1)
//
// GET ?q=&limit= → [{ id, name, department, position }]
// 활성 직원만, 이름 prefix 매칭 우선 + 부서/직책 부분 매칭
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
      // 빈 쿼리 — 최근 활성 직원 top N
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, department, position
           FROM profiles
          WHERE (is_active IS NULL OR is_active = 1)
            AND name IS NOT NULL AND name <> ''
          ORDER BY name ASC
          LIMIT ?`,
        limit
      )
      return NextResponse.json({ data: serialize(rows), error: null })
    }

    // 이름 prefix 매칭 우선 + 이름/부서/직책 부분 매칭
    // ORDER BY prefix 우선 (CASE) → 그 다음 name ASC
    const like = `${q}%`
    const fuzzy = `%${q}%`
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, department, position,
              CASE WHEN name LIKE ? THEN 0 ELSE 1 END AS match_prio
         FROM profiles
        WHERE (is_active IS NULL OR is_active = 1)
          AND name IS NOT NULL AND name <> ''
          AND (name LIKE ? OR department LIKE ? OR position LIKE ?)
        ORDER BY match_prio ASC, name ASC
        LIMIT ?`,
      like, fuzzy, fuzzy, fuzzy, limit
    )
    // match_prio 필드는 응답에서 제거
    const out = rows.map(({ match_prio, ...rest }) => rest)
    return NextResponse.json({ data: serialize(out), error: null })
  } catch (e: any) {
    console.error('[GET /api/meetings/mentions/profiles]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
