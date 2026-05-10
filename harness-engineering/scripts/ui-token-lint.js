#!/usr/bin/env node
/**
 * ui-token-lint.js — Soft Ice Glass 토큰 사용 강제
 *
 * §10 디자인 시스템 (CLAUDE.md) 준수 검증:
 *   · 컴포넌트의 inline style 안 rgba(255,255,255, ...) 패턴 →  GLASS.L1~L5 사용 권장
 *   · brand 색상 hardcode (rgba(59,110,181, ...)) → COLORS.primary 등 토큰 사용 권장
 *
 * 실행: node harness-engineering/scripts/ui-token-lint.js
 *
 * PR-HARNESS-1 (2026-05-09)
 * 트리거: PR-6.13 NavTabs inline rgba 우회 사고 (regression-cases/2026-05-09-pr613-ui-token-bypass.md)
 *
 * 검사 대상: app/**\/*.tsx (page / 컴포넌트)
 * 화이트리스트:
 *   · app/utils/ui-tokens.ts (토큰 정의 자체)
 *   · 주석 안 패턴 (// rgba(...))
 *   · ui-tokens 외 일반적 다른 라이브러리 인자 (예: SVG fill)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(ROOT, 'app')
const BASELINE_FILE = path.join(ROOT, 'harness-engineering/knowledge/ui-token-lint.baseline.json')

// 차단 패턴 (inline style 안 brand 색상 / glass 패턴 hardcode)
const PATTERNS = [
  {
    re: /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[0-9]+\s*\)/g,
    label: 'glass-bg-hardcode',
    hint: 'GLASS.L1~L5 토큰 사용 권장',
  },
  {
    re: /rgba\(\s*59\s*,\s*110\s*,\s*181\s*,\s*0\.[0-9]+\s*\)/g,
    label: 'primary-hardcode',
    hint: 'COLORS.primary / COLORS.bgBlue 토큰 사용 권장',
  },
]

// 화이트리스트 파일
const WHITELIST_FILES = new Set([
  'app/utils/ui-tokens.ts',
])

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '_docs' || entry.name === '_meta-archive') continue
      yield* walk(full)
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      yield full
    }
  }
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
    return new Set((data.violations || []).map(v => `${v.file}:${v.line}:${v.label}`))
  } catch { return new Set() }
}

function saveBaseline(violations) {
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true })
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    violations: violations.map(v => ({ file: v.file, line: v.line, label: v.label, snippet: v.snippet })),
    generatedAt: new Date().toISOString(),
    note: 'UI 토큰 hardcode (inline rgba). 기존 위반 동결, 새 위반만 차단.',
  }, null, 2))
}

function isLineComment(line) {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*')
}

function scan() {
  const violations = []
  let filesScanned = 0
  for (const file of walk(APP_DIR)) {
    const rel = path.relative(ROOT, file)
    if (WHITELIST_FILES.has(rel)) continue
    filesScanned++
    const src = fs.readFileSync(file, 'utf-8')
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (isLineComment(line)) continue
      for (const p of PATTERNS) {
        p.re.lastIndex = 0
        const m = p.re.exec(line)
        if (m) {
          violations.push({
            file: rel,
            line: i + 1,
            label: p.label,
            hint: p.hint,
            snippet: line.trim().substring(0, 120),
          })
        }
      }
    }
  }
  return { filesScanned, violations }
}

function main() {
  const { filesScanned, violations } = scan()
  const baseline = loadBaseline()
  const newViolations = violations.filter(v => !baseline.has(`${v.file}:${v.line}:${v.label}`))

  if (process.argv.includes('--baseline-update')) {
    saveBaseline(violations)
    console.log(`ui-token-lint baseline 업데이트: ${violations.length} 위반 동결`)
    return
  }

  console.log(`  ${filesScanned} files, total=${violations.length}, new=${newViolations.length}, known=${violations.length - newViolations.length}`)
  if (newViolations.length > 0) {
    console.log('  새 UI 토큰 hardcode:')
    for (const v of newViolations.slice(0, 10)) {
      console.log(`    ${v.file}:${v.line} [${v.label}] — ${v.hint}`)
      console.log(`      ${v.snippet}`)
    }
    if (newViolations.length > 10) {
      console.log(`    ... 외 ${newViolations.length - 10}건`)
    }
    process.exitCode = 1
  }

  return { total: violations.length, newCount: newViolations.length, knownCount: violations.length - newViolations.length, newViolations }
}

if (require.main === module) {
  main()
}

module.exports = { main, scan }
