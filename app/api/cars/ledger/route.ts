import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// GET /api/cars/ledger — 차량 원장 (2026-08-03 재정리, 목업 cars-redesign)
//
// 소속(지입 빌려타/직영 FMI)·총 취득가·보험(최신 계약)·검사만기·서류 현황을
// 한 번에 — cars 기존 컬럼 + insurance_contracts 최신건 조인.
// ═══════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const N = (v: any) => Number(v || 0)

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const cars = await prisma.$queryRaw<any[]>`
      SELECT id, number, brand, model, trim, year, status, image_url,
             fuel, mileage, ownership_type, purchase_method,
             inspection_end_date, vehicle_age_expiry, registration_image_url,
             purchase_price, total_cost, registration_tax, bond_amount,
             delivery_fee, plate_fee, agency_fee, other_initial_cost, is_used,
             owner_name, consignment_fee, consignment_start, consignment_end,
             consignment_contract_url, location
        FROM cars
       WHERE status != 'deleted'
       ORDER BY (ownership_type = '빌려타'), number`

    // 지입료 누적 (빌려타 정산서 월렌트료 합) — 차량 숫자 키 기준
    const feeCumByDigits = new Map<string, { total: number; months: number }>()
    try {
      const fees = await prisma.$queryRaw<any[]>`
        SELECT vehicle_number, SUM(monthly_fee) total, COUNT(*) months
          FROM ride_settlement_fees GROUP BY vehicle_number`
      for (const f of fees) {
        feeCumByDigits.set(String(f.vehicle_number || '').replace(/[^0-9]/g, ''), {
          total: N(f.total), months: N(f.months),
        })
      }
    } catch { /* 테이블 미생성 — 누적 없이 진행 */ }

    // 최신 보험 계약 — car_id 직접 연결 + 차량 분담(allocations) 연결 모두 (end_date 최신 1건)
    const insByCar = new Map<string, any>()
    try {
      const ins = await prisma.$queryRaw<any[]>`
        SELECT l.link_car_id AS car_id, ic.insurance_company, ic.policy_number, ic.start_date, ic.end_date,
               ic.coverage_own_damage, ic.total_premium, ic.premium,
               ic.certificate_url, ic.insurance_image_url
          FROM (
            SELECT car_id AS link_car_id, id AS contract_id FROM insurance_contracts WHERE car_id IS NOT NULL
            UNION
            SELECT car_id, contract_id FROM insurance_vehicle_allocations WHERE car_id IS NOT NULL
          ) l
          JOIN insurance_contracts ic ON ic.id = l.contract_id
         ORDER BY ic.end_date DESC`
      for (const i of ins) if (!insByCar.has(i.car_id)) insByCar.set(i.car_id, i)
    } catch { /* 보험 테이블 이슈 — 보험 없이 진행 */ }

    const today = Date.now()
    const dday = (d: any) => d ? Math.ceil((new Date(d).getTime() - today) / 86400000) : null

    const data = cars.map((c) => {
      const parts = [c.purchase_price, c.registration_tax, c.bond_amount, c.delivery_fee, c.plate_fee, c.agency_fee, c.other_initial_cost].map(N)
      const partsSum = parts.reduce((s, v) => s + v, 0)
      const totalCost = N(c.total_cost) > 0 ? N(c.total_cost) : partsSum
      const ins = insByCar.get(c.id) || null
      return {
        id: c.id, number: c.number, brand: c.brand, model: c.model, trim: c.trim,
        year: c.year, status: c.status, image_url: c.image_url, fuel: c.fuel, mileage: c.mileage,
        location: c.location,
        vehicle_class: c.ownership_type === '빌려타' ? 'ride' : c.ownership_type === 'company' ? 'own' : 'unknown',
        owner_name: c.owner_name,
        consignment_fee: N(c.consignment_fee) || null,
        consignment_cum: feeCumByDigits.get(String(c.number || '').replace(/[^0-9]/g, '')) || null,
        total_cost: totalCost || null,
        purchase_price: N(c.purchase_price) || null,
        is_used: Boolean(c.is_used),
        purchase_method: c.purchase_method || null,
        inspection_end_date: c.inspection_end_date,
        inspection_dday: dday(c.inspection_end_date),
        insurance: ins ? {
          company: ins.insurance_company,
          end_date: ins.end_date,
          dday: dday(ins.end_date),
          own_damage: ins.coverage_own_damage,
          premium: N(ins.total_premium) || N(ins.premium) || null,
          has_certificate: Boolean(ins.certificate_url || ins.insurance_image_url),
        } : null,
        docs: {
          registration: Boolean(c.registration_image_url),
          consignment_contract: Boolean(c.consignment_contract_url),
          photo: Boolean(c.image_url),
        },
      }
    })

    const summary = {
      total: data.length,
      ride: data.filter((c) => c.vehicle_class === 'ride').length,
      own: data.filter((c) => c.vehicle_class === 'own').length,
      own_total_cost: data.filter((c) => c.vehicle_class === 'own').reduce((s, c) => s + N(c.total_cost), 0),
      ride_monthly_fee: data.filter((c) => c.vehicle_class === 'ride').reduce((s, c) => s + N(c.consignment_fee), 0),
      insurance_expiring: data.filter((c) => c.insurance?.dday != null && c.insurance.dday <= 90 && c.insurance.dday >= 0).length,
      docs_missing: data.filter((c) => !c.docs.registration).length,
    }

    return NextResponse.json({ data, summary, error: null })
  } catch (e: any) {
    console.error('[GET /api/cars/ledger]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
