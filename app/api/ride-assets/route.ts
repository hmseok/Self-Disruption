/**
 * /api/ride-assets
 *
 * GET  — 자산 목록 (필터: category/status/assigned/q)
 *        권한자(asset admin) → 전체 / 일반 사용자 → 본인 매칭만
 * POST — 자산 등록 (권한자만, 자산코드 트랜잭션 자동 생성)
 *
 * 자산코드: <CATEGORY_CODE>-<YYYY>-<SEQ4>  예) IT-2026-0001
 *   category.next_seq 를 FOR UPDATE 로 락 → +1 → 자산코드 조합 → INSERT
 *
 * 등록 시 ride_asset_logs 에 action='created' 1행 자동 기록.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isAssetAdmin } from '@/lib/ride-asset-perm'
import { randomUUID } from 'crypto'

interface AssetRow {
  id: string
  asset_code: string
  category_id: string
  category_code: string
  category_name: string
  category_emoji: string | null
  name: string
  acquired_at: Date | string | null
  acquired_cost: string | null  // DECIMAL → string
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

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const category = (url.searchParams.get('category') || '').trim() // category code (VH/OF/IT/CC/ET/...)
  const status = (url.searchParams.get('status') || '').trim()      // active/repair/disposed/lost
  const assigned = (url.searchParams.get('assigned') || '').trim()  // 'me'|'common'|'any'|userId
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 1000)

  const isAdmin = await isAssetAdmin(user)

  try {
    // WHERE 조건 동적 빌드 — 안전한 prisma raw helper 패턴
    // 작은 분기로 if/else 처리 (rule 11/13 — 추측 X)
    let rows: AssetRow[]

    // 일반 사용자는 본인 자산만 (관리자는 전체)
    const mineOnly = !isAdmin
    const like = q ? `%${q}%` : null

    if (mineOnly) {
      // 일반 사용자: assigned_user_id = 본인. category/status/q 부가 필터.
      rows = await prisma.$queryRaw<AssetRow[]>`
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
          LEFT JOIN profiles u ON u.id = a.assigned_user_id
         WHERE a.assigned_user_id = ${user.id}
           AND a.status <> 'disposed'
           AND (${category} = '' OR c.code = ${category})
           AND (${status} = '' OR a.status = ${status})
           AND (${like} IS NULL OR a.name LIKE ${like} OR a.asset_code LIKE ${like})
         ORDER BY a.created_at DESC
         LIMIT ${limit}
      `
    } else {
      // 권한자: 전체. assigned='me' / 'common' / userId / '' 분기.
      const assignedFilter =
        assigned === 'me' ? user.id
        : assigned === 'common' ? '__COMMON__'
        : assigned === 'any' || assigned === '' ? '__ANY__'
        : assigned // userId 직접 지정

      rows = await prisma.$queryRaw<AssetRow[]>`
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
          LEFT JOIN profiles u ON u.id = a.assigned_user_id
         WHERE (${category} = '' OR c.code = ${category})
           AND (${status} = '' OR a.status = ${status})
           AND (${assignedFilter} = '__ANY__'
                OR (${assignedFilter} = '__COMMON__' AND a.assigned_user_id IS NULL)
                OR a.assigned_user_id = ${assignedFilter})
           AND (${like} IS NULL OR a.name LIKE ${like} OR a.asset_code LIKE ${like})
         ORDER BY a.created_at DESC
         LIMIT ${limit}
      `
    }

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        count: rows.length,
        is_admin: isAdmin,
        filters: { category, status, assigned, q },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes("doesn't exist") && err.message.includes('ride_asset')) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: true, migration: '2026-05-14_ride_assets.sql' },
      })
    }
    console.error('[/api/ride-assets GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isAssetAdmin(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 자산 권한자만 가능' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const categoryId = String(body.category_id || '').trim()
  const name = String(body.name || '').trim()
  const acquiredAt = body.acquired_at ? String(body.acquired_at).trim() : null
  const acquiredCost = body.acquired_cost != null && body.acquired_cost !== '' ? String(body.acquired_cost) : null
  const assignedUserId = body.assigned_user_id ? String(body.assigned_user_id).trim() : null
  const location = body.location ? String(body.location).trim() : null
  const notes = body.notes ? String(body.notes) : null

  if (!categoryId) return NextResponse.json({ success: false, error: 'category_id 필수' }, { status: 400 })
  if (!name) return NextResponse.json({ success: false, error: 'name 필수' }, { status: 400 })

  try {
    // 트랜잭션: 카테고리 next_seq 락 → +1 → asset_code 생성 → INSERT
    const result = await prisma.$transaction(async (tx) => {
      const catRows = await tx.$queryRaw<Array<{ code: string; next_seq: number }>>`
        SELECT code, next_seq FROM ride_asset_categories
         WHERE id = ${categoryId} AND is_active = 1
         FOR UPDATE
      `
      if (!catRows.length) {
        throw new Error('category not found or inactive')
      }
      const { code: catCode, next_seq: seq } = catRows[0]
      const year = new Date().getFullYear()
      const assetCode = `${catCode}-${year}-${String(seq).padStart(4, '0')}`

      await tx.$executeRaw`
        UPDATE ride_asset_categories SET next_seq = next_seq + 1 WHERE id = ${categoryId}
      `

      const id = randomUUID()
      const qrToken = randomUUID()

      await tx.$executeRaw`
        INSERT INTO ride_assets
          (id, asset_code, category_id, name,
           acquired_at, acquired_cost, status,
           assigned_user_id, location, notes, qr_token, created_by)
        VALUES
          (${id}, ${assetCode}, ${categoryId}, ${name},
           ${acquiredAt}, ${acquiredCost}, 'active',
           ${assignedUserId}, ${location}, ${notes}, ${qrToken}, ${user.id})
      `

      // 로그 — 생성
      await tx.$executeRaw`
        INSERT INTO ride_asset_logs
          (asset_id, action, to_user_id, to_status, to_location, by_user_id, note)
        VALUES
          (${id}, 'created', ${assignedUserId}, 'active', ${location}, ${user.id}, '자산 등록')
      `

      return { id, assetCode, qrToken }
    })

    const [row] = await prisma.$queryRaw<AssetRow[]>`
      SELECT a.id, a.asset_code, a.category_id,
             c.code AS category_code, c.name AS category_name, c.emoji AS category_emoji,
             a.name, a.acquired_at, CAST(a.acquired_cost AS CHAR) AS acquired_cost,
             a.status, a.assigned_user_id,
             u.name AS assigned_user_name,
             a.location, a.notes, a.qr_token,
             a.disposed_at, a.disposed_reason,
             a.created_by, a.created_at, a.updated_at
        FROM ride_assets a
        LEFT JOIN ride_asset_categories c ON c.id = a.category_id
        LEFT JOIN profiles u ON u.id = a.assigned_user_id
       WHERE a.id = ${result.id}
       LIMIT 1
    `

    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: '자산코드 중복 — 재시도 부탁드립니다' }, { status: 409 })
    }
    console.error('[/api/ride-assets POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
