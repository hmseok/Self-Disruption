/**
 * /api/ride-compliance/officers
 *
 * GET  — 컴플라이언스 3-tier 조직 매핑 list (role 필터, 현직만 기본)
 *        manager+ 권한 (handler 는 본인 row 만 반환)
 * POST — 임명·해임 변경 (cpo 만)
 *
 * 매뉴얼 근거: 통합본 5.17 제6조 (책임자 지정), 제9조 (취급자 범위).
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isCpo, isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface OfficerRow {
  id: string
  user_id: string
  role: string
  display_title: string | null
  business_unit: string | null
  appointed_at: Date | string
  released_at: Date | string | null
  is_active: number
  notes: string | null
  user_name: string | null
  created_at: Date | string
  updated_at: Date | string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  // handler 는 본인 row 만 — manager+ 는 전체
  const meOnly = role !== 'cpo' && role !== 'manager' && role !== 'incident_team'

  const url = new URL(request.url)
  const roleFilter = (url.searchParams.get('role') || '').trim()
  const includeReleased = url.searchParams.get('include_released') === '1'

  try {
    const rows = await prisma.$queryRaw<OfficerRow[]>`
      SELECT o.id, o.user_id, o.role,
             o.display_title, o.business_unit,
             o.appointed_at, o.released_at, o.is_active, o.notes,
             u.name AS user_name,
             o.created_at, o.updated_at
        FROM ride_compliance_officers o
        LEFT JOIN users u ON u.id = o.user_id
       WHERE (${meOnly ? user.id : '__ALL__'} = '__ALL__' OR o.user_id = ${user.id})
         AND (${roleFilter} = '' OR o.role = ${roleFilter})
         AND (${includeReleased ? 1 : 0} = 1 OR (o.is_active = 1 AND (o.released_at IS NULL OR o.released_at > CURDATE())))
       ORDER BY
         CASE o.role
           WHEN 'cpo' THEN 1
           WHEN 'manager' THEN 2
           WHEN 'incident_team' THEN 3
           WHEN 'handler' THEN 4
           ELSE 9
         END,
         o.appointed_at DESC
       LIMIT 500
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, my_role: role, me_only: meOnly },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true, migration: '2026-05-18_ride_compliance_phase11.sql', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/officers GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isCpo(user))) {
    // 본 모듈 첫 임명 (officers 테이블이 비어있을 때) 은 시스템 admin 만 가능 — isCpo 가 admin role 통과시킴
    // 첫 임명 후에는 oncoming cpo 가 추가 임명 가능
    return NextResponse.json({ success: false, error: 'forbidden — CPO 또는 시스템 관리자만 임명 가능' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const userId = String(body.user_id || '').trim()
  const role = String(body.role || '').trim()
  const displayTitle = body.display_title ? String(body.display_title).trim() : null
  const businessUnit = body.business_unit ? String(body.business_unit).trim() : null
  const appointedAt = body.appointed_at ? String(body.appointed_at).trim() : null
  const releasedAt = body.released_at ? String(body.released_at).trim() : null
  const notes = body.notes ? String(body.notes) : null

  if (!userId) return NextResponse.json({ success: false, error: 'user_id 필수' }, { status: 400 })
  if (!['cpo', 'manager', 'handler', 'incident_team'].includes(role)) {
    return NextResponse.json({ success: false, error: 'role 은 cpo/manager/handler/incident_team 중 하나' }, { status: 400 })
  }
  if (!appointedAt) return NextResponse.json({ success: false, error: 'appointed_at 필수' }, { status: 400 })

  try {
    const id = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_officers
        (id, user_id, role, display_title, business_unit, appointed_at, released_at, is_active, notes)
      VALUES
        (${id}, ${userId}, ${role}, ${displayTitle}, ${businessUnit}, ${appointedAt}, ${releasedAt}, 1, ${notes})
    `
    const [row] = await prisma.$queryRaw<OfficerRow[]>`
      SELECT o.id, o.user_id, o.role,
             o.display_title, o.business_unit,
             o.appointed_at, o.released_at, o.is_active, o.notes,
             u.name AS user_name,
             o.created_at, o.updated_at
        FROM ride_compliance_officers o
        LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = ${id}
       LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/officers POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
