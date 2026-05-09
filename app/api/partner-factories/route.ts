/**
 * /api/partner-factories
 *
 * GET  — 정제된 운영 공장 목록 (filter: status / q / region / group)
 * POST — 신규 등록 (수기 또는 snapshot 에서 promote)
 *
 * PR-6.12.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

interface FactoryRow {
  id: string
  cafe24_factcode: string | null
  snapshot_id: string | null
  name: string
  raw_name: string | null
  address: string | null
  phone: string | null
  business_no: string | null
  contact_person: string | null
  factory_type: string | null
  group_label: string | null
  insurance_tags: unknown
  service_tags: unknown
  lat: string | null
  lng: string | null
  region: string | null
  district: string | null
  status: string
  is_terminated: number
  note: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: Date | string
  updated_at: Date | string
}

const SELECT_COLS = `
  id, cafe24_factcode, snapshot_id,
  name, raw_name, address, phone, business_no, contact_person, factory_type,
  group_label, insurance_tags, service_tags,
  lat, lng, region, district,
  status, is_terminated, note,
  created_by, created_by_name, created_at, updated_at
`

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  const allowed = await canAccessPage(user, [
    '/factory-search',
    '/factory-search/mgmt',
  ])
  if (!allowed)
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const region = url.searchParams.get('region')
  const groupLabel = url.searchParams.get('group')
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '5000', 10) || 5000, 1),
    20000
  )

  try {
    const conds: string[] = []
    const args: (string | number)[] = []
    if (status) {
      conds.push('status = ?')
      args.push(status)
    }
    if (region) {
      conds.push('region = ?')
      args.push(region)
    }
    if (groupLabel) {
      conds.push('group_label = ?')
      args.push(groupLabel)
    }
    if (q) {
      conds.push('(name LIKE ? OR address LIKE ? OR business_no LIKE ? OR cafe24_factcode LIKE ?)')
      const like = `%${q}%`
      args.push(like, like, like, like)
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''
    const sql = `SELECT ${SELECT_COLS} FROM partner_factories ${where}
                 ORDER BY name ASC LIMIT ${limit}`
    const rows = await prisma.$queryRawUnsafe<FactoryRow[]>(sql, ...args)
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { status, region, groupLabel, q },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true },
      })
    }
    console.error('[/api/partner-factories GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

const INSERTABLE = [
  'cafe24_factcode', 'snapshot_id',
  'name', 'raw_name', 'address', 'phone', 'business_no', 'contact_person', 'factory_type',
  'group_label', 'insurance_tags', 'service_tags',
  'lat', 'lng', 'region', 'district',
  'status', 'is_terminated', 'note',
] as const

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, [
    '/factory-search',
    '/factory-search/mgmt',
  ])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const userTyped = user as { id: string; name?: string }
  const id = randomUUID()
  const cols: string[] = ['id', 'created_by', 'created_by_name']
  const placeholders: string[] = ['?', '?', '?']
  const vals: (string | number | null)[] = [id, userTyped.id, userTyped.name || null]

  for (const col of INSERTABLE) {
    if (col in body) {
      const v = body[col]
      cols.push(col)
      placeholders.push('?')
      if (col === 'is_terminated') {
        vals.push(v ? 1 : 0)
      } else if (col === 'lat' || col === 'lng') {
        vals.push(v === null || v === '' ? null : Number(v))
      } else if (col === 'insurance_tags' || col === 'service_tags') {
        vals.push(v ? JSON.stringify(v) : null)
      } else {
        vals.push(v === null || v === '' ? null : String(v))
      }
    }
  }
  if (!cols.includes('name')) {
    return NextResponse.json({ success: false, error: 'name 필수' }, { status: 400 })
  }
  const sql = `INSERT INTO partner_factories (${cols.join(',')}) VALUES (${placeholders.join(',')})`
  try {
    await prisma.$executeRawUnsafe(sql, ...vals)
    const [row] = await prisma.$queryRawUnsafe<FactoryRow[]>(
      `SELECT ${SELECT_COLS} FROM partner_factories WHERE id = ? LIMIT 1`,
      id
    )
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 cafe24_factcode' },
        { status: 409 }
      )
    }
    console.error('[/api/partner-factories POST]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
