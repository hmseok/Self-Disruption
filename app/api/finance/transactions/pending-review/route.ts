import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/finance/transactions/pending-review
 *
 * 검수 대기 큐 — pending+auto 매칭 페이지네이션 리스트 (PR-UX3-B).
 *
 * GET ?page=1&pageSize=20&matcher=invest|jiip|employee|freelancer|fmi_rental|car|all
 *      &suspectOnly=true|false
 *
 * 응답:
 *   { items: [{ assignment_id, transaction_id, tx_date, tx_type, tx_amount,
 *               client_name, description, category,
 *               matched_type, matched_id, matched_name (entity 조회 결과),
 *               source, suspect, suspect_reasons }],
 *     page, pageSize, total, hasMore }
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get('pageSize') || '20', 10)))
    const matcher = searchParams.get('matcher') || 'all'
    const suspectOnly = searchParams.get('suspectOnly') === 'true'
    const offset = (page - 1) * pageSize

    // 매처 필터
    const matcherFilter = matcher === 'all' ? '' : `AND ta.assignment_type = '${matcher.replace(/[^a-z_]/gi, '')}'`

    // 1) 페이지 데이터 + 2) 전체 카운트
    // PR-UX7.1: 거래 출처 (카드/통장) + 카드사/통장명/소유자 정보 JOIN
    let items: Array<any> = []
    try {
      items = await prisma.$queryRawUnsafe<Array<any>>(`
        SELECT
          ta.id              AS assignment_id,
          ta.transaction_id,
          ta.assignment_type AS matched_type,
          ta.assignment_id   AS matched_id,
          ta.created_at      AS matched_at,
          ta.source,
          t.transaction_date AS tx_date,
          t.type             AS tx_type,
          t.amount           AS tx_amount,
          t.client_name,
          t.description,
          t.category,
          t.imported_from,
          t.payment_method,
          t.codef_org_code,
          /* 카드 SMS 정보 */
          sms.card_alias       AS sms_card_alias,
          sms.merchant         AS sms_merchant,
          sms.holder_name      AS sms_holder,
          sms.transaction_type AS sms_transaction_type,
          /* 통장 매핑 정보 */
          bam.account_alias    AS bank_account_alias,
          bam.account_holder   AS bank_account_holder
        FROM transaction_assignments ta
        JOIN transactions t ON t.id = ta.transaction_id
        LEFT JOIN card_sms_transactions sms
          ON sms.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
        LEFT JOIN bank_account_mappings bam
          ON bam.account_number = t.codef_org_code
        WHERE ta.status = 'pending'
          AND ta.source = 'auto'
          AND t.deleted_at IS NULL
          ${matcherFilter}
        ORDER BY t.transaction_date DESC, ta.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `)
    } catch (e: any) {
      // JOIN 실패 시 fallback (sms / bam 테이블 없거나 collation 충돌)
      console.warn('[pending-review] JOIN fallback:', e?.message?.slice(0, 200))
      items = await prisma.$queryRawUnsafe<Array<any>>(`
        SELECT
          ta.id              AS assignment_id,
          ta.transaction_id,
          ta.assignment_type AS matched_type,
          ta.assignment_id   AS matched_id,
          ta.created_at      AS matched_at,
          ta.source,
          t.transaction_date AS tx_date,
          t.type             AS tx_type,
          t.amount           AS tx_amount,
          t.client_name,
          t.description,
          t.category,
          t.imported_from,
          t.payment_method,
          t.codef_org_code
        FROM transaction_assignments ta
        JOIN transactions t ON t.id = ta.transaction_id
        WHERE ta.status = 'pending'
          AND ta.source = 'auto'
          AND t.deleted_at IS NULL
          ${matcherFilter}
        ORDER BY t.transaction_date DESC, ta.created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `)
    }

    // entity_name 조회 — assignment_type 별 다른 테이블
    // 매처별 group → 한 번에 IN 쿼리
    const idsByType: Record<string, string[]> = {}
    for (const it of items) {
      const t = String(it.matched_type)
      if (!idsByType[t]) idsByType[t] = []
      idsByType[t].push(String(it.matched_id))
    }
    const entityNameMap: Record<string, string> = {}

    // employee — profiles + ride_employees
    if (idsByType['employee']?.length) {
      const ids = idsByType['employee']
      try {
        const profiles = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, name FROM profiles WHERE id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
        for (const p of profiles) entityNameMap[`employee:${p.id}`] = String(p.name || '?') + '(계정)'
      } catch {}
      try {
        const rides = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, name, department FROM ride_employees WHERE id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
        for (const r of rides) {
          if (!entityNameMap[`employee:${r.id}`]) {
            entityNameMap[`employee:${r.id}`] = String(r.name || '?') + (r.department ? `(${r.department})` : '(라이드)')
          }
        }
      } catch {}
    }
    // invest
    if (idsByType['invest']?.length) {
      const ids = idsByType['invest']
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, investor_name FROM general_investments WHERE id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
        for (const r of rows) entityNameMap[`invest:${r.id}`] = String(r.investor_name || '?') + '(투자)'
      } catch {}
    }
    // jiip
    if (idsByType['jiip']?.length) {
      const ids = idsByType['jiip']
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, investor_name FROM jiip_contracts WHERE id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
        for (const r of rows) entityNameMap[`jiip:${r.id}`] = String(r.investor_name || '?') + '(지입)'
      } catch {}
    }
    // freelancer
    if (idsByType['freelancer']?.length) {
      const ids = idsByType['freelancer']
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, name, bank_name FROM freelancers WHERE id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
        for (const r of rows) entityNameMap[`freelancer:${r.id}`] = String(r.name || '?') + (r.bank_name ? `(${r.bank_name})` : '(프리랜서)')
      } catch {}
    }
    // car
    if (idsByType['car']?.length) {
      const ids = idsByType['car']
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, number, model FROM cars WHERE id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
        for (const r of rows) entityNameMap[`car:${r.id}`] = String(r.number || '?') + (r.model ? ` ${r.model}` : '')
      } catch {}
    }
    // fmi_rental
    if (idsByType['fmi_rental']?.length) {
      const ids = idsByType['fmi_rental']
      try {
        const rows = await prisma.$queryRawUnsafe<Array<any>>(
          `SELECT id, customer_car_number, insurance_company FROM fmi_rentals WHERE id IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
        for (const r of rows) entityNameMap[`fmi_rental:${r.id}`] = `${r.customer_car_number || '?'} (${r.insurance_company || '?'})`
      } catch {}
    }

    // PR-UX7.1: 출처 라벨 + 의심 라벨링
    const enriched = items.map((it: any) => {
      const amount = Math.abs(Number(it.tx_amount || 0))
      const reasons: string[] = []
      if (amount >= 1_000_000) reasons.push(`큰 금액 (${(amount / 10000).toFixed(0)}만)`)

      // 출처 분류 (카드/통장/SMS)
      const importedFrom = String(it.imported_from || '')
      let sourceType: 'card' | 'bank' | 'unknown' = 'unknown'
      let sourceLabel = ''
      let sourceDetail = ''
      if (importedFrom === 'sms' || importedFrom.startsWith('excel_card') || importedFrom.startsWith('pdf_card')) {
        sourceType = 'card'
        sourceLabel = '💳 카드'
        // sms_card_alias 있으면 카드 정보, sms_transaction_type='canceled' 면 취소
        const cardAlias = it.sms_card_alias || it.payment_method || ''
        sourceDetail = cardAlias ? `${cardAlias}` : '카드'
        if (it.sms_transaction_type === 'canceled') sourceDetail += ' (취소)'
      } else if (importedFrom.startsWith('excel_bank') || importedFrom === 'sms_bank') {
        sourceType = 'bank'
        sourceLabel = '🏦 통장'
        const accAlias = it.bank_account_alias || ''
        const accHolder = it.bank_account_holder || ''
        sourceDetail = accAlias || (accHolder ? `${accHolder} 계좌` : '통장')
      } else {
        sourceLabel = '📝 기타'
        sourceDetail = importedFrom || 'unknown'
      }

      const matchedKey = `${it.matched_type}:${it.matched_id}`
      return {
        ...it,
        tx_amount: Number(it.tx_amount || 0),
        matched_name: entityNameMap[matchedKey] || `${it.matched_type}:${String(it.matched_id).slice(0, 8)}`,
        // PR-UX7.1: 출처 라벨
        source_type: sourceType,
        source_label: sourceLabel,
        source_detail: sourceDetail,
        is_canceled: it.sms_transaction_type === 'canceled',
        suspect: reasons.length > 0,
        suspect_reasons: reasons,
      }
    })

    // suspect 만 필터
    const filtered = suspectOnly ? enriched.filter((it: any) => it.suspect) : enriched

    // 전체 카운트
    const cntRows = await prisma.$queryRawUnsafe<Array<any>>(`
      SELECT COUNT(*) AS cnt
        FROM transaction_assignments ta
        JOIN transactions t ON t.id = ta.transaction_id
       WHERE ta.status = 'pending'
         AND ta.source = 'auto'
         AND t.deleted_at IS NULL
         ${matcherFilter}
    `)
    const total = Number(cntRows[0]?.cnt || 0)

    return NextResponse.json({
      items: filtered,
      page,
      pageSize,
      total,
      hasMore: offset + items.length < total,
      filter: { matcher, suspectOnly },
    })
  } catch (e: any) {
    console.error('[pending-review GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
