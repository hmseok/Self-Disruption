/**
 * /api/ride-customer-companies/[id]
 *
 * PATCH  — 고객사 수정 (화이트리스트 컬럼만)
 * DELETE — soft delete (active=0)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

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

const UPDATABLE = ['name', 'type', 'report_frequency', 'active', 'note'] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const updates: Record<string, string | number | null> = {}
  for (const col of UPDATABLE) {
    if (col in body) {
      const v = body[col]
      if (col === 'active') {
        updates[col] = v ? 1 : 0
      } else {
        updates[col] = v === null || v === '' ? null : String(v).trim()
      }
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'no fields to update' }, { status: 400 })
  }

  try {
    for (const [col, val] of Object.entries(updates)) {
      switch (col) {
        case 'name':
          await prisma.$executeRaw`UPDATE ride_customer_companies SET name = ${val} WHERE id = ${id}`
          break
        case 'type':
          await prisma.$executeRaw`UPDATE ride_customer_companies SET type = ${val} WHERE id = ${id}`
          break
        case 'report_frequency':
          await prisma.$executeRaw`UPDATE ride_customer_companies SET report_frequency = ${val} WHERE id = ${id}`
          break
        case 'active':
          await prisma.$executeRaw`UPDATE ride_customer_companies SET active = ${val} WHERE id = ${id}`
          break
        case 'note':
          await prisma.$executeRaw`UPDATE ride_customer_companies SET note = ${val} WHERE id = ${id}`
          break
      }
    }
    const [row] = await prisma.$queryRaw<CompanyRow[]>`
      SELECT id, name, type, report_frequency, active, note,
             created_by, created_at, updated_at
        FROM ride_customer_companies
       WHERE id = ${id}
       LIMIT 1
    `
    if (!row)
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 고객사명' },
        { status: 409 }
      )
    }
    console.error('[/api/ride-customer-companies PATCH]', err.code, err.message)
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
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params
  try {
    await prisma.$executeRaw`UPDATE ride_customer_companies SET active = 0 WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-customer-companies DELETE]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
