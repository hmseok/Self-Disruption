import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/mentions/employees — @멘션 후보 검색 + 참석자 picker 로스터
//
// 데이터 소스: ride_employees (Ride Inc. 인사 마스터 — /hr/people 동일)
// → 기존 /api/meetings/mentions/profiles 대체 (profiles = 인증 계정 ≠ 직원)
//
// GET ?q=&limit= → [{ id, name, department, position, employment_type, color_tone, group_label, profile_id }]
// 활성 직원만 (is_active = 1), 이름 prefix 우선 + 부서/직책 부분 매칭
//
// 호출 패턴:
//   · @멘션 autocomplete (MentionEmployee.ts) — ?q=홍&limit=10 (검색)
//   · 참석자 picker / 멘션 캐시 (MeetingsLayoutV2) — ?limit=200 (전체 로스터)
//
// hotfix #8 (2026-05-26) — 캡 20 → 500 상향:
//   기존 Math.min(20, ...) 가 클라이언트 limit=200 요청을 사일런트로 20 으로 깎아서,
//   인사마스터 인원 20+ 가 되면 참석자 picker 에서 잘리는 잠재 버그. 외부/CX 합치며 늘어날 예정.
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
    // hotfix #8 — 캡 20 → 500 (참석자 picker 전체 로스터 지원)
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)))

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
