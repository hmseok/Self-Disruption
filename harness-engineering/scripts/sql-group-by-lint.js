#!/usr/bin/env node
/**
 * sql-group-by-lint.js — GROUP BY alias ↔ SELECT expression 정합성 검사.
 *
 * MySQL only_full_group_by 모드 (Cloud SQL 기본값) 에서:
 *   SELECT COALESCE(a, b) AS x ... GROUP BY x  → 1055 에러
 *
 * x 가 expression 의 alias 인데 GROUP BY 에서 alias 만 참조 → MySQL 이
 * SELECT 의 nonaggregated column (예: a, b) 을 GROUP BY 에 없다고 판단.
 *
 * 검증:
 *   1. SELECT 절의 alias 정의 추출: `<expr> AS <alias>` 또는 `<expr> <alias>`
 *   2. expression 이 단순 컬럼 (`col` 또는 `t.col`) 이면 OK
 *   3. expression 이 함수 호출 / 연산 / CASE 등이면 GROUP BY 에서 같은 expression 명시 강제
 *   4. GROUP BY 에서 단순 alias 참조 발견 시 → 위반
 *
 * 화이트리스트:
 *   -- sql-group-by-allow: <reason>
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js'))) yield p
  }
}

function extractTemplateBlocks(src) {
  const blocks = []
  const tplRegex = /\$(?:queryRaw|executeRaw)(?:Unsafe)?(?:<[^>]*>)?\s*`/g
  let m
  while ((m = tplRegex.exec(src)) !== null) {
    let i = m.index + m[0].length
    let str = ''
    while (i < src.length) {
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
      if (c === '`') break
      str += c
      i++
    }
    const startLine = src.slice(0, m.index).split('\n').length
    blocks.push({ sql: str, startLine })
  }
  return blocks
}

// 단순 컬럼 패턴: identifier 또는 alias.identifier
const SIMPLE_COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/

// SELECT ... FROM 사이의 alias 정의 추출
function extractAliases(sql) {
  // SELECT ~ FROM (대소문자 무시, 멀티라인)
  const selectMatch = /\bSELECT\b([\s\S]*?)\bFROM\b/i.exec(sql)
  if (!selectMatch) return []
  const selectBody = selectMatch[1]

  const aliases = []
  // 콤마로 분리 — 단, 함수 호출 안 콤마 무시 (괄호 depth)
  let depth = 0
  let buf = ''
  const items = []
  for (let i = 0; i < selectBody.length; i++) {
    const c = selectBody[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) { items.push(buf.trim()); buf = ''; continue }
    buf += c
  }
  if (buf.trim()) items.push(buf.trim())

  for (const item of items) {
    // <expr> AS <alias> | <expr> <alias>
    const m = /^([\s\S]+?)\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i.exec(item)
    if (!m) continue
    let expr = m[1].trim()
    const alias = m[2]
    // alias 자체가 SQL 키워드면 skip (잘못 파싱)
    if (/^(SELECT|FROM|WHERE|AS|JOIN|ON|AND|OR)$/i.test(alias)) continue
    aliases.push({ expr, alias, isSimple: SIMPLE_COLUMN_RE.test(expr) })
  }
  return aliases
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
    const blocks = extractTemplateBlocks(src)

    for (const { sql, startLine } of blocks) {
      // GROUP BY 절 추출
      const gbMatch = /\bGROUP\s+BY\s+([\s\S]+?)(?:\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i.exec(sql)
      if (!gbMatch) continue
      const gbBody = gbMatch[1].trim()

      // GROUP BY 항목 (콤마 분리)
      const gbItems = gbBody.split(',').map(s => s.trim()).filter(Boolean)

      const aliases = extractAliases(sql)

      // 화이트리스트 라인 수집
      const allowLines = new Set()
      sql.split('\n').forEach((line, idx) => {
        if (/sql-group-by-allow/i.test(line)) {
          for (let i = 1; i <= 3; i++) allowLines.add(idx + 1 + i)
        }
      })

      const gbStartIdx = gbMatch.index
      const lineInBlock = sql.slice(0, gbStartIdx).split('\n').length

      for (const item of gbItems) {
        // GROUP BY 항목이 단순 identifier 인지
        if (!SIMPLE_COLUMN_RE.test(item)) continue
        // SELECT alias 와 동일한 단순 identifier 인지
        const matched = aliases.find(a => a.alias.toLowerCase() === item.toLowerCase())
        if (!matched) continue
        // alias 의 expression 이 단순 컬럼이면 OK
        if (matched.isSimple) continue

        if (allowLines.has(lineInBlock)) continue

        violations.push({
          file: rel,
          line: startLine + lineInBlock - 1,
          alias: item,
          expr: matched.expr.slice(0, 60),
        })
      }
    }
  }

  return { fileCount, violations }
}

if (require.main === module) {
  const r = lint()
  console.log(`sql-group-by-lint: ${r.fileCount} files, ${r.violations.length} violations`)
  for (const v of r.violations) {
    console.error(`  ❌ ${v.file}:${v.line} GROUP BY ${v.alias} — alias 의 expression: ${v.expr}`)
    console.error(`     → GROUP BY 에 expression 그대로 명시 필요 (only_full_group_by)`)
  }
  process.exit(r.violations.length > 0 ? 1 : 0)
}

module.exports = { lint }
