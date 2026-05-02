/**
 * schema-parser.js — schema.prisma + migrations/*.sql 을 파싱해서
 *                    { tableName: Set<columnName> } 인덱스 생성.
 *
 * 사용처: sql-lint.js / api-call-trace.js
 *
 * 한계:
 *   - 정규식 기반 단순 파싱
 *   - 컴퓨티드/뷰 컬럼은 누락 가능 — 화이트리스트 보충
 *
 * (CLAUDE.md § 0-1 규칙 11 자동화 안전장치)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const SCHEMA_FILE = path.join(ROOT, 'prisma/schema.prisma')
const MIG_DIR = path.join(ROOT, 'migrations')

// snake_case 변환 (Pascal/camel → snake)
function snakeCase(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .replace(/[A-Z]+/g, m => m.toLowerCase())
          .toLowerCase()
}

// ⚠️ STANDARD_COLS 자동 추가는 false negative 의 원인 (2026-05-03 발견)
// 어제 `bank_account_mappings.deleted_at` 1054 에러: 이 자동 추가 때문에 lint 가 못 잡음.
// → STANDARD_COLS 제거. 모든 컬럼을 schema/migration 에서 명시적으로 정의해야 검증 가능.
const STANDARD_COLS = new Set([])

function parseSchemaPrisma() {
  if (!fs.existsSync(SCHEMA_FILE)) return {}
  const src = fs.readFileSync(SCHEMA_FILE, 'utf-8')
  const tables = {}

  // model X { ... } 블록 추출
  const modelRegex = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm
  let m
  while ((m = modelRegex.exec(src)) !== null) {
    const modelName = m[1]
    const body = m[2]

    // @@map("table_name") 우선
    const mapMatch = body.match(/@@map\("([^"]+)"\)/)
    const tableName = mapMatch ? mapMatch[1] : snakeCase(modelName)

    // Prisma 스칼라 타입 화이트리스트 — 이 타입으로 시작하면 컬럼.
    // 그 외 (UserRole, Vehicle 등) 는 enum 또는 관계로 간주 → skip.
    const SCALARS = ['String', 'Int', 'BigInt', 'Float', 'Decimal',
                     'Boolean', 'DateTime', 'Bytes', 'Json']
    const scalarRe = new RegExp(`^(${SCALARS.join('|')})(\\?|\\[\\])?(\\s|$)`)

    const cols = new Set([...STANDARD_COLS])
    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue
      const fieldMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i)
      if (!fieldMatch) continue
      const field = fieldMatch[1]
      const rest = fieldMatch[2]
      // 1) Prisma 스칼라 타입이면 컬럼
      if (scalarRe.test(rest)) { cols.add(field); continue }
      // 2) `@db.` 디렉티브가 있으면 enum 컬럼 (UserRole 같은) 도 컬럼
      if (/@db\./.test(rest)) { cols.add(field); continue }
      // 3) 그 외는 관계 — skip
    }
    tables[tableName] = cols
  }
  return tables
}

function parseMigrations() {
  if (!fs.existsSync(MIG_DIR)) return {}
  const tables = {}
  for (const f of fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql'))) {
    const src = fs.readFileSync(path.join(MIG_DIR, f), 'utf-8')

    // CREATE TABLE x ( ... )
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;)/gi
    let m
    while ((m = createRe.exec(src)) !== null) {
      const t = m[1]
      const body = m[2]
      tables[t] = tables[t] || new Set([...STANDARD_COLS])
      // 각 컬럼 정의 한 줄
      for (const line of body.split(',')) {
        const trimmed = line.trim()
        // 인덱스/제약 정의 skip — 시작 토큰으로 판별
        if (/^(PRIMARY\s+KEY|KEY\b|INDEX\b|UNIQUE\b|CONSTRAINT\b|FULLTEXT\b|SPATIAL\b|FOREIGN\b)/i.test(trimmed)) continue
        const cm = trimmed.match(/^[`"]?(\w+)[`"]?\s+\w+/)
        if (cm && !/^(PRIMARY|KEY|INDEX|UNIQUE|CONSTRAINT|FULLTEXT|SPATIAL|FOREIGN)$/i.test(cm[1])) {
          tables[t].add(cm[1])
        }
      }
    }

    // ALTER TABLE x ADD COLUMN y ...
    const alterRe = /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s*([\s\S]*?);/gi
    while ((m = alterRe.exec(src)) !== null) {
      const t = m[1]
      tables[t] = tables[t] || new Set([...STANDARD_COLS])
      const body = m[2]
      const colRe = /ADD\s+(?:COLUMN\s+)?[`"]?(\w+)[`"]?\s+\w+/gi
      let cm
      while ((cm = colRe.exec(body)) !== null) {
        tables[t].add(cm[1])
      }
    }
  }
  return tables
}

function buildIndex() {
  const fromSchema = parseSchemaPrisma()
  const fromMig = parseMigrations()
  // Strict 검증 대상 = schema.prisma 에 정의된 테이블 + migrations 의 추가 컬럼
  // schema 미정의 + migrations 부분만 있는 테이블은 신뢰도 낮음 → 별도 표시
  const strict = {}
  const partial = {}
  for (const [t, cols] of Object.entries(fromSchema)) strict[t] = new Set(cols)
  for (const [t, cols] of Object.entries(fromMig)) {
    if (strict[t]) {
      for (const c of cols) strict[t].add(c)
    } else {
      partial[t] = new Set(cols)
    }
  }
  return { strict, partial }
}

module.exports = { buildIndex, snakeCase, STANDARD_COLS }

if (require.main === module) {
  const { strict, partial } = buildIndex()
  console.log(`[schema-parser] strict=${Object.keys(strict).length} (schema+mig), partial=${Object.keys(partial).length} (mig only)`)
  for (const [t, cols] of Object.entries(strict).slice(0, 3)) {
    console.log(`  [strict] ${t}: ${cols.size} cols`)
  }
  for (const [t, cols] of Object.entries(partial).slice(0, 3)) {
    console.log(`  [partial] ${t}: ${cols.size} cols`)
  }
}
