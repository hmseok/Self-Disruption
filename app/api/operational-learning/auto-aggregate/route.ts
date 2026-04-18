import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { monthRange, serialize } from '@/lib/operational-learning-helpers'

// ═══════════════════════════════════════════════════════════════
// 자동 집계 API
//   POST /api/operational-learning/auto-aggregate
//     body: { snapshotId, fromMonth: "YYYY-MM", toMonth: "YYYY-MM" }
//     → snapshot의 vehicle_id 로 fmi_payments / fmi_accidents 월별 집계
//     → operational_actuals 에 source='auto_payment'/'auto_accident' 로 UPSERT
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { snapshotId, fromMonth, toMonth } = body

    if (!snapshotId) {
      return NextResponse.json({ error: 'snapshotId 필수' }, { status: 400 })
    }
    if (!fromMonth || !/^\d{4}-\d{2}$/.test(fromMonth)) {
      return NextResponse.json({ error: 'fromMonth YYYY-MM 필수' }, { status: 400 })
    }
    if (!toMonth || !/^\d{4}-\d{2}$/.test(toMonth)) {
      return NextResponse.json({ error: 'toMonth YYYY-MM 필수' }, { status: 400 })
    }

    // 1. 스냅샷 로드 → vehicle_id, contract_id 확보
    const snaps = await prisma.$queryRaw<any[]>`
      SELECT id, vehicle_id, contract_id FROM calc_snapshots WHERE id = ${snapshotId} LIMIT 1
    `
    if (snaps.length === 0) {
      return NextResponse.json({ error: '스냅샷을 찾을 수 없습니다' }, { status: 404 })
    }
    const snap = snaps[0]
    const vehicleId = snap.vehicle_id
    const contractId = snap.contract_id

    if (!vehicleId) {
      return NextResponse.json({
        error: '스냅샷에 vehicle_id가 없어 자동집계 불가',
      }, { status: 400 })
    }

    // 2. 대상 월 리스트
    const months = monthRange(fromMonth, toMonth)
    if (months.length > 120) {
      return NextResponse.json({ error: '최대 120개월까지만 지원' }, { status: 400 })
    }

    // 3. 월별 정비비 집계 (fmi_payments)
    //    payment_category='정비' 또는 '정비비' 기준
    const maintByMonth = await prisma.$queryRaw<any[]>`
      SELECT DATE_FORMAT(payment_date, '%Y-%m') AS ym,
             SUM(COALESCE(total_amount, amount)) AS total
      FROM fmi_payments
      WHERE vehicle_id = ${vehicleId}
        AND payment_category IN ('정비', '정비비', 'maintenance')
        AND payment_date >= ${fromMonth + '-01'}
        AND payment_date <= ${toMonth + '-31'}
      GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
    `
    const maintMap = new Map<string, number>()
    for (const r of maintByMonth) {
      maintMap.set(r.ym, Number(r.total || 0))
    }

    // 4. 월별 사고비용 집계 (fmi_accidents)
    //    차량번호로 매칭 — vehicle 테이블에서 plate_number 조회 후 사고 매칭
    let plateNumber: string | null = null
    const vehRows = await prisma.$queryRaw<any[]>`
      SELECT plate_number FROM fmi_vehicles WHERE id = ${vehicleId} LIMIT 1
    `
    if (vehRows.length > 0) plateNumber = vehRows[0].plate_number

    let accidentByMonth: any[] = []
    if (plateNumber) {
      accidentByMonth = await prisma.$queryRaw<any[]>`
        SELECT DATE_FORMAT(accident_date, '%Y-%m') AS ym,
               SUM(COALESCE(estimated_repair_cost, 0)) AS total
        FROM fmi_accidents
        WHERE customer_car_number = ${plateNumber}
          AND accident_date >= ${fromMonth + '-01'}
          AND accident_date <= ${toMonth + '-31'}
        GROUP BY DATE_FORMAT(accident_date, '%Y-%m')
      `
    }
    const accMap = new Map<string, number>()
    for (const r of accidentByMonth) {
      accMap.set(r.ym, Number(r.total || 0))
    }

    // 5. 각 월별 UPSERT
    const upserted: any[] = []
    for (const ym of months) {
      const maintenance = maintMap.get(ym) ?? null
      const accident = accMap.get(ym) ?? null

      // 둘 다 null이면 스킵
      if (maintenance === null && accident === null) continue

      // 기존 row 조회
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id, source, actual_depreciation, actual_insurance, actual_tax
        FROM operational_actuals
        WHERE snapshot_id = ${snapshotId} AND recorded_month = ${ym}
        LIMIT 1
      `

      const newSource = existing.length > 0 && existing[0].source === 'manual' ? 'mixed' : 'auto_payment'

      if (existing.length > 0) {
        // 기존 수동 입력값은 보존 (감가/보험/세금), 정비·사고만 덮어쓰기
        await prisma.$executeRaw`
          UPDATE operational_actuals
          SET
            actual_maintenance = COALESCE(${maintenance}, actual_maintenance),
            actual_accident_cost = COALESCE(${accident}, actual_accident_cost),
            source = ${newSource},
            notes = CONCAT(COALESCE(notes, ''), ' [auto-aggregate ', NOW(), ']'),
            updated_at = NOW()
          WHERE id = ${existing[0].id}
        `
        upserted.push({ month: ym, action: 'updated', id: existing[0].id })
      } else {
        const id = crypto.randomUUID()
        await prisma.$executeRaw`
          INSERT INTO operational_actuals (
            id, snapshot_id, contract_id, recorded_month,
            actual_maintenance, actual_accident_cost,
            source, notes, created_at, updated_at
          ) VALUES (
            ${id}, ${snapshotId}, ${contractId || null}, ${ym},
            ${maintenance}, ${accident},
            ${'auto_payment'}, ${`auto-aggregate from fmi_payments/accidents`}, NOW(), NOW()
          )
        `
        upserted.push({ month: ym, action: 'created', id })
      }
    }

    return NextResponse.json({
      data: {
        snapshot_id: snapshotId,
        vehicle_id: vehicleId,
        plate_number: plateNumber,
        months_processed: months.length,
        months_with_data: upserted.length,
        upserted: serialize(upserted),
      },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
