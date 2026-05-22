/**
 * /api/ride-asset-categories
 *
 * GET  — 카테고리 목록 (모든 인증 사용자 — 등록 모달 selectbox 등에 사용)
 * POST — 카테고리 추가 (권한자 only)
 *
 * 카테고리 마스터 (VH/OF/IT/CC/ET + 권한자 확장).
 * next_seq 컬럼은 자산 등록 시 트랜잭션으로 increment.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isAssetAdmin } from '@/lib/ride-asset-perm'
import { randomUUID } from 'crypto'

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

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const includeInactive = url.searchParams.get('include_inactive') === '1'

  try {
    const rows = includeInactive
      ? await prisma.$queryRaw<CategoryRow[]>`
          SELECT id, code, name, emoji, sort_order, next_seq, is_active, created_at, updated_at
            FROM ride_asset_categories
           ORDER BY sort_order, code
        `
      : await prisma.$queryRaw<CategoryRow[]>`
          SELECT id, code, name, emoji, sort_order, next_seq, is_active, created_at, updated_at
            FROM ride_asset_categories
           WHERE is_active = 1
           ORDER BY sort_order, code
        `
    return NextResponse.json({ success: true, data: rows, meta: null })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes("doesn't exist") && err.message.includes('ride_asset')) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true, migration: '2026-05-14_ride_assets.sql' },
      })
    }
    console.error('[/api/ride-asset-categories GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!(await isAssetAdmin(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 자산 권한자만 가능' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const code = String(body.code || '').trim().toUpperCase()
  const name = String(body.name || '').trim()
  const emoji = body.emoji ? String(body.emoji).trim() : null
  const sortOrder = Number(body.sort_order) || 100

  if (!code || !/^[A-Z]{1,8}$/.test(code)) {
    return NextResponse.json({ success: false, error: 'code 는 A~Z 1~8자' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ success: false, error: 'name 필수' }, { status: 400 })
  }

  const id = randomUUID()
  try {
    await prisma.$executeRaw`
      INSERT INTO ride_asset_categories (id, code, name, emoji, sort_order, next_seq, is_active)
      VALUES (${id}, ${code}, ${name}, ${emoji}, ${sortOrder}, 1, 1)
    `
    const [row] = await prisma.$queryRaw<CategoryRow[]>`
      SELECT id, code, name, emoji, sort_order, next_seq, is_active, created_at, updated_at
        FROM ride_asset_categories
       WHERE id = ${id}
       LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: `code '${code}' 이미 존재` }, { status: 409 })
    }
    console.error('[/api/ride-asset-categories POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
