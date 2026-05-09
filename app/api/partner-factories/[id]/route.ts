/**
 * /api/partner-factories/[id]
 *
 * GET    — 상세
 * PATCH  — 화이트리스트 컬럼 수정
 * DELETE — soft (status='terminated' + is_terminated=1)
 *
 * PR-6.12.a
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { canAccessPage } from '@/lib/page-access'
import { prisma } from '@/lib/prisma'

interface FactoryRow {
  id: string
  [key: string]: unknown
}

const UPDATABLE = [
  'cafe24_factcode',
  'name', 'raw_name', 'address', 'phone', 'business_no', 'contact_person', 'factory_type',
  'group_label', 'insurance_tags', 'service_tags',
  'lat', 'lng', 'region', 'district',
  'status', 'is_terminated', 'note',
] as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, ['/factory-search', '/factory-search/mgmt'])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    const [row] = await prisma.$queryRaw<FactoryRow[]>`
      SELECT * FROM partner_factories WHERE id = ${id} LIMIT 1
    `
    if (!row)
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/partner-factories/[id] GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, ['/factory-search', '/factory-search/mgmt'])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const setSql: string[] = []
  const vals: (string | number | null)[] = []
  for (const col of UPDATABLE) {
    if (col in body) {
      setSql.push(`${col} = ?`)
      const v = body[col]
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
  if (setSql.length === 0)
    return NextResponse.json({ success: false, error: 'no fields to update' }, { status: 400 })
  vals.push(id)

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE partner_factories SET ${setSql.join(', ')} WHERE id = ?`,
      ...vals
    )
    const [row] = await prisma.$queryRaw<FactoryRow[]>`
      SELECT * FROM partner_factories WHERE id = ${id} LIMIT 1
    `
    if (!row)
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 cafe24_factcode' },
        { status: 409 }
      )
    }
    console.error('[/api/partner-factories/[id] PATCH]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const allowed = await canAccessPage(user, ['/factory-search', '/factory-search/mgmt'])
  if (!allowed)
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    await prisma.$executeRaw`
      UPDATE partner_factories SET status = 'terminated', is_terminated = 1 WHERE id = ${id}
    `
    return NextResponse.json({ success: true })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/partner-factories/[id] DELETE]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
