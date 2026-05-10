#!/usr/bin/env node
/**
 * ui-design-lint.js — 페이지 디자인 일관성 검사 (PR-DESIGN, 2026-05-10)
 *
 * 사용자 명령:
 *   「정산 관리가 우리의 기준입니다. 다른 세션들이 하네스를 지키지만
 *    다른 방향으로 나오고 있어서 조금 강화가 필요해보입니다.」
 *
 * 기준: app/finance/settlement (정산 관리 페이지)
 *
 * 검사 항목:
 *   1. page.tsx 파일에서 stat 카드 직접 구현 여부 (DcStatStrip 미사용 → 경고)
 *   2. 검색바 + 필터 자체 구현 (DcToolbar 미사용 → 경고)
 *   3. 「Employee of Ride Inc.」 같은 회사명 breadcrumb (그룹명 X)
 *   4. 페이지 헤더가 박스로 강조 (제목 영역 단순해야)
 *
 * 사용:
 *   npm run lint:ui-design
 *   node harness-engineering/scripts/ui-design-lint.js
 *
 * 화이트리스트 (기준 페이지 자체):
 *   - app/finance/settlement/* — 본 페이지가 기준
 *
 * 회귀 케이스: TBD
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(ROOT, 'app')

function listPageFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f)
    const stat = fs.statSync(fp)
    if (stat.isDirectory()) {
      if (f.startsWith('_') || f.startsWith('.') || f === 'node_modules') continue
      listPageFiles(fp, files)
    } else if (f === 'page.tsx') {
      files.push(fp)
    }
  }
  return files
}

const violations = []
const warnings = []

const pageFiles = listPageFiles(APP_DIR)
console.log(`ui-design-lint: ${pageFiles.length} page.tsx files`)
console.log('')

for (const fp of pageFiles) {
  const rel = path.relative(ROOT, fp)
  const content = fs.readFileSync(fp, 'utf-8')

  // 화이트리스트
  if (rel.startsWith('app/finance/settlement/')) continue
  if (rel.startsWith('app/api/')) continue
  // 페이지가 단순 wrapper (export 만 있고 컴포넌트 import) — 별도 컴포넌트 확인 필요
  if (content.length < 500) continue

  const checks = {
    hasDcStatStrip: /DcStatStrip/.test(content),
    hasDcToolbar: /DcToolbar/.test(content),
    hasStatCardPattern: /flex.*minWidth.*120|gridTemplateColumns.*minmax\(1[0-9][0-9]/.test(content),
    hasSearchInput: /<input[^>]*placeholder=["'][^"']*검색/.test(content)
                  || /onChange={[^}]*setSearch/.test(content),
    hasEmployeeOfRideHeader: /Employee of Ride Inc/.test(content),
    hasLargeHeader: /fontSize:\s*(2[4-9]|3[0-9])/.test(content),
  }

  // 1) stat strip 자체 구현 (5+ 카드 패턴 있는데 DcStatStrip 미사용)
  if (checks.hasStatCardPattern && !checks.hasDcStatStrip) {
    warnings.push({ file: rel, issue: 'stat 카드 자체 구현 — DcStatStrip 사용 권장' })
  }

  // 2) 검색바 자체 구현 (DcToolbar 미사용)
  if (checks.hasSearchInput && !checks.hasDcToolbar) {
    warnings.push({ file: rel, issue: '검색바 자체 구현 — DcToolbar 사용 권장' })
  }

  // 3) breadcrumb 「Employee of Ride Inc.」 — 정산 관리는 「영업/경영」 사용
  if (checks.hasEmployeeOfRideHeader) {
    warnings.push({
      file: rel,
      issue: 'breadcrumb 회사명 사용 — 그룹명 사용 권장 (예: 영업/경영, 운영, 차량 등)',
    })
  }

  // 4) 큰 페이지 제목 (24px+) — 기준은 20px
  if (checks.hasLargeHeader) {
    warnings.push({ file: rel, issue: '페이지 제목 크기 24px+ — 기준 20px (정산 관리)' })
  }
}

console.log('═══ 결과 ═══')
console.log(`  검사 페이지: ${pageFiles.length}`)
console.log(`  경고: ${warnings.length}`)
console.log(`  위반: ${violations.length}`)

if (warnings.length > 0) {
  console.log('\n▸ 경고 (정보성):')
  for (const w of warnings.slice(0, 30)) {
    console.warn(`  ⚠ ${w.file}`)
    console.warn(`     ${w.issue}`)
  }
  if (warnings.length > 30) console.warn(`  ... ${warnings.length - 30}건 더`)
}

if (violations.length > 0) {
  console.log('\n▸ 위반 (commit 차단):')
  for (const v of violations) {
    console.error(`  ❌ ${v.file}`)
    console.error(`     ${v.issue}`)
  }
}

console.log('')
console.log('  💡 기준 페이지: app/finance/settlement/')
console.log('  📖 가이드: _docs/UI-DESIGN-STANDARD.md')

// warnings 만 있으면 통과 (정보성), violations 가 있으면 차단
if (violations.length > 0 && process.env.UI_DESIGN_LINT_REPORT_ONLY !== '1') {
  console.error('\n❌ ui-design-lint 위반 — commit 차단')
  console.error('   강제 우회 (권장 X): UI_DESIGN_LINT_REPORT_ONLY=1 npm run lint:ui-design')
  process.exit(1)
}
process.exit(0)
