import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const ALLOWED_TABLES = [
  'business_rules',
  'depreciation_adjustments',
  'depreciation_db',
  'depreciation_history',
  'depreciation_rates',
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
  'vehicle_market_price',
]

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

function validateTableName(table: string): boolean {
  return ALLOWED_TABLES.includes(table)
}

// 컬럼명 검증 (SQL Injection 방지 — 영문/숫자/_ 만 허용)
const COL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/
function validateColumnName(col: string): boolean {
  return COL_NAME_RE.test(col)
}

// UUID 형식만 허용 (DELETE/PATCH id)
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
function validateUuid(id: string): boolean {
  return UUID_RE.test(id)
}

function buildSelectQuery(table: string): string {
  switch (table) {
    case 'depreciation_adjustments':
      return `SELECT * FROM ${table} ORDER BY adjustment_type, factor DESC`
    case 'depreciation_db':
      return `SELECT * FROM ${table} ORDER BY category`
    case 'depreciation_rates':
      return `SELECT * FROM ${table} ORDER BY origin, vehicle_class, fuel_type`
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
      return `SELECT * FROM ${table} ORDER BY \`key\``
    case 'finance_rate_table':
      return `SELECT * FROM ${table} ORDER BY effective_date DESC`
    case 'maintenance_cost_table':
      return `SELECT * FROM ${table} ORDER BY vehicle_type`
    case 'registration_cost_table':
      return `SELECT * FROM ${table} ORDER BY cost_type`
    case 'vehicle_tax_table':
      return `SELECT * FROM ${table} ORDER BY tax_type ASC`
    case 'vehicle_market_price':
      return `SELECT * FROM ${table} WHERE is_active = 1 ORDER BY brand, model, year DESC`
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

    // Build INSERT query dynamically — 파라미터 바인딩 + 컬럼명 화이트리스트
    if (rows.length === 0) {
      return NextResponse.json({ error: '삽입할 행이 없습니다' }, { status: 400 })
    }

    const columns = Object.keys(rows[0])
    const invalidCol = columns.find(c => !validateColumnName(c))
    if (invalidCol) {
      return NextResponse.json({ error: `잘못된 컬럼명: ${invalidCol}` }, { status: 400 })
    }
    const columnStr = columns.map(c => `\`${c}\``).join(', ')

    const values: any[] = []
    const valueSets = rows.map((row: any) => {
      const placeholders = columns.map((col: string) => {
        const val = row[col]
        if (val === null || val === undefined) {
          values.push(null)
        } else if (typeof val === 'boolean') {
          values.push(val ? 1 : 0)
        } else {
          values.push(val)
        }
        return '?'
      }).join(', ')
      return `(${placeholders})`
    }).join(', ')

    const query = `INSERT INTO \`${table}\` (${columnStr}) VALUES ${valueSets}`
    await prisma.$executeRawUnsafe(query, ...values)

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
    // business_rules는 `key`(예약어), `value`(JSON) 특수 처리
    const isBR = table === 'business_rules'

    // 컬럼명 화이트리스트 검증
    const keys = Object.keys(body)
    const invalidKey = keys.find(k => !validateColumnName(k))
    if (invalidKey) {
      return NextResponse.json({ error: `잘못된 컬럼명: ${invalidKey}` }, { status: 400 })
    }

    const setClauses: string[] = []
    const values: any[] = []
    for (const key of keys) {
      const val = (body as any)[key]
      const colRef = `\`${key}\``
      if (isBR && key === 'value') {
        // JSON 컬럼 — CAST(? AS JSON)
        let jsonText: string
        if (val === null || val === undefined) jsonText = 'null'
        else if (typeof val === 'string') {
          try { JSON.parse(val); jsonText = val } catch { jsonText = JSON.stringify(val) }
        } else jsonText = JSON.stringify(val)
        setClauses.push(`${colRef} = CAST(? AS JSON)`)
        values.push(jsonText)
      } else if (val === null || val === undefined) {
        setClauses.push(`${colRef} = NULL`)
      } else if (typeof val === 'boolean') {
        setClauses.push(`${colRef} = ?`)
        values.push(val ? 1 : 0)
      } else {
        setClauses.push(`${colRef} = ?`)
        values.push(val)
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: '업데이트할 필드가 없습니다' }, { status: 400 })
    }

    const query = `UPDATE \`${table}\` SET ${setClauses.join(', ')} WHERE id = ?`
    await prisma.$executeRawUnsafe(query, ...values, id)

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

    const query = `DELETE FROM \`${table}\` WHERE id = ?`
    await prisma.$executeRawUnsafe(query, id)

    return NextResponse.json({ success: true, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
