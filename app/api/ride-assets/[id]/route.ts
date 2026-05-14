/**
 * /api/ride-assets/[id]
 *
 * GET    — 자산 상세 (권한자 또는 본인 매칭자)
 * PATCH  — 자산 수정 (권한자: 전체 필드 / 일반 사용자: 본인거 location/notes 만)
 * DELETE — 자산 삭제 (권한자만, 보통 status='disposed' 권장)
 *
 * 변경 시 ride_asset_logs 에 적절한 action 자동 기록.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isAssetAdmin } from '@/lib/ride-asset-perm'

interface AssetFullRow {
  id: string
  asset_code: string
  category_id: string
  category_code: string | null
  category_name: string | null
  category_emoji: string | null
  name: string
  acquired_at: Date | string | null
  acquired_cost: string | null
  status: string
  assigned_user_id: string | null
  assigned_user_name: string | null
  location: string | null
  notes: string | null
  qr_token: string
  disposed_at: Date | string | null
  disposed_reason: string | null
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface Ctx { params: Promise<{ id: string }> }

async function loadAsset(id: string): Promise<AssetFullRow | null> {
  const rows = await prisma.$queryRaw<AssetFullRow[]>`
    SELECT a.id, a.asset_code, a.category_id,
           c.code AS category_code, c.name AS category_name, c.emoji AS category_emoji,
           a.name, a.acquired_at, CAST(a.acquired_cost AS CHAR) AS acquired_cost,
           a.status,
           a.assigned_user_id,
           u.name AS assigned_user_name,
           a.location, a.notes, a.qr_token,
           a.disposed_at, a.disposed_reason,
           a.created_by, a.created_at, a.updated_at
      FROM ride_assets a
      LEFT JOIN ride_asset_categories c ON c.id = a.category_id
      LEFT JOIN users u ON u.id = a.assigned_user_id
     WHERE a.id = ${id}
     LIMIT 1
  `
  return rows[0] || null
}

export async function GET(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const row = await loadAsset(id)
    if (!row) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })

    const isAdmin = await isAssetAdmin(user)
    if (!isAdmin && row.assigned_user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'forbidden — 본인 매칭 자산만 조회 가능' }, { status: 403 })
    }

    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true, data: null,
        meta: { _migration_pending: true, migration: '2026-05-14_ride_assets.sql' },
      })
    }
    console.error('[/api/ride-assets/:id GET]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  try {
    const before = await loadAsset(id)
    if (!before) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })

    const isAdmin = await isAssetAdmin(user)
    const isOwner = before.assigned_user_id === user.id

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
    }

    // 일반 사용자(본인) — location, notes 만 변경 가능
    const nextLocation = body.location !== undefined ? (body.location ? String(body.location).trim() : null) : undefined
    const nextNotes = body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined

    // 권한자 전용 필드
    const nextName = isAdmin && body.name !== undefined ? String(body.name).trim() : undefined
    const nextStatus = isAdmin && body.status !== undefined ? String(body.status).trim() : undefined
    const nextCategoryId = isAdmin && body.category_id !== undefined ? String(body.category_id).trim() : undefined
    const nextAcquiredAt = isAdmin && body.acquired_at !== undefined ? (body.acquired_at ? String(body.acquired_at) : null) : undefined
    const nextAcquiredCost = isAdmin && body.acquired_cost !== undefined ? (body.acquired_cost != null && body.acquired_cost !== '' ? String(body.acquired_cost) : null) : undefined
    const nextDisposedReason = isAdmin && body.disposed_reason !== undefined ? (body.disposed_reason ? String(body.disposed_reason).trim() : null) : undefined

    // 일반 사용자는 본인 자산 location/notes 만 — 다른 필드 거부
    if (!isAdmin) {
      const banned = ['name', 'status', 'category_id', 'acquired_at', 'acquired_cost', 'assigned_user_id', 'disposed_reason']
      if (banned.some(k => body[k] !== undefined)) {
        return NextResponse.json({ success: false, error: '권한자만 변경 가능한 필드가 포함됨' }, { status: 403 })
      }
    }

    // UPDATE 분기 (변경된 컬럼만)
    if (nextName !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET name = ${nextName} WHERE id = ${id}`
    if (nextCategoryId !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET category_id = ${nextCategoryId} WHERE id = ${id}`
    if (nextAcquiredAt !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET acquired_at = ${nextAcquiredAt} WHERE id = ${id}`
    if (nextAcquiredCost !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET acquired_cost = ${nextAcquiredCost} WHERE id = ${id}`
    if (nextLocation !== undefined && nextLocation !== before.location) {
      await prisma.$executeRaw`UPDATE ride_assets SET location = ${nextLocation} WHERE id = ${id}`
      await prisma.$executeRaw`
        INSERT INTO ride_asset_logs (asset_id, action, from_location, to_location, by_user_id, note)
        VALUES (${id}, 'location_update', ${before.location}, ${nextLocation}, ${user.id}, NULL)
      `
    }
    if (nextNotes !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET notes = ${nextNotes} WHERE id = ${id}`

    if (nextStatus !== undefined && nextStatus !== before.status) {
      await prisma.$executeRaw`UPDATE ride_assets SET status = ${nextStatus} WHERE id = ${id}`
      if (nextStatus === 'disposed') {
        await prisma.$executeRaw`
          UPDATE ride_assets SET disposed_at = NOW(), disposed_reason = ${nextDisposedReason}
           WHERE id = ${id}
        `
        await prisma.$executeRaw`
          INSERT INTO ride_asset_logs (asset_id, action, from_status, to_status, by_user_id, note)
          VALUES (${id}, 'disposed', ${before.status}, 'disposed', ${user.id}, ${nextDisposedReason})
        `
      } else {
        if (before.status === 'disposed' && nextStatus === 'active') {
          await prisma.$executeRaw`
            UPDATE ride_assets SET disposed_at = NULL, disposed_reason = NULL WHERE id = ${id}
          `
          await prisma.$executeRaw`
            INSERT INTO ride_asset_logs (asset_id, action, from_status, to_status, by_user_id, note)
            VALUES (${id}, 'restored', ${before.status}, ${nextStatus}, ${user.id}, NULL)
          `
        } else {
          await prisma.$executeRaw`
            INSERT INTO ride_asset_logs (asset_id, action, from_status, to_status, by_user_id, note)
            VALUES (${id}, 'status_change', ${before.status}, ${nextStatus}, ${user.id}, NULL)
          `
        }
      }
    }

    const after = await loadAsset(id)
    return NextResponse.json({ success: true, data: after })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-assets/:id PATCH]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isAssetAdmin(user))) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  try {
    // 실제 삭제 — 로그도 함께 (CASCADE 아님 — 명시적 삭제)
    await prisma.$executeRaw`DELETE FROM ride_asset_logs WHERE asset_id = ${id}`
    const result = await prisma.$executeRaw`DELETE FROM ride_assets WHERE id = ${id}`
    return NextResponse.json({ success: true, data: { id, deleted: true, rows: Number(result) } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-assets/:id DELETE]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
