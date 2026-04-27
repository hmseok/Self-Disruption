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

    const whereClause = conditions.join(' AND ')
    const data = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, transaction_date, type, amount, description, client_name,
              bank_name, card_company, imported_from, category, final_category, balance_after
       FROM transactions
       WHERE ${whereClause}
       ORDER BY transaction_date DESC
       LIMIT ?`,
      ...params
    )

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[GET /api/finance/transactions/list]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
