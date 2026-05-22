/**
 * /api/ride-assets/[id]/logs
 *
 * GET — 자산 변경/매칭 이력 (시계열 DESC)
 *       권한자 또는 본인 매칭자만 조회.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isAssetAdmin } from '@/lib/ride-asset-perm'

interface LogRow {
  id: number | string
  asset_id: string
  action: string
  from_user_id: string | null
  from_user_name: string | null
  to_user_id: string | null
  to_user_name: string | null
  from_status: string | null
  to_status: string | null
  from_location: string | null
  to_location: string | null
  by_user_id: string | null
  by_user_name: string | null
  note: string | null
  created_at: Date | string
}

interface Ctx { params: Promise<{ id: string }> }

export async function GET(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    // 권한 체크 — 권한자 또는 본인 매칭자
    const asset = await prisma.$queryRaw<Array<{ assigned_user_id: string | null }>>`
      SELECT assigned_user_id FROM ride_assets WHERE id = ${id} LIMIT 1
    `
    if (!asset.length) return NextResponse.json({ success: false, data: [], error: 'not found' }, { status: 404 })

    const isAdmin = await isAssetAdmin(user)
    if (!isAdmin && asset[0].assigned_user_id !== user.id) {
      return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })
    }

    const rows = await prisma.$queryRaw<LogRow[]>`
      SELECT l.id, l.asset_id, l.action,
             l.from_user_id,
             ufrom.name AS from_user_name,
             l.to_user_id,
             uto.name AS to_user_name,
             l.from_status, l.to_status,
             l.from_location, l.to_location,
             l.by_user_id,
             uby.name AS by_user_name,
             l.note, l.created_at
        FROM ride_asset_logs l
        LEFT JOIN profiles ufrom ON ufrom.id = l.from_user_id
        LEFT JOIN profiles uto ON uto.id = l.to_user_id
        LEFT JOIN profiles uby ON uby.id = l.by_user_id
       WHERE l.asset_id = ${id}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 200
    `

    // BigInt → string (MySQL AUTO_INCREMENT 가 bigint 로 반환될 수 있음)
    const serialized = rows.map(r => ({ ...r, id: String(r.id) }))

    return NextResponse.json({ success: true, data: serialized, meta: { count: serialized.length } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes("doesn't exist") && err.message.includes('ride_asset')) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: true, migration: '2026-05-14_ride_assets.sql' },
      })
    }
    console.error('[/api/ride-assets/:id/logs GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}
