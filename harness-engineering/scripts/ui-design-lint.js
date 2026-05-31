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
    // 2026-05-27: 윈도우 확대 (600 → 1200) — 외부 wrapper (page-bg 등) 다음의 centered wrapper 도 캐치
    const after = content.slice(mm.index, mm.index + 1200)
    // (1) 인라인 style — <div style={{ maxWidth: 1800, margin: 'auto' }}> — 모든 div 검사
    const styleMatches = after.matchAll(/<div\b[^>]*style=\{\{([^}]*)\}\}/g)
    for (const dm of styleMatches) {
      const styleBody = dm[1]
      const wm = styleBody.match(/\bmaxWidth:\s*['"]?(\d{2,4})\b/)
      if (wm && parseInt(wm[1], 10) >= 600
        && /\bmargin:\s*['"`][^'"`]*\bauto\b/.test(styleBody)) {
        return true
      }
    }
    // (2) Tailwind class — className="max-w-[1800px] mx-auto" — 모든 div 검사
    const classMatches = after.matchAll(/<div\b[^>]*className=["'`]([^"'`]+)["'`]/g)
    for (const cm of classMatches) {
      const cls = cm[1]
      // 2026-05-27: `\b` 가 `]` 뒤 word boundary 안 만들어 max-w-[1800px] 매칭 fail.
      //   bracket 패턴은 \b 빼고, 명명 패턴(7xl 등)만 \b 유지.
      const hasMaxW = /max-w-\[\d{3,4}(?:px|rem|em)?\]|\bmax-w-(?:screen-)?(?:xl|2xl|3xl|4xl|5xl|6xl|7xl)\b/.test(cls)
      const hasMxAuto = /\bmx-auto\b/.test(cls)
      if (hasMaxW && hasMxAuto) return true
    }
  }
  return false
}

const violations = []
const warnings = []

// 2026-05-27 사용자 결정 — lint 등급 승격 + baseline:
//   UI_DESIGN_LINT_STAGED env (comma-sep paths) 가 set 되면 그 파일만 scan.
//   baseline (known issues) 에 등록 안 된 신규 violation 만 차단.
//   --baseline-update 로 baseline 재생성.
const STAGED_LIST_RAW = process.env.UI_DESIGN_LINT_STAGED || ''
const STAGED_SET = new Set(STAGED_LIST_RAW.split(/[,\n]/).map(s => s.trim()).filter(Boolean))
const STAGED_MODE = STAGED_SET.size > 0
const BASELINE_UPDATE = process.argv.includes('--baseline-update')
const BASELINE_FILE = path.join(ROOT, 'harness-engineering/knowledge/ui-design-lint.baseline.json')

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
    return new Set((data.entries || []).map(e => `${e.file}|${e.issue}`))
  } catch { return new Set() }
}

function saveBaseline(allWarnings) {
  const data = {
    version: 1,
    frozen_at: new Date().toISOString().slice(0, 10),
    note: 'ui-design-lint baseline — 동결된 known issue. STAGED 모드에서 이 셋 외 신규만 차단.',
    entries: allWarnings.map(w => ({ file: w.file, issue: w.issue })),
  }
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2))
  console.log(`✅ baseline 갱신 — ${allWarnings.length} entries → ${path.relative(ROOT, BASELINE_FILE)}`)
}

const BASELINE = loadBaseline()

let pageFiles = listPageFiles(APP_DIR)
if (STAGED_MODE) {
  // app/ 안 page.tsx (tsx) 만 검사 대상 — staged 와 교차
  pageFiles = pageFiles.filter(fp => {
    const rel = path.relative(ROOT, fp)
    return STAGED_SET.has(rel)
  })
  console.log(`ui-design-lint: STAGED 모드 — ${pageFiles.length} staged page (전체 ${listPageFiles(APP_DIR).length}개 중)`)
} else {
  console.log(`ui-design-lint: ${pageFiles.length} page.tsx files`)
}
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
    //   setTab / setActiveTab / setTopTab / setSubTab / setTabKey 등 setter 검출.
    //   2026-05-28 fix: setTab (짧은 setter) 도 잡도록 정규식 보정.
    //   NeuFilterTabs 가 이미 import 되어 있으면 OK (sub-tab 혼용 가능).
    hasSelfTabSetter: /\bset\w*Tab\w*\s*\(/.test(content),
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

  // 13) 2026-05-26: 페이지 아나토미 불완전 (UI-DESIGN-STANDARD § 0-A)
  //   리스트/대시보드 페이지는 DcStatStrip + DcToolbar + NeuDataTable 의무.
  //   부분만 있으면 아나토미가 불완전 → 정보성 경고.
  if (checks.hasDcStatStrip && !checks.hasDcToolbar) {
    warnings.push({
      file: rel,
      issue: '아나토미 불완전: DcStatStrip ✓ / DcToolbar ✗ — 5층 표준 (§ 0-A) 누락. 검색·필터 영역 누락',
    })
  }
  if (checks.hasDcToolbar && !checks.hasNeuDataTable) {
    warnings.push({
      file: rel,
      issue: '아나토미 불완전: DcToolbar ✓ / NeuDataTable ✗ — 5층 표준 (§ 0-A) 누락. 자체 <table> 추정',
    })
  }
  // 14) 2026-05-26: 자체 <table> 사용 (NeuDataTable 미사용)
  //   <table> 태그 직접 사용 + NeuDataTable 미 import → 자체 테이블.
  //   data 표시면 NeuDataTable 사용 의무 (§ 0-A [5]).
  if (/<table[\s>]/i.test(content) && !checks.hasNeuDataTable) {
    warnings.push({
      file: rel,
      issue: '자체 <table> 추정 — 공용 NeuDataTable 사용 권장 (§ 0-A [5] — 정렬 + 모바일 카드 자동)',
    })
  }

  // 18) 2026-05-28: AI 잔존 표현 / 메타 식별자 노출 금지 (UI-DESIGN-STANDARD § 8)
  //   "AI 가 만든 느낌" 패턴 — 💡 + 기술 키워드 / em-dash 기술 부연 / 운영 단계 노출.
  //   2026-05-31 강화 — Phase/PR-X/P9-y 메타 식별자 + 「예정」 「향후」 자백 표현 차단.
  //   JSX 텍스트 영역만 검사 — 코드 주석 (// + 같은 라인) / import / 변수 선언 제외.
  const AI_PATTERNS = [
    // 기존 § 8.1 (UI 노출 기술 용어)
    /💡[^<]{0,200}?(?:adapter|direct|proxy|sync|fetch|cache|hash|token|env|어댑터|동기화|placeholder|stub|JSON\s*schema|fields|interface)/i,
    /어댑터\s*모드\s*[:：]/,
    /sync\s*후\s*표시/i,
    /adapter\s*[:：]\s*\w+/i,
    /(?:fetch|loading)\s*중\.{2,3}/i,
    /status\s*=\s*\w+\s*[\-—]\s*\w+/i,
    /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|TABLE)/i,
    // 2026-05-31 § 8.4 — 개발 메타 식별자 노출 (JSX 본문 한정 — '>'/'"'/'`' 뒤)
    /[>"`]\s*[^<"`{}]{0,80}\bPhase\s+\d+(?:\.\d+)?(?:-[A-Z])?\b/,
    /[>"`]\s*[^<"`{}]{0,80}\bPR-[A-Z][A-Z0-9-]{2,}\b/,
    /[>"`]\s*[^<"`{}]{0,80}\bP\d+-[a-z0-9]+\b/,
    /[>"`]\s*[^<"`{}]{0,120}\b(?:placeholder|stub|TBD|WIP|TODO)\b[^<"`{}]{0,30}/i,
    /[>"`]\s*[^<"`{}]{0,120}\b(?:mock|direct|etl)\s*모드/i,
    /[>"`]\s*[^<"`{}]{0,120}(?:향후|추후)[^<"`{}]{0,40}(?:구현|대체|예정|진행)/,
    /[>"`]\s*[^<"`{}]{0,80}\bJSON\s*schema\b/i,
    /[>"`]\s*[^<"`{}]{0,80}\bfields\s*정의\b/i,
  ]
  let aiHits = 0
  const aiHitLabels = []
  for (let i = 0; i < AI_PATTERNS.length; i++) {
    if (AI_PATTERNS[i].test(content)) {
      aiHits++
      if (i >= 7) aiHitLabels.push('메타 식별자')
    }
  }
  if (aiHits > 0) {
    const label = aiHitLabels.length > 0 ? `${aiHits}건 (메타 식별자 포함)` : `${aiHits}건`
    warnings.push({
      file: rel,
      issue: `AI 잔존 표현 ${label} — § 8 인간 손길 표준 (Phase/PR-X/P9-y 메타 식별자, 어댑터/sync/fetch 기술 용어 사용자 노출 금지)`,
    })
  }

  // 17) 2026-05-28: 표시 텍스트 100% 한글 (UI-DESIGN-STANDARD § 7)
  //   JSX text content (예: <button>Click Me</button>) 안 한글 0 + 영어 단어 6자+
  //   → 정보성 경고. 기술 약어 화이트리스트 통과.
  const ENGLISH_ALLOWED = new Set([
    'API', 'URL', 'ID', 'AI', 'ML', 'PDF', 'CSV', 'XLS', 'XLSX', 'DOC', 'DOCX', 'PPTX',
    'HTTP', 'HTTPS', 'JSON', 'SQL', 'CRM', 'ERP', 'SMS', 'KPI', 'OK', 'NG', 'OAuth',
    'DB', 'IP', 'MAC', 'SSL', 'JWT', 'UUID', 'RGB', 'HEX', 'IRR', 'PG', 'CPO',
    'ADMIN', 'GOD', 'NEW', 'OLD', 'COPY', 'PASTE', 'OFF', 'ON', 'TODO', 'NOTE',
    'RIDE', 'FMI', 'CARE',
  ])
  const jsxTextRe = />[\s\n]*([A-Za-z][A-Za-z\s\-_./]{5,40}?)[\s\n]*</g
  let jtm, englishOnly = 0
  while ((jtm = jsxTextRe.exec(content)) !== null) {
    const text = jtm[1].trim()
    if (text.length < 6) continue
    // 짧은 공백 분리 단어가 모두 화이트리스트면 통과
    const words = text.split(/\s+/).filter(Boolean)
    const allAllowed = words.every(w => ENGLISH_ALLOWED.has(w.toUpperCase().replace(/[^\w]/g, '')))
    if (allAllowed) continue
    if (/[가-힯]/.test(text)) continue   // 한글 포함 → 통과
    if (/^[A-Z][A-Z0-9-]+$/.test(text)) continue // 페이지 코드 (POLICY-2026-001)
    englishOnly++
    if (englishOnly > 3) break   // 한 파일당 3건 까지만 카운트 (시그널만)
  }
  if (englishOnly > 0) {
    warnings.push({
      file: rel,
      issue: `JSX 영어 텍스트 ${englishOnly}건 이상 — § 7 한글 100% 의무 (한국어 표시. 기술 약어만 영어 허용)`,
    })
  }

  // 16) 2026-05-27: 체크박스 표준 (UI-DESIGN-STANDARD § 6)
  //   type="checkbox" 발견 시 그 부근 300 char 윈도우 에서 width:18 + accentColor 검증.
  const cbRe = /type=["']checkbox["']/g
  let cbm, cbViolations = 0
  while ((cbm = cbRe.exec(content)) !== null) {
    // 부근 300 char (앞 100 + 뒤 200) — JSX attribute spread 처리
    const start = Math.max(0, cbm.index - 100)
    const window = content.slice(start, cbm.index + 200)
    const hasWidth18 = /\bwidth:\s*18\b|\bwidth=["']?18\b/.test(window)
    const hasAccent = /accentColor/.test(window)
    if (!hasWidth18 || !hasAccent) cbViolations++
  }
  if (cbViolations > 0) {
    warnings.push({
      file: rel,
      issue: `체크박스 ${cbViolations}건 — § 6 표준 미준수 (width:18 + accentColor:'#3b6eb5' 의무)`,
    })
  }

  // 15) 2026-05-27: 모달 overlay 표준 (UI-DESIGN-STANDARD § 5.1)
  //   표준: bg-black/40 + backdrop-blur-sm
  //   금지: bg-black/50 이상 + backdrop-blur-xl/-2xl 조합 (뒷 콘텐츠 차단, 답답)
  //         bg-black/90 (사실상 페이지 차단 — data-loss confirm 외 예외)
  // 모달 잠재 패턴: 'fixed inset-0' + 'z-50' + overlay class
  const hasHeavyOverlay = /\bbg-black\/(5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9])\b/.test(content)
  const hasHeavyBlur = /\bbackdrop-blur-(xl|2xl|3xl)\b/.test(content)
  const hasFullPageBlackout = /\bbg-black\/9[0-9]\b/.test(content)
  if (hasHeavyOverlay && hasHeavyBlur) {
    warnings.push({
      file: rel,
      issue: '모달 overlay 무거움 — bg-black/50+ 와 backdrop-blur-xl+ 조합. 표준 (§ 5.1): bg-black/40 + backdrop-blur-sm',
    })
  } else if (hasFullPageBlackout) {
    warnings.push({
      file: rel,
      issue: '모달 overlay 90%+ 검정 — 사실상 페이지 차단. data-loss confirm 외 § 5.1 표준 (bg-black/40) 사용',
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

// --baseline-update: 현재 모든 warning 을 baseline 으로 동결
if (BASELINE_UPDATE) {
  // STAGED 모드 무시 — 전체 페이지에서 다시 스캔해서 baseline 생성
  if (STAGED_MODE) {
    console.warn('⚠ --baseline-update 는 STAGED 모드와 함께 쓰지 마세요. STAGED 무시하고 전체 스캔으로 baseline.')
  }
  saveBaseline(warnings)
  process.exit(0)
}

// STAGED 모드: baseline 외 신규 violation 안내 (2026-05-27 정보성 — 차단 X)
//   이전 commit (96e9534+) 의 strict 차단은 다른 세션 push 막아서 다운그레이드.
//   neologism 위반 → 화면 안내만, commit 통과.
//   추후 사용자 결정 시 UI_DESIGN_LINT_STRICT=1 로 strict 재활성 가능.
if (STAGED_MODE) {
  const newViolations = warnings.filter(w => !BASELINE.has(`${w.file}|${w.issue}`))
  const knownCount = warnings.length - newViolations.length
  console.log(`  baseline: ${BASELINE.size} known / staged warning: ${warnings.length} (known=${knownCount}, new=${newViolations.length})`)
  if (newViolations.length > 0) {
    console.warn('\n⚠ ui-design-lint (STAGED 정보성) — 신규 UI 표준 위반:')
    for (const w of newViolations.slice(0, 10)) {
      console.warn(`  · ${w.file}`)
      console.warn(`    ${w.issue}`)
    }
    if (newViolations.length > 10) console.warn(`  ... ${newViolations.length - 10}건 더`)
    if (process.env.UI_DESIGN_LINT_STRICT === '1' && process.env.UI_DESIGN_LINT_REPORT_ONLY !== '1') {
      console.error('\n❌ STRICT 모드 — commit 차단 (UI_DESIGN_LINT_STRICT=1)')
      console.error('   baseline 갱신: node harness-engineering/scripts/ui-design-lint.js --baseline-update')
      process.exit(1)
    } else {
      console.warn('   (정보성 — commit 통과. 정리 후 baseline 갱신 권장)')
    }
  }
}
// 일반 모드: warnings 정보성, violations 만 차단
if (!STAGED_MODE && violations.length > 0 && process.env.UI_DESIGN_LINT_REPORT_ONLY !== '1') {
  console.error('\n❌ ui-design-lint 위반 — commit 차단')
  console.error('   강제 우회 (권장 X): UI_DESIGN_LINT_REPORT_ONLY=1 npm run lint:ui-design')
  process.exit(1)
}
process.exit(0)
