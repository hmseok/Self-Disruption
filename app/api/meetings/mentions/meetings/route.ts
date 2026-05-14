import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// /api/meetings/mentions/meetings — #회의 멘션 후보 검색 (PR-MTG-V2-C-2)
//
// GET ?q=&limit= → [{ id, title, meeting_date, type, organizer_name }]
// deleted_at IS NULL 만, 제목 prefix 우선 + 안건/요약 부분 매칭
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
        `SELECT m.id, m.title, m.meeting_date, m.type,
                p.name AS organizer_name
           FROM meetings m
           LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = m.organizer_id COLLATE utf8mb4_unicode_ci
          WHERE m.deleted_at IS NULL
          ORDER BY COALESCE(m.meeting_date, m.created_at) DESC
          LIMIT ?`,
        limit
      )
      return NextResponse.json({ data: serialize(rows), error: null })
    }

    const like = `${q}%`
    const fuzzy = `%${q}%`
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT m.id, m.title, m.meeting_date, m.type,
              p.name AS organizer_name,
              CASE WHEN m.title LIKE ? THEN 0 ELSE 1 END AS match_prio
         FROM meetings m
         LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = m.organizer_id COLLATE utf8mb4_unicode_ci
        WHERE m.deleted_at IS NULL
          AND (m.title LIKE ? OR m.agenda LIKE ? OR m.summary LIKE ?)
        ORDER BY match_prio ASC, COALESCE(m.meeting_date, m.created_at) DESC
        LIMIT ?`,
      like, fuzzy, fuzzy, fuzzy, limit
    )
    const out = rows.map(({ match_prio, ...rest }) => rest)
    return NextResponse.json({ data: serialize(out), error: null })
  } catch (e: any) {
    console.error('[GET /api/meetings/mentions/meetings]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
