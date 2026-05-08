/**
 * /api/ride-vehicles
 *
 * GET  — 자체 DB 차량 목록
 * POST — 신규 등록
 *
 * 자체 FMI Cloud SQL 의 `ride_vehicles` 테이블 (PR-6.9 신규).
 * 카페24 측 pmccarsm 과 별도 — cafe24_idno 로 매칭만.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

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
  const status = url.searchParams.get('status')
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1),
    500
  )

  try {
    let rows: RideVehicleRow[]
    if (status && q) {
      const like = `%${q}%`
      rows = await prisma.$queryRaw<RideVehicleRow[]>`
        SELECT id, car_number, car_model, owner_name, owner_phone,
               cafe24_idno, status, note, created_by, created_at, updated_at
          FROM ride_vehicles
         WHERE status = ${status}
           AND (car_number LIKE ${like} OR car_model LIKE ${like} OR owner_name LIKE ${like})
         ORDER BY created_at DESC
         LIMIT ${limit}
      `
    } else if (status) {
      rows = await prisma.$queryRaw<RideVehicleRow[]>`
        SELECT id, car_number, car_model, owner_name, owner_phone,
               cafe24_idno, status, note, created_by, created_at, updated_at
          FROM ride_vehicles
         WHERE status = ${status}
         ORDER BY created_at DESC
         LIMIT ${limit}
      `
    } else if (q) {
      const like = `%${q}%`
      rows = await prisma.$queryRaw<RideVehicleRow[]>`
        SELECT id, car_number, car_model, owner_name, owner_phone,
               cafe24_idno, status, note, created_by, created_at, updated_at
          FROM ride_vehicles
         WHERE (car_number LIKE ${like} OR car_model LIKE ${like} OR owner_name LIKE ${like})
         ORDER BY created_at DESC
         LIMIT ${limit}
      `
    } else {
      rows = await prisma.$queryRaw<RideVehicleRow[]>`
        SELECT id, car_number, car_model, owner_name, owner_phone,
               cafe24_idno, status, note, created_by, created_at, updated_at
          FROM ride_vehicles
         ORDER BY created_at DESC
         LIMIT ${limit}
      `
    }
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { status, q },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      // 마이그레이션 미적용 — graceful fallback (규칙 23)
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true },
      })
    }
    console.error('[/api/ride-vehicles GET] error:', err.code, err.message)
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

  const car_number = String(body.car_number || '').trim()
  if (!car_number) {
    return NextResponse.json(
      { success: false, error: 'car_number 필수' },
      { status: 400 }
    )
  }

  const car_model = body.car_model ? String(body.car_model).trim() : null
  const owner_name = body.owner_name ? String(body.owner_name).trim() : null
  const owner_phone = body.owner_phone ? String(body.owner_phone).trim() : null
  const cafe24_idno = body.cafe24_idno ? String(body.cafe24_idno).trim() : null
  const status = body.status ? String(body.status).trim() : 'active'
  const note = body.note ? String(body.note) : null
  const id = randomUUID()
  const created_by = user.id

  try {
    await prisma.$executeRaw`
      INSERT INTO ride_vehicles
        (id, car_number, car_model, owner_name, owner_phone,
         cafe24_idno, status, note, created_by)
      VALUES
        (${id}, ${car_number}, ${car_model}, ${owner_name}, ${owner_phone},
         ${cafe24_idno}, ${status}, ${note}, ${created_by})
    `
    const [row] = await prisma.$queryRaw<RideVehicleRow[]>`
      SELECT id, car_number, car_model, owner_name, owner_phone,
             cafe24_idno, status, note, created_by, created_at, updated_at
        FROM ride_vehicles
       WHERE id = ${id}
       LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: '이미 등록된 차량번호' },
        { status: 409 }
      )
    }
    console.error('[/api/ride-vehicles POST] error:', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
