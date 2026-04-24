import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// 2026-04-22 구조 점검:
// - 계산엔진이 input.reference.* 필드로 실제 소비하는 참조 테이블은 유지
//   (quotes/simple 이 Promise.all 로 fetch → calc 엔진에 feed)
// - UI 가 편집하는 핵심 기준표 (business_rules + 6종) 는 EvidenceDrawer + AI 검증 대상
// - 5개 진짜 고아 테이블만 DROP: depreciation_history(→pricing_standard_changes 로 대체),
//     emission_standard_table, inspection_penalty_table,
//     insurance_policy_record, insurance_vehicle_group
//   (실제 DROP 은 migrations/2026-04-22_drop_unused_pricing_tables.sql)
const ALLOWED_TABLES = [
  // 핵심 (UI 편집 + EvidenceDrawer 대상)
  'business_rules',
  'vehicle_market_price',
  'depreciation_rates',
  'insurance_rate_table',
  'maintenance_cost_table',
  'finance_rate_table',
  'vehicle_tax_table',
  'sales_presets',
  // 계산엔진이 실제로 읽는 참조 테이블 (quotes/simple 이 fetch 해서 feed)
  'depreciation_adjustments',     // 시세/인기도 보정 계수
  'depreciation_db',              // 레거시 감가 DB (curve_preset=db_based 시 사용)
  'registration_cost_table',      // 취득세/공채/탁송료/번호판/인지세/대행료
  'inspection_cost_table',        // 정기검사 비용
  'inspection_schedule_table',    // 정기검사 스케줄
  'insurance_base_premium',       // 보험 기본 보험료
  'insurance_own_vehicle_rate',   // 보험 자기부담 요율
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
    case 'business_rules':
      return `SELECT * FROM ${table} ORDER BY \`key\``
    case 'vehicle_market_price':
      return `SELECT * FROM ${table} WHERE is_active = 1 ORDER BY brand, model, year DESC`
    case 'depreciation_rates':
      return `SELECT * FROM ${table} ORDER BY id`
    case 'depreciation_adjustments':
      return `SELECT * FROM ${table} ORDER BY id`
    case 'depreciation_db':
      return `SELECT * FROM ${table} ORDER BY id`
    case 'insurance_rate_table':
      return `SELECT * FROM ${table} ORDER BY vehicle_type, value_min`
    case 'insurance_base_premium':
      return `SELECT * FROM ${table} ORDER BY vehicle_type`
    case 'insurance_own_vehicle_rate':
      return `SELECT * FROM ${table} ORDER BY age_band`
    case 'maintenance_cost_table':
      return `SELECT * FROM ${table} ORDER BY vehicle_type`
    case 'finance_rate_table':
      return `SELECT * FROM ${table} ORDER BY effective_date DESC`
    case 'vehicle_tax_table':
      return `SELECT * FROM ${table} ORDER BY tax_type ASC`
    case 'registration_cost_table':
      return `SELECT * FROM ${table} ORDER BY cost_type`
    case 'inspection_cost_table':
      return `SELECT * FROM ${table} ORDER BY vehicle_type`
    case 'inspection_schedule_table':
      return `SELECT * FROM ${table} ORDER BY vehicle_type, year_from`
    case 'sales_presets':
      return `SELECT * FROM ${table} WHERE is_active = 1 ORDER BY sort_order ASC`
    default:
      return `SELECT * FROM ${table}`
  }
}

// ============================================================
// 변경 이력 로깅 유틸 — Phase A-1
// ============================================================
function stringifyVal(v: any): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

function normalizeForCompare(v: any): string | null {
  // DB에서 오는 값과 요청 본문 값을 같은 형태로 비교하기 위한 정규화
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  // Decimal from MySQL comes as string; numbers become strings too — trim trailing zeros
  if (typeof v === 'number') return String(v)
  return String(v)
}

async function logChanges(opts: {
  table: string
  rowId: string
  oldRow: any
  newBody: any
  userId: string | null
  reason?: string | null
}) {
  const { table, rowId, oldRow, newBody, userId, reason } = opts
  if (!oldRow) return
  // [id, table_name, row_id, field, old_value, new_value, user_id, reason]
  const rows: Array<[string, string, string, string, string | null, string | null, string | null, string | null]> = []
  for (const key of Object.keys(newBody)) {
    // 대상 row에 해당 컬럼이 원래 있던 경우에만 diff 계산
    const before = oldRow[key]
    const after = (newBody as any)[key]
    const beforeNorm = normalizeForCompare(before)
    const afterNorm = normalizeForCompare(after)
    if (beforeNorm === afterNorm) continue
    rows.push([
      crypto.randomUUID(),
      table,
      rowId,
      key,
      stringifyVal(before),
      stringifyVal(after),
      userId,
      reason ?? null,
    ])
  }
  if (rows.length === 0) return
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
  const flat = rows.flat()
  await prisma.$executeRawUnsafe(
    `INSERT INTO pricing_standard_changes
      (id, table_name, row_id, field, old_value, new_value, user_id, reason)
     VALUES ${placeholders}`,
    ...flat,
  )
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const table = searchParams.get('table')
    const history = searchParams.get('history')
    const rowId = searchParams.get('id')

    if (!table) {
      return NextResponse.json({ error: 'table 파라미터 필수' }, { status: 400 })
    }

    if (!validateTableName(table)) {
      return NextResponse.json({ error: '잘못된 테이블' }, { status: 400 })
    }

    // ── 변경 이력 조회 모드 ──
    if (history === '1') {
      if (!rowId) {
        // table 전체 최근 이력 (최대 50건)
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT c.id, c.table_name, c.row_id, c.field, c.old_value, c.new_value,
                  c.user_id, p.name AS user_name, p.email AS user_email,
                  c.reason, c.changed_at
             FROM pricing_standard_changes c
             LEFT JOIN profiles p ON p.id = c.user_id
            WHERE c.table_name = ?
            ORDER BY c.changed_at DESC
            LIMIT 50`,
          table,
        )
        return NextResponse.json({ data: serialize(rows), error: null })
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT c.id, c.table_name, c.row_id, c.field, c.old_value, c.new_value,
                c.user_id, p.name AS user_name, p.email AS user_email,
                c.reason, c.changed_at
           FROM pricing_standard_changes c
           LEFT JOIN profiles p ON p.id = c.user_id
          WHERE c.table_name = ? AND c.row_id = ?
          ORDER BY c.changed_at DESC
          LIMIT 50`,
        table,
        rowId,
      )
      return NextResponse.json({ data: serialize(rows), error: null })
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

    // 변경 이유 (선택) — body._reason 으로 받고, 저장엔 포함하지 않음
    const reason: string | null = typeof (body as any)?._reason === 'string' ? (body as any)._reason : null
    if ('_reason' in body) delete (body as any)._reason

    // 컬럼명 화이트리스트 검증
    const keys = Object.keys(body)
    const invalidKey = keys.find(k => !validateColumnName(k))
    if (invalidKey) {
      return NextResponse.json({ error: `잘못된 컬럼명: ${invalidKey}` }, { status: 400 })
    }

    // ── 변경 전 row 스냅샷 (로깅용) ──
    let oldRow: any = null
    try {
      const oldRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`,
        id,
      )
      oldRow = oldRows?.[0] ?? null
    } catch {
      oldRow = null
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

    // ── 변경 이력 자동 로깅 (실패해도 update 는 유지) ──
    try {
      await logChanges({
        table,
        rowId: id,
        oldRow,
        newBody: body,
        userId: (user as any)?.id ?? null,
        reason,
      })
    } catch (logErr) {
      // 로깅 실패는 무시 — 기준값 저장 자체는 이미 성공했음
      // eslint-disable-next-line no-console
      console.warn('[pricing-standards] change log failed:', logErr)
    }

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
