/**
 * /api/ride-compliance/assets
 *
 * GET  — 정보자산 list (필터: type / classification / status / pii / q)
 *        manager+ 권한 (handler 는 owner_user_id=본인 row 만 조회)
 * POST — 자산 등록 (manager+) — asset_code 자동 생성 (RC-{type}-{YYYY}-{0000})
 *
 * 매뉴얼 근거: 통합본 5.17 제10~19조 (기술적·관리적 보호조치).
 * 취급단말기 반출관리 매뉴얼 — asset_type='pc'|'mobile' 의 반출 관리 연계 (Phase 1.2+).
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface AssetRow {
  id: string
  asset_code: string
  name: string
  asset_type: string
  classification: string
  owner_user_id: string | null
  owner_user_name: string | null
  responsible_user_id: string | null
  responsible_user_name: string | null
  location: string | null
  os_or_spec: string | null
  contains_pii: number
  access_control: string | null
  encryption_status: string
  acquired_at: Date | string | null
  decommissioned_at: Date | string | null
  status: string
  notes: string | null
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

const ASSET_TYPES = ['server', 'pc', 'document', 'storage', 'cctv', 'mobile', 'software', 'network', 'other'] as const
const CLASSIFICATIONS = ['public', 'internal', 'confidential'] as const
const STATUSES = ['active', 'repair', 'disposed', 'lost'] as const
const ENCRYPTION = ['none', 'partial', 'full'] as const

const TYPE_PREFIX: Record<string, string> = {
  server: 'SVR', pc: 'PC', document: 'DOC', storage: 'STG',
  cctv: 'CCTV', mobile: 'MOB', software: 'SW', network: 'NET', other: 'ETC',
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  const isMgr = role === 'cpo' || role === 'manager'

  const url = new URL(request.url)
  const type = (url.searchParams.get('type') || '').trim()
  const classification = (url.searchParams.get('classification') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const pii = url.searchParams.get('pii') // '1'|'0'|null
  const q = (url.searchParams.get('q') || '').trim()
  const like = q ? `%${q}%` : null
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 1000)

  try {
    const rows = await prisma.$queryRaw<AssetRow[]>`
      SELECT a.id, a.asset_code, a.name, a.asset_type, a.classification,
             a.owner_user_id, ou.name AS owner_user_name,
             a.responsible_user_id, ru.name AS responsible_user_name,
             a.location, a.os_or_spec,
             a.contains_pii, a.access_control, a.encryption_status,
             a.acquired_at, a.decommissioned_at, a.status, a.notes,
             a.created_by, a.created_at, a.updated_at
        FROM ride_compliance_assets a
        LEFT JOIN profiles ou ON ou.id = a.owner_user_id
        LEFT JOIN profiles ru ON ru.id = a.responsible_user_id
       WHERE (${isMgr ? '__ALL__' : user.id} = '__ALL__' OR a.owner_user_id = ${user.id})
         AND (${type} = '' OR a.asset_type = ${type})
         AND (${classification} = '' OR a.classification = ${classification})
         AND (${status} = '' OR a.status = ${status})
         AND (${pii === null ? '__ANY__' : pii} = '__ANY__' OR a.contains_pii = ${pii === '1' ? 1 : 0})
         AND (${like} IS NULL OR a.name LIKE ${like} OR a.asset_code LIKE ${like} OR a.location LIKE ${like})
       ORDER BY a.created_at DESC
       LIMIT ${limit}
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, my_role: role, filters: { type, classification, status, pii, q } },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true, migration: '2026-05-18_ride_compliance_phase11.sql', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/assets GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자(manager) 이상만 자산 등록 가능' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const name = String(body.name || '').trim()
  const assetType = String(body.asset_type || '').trim()
  const classification = String(body.classification || 'internal').trim()
  const ownerUserId = body.owner_user_id ? String(body.owner_user_id).trim() : null
  const responsibleUserId = body.responsible_user_id ? String(body.responsible_user_id).trim() : null
  const location = body.location ? String(body.location).trim() : null
  const osOrSpec = body.os_or_spec ? String(body.os_or_spec).trim() : null
  const containsPii = body.contains_pii === true || body.contains_pii === 1 || body.contains_pii === '1' ? 1 : 0
  const accessControl = body.access_control ? String(body.access_control).trim() : null
  const encryptionStatus = String(body.encryption_status || 'none').trim()
  const acquiredAt = body.acquired_at ? String(body.acquired_at).trim() : null
  const notes = body.notes ? String(body.notes) : null

  if (!name) return NextResponse.json({ success: false, error: 'name 필수' }, { status: 400 })
  if (!ASSET_TYPES.includes(assetType as typeof ASSET_TYPES[number])) {
    return NextResponse.json({ success: false, error: `asset_type 은 ${ASSET_TYPES.join('/')} 중 하나` }, { status: 400 })
  }
  if (!CLASSIFICATIONS.includes(classification as typeof CLASSIFICATIONS[number])) {
    return NextResponse.json({ success: false, error: `classification 은 ${CLASSIFICATIONS.join('/')} 중 하나` }, { status: 400 })
  }
  if (!ENCRYPTION.includes(encryptionStatus as typeof ENCRYPTION[number])) {
    return NextResponse.json({ success: false, error: `encryption_status 은 ${ENCRYPTION.join('/')} 중 하나` }, { status: 400 })
  }

  try {
    // asset_code 생성: RC-{prefix}-{YYYY}-{4자리} — 본 type/연도의 max+1
    const year = new Date().getFullYear()
    const prefix = `RC-${TYPE_PREFIX[assetType]}-${year}-`
    const result = await prisma.$transaction(async (tx) => {
      const seqRows = await tx.$queryRaw<Array<{ max_code: string | null }>>`
        SELECT MAX(asset_code) AS max_code
          FROM ride_compliance_assets
         WHERE asset_code LIKE ${`${prefix}%`}
      `
      let seq = 1
      const maxCode = seqRows[0]?.max_code
      if (maxCode && maxCode.startsWith(prefix)) {
        const tail = maxCode.substring(prefix.length)
        const n = parseInt(tail, 10)
        if (!isNaN(n)) seq = n + 1
      }
      const assetCode = `${prefix}${String(seq).padStart(4, '0')}`
      const id = randomUUID()

      await tx.$executeRaw`
        INSERT INTO ride_compliance_assets
          (id, asset_code, name, asset_type, classification,
           owner_user_id, responsible_user_id, location, os_or_spec,
           contains_pii, access_control, encryption_status,
           acquired_at, status, notes, created_by)
        VALUES
          (${id}, ${assetCode}, ${name}, ${assetType}, ${classification},
           ${ownerUserId}, ${responsibleUserId}, ${location}, ${osOrSpec},
           ${containsPii}, ${accessControl}, ${encryptionStatus},
           ${acquiredAt}, 'active', ${notes}, ${user.id})
      `
      return { id, assetCode }
    })

    const [row] = await prisma.$queryRaw<AssetRow[]>`
      SELECT a.id, a.asset_code, a.name, a.asset_type, a.classification,
             a.owner_user_id, ou.name AS owner_user_name,
             a.responsible_user_id, ru.name AS responsible_user_name,
             a.location, a.os_or_spec,
             a.contains_pii, a.access_control, a.encryption_status,
             a.acquired_at, a.decommissioned_at, a.status, a.notes,
             a.created_by, a.created_at, a.updated_at
        FROM ride_compliance_assets a
        LEFT JOIN profiles ou ON ou.id = a.owner_user_id
        LEFT JOIN profiles ru ON ru.id = a.responsible_user_id
       WHERE a.id = ${result.id}
       LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: 'asset_code 중복 — 재시도 부탁드립니다' }, { status: 409 })
    }
    console.error('[/api/ride-compliance/assets POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
