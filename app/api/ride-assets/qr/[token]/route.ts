/**
 * /api/ride-assets/qr/[token]
 *
 * GET  — QR 스캔 시 자산 정보 조회 (인증 필수)
 * POST — 본인 매칭 자산(외부인력 로그인)의 location/notes 업데이트
 *
 * 매칭 모델 (PR-ASSETS-2.0): assigned_to_kind + assigned_to_id
 *   본인 판정 — freelancer.linked_profile_id === 로그인 user.id
 *   (ride_employees 는 로그인 연결 없음 → 권한자만 전체 정보)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isAssetAdmin } from '@/lib/ride-asset-perm'

interface AssetByQrRow {
  id: string
  asset_code: string
  category_code: string | null
  category_name: string | null
  category_emoji: string | null
  name: string
  status: string
  assigned_to_kind: string | null
  assigned_to_id: string | null
  assigned_user_name: string | null
  assigned_owner_profile_id: string | null
  location: string | null
  notes: string | null
  acquired_at: Date | string | null
}

interface Ctx { params: Promise<{ token: string }> }

function maskName(name: string | null): string {
  if (!name) return '***'
  if (name.length <= 1) return '*'
  return name[0] + '*'.repeat(Math.max(name.length - 1, 1))
}

async function loadByQr(token: string): Promise<AssetByQrRow | null> {
  const rows = await prisma.$queryRaw<AssetByQrRow[]>`
    SELECT a.id, a.asset_code,
           c.code AS category_code, c.name AS category_name, c.emoji AS category_emoji,
           a.name, a.status, a.assigned_to_kind, a.assigned_to_id,
           COALESCE(emp.name, fl.name) AS assigned_user_name,
           fl.linked_profile_id AS assigned_owner_profile_id,
           a.location, a.notes, a.acquired_at
      FROM ride_assets a
      LEFT JOIN ride_asset_categories c ON c.id = a.category_id
      LEFT JOIN ride_employees emp ON a.assigned_to_kind = 'employee'   AND emp.id = a.assigned_to_id
      LEFT JOIN freelancers     fl  ON a.assigned_to_kind = 'freelancer' AND fl.id  = a.assigned_to_id
     WHERE a.qr_token = ${token}
     LIMIT 1
  `
  return rows[0] || null
}

export async function GET(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { token } = await ctx.params
  try {
    const row = await loadByQr(token)
    if (!row) return NextResponse.json({ success: false, error: 'QR 토큰을 찾을 수 없습니다' }, { status: 404 })

    const isAdmin = await isAssetAdmin(user)
    const isOwner = row.assigned_owner_profile_id != null && row.assigned_owner_profile_id === user.id

    // 본인 자산 OR 권한자 OR 미할당(공통) → 전체 정보
    const fullView = isAdmin || isOwner || row.assigned_to_id === null
    const visible = fullView ? row : {
      ...row,
      assigned_user_name: maskName(row.assigned_user_name),
      notes: null,
    }

    return NextResponse.json({
      success: true,
      data: visible,
      meta: { is_admin: isAdmin, is_owner: isOwner, full_view: fullView },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes("doesn't exist") && err.message.includes('ride_asset')) {
      return NextResponse.json({
        success: false, error: '마이그레이션 미적용', meta: { _migration_pending: true },
      }, { status: 503 })
    }
    console.error('[/api/ride-assets/qr/:token GET]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { token } = await ctx.params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const nextLocation = body.location ? String(body.location).trim() : null
  const nextNotes = body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined

  try {
    const row = await loadByQr(token)
    if (!row) return NextResponse.json({ success: false, error: 'QR 토큰을 찾을 수 없습니다' }, { status: 404 })

    const isAdmin = await isAssetAdmin(user)
    const isOwner = row.assigned_owner_profile_id != null && row.assigned_owner_profile_id === user.id
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ success: false, error: '본인 매칭 자산만 위치 업데이트 가능' }, { status: 403 })
    }

    if (nextLocation !== row.location) {
      await prisma.$executeRaw`UPDATE ride_assets SET location = ${nextLocation} WHERE id = ${row.id}`
      await prisma.$executeRaw`
        INSERT INTO ride_asset_logs (asset_id, action, from_location, to_location, by_user_id, note)
        VALUES (${row.id}, 'location_update', ${row.location}, ${nextLocation}, ${user.id}, 'QR 스캔 페이지')
      `
    }
    if (nextNotes !== undefined) {
      await prisma.$executeRaw`UPDATE ride_assets SET notes = ${nextNotes} WHERE id = ${row.id}`
    }

    return NextResponse.json({ success: true, data: { id: row.id, location: nextLocation } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-assets/qr/:token POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
