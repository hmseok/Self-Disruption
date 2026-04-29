import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * GET /api/finance/transactions/list
 * 분류 검수용 거래 목록 조회 (카테고리/소스/유형 필터)
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

    // ★ corporate_cards / cars JOIN — SMS 기반 카드 매칭이 된 row 의 차량/직원/카드 별칭 노출
    //   (Excel 카드 거래는 card_sms_transactions 에 없어서 매칭 안됨 — 별도 매칭 로직 필요)
    const whereTx = conditions.map(c => c.replace(/\bdeleted_at\b/, 't.deleted_at')
                                        .replace(/^category =/, 't.category =')
                                        .replace(/^\(category /, '(t.category ')
                                        .replace(/^type =/, 't.type =')
                                        .replace(/^imported_from =/, 't.imported_from =')).join(' AND ')
    // 매칭 정보: 두 경로
    //   (1) SMS 경유: t.id ↔ card_sms_transactions.transaction_id ↔ corporate_cards ↔ cars
    //   (2) 직접 매칭: t.related_id 가 car.id (Excel 카드 last4 자동 매칭 결과)
    // 응답에는 두 경로의 결과를 모두 포함, UI에서 우선순위 결정 (직접 > SMS)
    const data = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         t.id, t.transaction_date, t.type, t.amount, t.description, t.client_name,
         t.bank_name, t.card_company, t.imported_from, t.category, t.final_category, t.balance_after,
         t.related_type, t.related_id,
         JSON_UNQUOTE(JSON_EXTRACT(t.raw_data, '$.card_last4')) AS card_last4,
         sms.card_alias        AS sms_card_alias,
         sms.card_id           AS sms_card_id,
         cc.card_alias         AS matched_card_alias,
         cc.holder_name        AS matched_holder_name,
         cc.assigned_employee_id AS matched_employee_id,
         cc.assigned_car_id    AS matched_car_id_sms,
         car.number            AS matched_car_number_sms,
         CONCAT_WS(' ', car.brand, car.model) AS matched_car_model_sms,
         car_direct.id         AS matched_car_id,
         car_direct.number     AS matched_car_number,
         CONCAT_WS(' ', car_direct.brand, car_direct.model) AS matched_car_model
       FROM transactions t
       LEFT JOIN card_sms_transactions sms ON sms.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
       LEFT JOIN corporate_cards cc       ON cc.id COLLATE utf8mb4_unicode_ci = sms.card_id COLLATE utf8mb4_unicode_ci
       LEFT JOIN cars car                 ON car.id COLLATE utf8mb4_unicode_ci = cc.assigned_car_id COLLATE utf8mb4_unicode_ci
       LEFT JOIN cars car_direct          ON car_direct.id COLLATE utf8mb4_unicode_ci = t.related_id COLLATE utf8mb4_unicode_ci
                                          AND t.related_type = 'car'
       WHERE ${whereTx}
       ORDER BY t.transaction_date DESC
       LIMIT ?`,
      ...params
    )

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[GET /api/finance/transactions/list]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
