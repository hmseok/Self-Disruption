#!/usr/bin/env node
/**
 * amount-sign-lint.js — 금액 표시에 `+` 부호 사용 자동 차단.
 *
 * CLAUDE.md 규칙 18 절대 규칙:
 *   🔴 + 부호: 절대 사용 금지
 *   🔴 - 부호: 카드 취소만 사용
 *   🔴 색상: type/transaction_type 으로 의미 표현
 *
 * 위반 사례 (2026-05-02 누적 3차):
 *   - 카드 거래 amount → +/- 표시
 *   - 통장 입금/출금 컬럼 → +/- 표시
 *   - 분류 검수 행 → +/- 표시 (3차 fix)
 *
 * 같은 부류 실수 N회 → 자동화 강제 차단 (규칙 15).
 *
 * 검출 패턴:
 *   "income ? '+' :"  같은 형태의 + 부호 표시 패턴
 *   `+${nf(amount)}` 같은 template 안 + 부호
 *
 * 정당한 사유 (예: 수학 연산):
 *   // amount-sign-lint-allow: <reason>  주석 추가
 *
 * (CLAUDE.md § 0-1 규칙 18 자동화 안전장치)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(ROOT, 'app')

// 위반 패턴 — JSX 안 amount 표시 부호
const PATTERNS = [
  // "income ? '+' : '-'" 같은 표시 ternary
  { re: /['"`]\+['"`]\s*:\s*['"`]-['"`]/, label: "income/expense 부호 ternary (+/-)" },
  // `+${...}` template 안 + 부호 + 숫자
  { re: /`\+\$\{[^}]*(?:amount|nf\()/, label: "template literal '+\\${amount...}'" },
  // 단순 ` +금액 ` 같은 JSX 텍스트 (드뭄)
  // 실제로 매우 보수적으로만 — 위 두 패턴이 핵심
]

// 화이트리스트 — 의미 없는 false positive 회피
const ALLOW_KEYWORDS = ['amount-sign-lint-allow']

function walkTsx(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git', 'api'].includes(entry.name)) continue
      walkTsx(full, out)
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function lint() {
  const violations = []
  const files = walkTsx(APP_DIR)
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8')
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // 주석 라인 skip
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
      // 화이트리스트 (3줄 window)
      const window = lines.slice(Math.max(0, i - 2), i + 2).join('\n')
      if (ALLOW_KEYWORDS.some(k => window.includes(k))) continue

      for (const { re, label } of PATTERNS) {
        if (re.test(line)) {
          violations.push({
            file: path.relative(ROOT, file),
            line: i + 1,
            label,
            preview: line.trim().slice(0, 100),
          })
          break
        }
      }
    }
  }
  return { violations, fileCount: files.length }
}

if (require.main === module) {
  const { violations, fileCount } = lint()
  console.log(`[amount-sign-lint] ${fileCount} files scanned`)
  if (violations.length === 0) {
    console.log('[amount-sign-lint] ✅ no + sign violations')
    process.exit(0)
  }
  console.error(`[amount-sign-lint] ❌ ${violations.length} violation(s):`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.label}`)
    console.error(`     ${v.preview}`)
    console.error(`     → CLAUDE.md 규칙 18: + 부호 절대 사용 금지`)
    console.error(`     → 정당한 사유 시 주석 추가: // amount-sign-lint-allow: <reason>`)
  }
  process.exit(1)
}

module.exports = { lint }
