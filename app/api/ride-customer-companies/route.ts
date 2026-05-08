/**
 * /api/ride-customer-companies
 *
 * GET  — 고객사 마스터 list (active 또는 전체)
 * POST — 신규 등록
 *
 * PR-6.10 — 라이드 고객사 데이터 통합.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

interface CompanyRow {
  id: string
  name: string
  type: string | null
  report_frequency: string | null
  active: number
  note: string | null
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json(
      { success: false, data: [], error: 'unauthorized' },
      { status: 401 }
    )
  }
  if (user.role !== 'admin') {
    return NextResponse.json(
      { success: false, data: [], error: 'forbidden' },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const includeInactive = url.searchParams.get('all') === '1'

  try {
    const rows = includeInactive
      ? await prisma.$queryRaw<CompanyRow[]>`
          SELECT id, name, type, report_frequency, active, note,
                 created_by, created_at, updated_at
            FROM ride_customer_companies
           ORDER BY active DESC, name ASC
        `
      : await prisma.$queryRaw<CompanyRow[]>`
          SELECT id, name, type, report_frequency, active, note,
                 created_by, created_at, updated_at
            FROM ride_customer_companies
           WHERE active = 1
           ORDER BY name ASC
        `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { fetched_at: new Date().toISOString(), count: rows.length },
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
    console.error('[/api/ride-customer-companies GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) {
    return NextResponse.json({ success: false, error: 'name 필수' }, { status: 400 })
  }
  const type = body.type ? String(body.type).trim() : null
  const report_frequency = body.report_frequency ? String(body.report_frequency).trim() : null
  const note = body.note ? String(body.note) : null
  const id = randomUUID()
  const created_by = user.id

  try {
    await prisma.$executeRaw`
      INSERT INTO ride_customer_companies
        (id, name, type, report_frequency, active, note, created_by)
      VALUES
        (${id}, ${name}, ${type}, ${report_frequency}, 1, ${note}, ${created_by})
    `
    const [row] = await prisma.$queryRaw<CompanyRow[]>`
      SELECT id, name, type, report_frequency, active, note,
             created_by, created_at, updated_at
        FROM ride_customer_companies
       WHERE id = ${id}
       LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 고객사명' },
        { status: 409 }
      )
    }
    console.error('[/api/ride-customer-companies POST]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
