import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/finance/cars-to-fmi-vehicles-sync
 *
 * cars (legacy INT id) → fmi_vehicles (UUID) 데이터 동기화 (PR-UX14, 2026-05-10).
 *
 * 사용자 진단: fmi_vehicles 0건 / cars 다수
 *   - fmi_rentals.vehicle_id FK → fmi_vehicles.id 인데
 *   - fmi_vehicles 비어있어서 매핑 불가 → 「차량 미등록」 다발
 *
 * 동기화 로직:
 *   1. cars 테이블의 모든 차량 SELECT
 *   2. fmi_vehicles 에 같은 car_number 가 있으면 skip
 *   3. 없으면 UUID 새로 생성 + fmi_vehicles INSERT
 *   4. (선택) cars.id ↔ fmi_vehicles.id 매핑 테이블 (필요 시)
 *
 * GET — 동기화 가능 통계 (dry-run 효과)
 * POST { dryRun?: false } — 실제 INSERT
 */
export const maxDuration = 120
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // cars 통계
    const carsStats = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status != 'deleted' AND number IS NOT NULL AND number != '' THEN 1 ELSE 0 END) AS active
         FROM cars`,
    ).catch(() => [{ total: 0, active: 0 }])

    // fmi_vehicles 통계
    const fvStats = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT COUNT(*) AS total FROM fmi_vehicles`,
    ).catch(() => [{ total: 0 }])

    // 동기화 가능 — cars 에 있고 fmi_vehicles 에 없는
    const syncable = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT c.id AS cars_id, c.number, c.brand, c.model, c.year, c.status
         FROM cars c
         LEFT JOIN fmi_vehicles fv
           ON fv.car_number = c.number
           OR REPLACE(fv.car_number, ' ', '') = REPLACE(c.number, ' ', '')
        WHERE fv.id IS NULL
          AND c.number IS NOT NULL AND c.number != ''
          AND c.status != 'deleted'
        LIMIT 1000`,
    ).catch(() => [])

    return NextResponse.json({
      cars_total: Number(carsStats[0]?.total || 0),
      cars_active: Number(carsStats[0]?.active || 0),
      fmi_vehicles_total: Number(fvStats[0]?.total || 0),
      syncable_count: syncable.length,
      sample: syncable.slice(0, 10).map((r: any) => ({
        cars_id: r.cars_id,
        car_number: r.number,
        brand: r.brand,
        model: r.model,
        year: r.year,
        status: r.status,
      })),
    })
  } catch (e: any) {
    console.error('[cars-to-fmi-vehicles-sync GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    // 동기화 후보 조회
    const syncable = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT c.id AS cars_id, c.number, c.brand, c.model, c.year, c.status
         FROM cars c
         LEFT JOIN fmi_vehicles fv
           ON fv.car_number = c.number
           OR REPLACE(fv.car_number, ' ', '') = REPLACE(c.number, ' ', '')
        WHERE fv.id IS NULL
          AND c.number IS NOT NULL AND c.number != ''
          AND c.status != 'deleted'`,
    ).catch(() => [])

    let inserted = 0
    let skipped = 0
    const errors: any[] = []

    for (const r of syncable) {
      try {
        const carNumber = String(r.number || '').trim()
        if (!carNumber) { skipped++; continue }

        if (dryRun) { inserted++; continue }

        const newId = randomUUID()
        await prisma.$executeRawUnsafe(
          `INSERT IGNORE INTO fmi_vehicles
             (id, car_number, car_brand, car_model, car_year, ownership_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'owned', NOW(), NOW())`,
          newId, carNumber, r.brand || null, r.model || null, r.year || null,
        )
        inserted++
      } catch (e: any) {
        if (errors.length < 20) {
          errors.push({
            cars_id: r.cars_id, car_number: r.number,
            reason: e?.message?.slice(0, 200) || String(e),
          })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      inserted,
      skipped,
      total_candidates: syncable.length,
      errors,
      message: dryRun
        ? `dry-run — ${inserted}건 INSERT 가능 / ${skipped}건 skip`
        : `${inserted}건 fmi_vehicles INSERT 완료 (${errors.length}건 실패)`,
    })
  } catch (e: any) {
    console.error('[cars-to-fmi-vehicles-sync POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
