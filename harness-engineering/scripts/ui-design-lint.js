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

// 페이지 최상위 래퍼 중앙정렬 (maxWidth + margin auto) 검출 — 전체 너비여야 (2026-05-24)
// 모든 `return (` 직후 첫 <div 의 style 을 검사 (sub-component / early-return 대응).
// maxWidth ≥ 600 + margin auto 조합만 — 좁은 모달(≤560) 은 대체로 제외됨.
function topWrapperCentered(content) {
  const re = /return\s*\(/g
  let mm
  while ((mm = re.exec(content)) !== null) {
    const after = content.slice(mm.index, mm.index + 600)
    const dm = after.match(/<div\b[^>]*style=\{\{([^}]*)\}\}/)
    if (!dm) continue
    const styleBody = dm[1]
    const wm = styleBody.match(/\bmaxWidth:\s*['"]?(\d{2,4})\b/)
    if (wm && parseInt(wm[1], 10) >= 600
      && /\bmargin:\s*['"`][^'"`]*\bauto\b/.test(styleBody)) {
      return true
    }
  }
  return false
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
    hasNeuDataTable: /NeuDataTable/.test(content),
    hasStatCardPattern: /flex.*minWidth.*120|gridTemplateColumns.*minmax\(1[0-9][0-9]/.test(content),
    hasSearchInput: /<input[^>]*placeholder=["'][^"']*검색/.test(content)
                  || /onChange={[^}]*setSearch/.test(content),
    hasEmployeeOfRideHeader: /Employee of Ride Inc/.test(content),
    hasLargeHeader: /fontSize:\s*(2[4-9]|3[0-9])/.test(content),
    // PR-DESIGN-3: 자체 헤더 박스 만드는 패턴
    hasCustomBigTitle: /<h1[^>]*style[^>]*fontSize:\s*(2[4-9]|3[0-9])/.test(content)
                     || /<h2[^>]*style[^>]*fontSize:\s*(3[0-9]|4[0-9])/.test(content),
    hasCustomBreadcrumbBox: /Employee of Ride Inc[^<]*›|차량관리[^<]*›|재무\/경영[^<]*›/.test(content),
    // 2026-05-24 — 페이지 최상위 래퍼 중앙정렬 (전체 너비여야)
    hasCenteredWrapper: topWrapperCentered(content),
    // 2026-05-24 — 활성 탭 네이비(#0f2440) — 표준은 브랜드 블루 #3b6eb5
    // (#1e293b 등은 데이터 셀 텍스트색으로도 흔해 navy 전용으로 한정 — 오탐 회피)
    hasOffStandardTabColor: /\?\s*'#0f2440'/.test(content),
    // 2026-05-26 — 자체 탭 strip — 공용 NeuFilterTabs 사용 의무
    //   setActive*Tab / setTop*Tab / setSub*Tab / setTabKey 등 setter 검출.
    //   NeuFilterTabs 가 이미 import 되어 있으면 OK (sub-tab 혼용 가능).
    hasSelfTabSetter: /\bset[A-Z]\w*Tab\w*\s*\(/.test(content),
    hasNeuFilterTabs: /NeuFilterTabs/.test(content),
    // 2026-05-26 — alert / confirm — 글래스 패널 사용 의무 (Rule 20)
    //   기계적 message 박스 금지. 결과 메시지는 React state + 글래스.
    //   exec context 안 alert (window.alert / 단순 alert) 검출.
    //   prompt() 도 같이 — confirm 은 일부 case 허용 (data-loss 위험 시) → 정보성.
    hasAlertCall: /(?:^|[^.\w])alert\s*\(/m.test(content),
    hasConfirmCall: /(?:^|[^.\w])confirm\s*\(/m.test(content),
    // 2026-05-26 — 자체 진행률 — AIProgressFloater 사용 의무 (Rule 16)
    //   batch loop / AI 호출 / 1초+ 작업 = useAIProgress 호출.
    //   setProgress / setBarWidth 같은 자체 progress state setter 검출.
    hasSelfProgressSetter: /\bset(?:Progress|BarProgress|LoadingProgress|UploadProgress)\s*\(/.test(content),
    hasAIProgress: /useAIProgress|AIProgressFloater/.test(content),
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
    warnings.push({ file: rel, issue: '페이지 제목 크기 24px+ — 기준 20px (대출 관리)' })
  }

  // 5) PR-DESIGN-3: 자체 헤더 박스 (PageTitle 가 자동 처리하므로 불필요)
  if (checks.hasCustomBigTitle) {
    warnings.push({
      file: rel,
      issue: '자체 큰 제목 (h1/h2 24px+) — PageTitle 컴포넌트가 자동 헤더 (path/그룹/이름) 표시. ClientLayout 에 path 등록만 하면 됨',
    })
  }

  // 6) PR-DESIGN-3: 자체 breadcrumb (PageTitle 의 자동 breadcrumb 와 중복)
  if (checks.hasCustomBreadcrumbBox) {
    warnings.push({
      file: rel,
      issue: '자체 breadcrumb (그룹 › 페이지명) — PageTitle 가 자동으로 표시. 자체 추가 시 중복',
    })
  }

  // 7) 2026-05-24: 페이지 최상위 래퍼 중앙정렬 — 콘텐츠 프레임 전체 너비로 펴야
  if (checks.hasCenteredWrapper) {
    warnings.push({
      file: rel,
      issue: '페이지 최상위 래퍼 중앙정렬 (maxWidth + margin:auto) — 전체 너비로 (UI-DESIGN-STANDARD § 1.6). 모달/카드 내부는 제외',
    })
  }

  // 8) 2026-05-24: 활성 탭 비표준 색상 — 표준은 브랜드 블루 #3b6eb5
  if (checks.hasOffStandardTabColor) {
    warnings.push({
      file: rel,
      issue: '활성 탭에 네이비(#0f2440) — 표준 브랜드 블루 #3b6eb5 사용 (UI-DESIGN-STANDARD § 4.1)',
    })
  }

  // 9) 2026-05-26: 자체 탭 strip — 공용 NeuFilterTabs 사용 의무 (UI-DESIGN-STANDARD § 4)
  //   setActiveTab/setTopTab/setSubTab/setTabKey 같은 setter 가 있는데
  //   NeuFilterTabs 미 import → 자체 탭 strip 으로 추정.
  if (checks.hasSelfTabSetter && !checks.hasNeuFilterTabs) {
    warnings.push({
      file: rel,
      issue: '자체 탭 strip 추정 — 공용 NeuFilterTabs 사용 권장 (UI-DESIGN-STANDARD § 4 — 같은 기능 같은 UI)',
    })
  }

  // 10) 2026-05-26: alert() — 글래스 패널 사용 의무 (CLAUDE.md Rule 20)
  //   기계적 message 박스 ERP 수준 떨어뜨림. 결과는 React state + Glass L3/L4.
  if (checks.hasAlertCall) {
    warnings.push({
      file: rel,
      issue: 'alert() 사용 — Rule 20: 결과 메시지는 글래스 패널 (React state + GLASS) 로. 기계적 alert 금지',
    })
  }
  // 11) 2026-05-26: confirm() — 단순 confirm 은 dialog component 로 대체 권장
  //   data-loss 위험 confirm 은 허용 (정보성 — 강제 X)
  if (checks.hasConfirmCall) {
    warnings.push({
      file: rel,
      issue: 'confirm() 사용 — Rule 20: dialog component 권장 (data-loss 위험 case 만 예외 허용)',
    })
  }

  // 12) 2026-05-26: 자체 진행률 — AIProgressFloater 사용 의무 (CLAUDE.md Rule 16)
  //   setProgress / setBarProgress / setLoadingProgress / setUploadProgress 같은
  //   자체 progress state 가 있는데 useAIProgress 미 import → 자체 진행률.
  if (checks.hasSelfProgressSetter && !checks.hasAIProgress) {
    warnings.push({
      file: rel,
      issue: '자체 진행률 state — Rule 16: useAIProgress() / AIProgressFloater 사용 권장 (플로팅 진행률 통일)',
    })
  }
}

console.log('═══ 결과 ═══')
console.log(`  검사 페이지: ${pageFiles.length}`)
console.log(`  경고: ${warnings.length}`)
console.log(`  위반: ${violations.length}`)

if (warnings.length > 0) {
  console.log('\n▸ 경고 (정보성):')
  // 2026-05-26 — DETAIL: 환경변수 / 인자로 truncation 해제 (전수조사 용도)
  const DETAIL = process.env.UI_DESIGN_LINT_DETAIL === '1' || process.argv.includes('--detail')
  const MAX = DETAIL ? warnings.length : 60
  for (const w of warnings.slice(0, MAX)) {
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
