import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T | null {
  if (data === undefined || data === null) return null as any
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// 실제 new_car_prices 테이블 컬럼에 맞춘 화이트리스트
const ALLOWED_COLS = ['brand', 'model', 'year', 'source', 'price_data'] as const
const JSON_COLS = new Set(['price_data'])
const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const brand = searchParams.get('brand')
    const model = searchParams.get('model')
    const year = searchParams.get('year')

    let query = 'SELECT * FROM new_car_prices WHERE 1=1'
    const params: any[] = []

    if (brand) {
      query += ` AND brand = ?`
      params.push(brand)
    }
    if (model) {
      query += ` AND model = ?`
      params.push(model)
    }
    if (year) {
      query += ` AND year = ?`
      params.push(parseInt(year))
    }

    query += ' ORDER BY created_at DESC LIMIT 500'

    const data = await prisma.$queryRawUnsafe<any[]>(query, ...params)

    // 단일 결과가 기대되는 호출(brand+model+year 전부 지정) 시 첫 행만 반환
    if (brand && model && year) {
      return NextResponse.json({ data: serialize(data[0]) ?? null, error: null })
    }
    return NextResponse.json({ data: serialize(data) ?? [], error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const id = crypto.randomUUID()

    // 화이트리스트 + 컬럼명 정규식 검증
    const entries = Object.entries(body).filter(
      ([k, v]) => SAFE_COL.test(k) && (ALLOWED_COLS as readonly string[]).includes(k) && v !== undefined
    )

    const cols = ['id', ...entries.map(([k]) => k)]
    const vals = [id, ...entries.map(([k, v]) => {
      if (v === null) return null
      if (JSON_COLS.has(k) || typeof v === 'object') return JSON.stringify(v)
      return v
    })]

    const placeholders = cols.map(() => '?').join(', ')
    const colSql = cols.map(c => `\`${c}\``).join(', ')

    await prisma.$executeRawUnsafe(
      `INSERT INTO new_car_prices (${colSql}, created_at, updated_at) VALUES (${placeholders}, NOW(), NOW())`,
      ...vals
    )

    const created = await prisma.$queryRaw<any[]>`SELECT * FROM new_car_prices WHERE id = ${id} LIMIT 1`
    return NextResponse.json({ data: serialize(created[0]) ?? { id }, error: null }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
