import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/finance/fmi-rentals-fix
 *
 * fmi_rentals 진단 + 일괄 매핑 도구 (PR-UX13, 2026-05-09).
 *
 * 사용자 보고: fmi_rentals 의 vehicle_id 가 누락되어 매처가 「차량 미등록」 표시
 *
 * GET — 진단 (vehicle_id 누락 통계 + 매핑 가능 후보)
 * POST { dryRun?: false } — 일괄 매핑:
 *   1. fmi_rentals.vehicle_id NULL 인 row 들
 *   2. vehicle_car_number → cars.number 자동 검색
 *   3. 1대 hit 시 vehicle_id 자동 채움
 *   4. 매핑 실패 row 는 사용자 수동 매핑 필요 (별도 UI)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // 진단 — fmi_rentals 통계
    const stats = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN vehicle_id IS NULL OR vehicle_id = '' THEN 1 ELSE 0 END) AS missing_vehicle_id,
        SUM(CASE WHEN vehicle_id IS NOT NULL AND vehicle_id != '' THEN 1 ELSE 0 END) AS has_vehicle_id,
        SUM(CASE WHEN (vehicle_id IS NULL OR vehicle_id = '')
                  AND vehicle_car_number IS NOT NULL AND vehicle_car_number != '' THEN 1 ELSE 0 END) AS mappable,
        SUM(CASE WHEN (vehicle_id IS NULL OR vehicle_id = '')
                  AND (vehicle_car_number IS NULL OR vehicle_car_number = '') THEN 1 ELSE 0 END) AS unmappable
      FROM fmi_rentals
    `).catch(() => [{ total: 0, missing_vehicle_id: 0 }])

    // 매핑 후보 샘플 — PR-UX13 hotfix: cars → fmi_vehicles (FK 대상)
    const candidates = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT
        fr.id, fr.customer_car_number, fr.vehicle_car_number, fr.insurance_company,
        fr.dispatch_date,
        fv.id AS car_id, fv.car_number AS car_number, fv.car_brand AS brand, fv.car_model AS model
      FROM fmi_rentals fr
      LEFT JOIN fmi_vehicles fv ON fv.car_number = fr.vehicle_car_number
                                OR REPLACE(fv.car_number, ' ', '') = REPLACE(fr.vehicle_car_number, ' ', '')
      WHERE (fr.vehicle_id IS NULL OR fr.vehicle_id = '')
        AND fr.vehicle_car_number IS NOT NULL AND fr.vehicle_car_number != ''
      ORDER BY fr.dispatch_date DESC
      LIMIT 20
    `).catch(() => [])

    const totalRow = stats[0] || {}
    const autoMappable = candidates.filter((r: any) => r.car_id).length
    const manualNeeded = candidates.filter((r: any) => !r.car_id).length

    return NextResponse.json({
      stats: {
        total: Number(totalRow.total || 0),
        missing_vehicle_id: Number(totalRow.missing_vehicle_id || 0),
        has_vehicle_id: Number(totalRow.has_vehicle_id || 0),
        mappable: Number(totalRow.mappable || 0),
        unmappable: Number(totalRow.unmappable || 0),
      },
      sample_candidates: candidates.slice(0, 10).map((r: any) => ({
        fmi_id: r.id,
        customer_car: r.customer_car_number,
        vehicle_car: r.vehicle_car_number,
        insurer: r.insurance_company,
        dispatch_date: r.dispatch_date,
        cars_match: r.car_id ? {
          id: r.car_id, number: r.car_number, model: `${r.brand || ''} ${r.model || ''}`.trim(),
        } : null,
      })),
      sample_auto_mappable: autoMappable,
      sample_manual_needed: manualNeeded,
    })
  } catch (e: any) {
    console.error('[fmi-rentals-fix GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    // ── 일괄 매핑 — PR-UX13 hotfix: cars → fmi_vehicles (FK 대상) ──
    // 1대 hit 만 매핑 (다대 hit 면 사용자 수동 결정)
    const candidates = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT
        fr.id, fr.vehicle_car_number,
        (SELECT GROUP_CONCAT(fv.id) FROM fmi_vehicles fv
          WHERE fv.car_number = fr.vehicle_car_number
             OR REPLACE(fv.car_number, ' ', '') = REPLACE(fr.vehicle_car_number, ' ', '')
        ) AS car_ids
      FROM fmi_rentals fr
      WHERE (fr.vehicle_id IS NULL OR fr.vehicle_id = '')
        AND fr.vehicle_car_number IS NOT NULL AND fr.vehicle_car_number != ''
    `).catch(() => [])

    let updated = 0
    let multiMatch = 0
    let noMatch = 0
    let updateErrors = 0
    const samples: any[] = []
    const errors: any[] = []

    for (const r of candidates) {
      const carIds = r.car_ids ? String(r.car_ids).split(',').filter(Boolean) : []
      if (carIds.length === 0) {
        noMatch++
        continue
      }
      if (carIds.length > 1) {
        multiMatch++
        if (samples.length < 20) {
          samples.push({
            fmi_id: r.id, vehicle_car: r.vehicle_car_number,
            car_ids: carIds, reason: '다중 차량 — 사용자 수동 결정 필요',
          })
        }
        continue
      }
      // 1대 hit — 매핑
      const carId = carIds[0]
      if (samples.length < 20) {
        samples.push({
          fmi_id: r.id, vehicle_car: r.vehicle_car_number, car_id: carId,
        })
      }
      if (!dryRun) {
        try {
          // FK 안전 검증 — UPDATE 직전 fmi_vehicles 존재 재확인 (PR-UX13 hotfix)
          const checkCar = await prisma.$queryRawUnsafe<Array<any>>(
            `SELECT id FROM fmi_vehicles WHERE id = ? LIMIT 1`, carId,
          )
          if (!checkCar[0]) {
            updateErrors++
            if (errors.length < 20) {
              errors.push({
                fmi_id: r.id, car_id: carId,
                reason: 'fmi_vehicles 테이블에 없음 (삭제됐거나 collation 충돌)',
              })
            }
            continue
          }
          await prisma.$executeRawUnsafe(
            `UPDATE fmi_rentals SET vehicle_id = ?, updated_at = NOW() WHERE id = ?`,
            carId, r.id,
          )
          updated++
        } catch (e: any) {
          updateErrors++
          if (errors.length < 20) {
            errors.push({
              fmi_id: r.id, car_id: carId,
              reason: e?.message?.slice(0, 200) || String(e),
            })
          }
        }
      } else {
        updated++ // dry-run
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      updated,
      multi_match: multiMatch,
      no_match: noMatch,
      update_errors: updateErrors,
      total_candidates: candidates.length,
      samples,
      errors,
      message: dryRun
        ? `dry-run — ${updated}건 자동 매핑 가능 / ${multiMatch}건 다중 / ${noMatch}건 매핑 불가`
        : `${updated}건 vehicle_id 자동 채움 (${multiMatch}건 수동 / ${updateErrors}건 FK 오류)`,
    })
  } catch (e: any) {
    console.error('[fmi-rentals-fix POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
