import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// POST /api/migrate/universal — Supabase → MySQL 범용 마이그레이션 (admin 전용)
// Body: { supabase_key, tables: string[], mode?: 'create_and_sync'|'sync_only'|'create_only', insertMode?: 'ignore'|'replace' }
// 1) Supabase OpenAPI 스키마 자동 파싱 → MySQL DDL 생성
// 2) CREATE TABLE IF NOT EXISTS 실행
// 3) Supabase REST API 페이지네이션 fetch
// 4) INSERT IGNORE (기본) 또는 REPLACE INTO 삽입
// 5) 테이블별 상세 결과 반환 (fetched/inserted/skipped/error)

const SUPABASE_URL = 'https://uiyiwgkpchnvuvpsjfxv.supabase.co'
const PAGE_SIZE = 1000

type ColDef = { name: string; pgType: string; nullable: boolean }
type TableSchema = { cols: ColDef[]; required: string[] }

// PG → MySQL type mapping
function pgToMysql(pgType: string): string {
  const t = pgType.toLowerCase().trim()
  if (t === 'uuid') return 'CHAR(36)'
  if (t === 'bigint') return 'BIGINT'
  if (t === 'integer' || t === 'int') return 'INT'
  if (t === 'smallint') return 'SMALLINT'
  if (t === 'numeric' || t.startsWith('numeric')) return 'DECIMAL(20,6)'
  if (t === 'real' || t === 'double precision') return 'DOUBLE'
  if (t === 'boolean' || t === 'bool') return 'TINYINT(1)'
  if (t === 'text') return 'TEXT'
  if (t.startsWith('character varying') || t.startsWith('varchar')) {
    const m = t.match(/\((\d+)\)/)
    return m ? `VARCHAR(${m[1]})` : 'VARCHAR(255)'
  }
  if (t.startsWith('character')) return 'CHAR(36)'
  if (t === 'timestamp with time zone' || t === 'timestamptz') return 'DATETIME(3)'
  if (t === 'timestamp without time zone' || t === 'timestamp') return 'DATETIME(3)'
  if (t === 'date') return 'DATE'
  if (t === 'time' || t.startsWith('time ')) return 'TIME'
  if (t === 'jsonb' || t === 'json') return 'JSON'
  if (t.endsWith('[]') || t === 'array') return 'JSON'
  if (t === 'bytea') return 'BLOB'
  return 'TEXT'
}

// Fetch OpenAPI schema and extract table definitions
async function fetchSchema(supabaseKey: string): Promise<Record<string, TableSchema>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Accept': 'application/openapi+json',
    },
  })
  if (!res.ok) throw new Error(`OpenAPI fetch failed: ${res.status}`)
  const spec: any = await res.json()
  const defs = spec.definitions || {}
  const out: Record<string, TableSchema> = {}
  for (const [tbl, def] of Object.entries<any>(defs)) {
    const props = def.properties || {}
    const cols: ColDef[] = []
    for (const [name, p] of Object.entries<any>(props)) {
      // PostgREST stores PG type as "format" (e.g. "bigint", "uuid", "text")
      const pgType = p.format || p.type || 'text'
      const nullable = p.nullable !== false // default true
      cols.push({ name, pgType, nullable })
    }
    out[tbl] = { cols, required: def.required || [] }
  }
  return out
}

// Generate CREATE TABLE DDL
function buildCreateTable(table: string, schema: TableSchema): string {
  const colDefs: string[] = []
  let pkCol: string | null = null
  for (const c of schema.cols) {
    const mysqlType = pgToMysql(c.pgType)
    // id PK must be NOT NULL even if OpenAPI says nullable
    const isPk = c.name === 'id' && !pkCol
    const nullStr = isPk ? 'NOT NULL' : (c.nullable ? 'NULL' : 'NOT NULL')
    colDefs.push(`  \`${c.name}\` ${mysqlType} ${nullStr}`)
    if (isPk) pkCol = c.name
  }
  if (pkCol) {
    colDefs.push(`  PRIMARY KEY (\`${pkCol}\`)`)
  }
  return `CREATE TABLE IF NOT EXISTS \`${table}\` (\n${colDefs.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
}

// Normalize a row value for MySQL insertion
function normalizeValue(v: any, pgType: string): any {
  if (v === null || v === undefined) return null
  const t = pgType.toLowerCase()
  if (t === 'jsonb' || t === 'json' || t.endsWith('[]') || t === 'array') {
    return JSON.stringify(v)
  }
  if (t === 'boolean' || t === 'bool') {
    return v ? 1 : 0
  }
  if (t === 'timestamp with time zone' || t === 'timestamptz' || t === 'timestamp without time zone' || t === 'timestamp') {
    // Convert ISO to MySQL DATETIME(3)
    if (typeof v === 'string') {
      const d = new Date(v)
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 23).replace('T', ' ')
      }
    }
    return v
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

// Fetch all rows from Supabase with pagination
async function fetchAllRows(table: string, supabaseKey: string): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const to = from + PAGE_SIZE - 1
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Range-Unit': 'items',
        'Range': `${from}-${to}`,
      },
    })
    if (!res.ok) throw new Error(`fetch ${table} [${from}-${to}] failed: ${res.status}`)
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM profiles WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  let body: any = {}
  try { body = await request.json() } catch {}
  const supabaseKey = body.supabase_key || ''
  const tables: string[] = Array.isArray(body.tables) ? body.tables : []
  const mode: 'create_and_sync' | 'sync_only' | 'create_only' = body.mode || 'create_and_sync'
  const insertMode: 'ignore' | 'replace' = body.insertMode || 'ignore'
  const dryRun: boolean = !!body.dryRun

  if (!supabaseKey) return NextResponse.json({ error: 'supabase_key 필요' }, { status: 400 })
  if (tables.length === 0) return NextResponse.json({ error: 'tables[] 필요' }, { status: 400 })

  try {
    const allSchemas = await fetchSchema(supabaseKey)

    const results: Record<string, any> = {}

    for (const tbl of tables) {
      const r: any = { table: tbl }
      try {
        const schema = allSchemas[tbl]
        if (!schema) {
          r.error = 'schema not found in Supabase OpenAPI'
          results[tbl] = r
          continue
        }

        // 1. CREATE TABLE
        if (mode !== 'sync_only') {
          const ddl = buildCreateTable(tbl, schema)
          r.ddl = ddl
          if (!dryRun) {
            await prisma.$executeRawUnsafe(ddl)
            r.created = true
          }
        }
        if (mode === 'create_only') {
          results[tbl] = r
          continue
        }

        // 2. Fetch rows
        const rows = await fetchAllRows(tbl, supabaseKey)
        r.fetched = rows.length
        if (rows.length === 0) {
          r.inserted = 0
          results[tbl] = r
          continue
        }

        // 3. Build INSERT — use first row keys (all rows have same shape)
        const colNames = Object.keys(rows[0])
        const colTypeMap: Record<string, string> = {}
        for (const c of schema.cols) colTypeMap[c.name] = c.pgType

        const backticks = colNames.map(c => `\`${c}\``).join(', ')
        const placeholders = colNames.map(() => '?').join(', ')
        const verb = insertMode === 'replace' ? 'REPLACE' : 'INSERT IGNORE'
        const sql = `${verb} INTO \`${tbl}\` (${backticks}) VALUES (${placeholders})`

        let inserted = 0
        const errors: string[] = []
        for (const row of rows) {
          const values = colNames.map(c => normalizeValue(row[c], colTypeMap[c] || 'text'))
          if (dryRun) { inserted++; continue }
          try {
            const n = await prisma.$executeRawUnsafe(sql, ...values)
            inserted += Number(n || 0)
          } catch (e: any) {
            errors.push(`${e.message}`.slice(0, 200))
            if (errors.length >= 3) break // stop spamming
          }
        }
        r.inserted = inserted
        r.skipped = rows.length - inserted
        if (errors.length > 0) r.errors = errors
      } catch (e: any) {
        r.error = e.message
      }
      results[tbl] = r
    }

    const summary = {
      totalTables: tables.length,
      created: Object.values(results).filter((r: any) => r.created).length,
      fetched: Object.values(results).reduce((a: number, r: any) => a + (r.fetched || 0), 0),
      inserted: Object.values(results).reduce((a: number, r: any) => a + (r.inserted || 0), 0),
      errored: Object.values(results).filter((r: any) => r.error).length,
    }

    return NextResponse.json({ ok: true, mode, insertMode, dryRun, summary, results })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  }
}
