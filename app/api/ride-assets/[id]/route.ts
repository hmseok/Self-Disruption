/**
 * /api/ride-assets/[id]
 *
 * GET    — 자산 상세 (권한자 또는 본인 매칭 외부인력)
 * PATCH  — 자산 수정 (권한자 전용 — 일반 사용자 편집은 QR 페이지로 일원화)
 * DELETE — 자산 삭제 (권한자만)
 *
 * 매칭 모델 (PR-ASSETS-2.0): assigned_to_kind + assigned_to_id
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
  assigned_to_kind: string | null
  assigned_to_id: string | null
  assigned_user_name: string | null
  assigned_owner_profile_id: string | null  // freelancer.linked_profile_id (본인 판정용)
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
           a.status, a.assigned_to_kind, a.assigned_to_id,
           COALESCE(emp.name, fl.name) AS assigned_user_name,
           fl.linked_profile_id AS assigned_owner_profile_id,
           a.location, a.notes, a.qr_token,
           a.disposed_at, a.disposed_reason,
           a.created_by, a.created_at, a.updated_at
      FROM ride_assets a
      LEFT JOIN ride_asset_categories c ON c.id = a.category_id
      LEFT JOIN ride_employees emp ON a.assigned_to_kind = 'employee'   AND emp.id = a.assigned_to_id
      LEFT JOIN freelancers     fl  ON a.assigned_to_kind = 'freelancer' AND fl.id  = a.assigned_to_id
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
    const isOwner = row.assigned_owner_profile_id === user.id
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ success: false, error: 'forbidden — 본인 매칭 자산만 조회 가능' }, { status: 403 })
    }
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes("doesn't exist") && err.message.includes('ride_asset')) {
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
  if (!(await isAssetAdmin(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 권한자만 수정 가능' }, { status: 403 })
  }

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  try {
    const before = await loadAsset(id)
    if (!before) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })

    const nextName = body.name !== undefined ? String(body.name).trim() : undefined
    const nextCategoryId = body.category_id !== undefined ? String(body.category_id).trim() : undefined
    const nextAcquiredAt = body.acquired_at !== undefined ? (body.acquired_at ? String(body.acquired_at) : null) : undefined
    const nextAcquiredCost = body.acquired_cost !== undefined ? (body.acquired_cost != null && body.acquired_cost !== '' ? String(body.acquired_cost) : null) : undefined
    const nextLocation = body.location !== undefined ? (body.location ? String(body.location).trim() : null) : undefined
    const nextNotes = body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined
    const nextStatus = body.status !== undefined ? String(body.status).trim() : undefined
    const nextDisposedReason = body.disposed_reason !== undefined ? (body.disposed_reason ? String(body.disposed_reason).trim() : null) : undefined

    if (nextName !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET name = ${nextName} WHERE id = ${id}`
    if (nextCategoryId !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET category_id = ${nextCategoryId} WHERE id = ${id}`
    if (nextAcquiredAt !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET acquired_at = ${nextAcquiredAt} WHERE id = ${id}`
    if (nextAcquiredCost !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET acquired_cost = ${nextAcquiredCost} WHERE id = ${id}`
    if (nextNotes !== undefined) await prisma.$executeRaw`UPDATE ride_assets SET notes = ${nextNotes} WHERE id = ${id}`
    if (nextLocation !== undefined && nextLocation !== before.location) {
      await prisma.$executeRaw`UPDATE ride_assets SET location = ${nextLocation} WHERE id = ${id}`
      await prisma.$executeRaw`
        INSERT INTO ride_asset_logs (asset_id, action, from_location, to_location, by_user_id, note)
        VALUES (${id}, 'location_update', ${before.location}, ${nextLocation}, ${user.id}, NULL)
      `
    }

    if (nextStatus !== undefined && nextStatus !== before.status) {
      await prisma.$executeRaw`UPDATE ride_assets SET status = ${nextStatus} WHERE id = ${id}`
      if (nextStatus === 'disposed') {
        await prisma.$executeRaw`UPDATE ride_assets SET disposed_at = NOW(), disposed_reason = ${nextDisposedReason} WHERE id = ${id}`
        await prisma.$executeRaw`
          INSERT INTO ride_asset_logs (asset_id, action, from_status, to_status, by_user_id, note)
          VALUES (${id}, 'disposed', ${before.status}, 'disposed', ${user.id}, ${nextDisposedReason})
        `
      } else if (before.status === 'disposed' && nextStatus === 'active') {
        await prisma.$executeRaw`UPDATE ride_assets SET disposed_at = NULL, disposed_reason = NULL WHERE id = ${id}`
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
    await prisma.$executeRaw`DELETE FROM ride_asset_logs WHERE asset_id = ${id}`
    const result = await prisma.$executeRaw`DELETE FROM ride_assets WHERE id = ${id}`
    return NextResponse.json({ success: true, data: { id, deleted: true, rows: Number(result) } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-assets/:id DELETE]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
