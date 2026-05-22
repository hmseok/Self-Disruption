/**
 * /api/ride-assets
 *
 * GET  — 자산 목록 (필터: category/status/assigned/q)
 *        권한자(asset admin) → 전체 / 일반 사용자 → 본인(외부인력 로그인) 매칭만
 * POST — 자산 등록 (권한자만, 자산코드 트랜잭션 자동 생성)
 *
 * 매칭 모델 (PR-ASSETS-2.0):
 *   assigned_to_kind  'employee'(ride_employees) | 'freelancer'(freelancers) | NULL(공통)
 *   assigned_to_id    ride_employees.id 또는 freelancers.id
 *   assigned_user_name = COALESCE(emp.name, fl.name)
 *
 * 자산코드: <CATEGORY_CODE>-<YYYY>-<SEQ4>  예) IT-2026-0001
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
  acquired_cost: string | null
  status: string
  assigned_to_kind: string | null
  assigned_to_id: string | null
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
  const category = (url.searchParams.get('category') || '').trim()  // category code
  const status = (url.searchParams.get('status') || '').trim()
  const assigned = (url.searchParams.get('assigned') || '').trim()  // 'me'|'common'|'any'|assigned_to_id
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 1000)

  const isAdmin = await isAssetAdmin(user)

  try {
    const mineOnly = !isAdmin
    const like = q ? `%${q}%` : null

    let rows: AssetRow[]

    if (mineOnly) {
      // 일반 사용자 — 본인(외부인력 로그인 계정)에 매칭된 자산만.
      // ride_employees 는 로그인 연결(profile_id) 이 없어 일반 사용자 조회 대상 아님.
      rows = await prisma.$queryRaw<AssetRow[]>`
        SELECT a.id, a.asset_code, a.category_id,
               c.code AS category_code, c.name AS category_name, c.emoji AS category_emoji,
               a.name, a.acquired_at, CAST(a.acquired_cost AS CHAR) AS acquired_cost,
               a.status, a.assigned_to_kind, a.assigned_to_id,
               COALESCE(emp.name, fl.name) AS assigned_user_name,
               a.location, a.notes, a.qr_token,
               a.disposed_at, a.disposed_reason,
               a.created_by, a.created_at, a.updated_at
          FROM ride_assets a
          LEFT JOIN ride_asset_categories c ON c.id = a.category_id
          LEFT JOIN ride_employees emp ON a.assigned_to_kind = 'employee'   AND emp.id = a.assigned_to_id
          LEFT JOIN freelancers     fl  ON a.assigned_to_kind = 'freelancer' AND fl.id  = a.assigned_to_id
         WHERE a.assigned_to_kind = 'freelancer'
           AND a.assigned_to_id IN (SELECT id FROM freelancers WHERE linked_profile_id = ${user.id})
           AND a.status <> 'disposed'
           AND (${category} = '' OR c.code = ${category})
           AND (${status} = '' OR a.status = ${status})
           AND (${like} IS NULL OR a.name LIKE ${like} OR a.asset_code LIKE ${like})
         ORDER BY a.created_at DESC
         LIMIT ${limit}
      `
    } else {
      // 권한자 — 전체. assigned 필터: 'common'(미할당) / 'any' / 특정 assigned_to_id
      const assignedFilter =
        assigned === 'common' ? '__COMMON__'
        : assigned === 'any' || assigned === '' || assigned === 'me' ? '__ANY__'
        : assigned  // assigned_to_id 직접 지정

      rows = await prisma.$queryRaw<AssetRow[]>`
        SELECT a.id, a.asset_code, a.category_id,
               c.code AS category_code, c.name AS category_name, c.emoji AS category_emoji,
               a.name, a.acquired_at, CAST(a.acquired_cost AS CHAR) AS acquired_cost,
               a.status, a.assigned_to_kind, a.assigned_to_id,
               COALESCE(emp.name, fl.name) AS assigned_user_name,
               a.location, a.notes, a.qr_token,
               a.disposed_at, a.disposed_reason,
               a.created_by, a.created_at, a.updated_at
          FROM ride_assets a
          LEFT JOIN ride_asset_categories c ON c.id = a.category_id
          LEFT JOIN ride_employees emp ON a.assigned_to_kind = 'employee'   AND emp.id = a.assigned_to_id
          LEFT JOIN freelancers     fl  ON a.assigned_to_kind = 'freelancer' AND fl.id  = a.assigned_to_id
         WHERE (${category} = '' OR c.code = ${category})
           AND (${status} = '' OR a.status = ${status})
           AND (${assignedFilter} = '__ANY__'
                OR (${assignedFilter} = '__COMMON__' AND a.assigned_to_id IS NULL)
                OR a.assigned_to_id = ${assignedFilter})
           AND (${like} IS NULL OR a.name LIKE ${like} OR a.asset_code LIKE ${like})
         ORDER BY a.created_at DESC
         LIMIT ${limit}
      `
    }

    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, is_admin: isAdmin, filters: { category, status, assigned, q } },
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
  const location = body.location ? String(body.location).trim() : null
  const notes = body.notes ? String(body.notes) : null

  // 매칭 — assigned_to_kind ('employee'|'freelancer') + assigned_to_id
  const rawKind = body.assigned_to_kind ? String(body.assigned_to_kind).trim() : ''
  const assignedKind = rawKind === 'employee' || rawKind === 'freelancer' ? rawKind : null
  const assignedId = assignedKind && body.assigned_to_id ? String(body.assigned_to_id).trim() : null

  if (!categoryId) return NextResponse.json({ success: false, error: 'category_id 필수' }, { status: 400 })
  if (!name) return NextResponse.json({ success: false, error: 'name 필수' }, { status: 400 })

  try {
    const result = await prisma.$transaction(async (tx) => {
      const catRows = await tx.$queryRaw<Array<{ code: string; next_seq: number }>>`
        SELECT code, next_seq FROM ride_asset_categories
         WHERE id = ${categoryId} AND is_active = 1
         FOR UPDATE
      `
      if (!catRows.length) throw new Error('category not found or inactive')
      const { code: catCode, next_seq: seq } = catRows[0]
      const year = new Date().getFullYear()
      const assetCode = `${catCode}-${year}-${String(seq).padStart(4, '0')}`

      await tx.$executeRaw`UPDATE ride_asset_categories SET next_seq = next_seq + 1 WHERE id = ${categoryId}`

      const id = randomUUID()
      const qrToken = randomUUID()

      await tx.$executeRaw`
        INSERT INTO ride_assets
          (id, asset_code, category_id, name,
           acquired_at, acquired_cost, status,
           assigned_to_kind, assigned_to_id, location, notes, qr_token, created_by)
        VALUES
          (${id}, ${assetCode}, ${categoryId}, ${name},
           ${acquiredAt}, ${acquiredCost}, 'active',
           ${assignedKind}, ${assignedId}, ${location}, ${notes}, ${qrToken}, ${user.id})
      `

      await tx.$executeRaw`
        INSERT INTO ride_asset_logs
          (asset_id, action, to_user_id, to_status, to_location, by_user_id, note)
        VALUES
          (${id}, 'created', ${assignedId}, 'active', ${location}, ${user.id}, '자산 등록')
      `

      return { id }
    })

    const [row] = await prisma.$queryRaw<AssetRow[]>`
      SELECT a.id, a.asset_code, a.category_id,
             c.code AS category_code, c.name AS category_name, c.emoji AS category_emoji,
             a.name, a.acquired_at, CAST(a.acquired_cost AS CHAR) AS acquired_cost,
             a.status, a.assigned_to_kind, a.assigned_to_id,
             COALESCE(emp.name, fl.name) AS assigned_user_name,
             a.location, a.notes, a.qr_token,
             a.disposed_at, a.disposed_reason,
             a.created_by, a.created_at, a.updated_at
        FROM ride_assets a
        LEFT JOIN ride_asset_categories c ON c.id = a.category_id
        LEFT JOIN ride_employees emp ON a.assigned_to_kind = 'employee'   AND emp.id = a.assigned_to_id
        LEFT JOIN freelancers     fl  ON a.assigned_to_kind = 'freelancer' AND fl.id  = a.assigned_to_id
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
