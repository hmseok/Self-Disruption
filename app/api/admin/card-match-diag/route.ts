import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// 카드 매칭 진단 — 어떤 last4 가 매칭 안 됐는지 분석
//
// GET /api/admin/card-match-diag
//
// 응답:
//   - transactions 의 last4 별 카운트 (excel_card 기반)
//   - corporate_cards 등록 상태
//   - 매핑 부재 last4 (top 20)
//   - 매핑 있지만 차량 미할당 last4
// ═══════════════════════════════════════════════════════════════════

function deriveLast4(card: { card_number: string | null; card_alias: string | null }): string | null {
  const num = String(card.card_number || '').replace(/\D/g, '')
  if (num.length >= 4) return num.slice(-4)
  const alias = String(card.card_alias || '').replace(/\D/g, '')
  if (alias.length >= 4) return alias.slice(-4)
  return null
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    // 1) transactions 의 last4 분포 (Excel 카드 + SMS 카드 모두)
    //    매칭 정의: 차량 직접 매칭 OR SMS→corporate_cards 연결됨 (직원 카드 포함)
    const txRows = await prisma.$queryRaw<Array<{
      last4: string
      total: bigint
      matched: bigint
      sms_count: bigint
    }>>`
      SELECT
        COALESCE(
          JSON_UNQUOTE(JSON_EXTRACT(t.raw_data, '$.card_last4')),
          RIGHT(REGEXP_SUBSTR(s.card_alias, '[0-9]+$'), 4)
        ) AS last4,
        COUNT(*) AS total,
        SUM(CASE
          WHEN t.related_type = 'car' AND t.related_id IS NOT NULL THEN 1
          WHEN s.card_id IS NOT NULL THEN 1
          ELSE 0
        END) AS matched,
        SUM(CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END) AS sms_count
      FROM transactions t
      LEFT JOIN card_sms_transactions s
        ON s.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
      WHERE t.deleted_at IS NULL
        AND (
          (t.imported_from LIKE 'excel_card%' AND JSON_EXTRACT(t.raw_data, '$.card_last4') IS NOT NULL)
          OR (t.imported_from = 'sms' AND s.card_alias IS NOT NULL)
        )
      GROUP BY last4
      HAVING last4 IS NOT NULL AND last4 != ''
      ORDER BY total DESC
    `

    // 2) corporate_cards 전체 + last4 추출 + 상태/부서 (사용자 의도 인식용)
    const cards = await prisma.$queryRaw<Array<{
      id: string; card_number: string | null; card_alias: string | null;
      holder_name: string | null;
      assigned_car_id: string | null; car_number: string | null;
      assigned_employee_id: string | null; employee_name: string | null;
      status: string | null; department: string | null; card_type: string | null;
    }>>`
      SELECT cc.id, cc.card_number, cc.card_alias, cc.holder_name,
             cc.assigned_car_id,
             car.number AS car_number,
             cc.assigned_employee_id,
             p.full_name AS employee_name,
             cc.status, cc.department, cc.card_type
        FROM corporate_cards cc
        LEFT JOIN cars car ON car.id COLLATE utf8mb4_unicode_ci = cc.assigned_car_id COLLATE utf8mb4_unicode_ci
        LEFT JOIN profiles p ON p.id COLLATE utf8mb4_unicode_ci = cc.assigned_employee_id COLLATE utf8mb4_unicode_ci
    `

    const cardLast4Map = new Map<string, typeof cards>()
    for (const c of cards) {
      const l4 = deriveLast4(c)
      if (!l4) continue
      if (!cardLast4Map.has(l4)) cardLast4Map.set(l4, [])
      cardLast4Map.get(l4)!.push(c)
    }

    // 3) 진단 분석
    const totalTx = txRows.reduce((s, r) => s + Number(r.total), 0)
    const totalMatched = txRows.reduce((s, r) => s + Number(r.matched), 0)
    const totalCards = cards.length
    const totalCardsWithCar = cards.filter(c => c.assigned_car_id).length

    // last4 별 진단 (사용자 의도 인식: 해지/공용/직원/차량 카드)
    const POOL_DEPTS = ['탁송팀', '배차팀', '공용']
    const diagnosis = txRows.map(r => {
      const last4 = r.last4
      const txCount = Number(r.total)
      const matched = Number(r.matched)
      const cardEntries = cardLast4Map.get(last4) || []
      const hasCard = cardEntries.length > 0
      const activeCards = cardEntries.filter(c => (c.status || 'active') !== 'canceled' && (c.status || 'active') !== 'inactive')
      const cancelledCards = cardEntries.filter(c => c.status === 'canceled' || c.status === 'inactive')
      const hasCarAssigned = activeCards.some(c => c.assigned_car_id)
      const hasEmployeeAssigned = activeCards.some(c => c.assigned_employee_id)
      const isPoolCard = activeCards.some(c => POOL_DEPTS.includes(String(c.department || '')))
      const ambiguous = activeCards.filter(c => c.assigned_car_id).length > 1

      // 분류 (사용자 인정 가능한 의도 반영):
      //   ok_car_card       : 차량 카드 (assigned_car_id) — 정상
      //   ok_employee_card  : 직원 카드 (assigned_employee_id, no car) — 정상
      //   ok_pool_card      : 공용 카드 (department=탁송팀/배차팀, no car) — 정상 의도
      //   ok_canceled       : 해지 카드 (status=canceled) — 정상 (사용 종료)
      //   no_card           : 카드 미등록
      //   no_assignment     : 카드 있지만 차량/직원/공용 모두 X (진짜 누락)
      //   ambiguous         : 같은 last4 차량 카드 2개 이상
      //   partial           : 일부만 매칭 (backfill 필요)
      let status: 'ok_car_card' | 'ok_employee_card' | 'ok_pool_card' | 'ok_canceled' |
                   'no_card' | 'no_assignment' | 'ambiguous' | 'partial'
      if (!hasCard) status = 'no_card'
      else if (activeCards.length === 0 && cancelledCards.length > 0) status = 'ok_canceled'
      else if (ambiguous) status = 'ambiguous'
      else if (hasCarAssigned) status = matched < txCount ? 'partial' : 'ok_car_card'
      else if (hasEmployeeAssigned) status = 'ok_employee_card'
      else if (isPoolCard) status = 'ok_pool_card'
      else status = 'no_assignment'

      return {
        last4,
        tx_count: txCount,
        matched_count: matched,
        unmatched_count: txCount - matched,
        sms_count: Number(r.sms_count),
        status,
        card_count: cardEntries.length,
        cars_assigned: activeCards
          .filter(c => c.assigned_car_id)
          .map(c => c.car_number || c.assigned_car_id)
          .filter(Boolean),
        employees: activeCards
          .filter(c => c.assigned_employee_id)
          .map(c => c.employee_name || c.holder_name)
          .filter(Boolean),
        holders: cardEntries.map(c => c.holder_name).filter(Boolean),
        departments: cardEntries.map(c => c.department).filter(Boolean),
        card_status: cardEntries.map(c => c.status).filter(Boolean),
      }
    })

    // status 별로 정리
    const groupByStatus = (s: string) => diagnosis.filter(d => d.status === s)
    const noCard = groupByStatus('no_card').sort((a, b) => b.tx_count - a.tx_count)
    const noAssignment = groupByStatus('no_assignment').sort((a, b) => b.tx_count - a.tx_count)
    const ambiguous = groupByStatus('ambiguous').sort((a, b) => b.tx_count - a.tx_count)
    const partial = groupByStatus('partial').sort((a, b) => b.tx_count - a.tx_count)
    const okCar = groupByStatus('ok_car_card').sort((a, b) => b.tx_count - a.tx_count)
    const okEmployee = groupByStatus('ok_employee_card').sort((a, b) => b.tx_count - a.tx_count)
    const okPool = groupByStatus('ok_pool_card').sort((a, b) => b.tx_count - a.tx_count)
    const okCanceled = groupByStatus('ok_canceled').sort((a, b) => b.tx_count - a.tx_count)

    return NextResponse.json({
      summary: {
        total_transactions: totalTx,
        matched_transactions: totalMatched,
        unmatched_transactions: totalTx - totalMatched,
        total_cards_registered: totalCards,
        cards_with_car_assigned: totalCardsWithCar,
        unique_last4_in_tx: txRows.length,
      },
      problems: {
        no_card_last4_count: noCard.length,
        no_card_tx_count: noCard.reduce((s, r) => s + r.tx_count, 0),
        no_assignment_last4_count: noAssignment.length,
        no_assignment_tx_count: noAssignment.reduce((s, r) => s + r.tx_count, 0),
        ambiguous_last4_count: ambiguous.length,
        partial_last4_count: partial.length,
      },
      // top 20 으로 제한 — alert 너무 길어지지 않도록
      top_no_card: noCard.slice(0, 20).map(r => ({
        last4: r.last4, tx: r.tx_count, sms: r.sms_count,
      })),
      top_no_assignment: noAssignment.slice(0, 20).map(r => ({
        last4: r.last4, tx: r.tx_count, holders: r.holders,
      })),
      top_partial: partial.slice(0, 10).map(r => ({
        last4: r.last4, total: r.tx_count, matched: r.matched_count, unmatched: r.unmatched_count,
        cars: r.cars_assigned,
      })),
      ok_employee_card: okEmployee.map(r => ({
        last4: r.last4, tx: r.tx_count, employees: r.employees,
      })),
      ok_pool_card: okPool.map(r => ({
        last4: r.last4, tx: r.tx_count, departments: r.departments, holders: r.holders,
      })),
      ok_canceled: okCanceled.map(r => ({
        last4: r.last4, tx: r.tx_count, holders: r.holders,
      })),
      ok_count: okCar.length + okEmployee.length + okPool.length + okCanceled.length,
    })
  } catch (e: any) {
    console.error('[GET /api/admin/card-match-diag]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
