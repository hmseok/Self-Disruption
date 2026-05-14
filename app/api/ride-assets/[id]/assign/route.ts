/**
 * /api/ride-assets/[id]/assign
 *
 * POST — 자산 사용자 매칭 변경 (권한자만)
 *
 * body: { user_id: string | null }   null 또는 '' 이면 공통 자산으로 전환 (unassigned)
 *
 * ride_asset_logs 에 'assigned' 또는 'unassigned' 1행 기록.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isAssetAdmin } from '@/lib/ride-asset-perm'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isAssetAdmin(user))) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const targetUserIdRaw = body.user_id
  const targetUserId = targetUserIdRaw && String(targetUserIdRaw).trim() ? String(targetUserIdRaw).trim() : null

  try {
    const rows = await prisma.$queryRaw<Array<{ assigned_user_id: string | null }>>`
      SELECT assigned_user_id FROM ride_assets WHERE id = ${id} LIMIT 1
    `
    if (!rows.length) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    const prev = rows[0].assigned_user_id

    if (prev === targetUserId) {
      return NextResponse.json({ success: true, data: { id, assigned_user_id: targetUserId, unchanged: true } })
    }

    await prisma.$executeRaw`
      UPDATE ride_assets SET assigned_user_id = ${targetUserId} WHERE id = ${id}
    `

    const action = targetUserId === null ? 'unassigned' : 'assigned'
    await prisma.$executeRaw`
      INSERT INTO ride_asset_logs (asset_id, action, from_user_id, to_user_id, by_user_id, note)
      VALUES (${id}, ${action}, ${prev}, ${targetUserId}, ${user.id}, NULL)
    `

    return NextResponse.json({ success: true, data: { id, assigned_user_id: targetUserId, action } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-assets/:id/assign POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
