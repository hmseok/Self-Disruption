import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { loadVehicleClassMap, classifyVehicle } from '@/lib/vehicle-class'

// ═══════════════════════════════════════════════════════════════════
// GET /api/finance/ar — 수금 통합 (장부 「수금」 탭, 2026-08-03 사용자 확정)
//
// 회사 관점 채권: 단기·대차 청구와 (추후) 장기 렌트료의 청구→수납→미수.
// 1단계 범위 (청구액 데이터가 아직 없어 플래그·수납 중심):
//   monthly : 월별 수납 흐름 — 통장 매칭분 + 빌려타 정산분
//   waiting : 청구완료(시트 sheet_billed)인데 입금 흔적 없는 건 — 경과일 순
//   ledger  : 채권 원장 (최근 배차건: 소속/청구액/수납액/경로/상태)
// ═══════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const N = (v: any) => Number(v || 0)

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const months = Math.min(24, Math.max(3, Number(request.nextUrl.searchParams.get('months')) || 6))

    const vehClassMap = await loadVehicleClassMap()

    const [bankMonthly, rideMonthly, rentals] = await Promise.all([
      // 통장 수납 — 대차건에 연결된 입금 (입금월 기준)
      prisma.$queryRawUnsafe<any[]>(`
        SELECT DATE_FORMAT(t.transaction_date,'%Y-%m') m, SUM(t.amount) amt, COUNT(*) c
          FROM transactions t
         WHERE t.related_type = 'fmi_rental' AND t.type = 'income' AND t.deleted_at IS NULL
           AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL ${months} MONTH)
         GROUP BY m ORDER BY m DESC`),
      // 빌려타 정산 수납 (입금일 기준 월)
      prisma.$queryRawUnsafe<any[]>(`
        SELECT DATE_FORMAT(deposit_date,'%Y-%m') m, SUM(amount) amt, COUNT(*) c
          FROM ride_settlement_deposits
         WHERE deposit_date IS NOT NULL
           AND deposit_date >= DATE_SUB(CURDATE(), INTERVAL ${months} MONTH)
         GROUP BY m ORDER BY m DESC`),
      // 배차건 + 수납 (원장·입금대기 재료)
      prisma.$queryRawUnsafe<any[]>(`
        SELECT r.id, r.customer_name, r.customer_car_number, r.vehicle_car_number,
               r.insurance_company, r.dispatch_date, r.actual_return_date, r.status,
               r.final_claim_amount, r.sheet_billed, r.sheet_paid,
               COALESCE(p.paid, 0) bank_paid, p.last_paid,
               COALESCE(rs.ride, 0) ride_paid, rs.last_ride
          FROM fmi_rentals r
          LEFT JOIN (SELECT related_id, SUM(amount) paid, MAX(transaction_date) last_paid
                       FROM transactions
                      WHERE related_type='fmi_rental' AND type='income' AND deleted_at IS NULL
                      GROUP BY related_id) p ON p.related_id = r.id
          LEFT JOIN (SELECT rental_id, SUM(amount) ride, MAX(deposit_date) last_ride
                       FROM ride_settlement_deposits WHERE rental_id IS NOT NULL
                      GROUP BY rental_id) rs ON rs.rental_id = r.id
         WHERE r.dispatch_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         ORDER BY r.dispatch_date DESC
         LIMIT 1200`),
    ])

    // 월별 병합
    const monthMap = new Map<string, { month: string; bank: number; bank_count: number; ride: number; ride_count: number }>()
    for (const b of bankMonthly) {
      monthMap.set(b.m, { month: b.m, bank: N(b.amt), bank_count: N(b.c), ride: 0, ride_count: 0 })
    }
    for (const r of rideMonthly) {
      const e = monthMap.get(r.m) || { month: r.m, bank: 0, bank_count: 0, ride: 0, ride_count: 0 }
      e.ride = N(r.amt); e.ride_count = N(r.c)
      monthMap.set(r.m, e)
    }
    const monthly = [...monthMap.values()].sort((a, b) => b.month.localeCompare(a.month))

    const today = Date.now()
    const items = rentals.map((r) => {
      const bank = N(r.bank_paid)
      const ride = N(r.ride_paid)
      const claim = r.final_claim_amount != null ? N(r.final_claim_amount) : null
      const billed = Boolean(String(r.sheet_billed || '').trim()) || r.status === 'claiming' || r.status === 'settled'
      const paidFlag = Boolean(String(r.sheet_paid || '').trim())
      const received = bank + ride
      const cls = classifyVehicle(vehClassMap, r.vehicle_car_number)
      const baseDate = r.actual_return_date || r.dispatch_date
      const elapsed = baseDate ? Math.floor((today - new Date(baseDate).getTime()) / 86400000) : null
      // 상태: 수납 > 시트입금 표기 > 청구완료·대기 > 미청구
      const arState = received > 0 ? 'received' : paidFlag ? 'paid_flag' : billed ? 'waiting' : 'unbilled'
      return {
        id: r.id,
        customer_name: r.customer_name,
        customer_car_number: r.customer_car_number,
        vehicle_car_number: r.vehicle_car_number,
        insurance_company: r.insurance_company,
        dispatch_date: r.dispatch_date,
        return_date: r.actual_return_date,
        status: r.status,
        vehicle_class: cls,
        claim_amount: claim,
        bank_paid: bank,
        ride_paid: ride,
        received,
        last_received: r.last_paid || r.last_ride,
        sheet_billed: r.sheet_billed,
        sheet_paid: r.sheet_paid,
        ar_state: arState,
        elapsed_days: elapsed,
      }
    })

    const waiting = items
      .filter((x) => x.ar_state === 'waiting')
      .sort((a, b) => (b.elapsed_days || 0) - (a.elapsed_days || 0))

    const summary = {
      month_now: monthly[0] || null,
      ride_last: rideMonthly[0] ? { month: rideMonthly[0].m, total: N(rideMonthly[0].amt), count: N(rideMonthly[0].c) } : null,
      waiting_count: waiting.length,
      waiting_over14: waiting.filter((x) => (x.elapsed_days || 0) >= 14).length,
      claim_missing: items.filter((x) => x.claim_amount == null || x.claim_amount === 0).length,
      claim_outstanding: items.reduce((s, x) =>
        x.claim_amount && x.claim_amount > x.received ? s + (x.claim_amount - x.received) : s, 0),
    }

    return NextResponse.json({ monthly, waiting: waiting.slice(0, 100), ledger: items, summary, error: null })
  } catch (e: any) {
    console.error('[GET /api/finance/ar]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
