#!/usr/bin/env node
/**
 * sql-lint.js — $queryRaw / $executeRaw 안의 컬럼 참조를
 *               schema.prisma + migrations 와 대조하여 미정의 컬럼 감지.
 *
 * 검증 패턴:
 *   1. Tagged template:  prisma.$queryRaw`SELECT ... FROM x WHERE col = ${v}`
 *   2. Unsafe 호출:      prisma.$queryRawUnsafe('SELECT ... ', args)
 *
 * 알려진 한계:
 *   - dynamic SQL (string concat) 은 부분 검사
 *   - subquery alias / CTE 는 alias 매핑 누락 가능 → unknown_alias 로 분류
 *   - 컴퓨티드 컬럼 / 뷰 컬럼은 schema 에 없으면 위반으로 보고
 *
 * (CLAUDE.md § 0-1 규칙 11 자동화 안전장치)
 */
const fs = require('fs')
const path = require('path')
const { buildIndex } = require('./schema-parser')

const ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(ROOT, 'app')
const LIB_DIR = path.join(ROOT, 'lib')

// SQL 키워드/함수 화이트리스트 (컬럼명으로 오인 방지)
const SQL_KEYWORDS = new Set([
  // DML
  'select','from','where','and','or','not','null','is','as','in','on',
  'left','right','inner','outer','full','cross','join','using',
  'group','by','order','having','limit','offset','distinct','all','any','some',
  'union','intersect','except','case','when','then','else','end','exists',
  'between','like','rlike','regexp','asc','desc','collate','set','values',
  'insert','into','update','delete','from','returning','duplicate','key',
  // 함수
  'count','sum','avg','max','min','coalesce','if','ifnull','nullif',
  'concat','concat_ws','substring','substr','left','right','length','char_length',
  'replace','trim','ltrim','rtrim','upper','lower','format',
  'date_format','date_sub','date_add','now','curdate','curtime','unix_timestamp',
  'year','month','day','hour','minute','second',
  'round','floor','ceiling','ceil','mod','abs','greatest','least',
  'group_concat','json_object','json_array','json_extract','json_unquote',
  'cast','convert','utf8mb4_unicode_ci','utf8mb4_bin','utf8','utf8mb4',
  'true','false','default',
  'regexp_replace','regexp_like','json_table',
  'row_number','rank','dense_rank','over','partition',
  // MySQL 타입 (CAST 안)
  'char','varchar','int','bigint','decimal','date','datetime','timestamp','json','text','tinyint','smallint','signed','unsigned',
])

// 우리 코드에서 자주 쓰는 가상 컬럼/별칭 (오탐 방지)
const PROJECT_ALIASES = new Set([
  // join 테이블 별칭 — 본 테이블을 그대로 쓸 때
])

// $queryRaw / $executeRaw 호출 추출
function extractSqlCalls(src, file) {
  const out = []
  // Tagged template — generic 중첩 (Array<{...}>) 도 매칭하도록 단순화
  const tagRe = /\$(?:query|execute)Raw(?!Unsafe)\b[^`]*`([\s\S]*?)`/g
  let m
  while ((m = tagRe.exec(src)) !== null) {
    out.push({ sql: m[1], file, offset: m.index })
  }
  // Unsafe call — generic 무시
  const unsafeRe = /\$(?:query|execute)RawUnsafe\b[^(]*\(\s*([`'"])([\s\S]*?)\1/g
  while ((m = unsafeRe.exec(src)) !== null) {
    out.push({ sql: m[2], file, offset: m.index })
  }
  // ── lib/ 의 SQL helper 추출 (2026-05-02 신설 — 자동화 사고 방지) ──
  // 함수 이름이 Sql 로 끝나는 export function 의 backtick 반환 SQL 단편 검사.
  // 예: export function bankMappingJoinSql(...) { return `...` }
  const helperRe = /export\s+function\s+\w*Sql\s*\([^)]*\)[^{]*\{[\s\S]*?return\s*`([\s\S]*?)`/g
  while ((m = helperRe.exec(src)) !== null) {
    out.push({ sql: m[1], file, offset: m.index, isHelper: true })
  }
  return out
}

// SQL 에서 FROM / JOIN 절 → alias 매핑 추출
function buildAliasMap(sql) {
  const aliases = {} // alias -> tableName
  // FROM table [AS] alias
  // JOIN table [AS] alias ON ...
  const re = /\b(?:from|join)\s+`?([a-z_][a-z0-9_]*)`?(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?(?=\s|$|,|\(|\))/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    const table = m[1]
    const alias = m[2] && !SQL_KEYWORDS.has(m[2].toLowerCase()) ? m[2] : null
    aliases[table] = table  // 본명도 alias 로
    if (alias) aliases[alias] = table
  }
  return aliases
}

// SQL 에서 alias.column 패턴 추출
function extractColRefs(sql) {
  const refs = []
  // alias.column — column 이 키워드가 아닐 때만
  const re = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    const aliasOrTable = m[1]
    const col = m[2]
    if (SQL_KEYWORDS.has(col.toLowerCase())) continue
    refs.push({ aliasOrTable, col })
  }
  return refs
}

function walkTs(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(entry.name)) continue
      walkTs(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function lint() {
  const { strict, partial } = buildIndex()
  // 모든 schema 의 컬럼 합집합 — helper SQL 의 어디에든 존재 검증용
  const ALL_COLS = new Set()
  for (const cols of Object.values(strict)) for (const c of cols) ALL_COLS.add(c)
  for (const cols of Object.values(partial)) for (const c of cols) ALL_COLS.add(c)

  const violations = []
  const warnings = []
  const files = [...walkTs(APP_DIR), ...walkTs(LIB_DIR)]

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8')
    const calls = extractSqlCalls(src, file)
    for (const { sql, offset, isHelper } of calls) {
      const before = src.slice(0, offset)
      const lineNo = before.split('\n').length

      if (isHelper) {
        // ── lib/ helper SQL — alias 가 동적 (${aliasParam}) 이라 어느 테이블인지 모름.
        //    추출된 column 이 schema 의 어느 테이블에든 존재하는지 확인. 없으면 위반.
        // 패턴: \w+\.(snake_col)  + ${alias}.column 모두 추출
        const colSet = new Set()
        // alias.col
        const re1 = /\b([a-z_]\w*)\.([a-z_][a-z0-9_]*)\b/gi
        let m1
        while ((m1 = re1.exec(sql)) !== null) {
          if (!SQL_KEYWORDS.has(m1[2].toLowerCase())) colSet.add(m1[2])
        }
        // ${alias}.col
        const re2 = /\$\{[^}]+\}\.([a-z_][a-z0-9_]*)/g
        let m2
        while ((m2 = re2.exec(sql)) !== null) {
          if (!SQL_KEYWORDS.has(m2[1].toLowerCase())) colSet.add(m2[1])
        }
        for (const col of colSet) {
          if (!ALL_COLS.has(col)) {
            violations.push({
              file: path.relative(ROOT, file),
              line: lineNo,
              table: '(helper)',
              column: col,
              ref: `(SQL helper) ${col}`,
              knownCols: ['→ schema 의 어떤 테이블에도 없는 컬럼'],
            })
          }
        }
      } else {
        // 기존 — $queryRaw 호출의 SQL — alias 매핑으로 정확 검증
        const aliases = buildAliasMap(sql)
        const refs = extractColRefs(sql)
        for (const { aliasOrTable, col } of refs) {
          const table = aliases[aliasOrTable]
          if (!table) continue
          const knownCols = strict[table]
          if (!knownCols) continue
          if (!knownCols.has(col)) {
            violations.push({
              file: path.relative(ROOT, file),
              line: lineNo,
              table,
              column: col,
              ref: `${aliasOrTable}.${col}`,
              knownCols: [...knownCols].sort().slice(0, 10),
            })
          }
        }
      }
    }
  }

  return { violations, warnings, fileCount: files.length,
           strictCount: Object.keys(strict).length,
           partialCount: Object.keys(partial).length }
}

if (require.main === module) {
  const { violations, fileCount, strictCount, partialCount } = lint()
  console.log(`[sql-lint] ${fileCount} files scanned, ${strictCount} strict + ${partialCount} partial tables`)
  if (violations.length === 0) {
    console.log('[sql-lint] ✅ no column violations')
    process.exit(0)
  }
  console.error(`[sql-lint] ❌ ${violations.length} violation(s):`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.ref}  (table ${v.table} has no '${v.column}')`)
    console.error(`     known cols: ${v.knownCols.join(', ')}, ...`)
  }
  process.exit(1)
}

module.exports = { lint }
