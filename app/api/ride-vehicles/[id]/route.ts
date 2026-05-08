/**
 * /api/ride-vehicles/[id]
 *
 * PATCH  — 자체 DB 차량 수정
 * DELETE — soft delete (status='inactive')
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface RideVehicleRow {
  id: string
  car_number: string
  car_model: string | null
  owner_name: string | null
  owner_phone: string | null
  cafe24_idno: string | null
  status: string
  note: string | null
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

const UPDATABLE_COLUMNS = [
  'car_number',
  'car_model',
  'owner_name',
  'owner_phone',
  'cafe24_idno',
  'status',
  'note',
] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  // 화이트리스트 컬럼만 PATCH (CLAUDE.md SQL Injection 방지)
  const updates: Record<string, string | null> = {}
  for (const col of UPDATABLE_COLUMNS) {
    if (col in body) {
      const v = body[col]
      updates[col] = v === null || v === '' ? null : String(v).trim()
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: 'no fields to update' },
      { status: 400 }
    )
  }

  try {
    // 안전한 컬럼별 분기 (화이트리스트 검증 후) — tagged template 사용
    for (const [col, val] of Object.entries(updates)) {
      switch (col) {
        case 'car_number':
          await prisma.$executeRaw`UPDATE ride_vehicles SET car_number = ${val} WHERE id = ${id}`
          break
        case 'car_model':
          await prisma.$executeRaw`UPDATE ride_vehicles SET car_model = ${val} WHERE id = ${id}`
          break
        case 'owner_name':
          await prisma.$executeRaw`UPDATE ride_vehicles SET owner_name = ${val} WHERE id = ${id}`
          break
        case 'owner_phone':
          await prisma.$executeRaw`UPDATE ride_vehicles SET owner_phone = ${val} WHERE id = ${id}`
          break
        case 'cafe24_idno':
          await prisma.$executeRaw`UPDATE ride_vehicles SET cafe24_idno = ${val} WHERE id = ${id}`
          break
        case 'status':
          await prisma.$executeRaw`UPDATE ride_vehicles SET status = ${val} WHERE id = ${id}`
          break
        case 'note':
          await prisma.$executeRaw`UPDATE ride_vehicles SET note = ${val} WHERE id = ${id}`
          break
      }
    }
    const [row] = await prisma.$queryRaw<RideVehicleRow[]>`
      SELECT id, car_number, car_model, owner_name, owner_phone,
             cafe24_idno, status, note, created_by, created_at, updated_at
        FROM ride_vehicles
       WHERE id = ${id}
       LIMIT 1
    `
    if (!row) {
      return NextResponse.json({ success: false, error: 'not-found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 차량번호' },
        { status: 409 }
      )
    }
    console.error('[/api/ride-vehicles PATCH] error:', err.code, err.message)
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
  if (!user) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }
  const { id } = await params

  try {
    // soft delete — status='inactive' (HARD DELETE 위험 — 규칙 prohibited)
    await prisma.$executeRaw`UPDATE ride_vehicles SET status = 'inactive' WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-vehicles DELETE] error:', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
