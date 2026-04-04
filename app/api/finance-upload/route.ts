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
    const updates = Object.entries(body)
      .map(([key, val]) => {
        if (val === null || val === undefined) return `${key} = NULL`
        if (typeof val === 'string') return `${key} = '${val.replace(/'/g, "''")}'`
        if (typeof val === 'boolean') return `${key} = ${val ? '1' : '0'}`
        return `${key} = ${val}`
      })
      .join(', ')

    const query = `UPDATE ${table} SET ${updates} WHERE id = '${id.replace(/'/g, "''")}'`
    await prisma.$executeRawUnsafe(query)

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
      // Soft delete - set deleted_at
      const now = new Date().toISOString()
      const query = `UPDATE ${table} SET deleted_at = '${now}' WHERE id = '${id.replace(/'/g, "''")}'`
      await prisma.$executeRawUnsafe(query)
    } else {
      // Hard delete
      const query = `DELETE FROM ${table} WHERE id = '${id.replace(/'/g, "''")}'`
      await prisma.$executeRawUnsafe(query)
    }

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
