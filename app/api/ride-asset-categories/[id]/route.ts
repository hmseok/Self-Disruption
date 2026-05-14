/**
 * /api/ride-asset-categories/[id]
 *
 * PATCH  — 카테고리 수정 (name/emoji/sort_order/is_active)
 * DELETE — 카테고리 비활성화 (실제 row 삭제 X — 자산이 참조 중일 수 있음)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isAssetAdmin } from '@/lib/ride-asset-perm'

interface CategoryRow {
  id: string
  code: string
  name: string
  emoji: string | null
  sort_order: number
  next_seq: number
  is_active: number
  created_at: Date | string
  updated_at: Date | string
}

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isAssetAdmin(user))) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const name = body.name != null ? String(body.name).trim() : null
  const emoji = body.emoji != null ? (String(body.emoji).trim() || null) : undefined
  const sortOrder = body.sort_order != null ? Number(body.sort_order) : null
  const isActive = body.is_active != null ? (body.is_active ? 1 : 0) : null

  try {
    // 동적 UPDATE — 변경된 컬럼만
    if (name !== null) {
      await prisma.$executeRaw`UPDATE ride_asset_categories SET name = ${name} WHERE id = ${id}`
    }
    if (emoji !== undefined) {
      await prisma.$executeRaw`UPDATE ride_asset_categories SET emoji = ${emoji} WHERE id = ${id}`
    }
    if (sortOrder !== null) {
      await prisma.$executeRaw`UPDATE ride_asset_categories SET sort_order = ${sortOrder} WHERE id = ${id}`
    }
    if (isActive !== null) {
      await prisma.$executeRaw`UPDATE ride_asset_categories SET is_active = ${isActive} WHERE id = ${id}`
    }
    const [row] = await prisma.$queryRaw<CategoryRow[]>`
      SELECT id, code, name, emoji, sort_order, next_seq, is_active, created_at, updated_at
        FROM ride_asset_categories WHERE id = ${id} LIMIT 1
    `
    if (!row) {
      return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-asset-categories/:id PATCH]', err.code, err.message)
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
    // 실제 row 삭제 X — is_active = 0 으로 비활성화만
    await prisma.$executeRaw`UPDATE ride_asset_categories SET is_active = 0 WHERE id = ${id}`
    return NextResponse.json({ success: true, data: { id, deactivated: true } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-asset-categories/:id DELETE]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
