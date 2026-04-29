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
    const data = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         t.id, t.transaction_date, t.type, t.amount, t.description, t.client_name,
         t.bank_name, t.card_company, t.imported_from, t.category, t.final_category, t.balance_after,
         sms.card_alias        AS sms_card_alias,
         sms.card_id           AS sms_card_id,
         cc.card_alias         AS matched_card_alias,
         cc.holder_name        AS matched_holder_name,
         cc.assigned_employee_id AS matched_employee_id,
         cc.assigned_car_id    AS matched_car_id,
         car.number            AS matched_car_number,
         CONCAT_WS(' ', car.brand, car.model) AS matched_car_model
       FROM transactions t
       LEFT JOIN card_sms_transactions sms ON sms.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
       LEFT JOIN corporate_cards cc       ON cc.id COLLATE utf8mb4_unicode_ci = sms.card_id COLLATE utf8mb4_unicode_ci
       LEFT JOIN cars car                 ON car.id COLLATE utf8mb4_unicode_ci = cc.assigned_car_id COLLATE utf8mb4_unicode_ci
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
