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
 * PR-COORD-7 (2026-05-22) — baseline 키를 line 번호 비의존(코드 내용 해시) 으로 개선
 *   배경: 큰 파일(ClientLayout.tsx 등) 상단에 줄 1개만 추가해도 그 아래 모든
 *         기존 위반의 line 번호가 밀려 baseline 과 불일치 → 전부 "새 위반" 오검출
 *         → 매번 `--baseline-update` 필요한 마찰 (2026-05 중 2회 발생).
 *   개선: baseline 키 = `file:label:contentHash:occurrence`
 *         · contentHash — 위반 라인 내용의 정규화 해시 (공백 무시). line 번호 무관.
 *         · occurrence  — 한 파일 안 동일 (label+내용) 위반의 출현 순번 (0,1,2…).
 *                         완전히 동일한 줄이 여러 개일 때 구분용.
 *   효과: 줄 추가/삭제로 line 번호가 밀려도 기존 위반은 그대로 known 처리.
 *         위반 라인 자체를 수정하면 해시가 바뀌어 재검출 → 의도된 동작 (재검토 유도).
 *
 * 검사 대상: app/**\/*.tsx (page / 컴포넌트)
 * 화이트리스트:
 *   · app/utils/ui-tokens.ts (토큰 정의 자체)
 *   · 주석 안 패턴 (// rgba(...))
 *   · ui-tokens 외 일반적 다른 라이브러리 인자 (예: SVG fill)
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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

// ── PR-COORD-7: line 번호 비의존 키 ──
// 위반 라인 내용을 정규화(공백 1칸으로 축약 + trim)한 뒤 sha1 앞 12자.
// 들여쓰기/공백만 바뀐 경우엔 같은 해시 → baseline 유지.
function normalizeContent(line) {
  return line.replace(/\s+/g, ' ').trim()
}
function contentHash(line) {
  return crypto.createHash('sha1').update(normalizeContent(line)).digest('hex').slice(0, 12)
}

// 한 파일 안 (label + hash) 동일 위반에 출현 순번(occ) 부여 → key 확정.
// violations 는 (file, line) 오름차순으로 들어온다고 가정 (walk + line 스캔 순서).
function assignKeys(violations) {
  const counter = new Map()
  for (const v of violations) {
    const base = `${v.file}:${v.label}:${v.hash}`
    const occ = counter.get(base) || 0
    counter.set(base, occ + 1)
    v.occ = occ
    v.key = `${base}:${occ}`
  }
  return violations
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
    return new Set((data.violations || []).map(v => {
      // 신 포맷 (PR-COORD-7): file:label:hash:occ
      if (v.hash != null) return `${v.file}:${v.label}:${v.hash}:${v.occ || 0}`
      // 구 포맷 폴백: hash 가 없으면 매칭 불가 키 — 재 baseline-update 유도.
      // (안전 방향: under-detection 이 아니라 over-detection 으로 떨어짐)
      return `__legacy__:${v.file}:${v.line}:${v.label}`
    }))
  } catch { return new Set() }
}

function saveBaseline(violations) {
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true })
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    violations: violations.map(v => ({
      file: v.file,
      label: v.label,
      hash: v.hash,
      occ: v.occ,
      line: v.line,        // 사람이 보기 위한 참고용 — 키에는 미포함
      snippet: v.snippet,
    })),
    generatedAt: new Date().toISOString(),
    note: 'UI 토큰 hardcode (inline rgba). baseline 키 = file:label:contentHash:occurrence '
      + '(line 번호 비의존 — PR-COORD-7 2026-05-22). 기존 위반 동결, 새 위반만 차단.',
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
            hash: contentHash(line),
            snippet: line.trim().substring(0, 120),
          })
        }
      }
    }
  }
  assignKeys(violations)
  return { filesScanned, violations }
}

function main() {
  const { filesScanned, violations } = scan()
  const baseline = loadBaseline()
  const newViolations = violations.filter(v => !baseline.has(v.key))

  if (process.argv.includes('--baseline-update')) {
    saveBaseline(violations)
    console.log(`ui-token-lint baseline 업데이트: ${violations.length} 위반 동결 (키=내용 해시 기반)`)
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
