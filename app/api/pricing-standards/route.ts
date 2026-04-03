import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ALLOWED_TABLES = [
  'business_rules',
  'depreciation_adjustments',
  'depreciation_history',
  'emission_standard_table',
  'finance_rate_table',
  'inspection_cost_table',
  'inspection_penalty_table',
  'inspection_schedule_table',
  'insurance_base_premium',
  'insurance_own_vehicle_rate',
  'insurance_policy_record',
  'insurance_rate_table',
  'insurance_vehicle_group',
  'maintenance_cost_table',
  'registration_cost_table',
  'vehicle_tax_table',
]

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function getUserIdFromToken(token: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return p.sub || p.user_id || null
  } catch {
    return null
  }
}

async function verifyUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const userId = getUserIdFromToken(authHeader.replace('Bearer ', ''))
    if (!userId) return null
    const profiles = await prisma.$queryRaw<any[]>`SELECT id, role, company_id FROM profiles WHERE id = ${userId} LIMIT 1`
    return profiles[0] ? { id: userId, ...profiles[0] } : null
  } catch {
    return null
  }
}

function validateTableName(table: string): boolean {
  return ALLOWED_TABLES.includes(table)
}

function buildSelectQuery(table: string): string {
  switch (table) {
    case 'depreciation_adjustments':
      return `SELECT * FROM ${table} ORDER BY adjustment_type, factor DESC`
    case 'inspection_cost_table':
      return `SELECT * FROM ${table} WHERE is_active = true ORDER BY vehicle_class, fuel_type`
    case 'inspection_schedule_table':
      return `SELECT * FROM ${table} WHERE is_active = true ORDER BY vehicle_usage, fuel_type, age_from`
    case 'inspection_penalty_table':
      return `SELECT * FROM ${table} WHERE is_active = true ORDER BY penalty_type`
    case 'emission_standard_table':
      return `SELECT * FROM ${table} WHERE is_active = true ORDER BY fuel_type, year_from`
    case 'insurance_rate_table':
      return `SELECT * FROM ${table} ORDER BY vehicle_type, value_min`
    case 'insurance_policy_record':
      return `SELECT * FROM ${table} WHERE is_active = true ORDER BY created_at DESC`
    case 'insurance_base_premium':
      return `SELECT * FROM ${table} WHERE is_active = true`
    case 'insurance_own_vehicle_rate':
      return `SELECT * FROM ${table} WHERE is_active = true ORDER BY origin, fuel_type, value_min`
    case 'insurance_vehicle_group':
      return `SELECT * FROM ${table} WHERE is_active = true ORDER BY sort_order`
    case 'business_rules':
      return `SELECT * FROM ${table} ORDER BY key`
    case 'finance_rate_table':
      return `SELECT * FROM ${table} ORDER BY effective_date DESC`
    case 'maintenance_cost_table':
      return `SELECT * FROM ${table} ORDER BY vehicle_type`
    case 'registration_cost_table':
      return `SELECT * FROM ${table} ORDER BY cost_type`
    case 'vehicle_tax_table':
      return `SELECT * FROM ${table} ORDER BY tax_type ASC`
    case 'depreciation_history':
      return `SELECT * FROM ${table} ORDER BY created_at DESC`
    default:
      return `SELECT * FROM ${table}`
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')

    if (!table) {
      return NextResponse.json({ error: 'table 파라미터 필수' }, { status: 400 })
    }

    if (!validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
    }

    const query = buildSelectQuery(table)
    const data = await prisma.$queryRawUnsafe<any[]>(query)

    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')

    if (!table) {
      return NextResponse.json({ error: 'table 파라미터 필수' }, { status: 400 })
    }

    if (!validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
    }

    const body = await request.json()
    const rows = Array.isArray(body) ? body : [body]

    // Build INSERT query dynamically
    if (rows.length === 0) {
      return NextResponse.json({ error: '삽입할 행이 없습니다' }, { status: 400 })
    }

    const columns = Object.keys(rows[0])
    const columnStr = columns.join(', ')

    const valueSets = rows.map((row: any, idx: number) => {
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
    await prisma.$executeRawUnsafe(query)

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const id = searchParams.get('id')

    if (!table || !id) {
      return NextResponse.json({ error: 'table과 id 파라미터 필수' }, { status: 400 })
    }

    if (!validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
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

export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const id = searchParams.get('id')

    if (!table || !id) {
      return NextResponse.json({ error: 'table과 id 파라미터 필수' }, { status: 400 })
    }

    if (!validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
    }

    const query = `DELETE FROM ${table} WHERE id = '${id.replace(/'/g, "''")}'`
    await prisma.$executeRawUnsafe(query)

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
