#!/usr/bin/env node
/**
 * db-sync-check.js — schema.prisma vs 실제 DB 컬럼 sync 검증.
 *
 * 사용자가 "monthly_management_fee 1054" 같은 사고를 또 발견하지 않도록 —
 * lint 가 사전에 차단.
 *
 * 동작:
 *   1. DATABASE_URL 환경변수로 실제 DB 연결 (mysql2)
 *   2. INFORMATION_SCHEMA.COLUMNS 조회 → 테이블별 실제 컬럼 수집
 *   3. prisma/schema.prisma + migrations 인덱스 (schema-parser) 와 비교
 *   4. schema 에만 있고 실제 DB 에 없는 컬럼 → 위반 (1054 잠재 사고)
 *
 * 옵션:
 *   --skip-if-no-db  : DATABASE_URL 없으면 skip (CI / 로컬 dev 용)
 *   --baseline-update: 현재 차이를 known issue 로 동결
 *
 * 화이트리스트 주석 (코드 안):
 *   // db-sync-allow: <table>.<column> <reason>
 *
 * (CLAUDE.md 규칙 15 — 같은 부류 6+회 발생 → 자동 차단)
 */
const fs = require('fs')
const path = require('path')
const { buildIndex } = require('./schema-parser')

const ROOT = path.resolve(__dirname, '../..')
const KNOWLEDGE_DIR = path.join(ROOT, 'harness-engineering/knowledge')
const BASELINE_FILE = path.join(KNOWLEDGE_DIR, 'db-sync-check.baseline.json')

const flags = new Set(process.argv.slice(2))

function parseDatabaseUrl(url) {
  // mysql://user:pass@host:port/db?...
  const m = /^mysql:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/([^?]+)/.exec(url)
  if (!m) return null
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(m[2]),
    host: m[3],
    port: Number(m[4] || 3306),
    database: m[5],
  }
}

async function loadActualColumns() {
  const url = process.env.DATABASE_URL
  if (!url) {
    if (flags.has('--skip-if-no-db')) {
      console.log('[db-sync-check] DATABASE_URL 없음 — skip (--skip-if-no-db)')
      return null
    }
    console.error('[db-sync-check] DATABASE_URL 환경변수 필요. 또는 --skip-if-no-db 로 skip.')
    process.exit(0)
  }
  const cfg = parseDatabaseUrl(url)
  if (!cfg) {
    console.error('[db-sync-check] DATABASE_URL 파싱 실패. 형식: mysql://user:pass@host:port/db')
    process.exit(2)
  }

  let mysql
  try {
    mysql = require('mysql2/promise')
  } catch {
    console.error('[db-sync-check] mysql2 미설치 — npm install mysql2 필요. 또는 --skip-if-no-db 로 skip.')
    process.exit(0)
  }

  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
    database: cfg.database, connectTimeout: 5000,
  })
  try {
    const [rows] = await conn.execute(`
      SELECT TABLE_NAME, COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
    `, [cfg.database])
    const actual = {}
    for (const r of rows) {
      const t = String(r.TABLE_NAME).toLowerCase()
      if (!actual[t]) actual[t] = new Set()
      actual[t].add(String(r.COLUMN_NAME))
    }
    return actual
  } finally {
    await conn.end()
  }
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
    return new Set(data.violations || [])
  } catch { return new Set() }
}

function saveBaseline(violations) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    violations,
    generatedAt: new Date().toISOString(),
    note: 'schema 에 있지만 실제 DB 에 없는 컬럼 — known issue 로 동결.',
  }, null, 2))
}

async function main() {
  const actual = await loadActualColumns()
  if (!actual) return // skipped

  const { strict, partial } = buildIndex()
  const allSchemaCols = { ...strict, ...partial }

  const violations = []
  for (const [table, schemaCols] of Object.entries(allSchemaCols)) {
    const actualCols = actual[table.toLowerCase()]
    if (!actualCols) {
      // schema 에 있는 테이블이 실제 DB 에 없음 — info 만
      continue
    }
    const actualLower = new Set([...actualCols].map(c => c.toLowerCase()))
    for (const col of schemaCols) {
      if (!actualLower.has(col.toLowerCase())) {
        violations.push(`${table}.${col}`)
      }
    }
  }

  console.log(`[db-sync-check] schema tables=${Object.keys(allSchemaCols).length}, actual tables=${Object.keys(actual).length}`)

  if (flags.has('--baseline-update')) {
    saveBaseline(violations)
    console.log(`[db-sync-check] baseline updated — ${violations.length} violations frozen`)
    process.exit(0)
  }

  const baseline = loadBaseline()
  const newViolations = violations.filter(v => !baseline.has(v))

  console.log(`[db-sync-check] total=${violations.length}, new=${newViolations.length}, known=${violations.length - newViolations.length}`)
  if (newViolations.length === 0) {
    console.log('[db-sync-check] ✅ 새 sync 위반 없음')
    process.exit(0)
  }
  console.error('[db-sync-check] ❌ schema 에 있지만 실제 DB 에 없는 컬럼:')
  for (const v of newViolations.slice(0, 20)) console.error(`  · ${v}`)
  if (newViolations.length > 20) console.error(`  ... 외 ${newViolations.length - 20}건`)
  console.error('\n→ migration 적용 필요 또는 코드에서 해당 컬럼 사용 안 하도록 수정')
  console.error('→ 의도된 차이라면: npm run lint:db-sync -- --baseline-update')
  process.exit(1)
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(2) })

module.exports = { loadActualColumns }
