#!/usr/bin/env node
/**
 * sql-fn-lint.js — $queryRaw / $executeRaw 안의 회색 SQL 함수 사용 감지.
 *
 * 회색 함수 = MySQL 8.0+ 만 지원되는 함수 (5.7 미지원).
 *   2026-05-01 사건: REGEXP_REPLACE 사용 → MySQL 5.7 호환 미확인 → 500 에러.
 *
 * 정책:
 *   - 회색 함수 사용 시 violation (FAIL)
 *   - 사용해야 할 정당한 사유가 있으면 코드에 `// sql-fn-lint-allow: REGEXP_REPLACE` 주석 추가
 *
 * (CLAUDE.md § 0-1 규칙 13 자동화 안전장치)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(ROOT, 'app')
const LIB_DIR = path.join(ROOT, 'lib')

// 회색 함수 — MySQL 8.0+ 전용 (5.7 미지원)
const GREY_FUNCTIONS = [
  'REGEXP_REPLACE',
  'REGEXP_LIKE',
  'REGEXP_INSTR',
  'REGEXP_SUBSTR',
  'JSON_TABLE',
  'ROW_NUMBER',
  'RANK',
  'DENSE_RANK',
  'LAG',
  'LEAD',
  'FIRST_VALUE',
  'LAST_VALUE',
  'NTILE',
  'CUME_DIST',
  'PERCENT_RANK',
]

function extractSqlBlocks(src) {
  const out = []
  // Tagged template 호출
  const tagRe = /\$(?:query|execute)Raw(?:<[^>]*>)?\s*`([\s\S]*?)`/g
  let m
  while ((m = tagRe.exec(src)) !== null) {
    out.push({ sql: m[1], offset: m.index })
  }
  // Unsafe 호출
  const unsafeRe = /\$(?:query|execute)RawUnsafe\s*(?:<[^>]*>)?\s*\(\s*([`'"])([\s\S]*?)\1/g
  while ((m = unsafeRe.exec(src)) !== null) {
    out.push({ sql: m[2], offset: m.index })
  }
  return out
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
  const violations = []
  const files = [...walkTs(APP_DIR), ...walkTs(LIB_DIR)]
  const fnRe = new RegExp(`\\b(${GREY_FUNCTIONS.join('|')})\\s*\\(`, 'gi')

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8')
    const blocks = extractSqlBlocks(src)
    for (const { sql, offset } of blocks) {
      let m
      while ((m = fnRe.exec(sql)) !== null) {
        const fn = m[1].toUpperCase()
        // 라인 번호 (호출 시작점 기준)
        const before = src.slice(0, offset)
        const lineNo = before.split('\n').length

        // 같은 줄에 allow 주석이 있으면 skip
        const allLines = src.split('\n')
        const window = allLines.slice(Math.max(0, lineNo - 3), lineNo + 3).join('\n')
        if (new RegExp(`sql-fn-lint-allow:\\s*${fn}`, 'i').test(window)) continue

        violations.push({
          file: path.relative(ROOT, file),
          line: lineNo,
          fn,
          context: sql.slice(Math.max(0, m.index - 30), m.index + 60).replace(/\s+/g, ' ').trim(),
        })
      }
      fnRe.lastIndex = 0
    }
  }
  return { violations, fileCount: files.length }
}

if (require.main === module) {
  const { violations, fileCount } = lint()
  console.log(`[sql-fn-lint] ${fileCount} files scanned`)
  if (violations.length === 0) {
    console.log('[sql-fn-lint] ✅ no grey-function usage')
    process.exit(0)
  }
  console.error(`[sql-fn-lint] ❌ ${violations.length} grey-function usage(s):`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.fn}`)
    console.error(`     ...${v.context}...`)
    console.error(`     → 회피 또는 코드에 주석 추가: // sql-fn-lint-allow: ${v.fn}`)
  }
  process.exit(1)
}

module.exports = { lint, GREY_FUNCTIONS }
