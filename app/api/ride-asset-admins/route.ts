/**
 * /api/ride-asset-admins
 *
 * GET  — 권한자 목록 (admin only)
 * POST — 권한자 추가 (admin only)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { listAssetAdmins } from '@/lib/ride-asset-perm'

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })
  }

  try {
    const rows = await listAssetAdmins()
    return NextResponse.json({ success: true, data: rows, meta: null })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes("doesn't exist") && err.message.includes('ride_asset')) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: true, migration: '2026-05-14_ride_assets.sql' },
      })
    }
    console.error('[/api/ride-asset-admins GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'forbidden — admin only' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const userId = String(body.user_id || '').trim()
  const note = body.note ? String(body.note).trim() : null
  if (!userId) {
    return NextResponse.json({ success: false, error: 'user_id 필수' }, { status: 400 })
  }

  try {
    // 멱등 INSERT IGNORE — 이미 있으면 skip
    await prisma.$executeRaw`
      INSERT IGNORE INTO ride_asset_admins (user_id, granted_by, note)
      VALUES (${userId}, ${user.id}, ${note})
    `
    const rows = await prisma.$queryRaw<Array<{ user_id: string; granted_by: string | null; granted_at: Date | string; note: string | null }>>`
      SELECT user_id, granted_by, granted_at, note
        FROM ride_asset_admins WHERE user_id = ${userId} LIMIT 1
    `
    return NextResponse.json({ success: true, data: rows[0] || null })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-asset-admins POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
