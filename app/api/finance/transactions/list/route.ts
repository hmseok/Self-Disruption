import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { bankMappingJoinSql, cardMappingJoinSql } from '@/lib/last4-match'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * GET /api/finance/transactions/list
 * 분류 검수용 거래 목록 조회 (카테고리/소스/유형 필터)
 *
 * 매칭 경로 — 카드 거래 탭 / 통장 거래 탭 (/api/finance-upload) 과 동일한 헬퍼 사용:
 *   (1) 직접 매칭: t.related_id 가 car.id (Excel 카드 last4 자동 매칭 결과)
 *   (2) corporate_cards 매칭: cardMappingJoinSql 사용 — sms.card_id / sms.card_alias.last4 / raw_data.card_last4
 *   (3) bank_account_mappings 매칭: bankMappingJoinSql 사용 — sms.card_alias.last4 / raw_data._account_last4
 *
 * UI 에서는 (1) > (2) > (3) 순으로 우선순위 적용.
 *
 * (CLAUDE.md 규칙 12 — 같은 데이터 표출하는 모든 화면이 같은 매칭 로직)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const category = searchParams.get('category') || ''
    const type = searchParams.get('type') || 'all'
    const source = searchParams.get('source') || 'all'
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500)

    const conditions: string[] = ['deleted_at IS NULL']
    const params: any[] = []

    if (category) {
      if (category === '미분류') {
        conditions.push(`(category IS NULL OR category = '' OR category = '미분류')`)
      } else {
        conditions.push('category = ?')
        params.push(category)
      }
    }
    if (type === 'income') conditions.push(`type = 'income'`)
    else if (type === 'expense') conditions.push(`type = 'expense'`)
    if (source !== 'all') {
      conditions.push('imported_from = ?')
      params.push(source)
    }

    params.push(limit)

    const whereTx = conditions.map(c => c.replace(/\bdeleted_at\b/, 't.deleted_at')
                                        .replace(/^category =/, 't.category =')
                                        .replace(/^\(category /, '(t.category ')
                                        .replace(/^type =/, 't.type =')
                                        .replace(/^imported_from =/, 't.imported_from =')).join(' AND ')

    const baseQuery = `SELECT
         t.id, t.transaction_date, t.type, t.amount, t.description, t.client_name,
         t.bank_name, t.card_company, t.imported_from, t.category, t.final_category, t.balance_after,
         t.related_type, t.related_id,
         JSON_UNQUOTE(JSON_EXTRACT(t.raw_data, '$.card_last4')) AS card_last4,
         sms.card_alias         AS sms_card_alias,
         sms.card_id            AS sms_card_id,
         sms.transaction_type   AS sms_transaction_type,
         sms.merchant           AS sms_merchant,
         sms.holder_name        AS sms_holder,
         sms.parse_status       AS sms_parse_status,
         cc.card_alias          AS matched_card_alias,
         cc.holder_name         AS matched_holder_name,
         cc.assigned_employee_id AS matched_employee_id,
         cc.assigned_car_id     AS matched_car_id_sms,
         car.number             AS matched_car_number_sms,
         CONCAT_WS(' ', car.brand, car.model) AS matched_car_model_sms,
         car_direct.id          AS matched_car_id,
         car_direct.number      AS matched_car_number,
         CONCAT_WS(' ', car_direct.brand, car_direct.model) AS matched_car_model,
         bam.account_alias      AS bank_account_alias,
         bam.account_holder     AS bank_account_holder,
         bam.purpose            AS bank_purpose,
         bam_car.number         AS bank_matched_car_number,
         CONCAT_WS(' ', bam_car.brand, bam_car.model) AS bank_matched_car_model
       FROM transactions t
       LEFT JOIN card_sms_transactions sms ON sms.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
       LEFT JOIN corporate_cards cc       ON ${cardMappingJoinSql('cc', 'sms', 't')}
       LEFT JOIN cars car                 ON car.id COLLATE utf8mb4_unicode_ci = cc.assigned_car_id COLLATE utf8mb4_unicode_ci
       LEFT JOIN cars car_direct          ON car_direct.id COLLATE utf8mb4_unicode_ci = t.related_id COLLATE utf8mb4_unicode_ci
                                          AND t.related_type = 'car'
       LEFT JOIN bank_account_mappings bam
         ON ${bankMappingJoinSql('bam', 'sms', 't')}
       LEFT JOIN cars bam_car             ON bam_car.id COLLATE utf8mb4_unicode_ci = bam.assigned_car_id COLLATE utf8mb4_unicode_ci
       WHERE ${whereTx}
       ORDER BY t.transaction_date DESC
       LIMIT ?`

    let data: any[]
    try {
      data = await prisma.$queryRawUnsafe<any[]>(baseQuery, ...params)
    } catch (e: any) {
      // bank_account_mappings 없는 환경 등 — graceful fallback
      console.warn('[finance/transactions/list] full query 실패, simple fallback:', e?.message?.slice(0, 200))
      data = await prisma.$queryRawUnsafe<any[]>(
        `SELECT
           t.id, t.transaction_date, t.type, t.amount, t.description, t.client_name,
           t.bank_name, t.card_company, t.imported_from, t.category, t.final_category, t.balance_after,
           t.related_type, t.related_id,
           JSON_UNQUOTE(JSON_EXTRACT(t.raw_data, '$.card_last4')) AS card_last4,
           sms.card_alias         AS sms_card_alias,
           sms.card_id            AS sms_card_id,
           sms.transaction_type   AS sms_transaction_type,
           sms.merchant           AS sms_merchant,
           sms.holder_name        AS sms_holder,
           sms.parse_status       AS sms_parse_status,
           cc.card_alias          AS matched_card_alias,
           cc.holder_name         AS matched_holder_name,
           cc.assigned_employee_id AS matched_employee_id,
           cc.assigned_car_id     AS matched_car_id_sms,
           car.number             AS matched_car_number_sms,
           CONCAT_WS(' ', car.brand, car.model) AS matched_car_model_sms,
           car_direct.id          AS matched_car_id,
           car_direct.number      AS matched_car_number,
           CONCAT_WS(' ', car_direct.brand, car_direct.model) AS matched_car_model
         FROM transactions t
         LEFT JOIN card_sms_transactions sms ON sms.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
         LEFT JOIN corporate_cards cc       ON ${cardMappingJoinSql('cc', 'sms', 't')}
         LEFT JOIN cars car                 ON car.id COLLATE utf8mb4_unicode_ci = cc.assigned_car_id COLLATE utf8mb4_unicode_ci
         LEFT JOIN cars car_direct          ON car_direct.id COLLATE utf8mb4_unicode_ci = t.related_id COLLATE utf8mb4_unicode_ci
                                            AND t.related_type = 'car'
         WHERE ${whereTx}
         ORDER BY t.transaction_date DESC
         LIMIT ?`,
        ...params
      )
    }

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[GET /api/finance/transactions/list]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
