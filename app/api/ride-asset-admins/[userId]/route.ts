/**
 * /api/ride-asset-admins/[userId]
 *
 * DELETE — 권한자 제거 (admin only)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface Ctx { params: Promise<{ userId: string }> }

export async function DELETE(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'forbidden — admin only' }, { status: 403 })
  }

  const { userId } = await ctx.params
  try {
    await prisma.$executeRaw`DELETE FROM ride_asset_admins WHERE user_id = ${userId}`
    return NextResponse.json({ success: true, data: { user_id: userId, removed: true } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-asset-admins/:userId DELETE]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
