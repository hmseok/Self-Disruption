import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/operations/deposits — 사고대차 「입금」 탭 (2026-07-08 사용자 명시)
 *
 * 배차 직원용: 렌터카통장(매핑 관리에서 용도에 「렌터카」 포함된 계좌)의 입금만
 * 읽기로 열어주고, 대차건 연결/사유 정리만 할 수 있게 한다.
 * (원장 페이지는 관리자 영역 — 전체삭제·매핑 관리 오조작 위험 차단)
 *
 * 행 상태:
 *   linked    : related_type='fmi_rental' — 어느 대차건인지 표시
 *   excluded  : raw_data $._not_rental — 대차 입금 아님 (사유 표시)
 *   candidate : 자동매칭 후보 있음 (예상입금자명 > 차량번호 > 고객명 — 검수 패널과 동형)
 *   none      : 미연결 + 후보 없음
 *
 * query: ?q=검색  ?days=90  ?limit=1000
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
const normName = (s: any) => String(s || '').replace(/[\s\-_()·.,*]+/g, '').trim()

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').trim()
    const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 90))
    const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get('limit')) || 1000))

    // 1) 렌터카통장 계좌 선별 (매핑 관리 purpose 에 「렌터카」)
    let rentalAccounts: string[] = []
    try {
      const maps = await prisma.$queryRaw<Array<any>>`
        SELECT account_alias, account_number, purpose FROM bank_account_mappings
        WHERE purpose LIKE '%렌터카%'
      `
      for (const m of maps) {
        const digits = String(m.account_number || m.account_alias || '').replace(/\D/g, '')
        if (digits.length >= 4) rentalAccounts.push(digits.slice(-4))
      }
    } catch { /* 매핑 테이블 없음 — 계좌 제한 없이 진행 */ }

    // 2) 입금 목록 (렌터카통장만 — 매핑 없으면 통장 전체)
    const acctClause = rentalAccounts.length > 0
      ? `AND account_last4 IN (${rentalAccounts.map(() => '?').join(',')})`
      : ''
    const buildSql = (withAcct: boolean) =>
      `SELECT t.id, t.transaction_date, t.amount, t.client_name, t.description,
              t.balance_after, t.related_type, t.related_id, t.raw_data,
              ${withAcct ? 't.account_last4,' : ''}
              r.customer_name AS linked_customer, r.customer_car_number AS linked_customer_car,
              r.vehicle_car_number AS linked_vehicle_car, r.status AS linked_status,
              r.final_claim_amount AS linked_claim
         FROM transactions t
         LEFT JOIN fmi_rentals r
           ON t.related_type = 'fmi_rental'
          AND r.id COLLATE utf8mb4_unicode_ci = t.related_id COLLATE utf8mb4_unicode_ci
        WHERE t.deleted_at IS NULL AND t.type = 'income'
          AND (t.imported_from LIKE 'excel_bank%' OR t.imported_from IN ('sms_bank', 'codef_bank'))
          AND t.transaction_date >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
          ${withAcct ? acctClause : ''}
          ${q ? 'AND (t.client_name LIKE ? OR t.description LIKE ?)' : ''}
        ORDER BY t.transaction_date DESC
        LIMIT ${limit}`
    const params: any[] = []
    if (rentalAccounts.length > 0) params.push(...rentalAccounts)
    if (q) params.push(`%${q}%`, `%${q}%`)
    const deposits = await prisma.$queryRawUnsafe<Array<any>>(buildSql(true), ...params)
      .catch(async (e: any) => {
        if (/Unknown column/i.test(e?.message || '')) {
          // V10 미적용 DB (규칙 23) — 계좌 제한 없이
          const p2: any[] = q ? [`%${q}%`, `%${q}%`] : []
          return prisma.$queryRawUnsafe<Array<any>>(buildSql(false), ...p2)
        }
        throw e
      })

    // 3) 대차건 인덱스 (후보 대조 — fmi-rental-payments 와 동형 3축)
    const rentals = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT id, customer_name, expected_payer, customer_car_number, vehicle_car_number,
              insurance_company, final_claim_amount, dispatch_date, status
         FROM fmi_rentals
        ORDER BY dispatch_date DESC
        LIMIT 500`,
    ).catch(async (e: any) => {
      if (/Unknown column/i.test(e?.message || '')) {
        return prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, customer_name, customer_car_number, vehicle_car_number,
                  insurance_company, final_claim_amount, dispatch_date, status
             FROM fmi_rentals ORDER BY dispatch_date DESC LIMIT 500`,
        )
      }
      throw e
    })
    const byLast4 = new Map<string, any[]>()
    const byName = new Map<string, any[]>()
    for (const r of rentals) {
      const l4 = last4(r.customer_car_number)
      if (l4) { if (!byLast4.has(l4)) byLast4.set(l4, []); byLast4.get(l4)!.push(r) }
      for (const nameField of [r.customer_name, r.expected_payer]) {
        const nm = normName(nameField)
        if (nm.length >= 2 && !/^\d+$/.test(nm)) {
          if (!byName.has(nm)) byName.set(nm, [])
          if (!byName.get(nm)!.some((x) => x.id === r.id)) byName.get(nm)!.push(r)
        }
      }
    }

    // 4) 상태 도출
    const list = deposits.map((d) => {
      let notRental: any = null
      try {
        const raw = typeof d.raw_data === 'string' ? JSON.parse(d.raw_data) : d.raw_data
        if (raw && raw._not_rental) notRental = raw._not_rental
      } catch { /* raw_data 파싱 실패 — 무시 */ }

      let status: 'linked' | 'excluded' | 'candidate' | 'none'
      let candidates: any[] = []
      if (d.related_type === 'fmi_rental' && d.related_id) {
        status = 'linked'
      } else if (notRental) {
        status = 'excluded'
      } else {
        const toks = new Set([...digitTokens(d.client_name), ...digitTokens(d.description)])
        const nm = normName(d.client_name)
        const seen = new Set<string>()
        const cands: any[] = []
        // 이름축 (입금자명 = 예상입금자/고객명) 우선, 다음 차량번호축
        if (nm.length >= 2 && byName.has(nm)) for (const r of byName.get(nm)!) cands.push({ ...r, match_by: 'name' })
        for (const tok of toks) {
          const key = tok.slice(-4)
          if (byLast4.has(key)) for (const r of byLast4.get(key)!) cands.push({ ...r, match_by: 'car' })
        }
        candidates = cands
          .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
          .slice(0, 3)
          .map((c) => ({
            id: c.id, customer_name: c.customer_name, customer_car_number: c.customer_car_number,
            vehicle_car_number: c.vehicle_car_number, insurance_company: c.insurance_company,
            claim_amount: c.final_claim_amount != null ? Number(c.final_claim_amount) : null,
            dispatch_date: c.dispatch_date, status: c.status, match_by: c.match_by,
          }))
        status = candidates.length > 0 ? 'candidate' : 'none'
      }
      return {
        id: d.id,
        transaction_date: d.transaction_date,
        amount: Number(d.amount || 0),
        client_name: d.client_name,
        description: d.description,
        balance_after: d.balance_after != null ? Number(d.balance_after) : null,
        account_last4: d.account_last4 || null,
        status,
        not_rental: notRental,
        linked: d.related_id ? {
          id: d.related_id, customer_name: d.linked_customer, customer_car_number: d.linked_customer_car,
          vehicle_car_number: d.linked_vehicle_car, status: d.linked_status,
          claim_amount: d.linked_claim != null ? Number(d.linked_claim) : null,
        } : null,
        candidates,
      }
    })

    const summary = {
      total: list.length,
      linked: list.filter((x) => x.status === 'linked').length,
      candidate: list.filter((x) => x.status === 'candidate').length,
      none: list.filter((x) => x.status === 'none').length,
      excluded: list.filter((x) => x.status === 'excluded').length,
      amount_total: list.reduce((s, x) => s + x.amount, 0),
      rental_accounts: rentalAccounts,
    }

    return NextResponse.json({ data: list, rentals: rentals.map((r) => ({
      id: r.id, customer_name: r.customer_name, customer_car_number: r.customer_car_number,
      vehicle_car_number: r.vehicle_car_number, insurance_company: r.insurance_company,
      claim_amount: r.final_claim_amount != null ? Number(r.final_claim_amount) : null,
      dispatch_date: r.dispatch_date, status: r.status,
    })), summary, error: null })
  } catch (e: any) {
    console.error('[GET /api/operations/deposits]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
