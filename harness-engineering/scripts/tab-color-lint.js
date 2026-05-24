#!/usr/bin/env node
/**
 * tab-color-lint.js — 활성 탭 네이비 색상 차단 (PR-DESIGN-6, 2026-05-24)
 *
 * 사용자 명령: 「탭 선택 색상 규정 — 하네스 자동 차단까지」
 *
 * 규칙 (UI-DESIGN-STANDARD § 4.1): 활성(선택) 탭 = 브랜드 블루 #3b6eb5.
 *   구 표준이던 네이비 #0f2440 을 활성 탭/칩/토글의 ternary 값으로 쓰면 위반.
 *   (`color: '#0f2440'` 같은 헤더 텍스트색 — ternary 아님 — 은 대상 아님)
 *
 * harness-lint [3.10] 으로 통합 — pre-commit 자동 차단.
 * 실행: node harness-engineering/scripts/tab-color-lint.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const APP = path.join(ROOT, 'app')

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '_meta-archive') continue
      yield* walk(full)
    } else if (e.name.endsWith('.tsx')) {
      yield full
    }
  }
}

function lint() {
  const violations = []
  for (const file of walk(APP)) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n')
    const rel = path.relative(ROOT, file)
    for (let i = 0; i < lines.length; i++) {
      // ternary true-branch 의 네이비 — 활성 탭/칩/토글 색상
      if (/\?\s*'#0f2440'/.test(lines[i])) {
        violations.push({ file: rel, line: i + 1, snippet: lines[i].trim().slice(0, 100) })
      }
    }
  }
  return violations
}

function main() {
  const violations = lint()
  console.log(`  활성 탭 네이비(#0f2440) 위반 ${violations.length}건`)
  for (const v of violations.slice(0, 10)) {
    console.log(`    ❌ ${v.file}:${v.line} — 활성 탭은 #3b6eb5 (UI-DESIGN-STANDARD § 4.1)`)
    console.log(`       ${v.snippet}`)
  }
  if (violations.length > 10) console.log(`    ... 외 ${violations.length - 10}건`)
  if (violations.length > 0) process.exitCode = 1
  return { total: violations.length, newCount: violations.length, violations }
}

if (require.main === module) main()

module.exports = { main, lint }
