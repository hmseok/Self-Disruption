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

  try {
    let sql: string
    const params: any[] = []

    if (from && to && companyId) {
      sql = `SELECT * FROM transactions WHERE company_id = ? AND transaction_date >= ? AND transaction_date <= ? ORDER BY transaction_date DESC, created_at DESC`
      params.push(companyId, from, to)
    } else if (from && to) {
      sql = `SELECT * FROM transactions WHERE transaction_date >= ? AND transaction_date <= ? ORDER BY transaction_date DESC, created_at DESC LIMIT 1000`
      params.push(from, to)
    } else if (companyId) {
      sql = `SELECT * FROM transactions WHERE company_id = ? ORDER BY transaction_date DESC, created_at DESC LIMIT 500`
      params.push(companyId)
    } else {
      sql = `SELECT * FROM transactions ORDER BY transaction_date DESC, created_at DESC LIMIT 200`
    }

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
