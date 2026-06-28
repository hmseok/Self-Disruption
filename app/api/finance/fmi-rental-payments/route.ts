import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/finance/fmi-rental-payments
 *
 * 사고대차(fmi_rentals) 건별 대차료 입금현황 — 3단계 구조.
 *   - paid       : 매칭된 통장 입금 있음 (transactions.related_type='fmi_rental')
 *   - candidate  : 미매칭 통장 입금 중 사고차량 뒤4자리 일치분 있음 → 「연결 필요」
 *   - unpaid     : 아무 입금도 없음 → 「진짜 미입금」 (보험사 입금 전)
 *
 * 청구액(final_claim_amount)은 import 미포함이라 금액 완납 판정은 보류, 매칭 유무 중심.
 * query: ?q=검색  ?limit=2000
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 문자열에서 3~4자리 숫자 토큰 추출 (차량 뒤4자리 대조용)
function digitTokens(s: string | null | undefined): string[] {
  if (!s) return []
  const out = new Set<string>()
  const matches = String(s).match(/\d{3,4}/g) || []
  for (const m of matches) {
    out.add(m)
    if (m.length > 4) out.add(m.slice(-4))
  }
  return Array.from(out)
}
function last4(s: string | null | undefined): string | null {
  if (!s) return null
  const m = String(s).match(/(\d{4})\D*$/) || String(s).match(/(\d{3,4})/)
  return m ? m[1].slice(-4) : null
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').trim()
    const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit')) || 2000))

    // 1) 대차건 + 매칭 입금 집계 (LEFT JOIN — 미입금도 포함)
    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT r.id, r.dispatch_date, r.vehicle_car_number, r.customer_car_number,
              r.customer_name, r.insurance_company, r.final_claim_amount AS claim_amount,
              COALESCE(p.paid_amount, 0) AS paid_amount, p.paid_date, COALESCE(p.paid_count, 0) AS paid_count
         FROM fmi_rentals r
         LEFT JOIN (
           SELECT t.related_id, SUM(t.amount) AS paid_amount, MAX(t.transaction_date) AS paid_date, COUNT(*) AS paid_count
             FROM transactions t
            WHERE t.related_type = 'fmi_rental' AND t.type = 'income' AND t.deleted_at IS NULL
            GROUP BY t.related_id
         ) p ON p.related_id = r.id
        WHERE r.fleet_group = '빌려타'
          ${q ? `AND (r.customer_name LIKE ? OR r.customer_car_number LIKE ? OR r.vehicle_car_number LIKE ? OR r.insurance_company LIKE ?)` : ''}
        ORDER BY (COALESCE(p.paid_amount,0) > 0) ASC, r.dispatch_date DESC
        LIMIT ${limit}`,
      ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : []),
    )

    // 2) 미매칭 통장 입금 (후보 대조용) — 사고차량 뒤4자리 → 입금 인덱스
    const candByLast4 = new Map<string, Array<any>>()
    try {
      const deposits = await prisma.$queryRawUnsafe<Array<any>>(
        `SELECT id, client_name, description, amount, transaction_date
           FROM transactions
          WHERE deleted_at IS NULL AND type = 'income'
            AND (related_type IS NULL OR related_id IS NULL)
            AND (imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank' OR imported_from = 'codef_bank')
            AND (client_name REGEXP '[0-9]{3,4}' OR description REGEXP '[0-9]{3,4}')
          LIMIT 5000`,
      )
      for (const d of deposits) {
        const toks = new Set([...digitTokens(d.client_name), ...digitTokens(d.description)])
        for (const tok of toks) {
          if (tok.length < 3) continue
          const key = tok.slice(-4)
          if (!candByLast4.has(key)) candByLast4.set(key, [])
          candByLast4.get(key)!.push({ id: d.id, client_name: d.client_name, amount: Number(d.amount || 0), transaction_date: d.transaction_date })
        }
      }
    } catch (e) {
      console.warn('[fmi-rental-payments] 후보 입금 조회 skip:', (e as Error)?.message)
    }

    // 3) 상태 도출 — paid / candidate / unpaid
    const list = rows.map((r) => {
      const paid = Number(r.paid_amount || 0)
      const claim = r.claim_amount != null ? Number(r.claim_amount) : null
      const l4 = last4(r.customer_car_number)
      let status: 'paid' | 'candidate' | 'unpaid'
      let candidates: Array<any> = []
      if (paid > 0) {
        status = 'paid'
      } else {
        candidates = (l4 && candByLast4.get(l4)) ? candByLast4.get(l4)!.slice(0, 3) : []
        status = candidates.length > 0 ? 'candidate' : 'unpaid'
      }
      return {
        id: r.id,
        dispatch_date: r.dispatch_date,
        vehicle_car_number: r.vehicle_car_number,
        customer_car_number: r.customer_car_number,
        customer_name: r.customer_name,
        insurance_company: r.insurance_company,
        claim_amount: claim,
        paid_amount: paid,
        paid_date: r.paid_date,
        status,
        candidates,
      }
    })

    const summary = {
      total: list.length,
      paid_count: list.filter((x) => x.status === 'paid').length,
      candidate_count: list.filter((x) => x.status === 'candidate').length,
      unpaid_count: list.filter((x) => x.status === 'unpaid').length,
      paid_sum: list.reduce((s, x) => s + (x.status === 'paid' ? x.paid_amount : 0), 0),
    }

    return NextResponse.json({ data: list, summary, error: null })
  } catch (e: any) {
    console.error('[fmi-rental-payments GET]', e)
    return NextResponse.json({ error: e.message, data: [], summary: null }, { status: 500 })
  }
}
