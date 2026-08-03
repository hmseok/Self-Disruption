import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { normInsurer } from '@/lib/insurer'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════════
// 라이드(빌려타) 월 대차료 정산 임포트 (2026-08-01)
//
// 사용자 확정 구조: 라이드 소유 차량의 대차 건은 보험사가 라이드에 입금하고
// 라이드가 월 마감으로 일괄 정산 — 마감엑셀의 건별 내역(입금일/보험사/고객차/금액)을
// ride_settlement_deposits 에 보관하고 fmi_rentals 와 매칭한다.
// 매칭: 고객차 끝4자리 → (복수면) 보험사명 일치 → 배차일 근접.
//
// POST { month: 'YYYY-MM', deposits: RideDeposit[] }  → 멱등 upsert + 자동 매칭
// GET  ?month=YYYY-MM                                 → 저장된 내역 + 매칭 현황
// ═══════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
}
const last4 = (s: unknown) => {
  const m = String(s || '').match(/(\d{4})\D*$/)
  return m ? m[1] : null
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const month: string = String(body?.month || '')
    const deposits: any[] = Array.isArray(body?.deposits) ? body.deposits : []
    const vehicles: any[] = Array.isArray(body?.vehicles) ? body.vehicles : []
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'month 는 YYYY-MM' }, { status: 400 })
    if (deposits.length === 0) return NextResponse.json({ error: 'deposits 비어있음' }, { status: 400 })

    // 차량별 월렌트료(지입료) upsert — 정산 상계 구조라 손익의 유일한 원천 (2026-08-03)
    let feesUpserted = 0
    for (const v of vehicles) {
      const fee = Number(v?.monthlyFee) || 0
      if (!v?.vehicleNumber || fee <= 0) continue
      await prisma.$executeRawUnsafe(
        `INSERT INTO ride_settlement_fees (id, settle_month, vehicle_number, monthly_fee)
         VALUES (UUID(), ?, ?, ?)
         ON DUPLICATE KEY UPDATE monthly_fee = VALUES(monthly_fee), updated_at = NOW(3)`,
        month, String(v.vehicleNumber), fee)
      feesUpserted += 1
    }

    // 매칭 대상 대차건 (전체 — 과거 정산분도 처리)
    const rentals = await prisma.$queryRaw<any[]>`
      SELECT id, customer_car_number, insurance_company, dispatch_date, vehicle_car_number
        FROM fmi_rentals`
    const byCarLast4 = new Map<string, any[]>()
    const byVehicle = new Map<string, any[]>()
    for (const r of rentals) {
      const l4 = last4(r.customer_car_number)
      if (l4) {
        if (!byCarLast4.has(l4)) byCarLast4.set(l4, [])
        byCarLast4.get(l4)!.push(r)
      }
      const veh = String(r.vehicle_car_number || '').replace(/\s+/g, '')
      if (veh) {
        if (!byVehicle.has(veh)) byVehicle.set(veh, [])
        byVehicle.get(veh)!.push(r)
      }
    }
    const nearestByDate = (pool: any[], date: string | null) =>
      [...pool].sort((a, b) =>
        Math.abs(new Date(a.dispatch_date || 0).getTime() - new Date(date || 0).getTime())
      - Math.abs(new Date(b.dispatch_date || 0).getTime() - new Date(date || 0).getTime()))[0]

    let inserted = 0, duplicated = 0, matched = 0, unmatched = 0
    const unmatchedList: any[] = []

    for (const d of deposits) {
      const amount = Number(d.amount) || 0
      if (amount <= 0) continue

      // 매칭
      let rentalId: string | null = null
      let matchBy: string = 'none'
      const l4 = last4(d.customerCar)
      if (l4 && byCarLast4.has(l4)) {
        const pool = byCarLast4.get(l4)!
        if (pool.length === 1) { rentalId = pool[0].id; matchBy = 'car' }
        else {
          const ins = normInsurer(d.insurer)
          const insMatch = pool.filter(r => normInsurer(r.insurance_company) === ins)
          const pick = nearestByDate(insMatch.length ? insMatch : pool, d.depositDate)
          if (pick) { rentalId = pick.id; matchBy = insMatch.length ? 'car+insurer' : 'car' }
        }
      }
      // 폴백: 고객차가 차량번호가 아닌 항목(휴차손해료 등) — 대차차량번호로 매칭
      if (!rentalId && d.vehicleNumber) {
        const veh = String(d.vehicleNumber).replace(/\s+/g, '')
        const pool = byVehicle.get(veh)
        if (pool?.length) {
          const ins = normInsurer(d.insurer)
          const insMatch = pool.filter(r => normInsurer(r.insurance_company) === ins)
          const pick = nearestByDate(insMatch.length ? insMatch : pool, d.depositDate)
          if (pick) { rentalId = pick.id; matchBy = insMatch.length ? 'vehicle+insurer' : 'vehicle' }
        }
      }

      // 멱등 삽입 (UNIQUE 키 충돌 = 중복)
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO ride_settlement_deposits
             (id, settle_month, vehicle_number, deposit_date, insurer, customer_car, amount, rental_id, match_by, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          randomUUID(), month, d.vehicleNumber || null, d.depositDate || null,
          d.insurer || null, d.customerCar || null, amount, rentalId, matchBy,
          d.vehicleModel ? `차종: ${d.vehicleModel}` : null)
        inserted += 1
        if (rentalId) matched += 1
        else { unmatched += 1; unmatchedList.push({ vehicle: d.vehicleNumber, customerCar: d.customerCar, insurer: d.insurer, amount }) }
      } catch (e: any) {
        if (/Duplicate entry/i.test(e?.message || '')) { duplicated += 1; continue }
        throw e
      }
    }

    return NextResponse.json({
      data: { month, received: deposits.length, inserted, duplicated, matched, unmatched, unmatchedList, feesUpserted },
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/operations/ride-settlement]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const month = request.nextUrl.searchParams.get('month')
    const rows = month
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT rs.*, r.customer_name AS matched_customer
             FROM ride_settlement_deposits rs
             LEFT JOIN fmi_rentals r ON r.id = rs.rental_id
            WHERE rs.settle_month = ? ORDER BY rs.vehicle_number, rs.deposit_date`, month)
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT settle_month, COUNT(*) AS c, SUM(amount) AS total,
                  SUM(rental_id IS NOT NULL) AS matched_c
             FROM ride_settlement_deposits GROUP BY settle_month ORDER BY settle_month DESC`)
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    console.error('[GET /api/operations/ride-settlement]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
