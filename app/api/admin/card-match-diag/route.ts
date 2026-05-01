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
    //    raw_data.card_last4 또는 card_alias 끝4자리
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
        SUM(CASE WHEN t.related_type = 'car' AND t.related_id IS NOT NULL THEN 1 ELSE 0 END) AS matched,
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

    // 2) corporate_cards 전체 + last4 추출
    const cards = await prisma.$queryRaw<Array<{
      id: string; card_number: string | null; card_alias: string | null;
      holder_name: string | null; assigned_car_id: string | null;
      car_number: string | null
    }>>`
      SELECT cc.id, cc.card_number, cc.card_alias, cc.holder_name, cc.assigned_car_id,
             car.number AS car_number
        FROM corporate_cards cc
        LEFT JOIN cars car ON car.id COLLATE utf8mb4_unicode_ci = cc.assigned_car_id COLLATE utf8mb4_unicode_ci
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

    // last4 별 진단
    const diagnosis = txRows.map(r => {
      const last4 = r.last4
      const txCount = Number(r.total)
      const matched = Number(r.matched)
      const cardEntries = cardLast4Map.get(last4) || []
      const hasCard = cardEntries.length > 0
      const hasCarAssigned = cardEntries.some(c => c.assigned_car_id)
      const ambiguous = cardEntries.filter(c => c.assigned_car_id).length > 1

      let status: 'ok' | 'no_card' | 'no_car' | 'ambiguous' | 'partial'
      if (!hasCard) status = 'no_card'
      else if (!hasCarAssigned) status = 'no_car'
      else if (ambiguous) status = 'ambiguous'
      else if (matched < txCount) status = 'partial'
      else status = 'ok'

      return {
        last4,
        tx_count: txCount,
        matched_count: matched,
        unmatched_count: txCount - matched,
        sms_count: Number(r.sms_count),
        status,
        card_count: cardEntries.length,
        cars_assigned: cardEntries
          .filter(c => c.assigned_car_id)
          .map(c => c.car_number || c.assigned_car_id)
          .filter(Boolean),
        holders: cardEntries.map(c => c.holder_name).filter(Boolean),
      }
    })

    // status 별로 정리
    const groupByStatus = (s: string) => diagnosis.filter(d => d.status === s)
    const noCard = groupByStatus('no_card').sort((a, b) => b.tx_count - a.tx_count)
    const noCar = groupByStatus('no_car').sort((a, b) => b.tx_count - a.tx_count)
    const ambiguous = groupByStatus('ambiguous').sort((a, b) => b.tx_count - a.tx_count)
    const partial = groupByStatus('partial').sort((a, b) => b.tx_count - a.tx_count)
    const ok = groupByStatus('ok')

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
        no_car_last4_count: noCar.length,
        no_car_tx_count: noCar.reduce((s, r) => s + r.tx_count, 0),
        ambiguous_last4_count: ambiguous.length,
        partial_last4_count: partial.length,
      },
      // top 20 으로 제한 — alert 너무 길어지지 않도록
      top_no_card: noCard.slice(0, 20).map(r => ({
        last4: r.last4, tx: r.tx_count, sms: r.sms_count,
      })),
      top_no_car: noCar.slice(0, 20).map(r => ({
        last4: r.last4, tx: r.tx_count, holders: r.holders,
      })),
      top_partial: partial.slice(0, 10).map(r => ({
        last4: r.last4, total: r.tx_count, matched: r.matched_count, unmatched: r.unmatched_count,
        cars: r.cars_assigned,
      })),
      ok_count: ok.length,
    })
  } catch (e: any) {
    console.error('[GET /api/admin/card-match-diag]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
