import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

const ALLOWED_TABLES = [
  'cars',
  'classification_queue',
  'contracts',
  'corporate_cards',
  'expected_payment_schedules',
  'finance_rules',
  'freelancers',
  'general_investments',
  'insurance_contracts',
  'jiip_contracts',
  'loans',
  'profiles',
  'transactions',
]

function validateTableName(table: string): boolean {
  return ALLOWED_TABLES.includes(table)
}

// GET - fetch data
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const action = searchParams.get('action')

    if (!table || !validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
    }

    if (action === 'detail') {
      const id = searchParams.get('id')
      if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

      const data = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM ${table} WHERE id = ?`,
        [id]
      )
      return NextResponse.json({ data: serialize(data[0] || null), error: null })
    }

    // Default list
    const data = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM ${table} LIMIT 1000`)
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST - insert
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')

    if (!table || !validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
    }

    const body = await request.json()
    const rows = Array.isArray(body) ? body : [body]

    if (rows.length === 0) {
      return NextResponse.json({ error: '삽입할 행이 없습니다' }, { status: 400 })
    }

    const columns = Object.keys(rows[0])
    const columnStr = columns.join(', ')

    const valueSets = rows.map((row: any) => {
      const values = columns.map((col: string) => {
        const val = row[col]
        if (val === null || val === undefined) return 'NULL'
        if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`
        if (typeof val === 'boolean') return val ? '1' : '0'
        return val
      }).join(', ')
      return `(${values})`
    }).join(', ')

    const query = `INSERT INTO ${table} (${columnStr}) VALUES ${valueSets}`
    const result = await prisma.$executeRawUnsafe(query)

    return NextResponse.json({ success: true, inserted: result, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH - update
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const id = searchParams.get('id')

    if (!table || !id || !validateTableName(table)) {
      return NextResponse.json({ error: 'table과 id 파라미터 필수' }, { status: 400 })
    }

    const body = await request.json()
    const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/
    const entries = Object.entries(body).filter(([k]) => SAFE_COL.test(k))
    if (entries.length === 0) return NextResponse.json({ error: '수정할 항목 없음' }, { status: 400 })

    const setClause = entries.map(([k]) => `\`${k}\` = ?`).join(', ')
    const values = entries.map(([, v]) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
    // table은 위 validateTableName으로 화이트리스트 검증됨
    const query = `UPDATE \`${table}\` SET ${setClause} WHERE id = ?`
    await prisma.$executeRawUnsafe(query, ...values, id)

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE - soft delete or hard delete
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const id = searchParams.get('id')
    const softDelete = searchParams.get('soft') === 'true'

    if (!table || !id || !validateTableName(table)) {
      return NextResponse.json({ error: 'table과 id 파라미터 필수' }, { status: 400 })
    }

    if (softDelete) {
      // Soft delete - set deleted_at (table은 validateTableName 화이트리스트 통과)
      await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET deleted_at = NOW() WHERE id = ?`,
        id
      )
    } else {
      // Hard delete
      await prisma.$executeRawUnsafe(
        `DELETE FROM \`${table}\` WHERE id = ?`,
        id
      )
    }

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
