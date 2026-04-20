import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&company_id=xxx
export async function GET(request: NextRequest) {
  try {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const companyId = searchParams.get('company_id') || user.company_id || null
  const relatedType = searchParams.get('related_type')   // 'invest' 또는 'jiip,jiip_share'
  const relatedId = searchParams.get('related_id')
  const typeFilter = searchParams.get('type')             // 'income' 또는 'expense'
  const limitParam = parseInt(searchParams.get('limit') || '0', 10)

  try {
    // WHERE 절 조립
    const where: string[] = []
    const params: any[] = []

    if (companyId) {
      where.push('company_id = ?')
      params.push(companyId)
    }
    if (from) {
      where.push('transaction_date >= ?')
      params.push(from)
    }
    if (to) {
      where.push('transaction_date <= ?')
      params.push(to)
    }
    if (relatedType) {
      const types = relatedType.split(',').map(s => s.trim()).filter(Boolean)
      if (types.length === 1) {
        where.push('related_type = ?')
        params.push(types[0])
      } else if (types.length > 1) {
        where.push(`related_type IN (${types.map(() => '?').join(',')})`)
        params.push(...types)
      }
    }
    if (relatedId) {
      where.push('related_id = ?')
      params.push(relatedId)
    }
    if (typeFilter) {
      where.push('type = ?')
      params.push(typeFilter)
    }
    // soft-delete 제외 (기본 적용)
    where.push('deleted_at IS NULL')

    // 기본 LIMIT: 필터 다중(companyId+from+to) 시 무제한, 그 외 합리적 상한
    let limit = 1000
    if (limitParam > 0 && limitParam <= 5000) limit = limitParam
    else if (from && to && companyId) limit = 5000
    else if (!from && !to && !relatedId && !companyId) limit = 200

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sql = `SELECT * FROM transactions ${whereSql} ORDER BY transaction_date DESC, created_at DESC LIMIT ${limit}`

    const data = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    console.error('[GET /api/transactions] inner:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  } catch (e: any) {
    console.error('[GET /api/transactions] outer:', e)
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}

// POST /api/transactions — 거래 등록
export async function POST(request: NextRequest) {
  try {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await request.json()

    // bulk insert (배열) 또는 단건
    const items: any[] = Array.isArray(body) ? body : [body]
    const companyId = items[0]?.company_id || user.company_id
    const inserted: string[] = []

    for (const item of items) {
      const id = crypto.randomUUID()
      const {
        transaction_date, type = 'expense', status = 'completed',
        category = '기타', client_name = '', description = '',
        amount = 0, payment_method = '통장',
        related_type = null, related_id = null,
      } = item
      const cid = item.company_id || companyId

      await prisma.$executeRaw`
        INSERT INTO transactions (
          id, company_id, transaction_date, type, status, category,
          client_name, description, amount, payment_method,
          related_type, related_id, created_at, updated_at
        ) VALUES (
          ${id}, ${cid}, ${transaction_date}, ${type}, ${status}, ${category},
          ${client_name}, ${description}, ${Number(amount)}, ${payment_method},
          ${related_type}, ${related_id}, NOW(), NOW()
        )
      `
      inserted.push(id)
    }

    return NextResponse.json({ data: { ids: inserted }, error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/transactions] inner:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  } catch (e: any) {
    console.error('[POST /api/transactions] outer:', e)
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
