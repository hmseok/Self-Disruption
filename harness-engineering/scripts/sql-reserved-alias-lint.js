#!/usr/bin/env node
/**
 * sql-reserved-alias-lint.js — SQL alias 예약어 사용 차단.
 *
 * MySQL 예약어를 alias 로 사용하면 1064 syntax error.
 * 예: SELECT COALESCE(...) AS desc → desc 가 ORDER BY DESC 키워드라서 문법 오류.
 *
 * 검사 대상: $queryRaw / $queryRawUnsafe / $executeRaw / $executeRawUnsafe template
 * 검출: \bAS\s+(예약어)\b 패턴 (백틱으로 감싼 경우 OK)
 *
 * 화이트리스트 주석 (SQL 안):
 *   -- sql-reserved-alias-allow: <reason>
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')

// MySQL 예약어 (R) — alias 로 쓰면 1064 발생 (백틱 없이)
// 집계 함수 (COUNT, SUM, AVG, MIN, MAX) 는 함수명일 뿐 예약어 X — 제외
// 출처: MySQL 8 공식 문서 Reserved Words + 어제 실수 패턴
const RESERVED = new Set([
  // 정렬/그룹 — alias 로 쓰면 syntax error 자주
  'asc', 'desc', 'order', 'group', 'by', 'limit', 'offset',
  // 명령
  'select', 'from', 'where', 'having', 'join', 'using',
  'inner', 'outer', 'left', 'right', 'cross',
  'insert', 'update', 'delete', 'values', 'into',
  // 조건
  'and', 'or', 'not', 'is', 'in', 'between', 'like', 'exists',
  'case', 'when', 'then', 'else', 'null', 'true', 'false',
  // 윈도우/순위 (8.0+)
  'rank', 'row', 'over', 'partition', 'dense_rank', 'window',
  // 키
  'key', 'primary', 'foreign', 'unique', 'references',
  // 데이터타입
  'int', 'integer', 'bigint', 'varchar', 'char', 'text', 'date', 'datetime',
  'timestamp', 'decimal', 'float', 'double', 'boolean', 'binary', 'blob',
  // 트랜잭션/락
  'lock', 'unlock', 'share',
  // 기타
  'all', 'distinct', 'with', 'recursive', 'union', 'intersect', 'except',
  'check', 'default', 'create', 'drop', 'alter', 'table', 'column', 'database',
  'trigger', 'procedure', 'function', 'index',
])

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js'))) yield p
  }
}

// $queryRaw / $queryRawUnsafe / $executeRaw / $executeRawUnsafe 안의 SQL 추출
function extractSqlBlocks(src) {
  const blocks = []
  // template literal: prisma.$queryRaw`...` or `...`
  const tplRegex = /\$(?:queryRaw|executeRaw)(?:Unsafe)?(?:<[^>]*>)?\s*[`(]/g
  let m
  while ((m = tplRegex.exec(src)) !== null) {
    const opener = src[m.index + m[0].length - 1]
    let i = m.index + m[0].length
    let depth = 1
    let str = ''
    if (opener === '`') {
      // template literal — 백틱 끝까지 (단, ${...} 안 backtick 무시)
      while (i < src.length && depth > 0) {
        const c = src[i]
        if (c === '\\') { str += c + src[i+1]; i += 2; continue }
        if (c === '$' && src[i+1] === '{') {
          let braceDepth = 1
          str += '${'
          i += 2
          while (i < src.length && braceDepth > 0) {
            if (src[i] === '{') braceDepth++
            else if (src[i] === '}') braceDepth--
            if (braceDepth > 0) str += src[i]
            i++
          }
          str += '}'
          continue
        }
        if (c === '`') { depth--; if (depth === 0) break }
        str += c
        i++
      }
    } else {
      // ( ... ) 형식: prisma.$queryRawUnsafe(query, ...) 처럼 변수 첫 인자면 skip
      // — 검사 대상은 SQL 자체 (template literal) 만
      i++  // skip — backtick template 만 검사 대상
      continue
    }
    const startLine = src.slice(0, m.index).split('\n').length
    blocks.push({ sql: str, startLine, startIndex: m.index })
  }
  return blocks
}

function lint() {
  const violations = []
  let fileCount = 0

  const targets = []
  for (const f of walk(path.join(ROOT, 'app'))) targets.push(f)
  for (const f of walk(path.join(ROOT, 'lib'))) targets.push(f)

  for (const file of targets) {
    fileCount++
    const src = fs.readFileSync(file, 'utf-8')
    const rel = path.relative(ROOT, file)
    const blocks = extractSqlBlocks(src)

    for (const { sql, startLine } of blocks) {
      // 화이트리스트 라인 수집
      const allowLines = new Set()
      sql.split('\n').forEach((line, idx) => {
        if (/sql-reserved-alias-allow/i.test(line)) {
          for (let i = 1; i <= 3; i++) allowLines.add(idx + 1 + i)
        }
      })

      // \bAS\s+([a-z_][a-z0-9_]*)\b — 백틱/따옴표 alias 는 제외
      // 단, AS 직전이 backtick 이면 skip (이미 quote 된 alias)
      const aliasRegex = /\bAS\s+([a-z_][a-z0-9_]*)\b/gi
      let m
      while ((m = aliasRegex.exec(sql)) !== null) {
        const alias = m[1].toLowerCase()
        if (!RESERVED.has(alias)) continue

        // 백틱 / 따옴표 안인지 확인 — 직후 글자가 백틱/따옴표면 false positive
        const charBefore = sql[m.index + m[0].length - alias.length - 1]
        if (charBefore === '`' || charBefore === '"' || charBefore === "'") continue

        const lineInBlock = sql.slice(0, m.index).split('\n').length
        if (allowLines.has(lineInBlock)) continue

        violations.push({
          file: rel,
          line: startLine + lineInBlock - 1,
          alias: m[1],
          context: sql.split('\n')[lineInBlock - 1].trim().slice(0, 80),
        })
      }
    }
  }

  return { fileCount, violations }
}

if (require.main === module) {
  const r = lint()
  console.log(`sql-reserved-alias-lint: ${r.fileCount} files, ${r.violations.length} violations`)
  for (const v of r.violations) {
    console.error(`  ❌ ${v.file}:${v.line} AS ${v.alias} (예약어)`)
    console.error(`     ${v.context}`)
  }
  process.exit(r.violations.length > 0 ? 1 : 0)
}

module.exports = { lint, RESERVED }
