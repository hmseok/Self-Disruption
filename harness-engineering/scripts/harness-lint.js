#!/usr/bin/env node
/**
 * harness-lint.js — 통합 lint entry.
 *
 * 평가 → 훅 → 기록 → 개선 사이클:
 *   [평가]  4개 lint 모두 실행하여 점수/위반 집계
 *   [훅]   git pre-commit hook 에서 자동 호출
 *   [기록]  위반 발견 시 knowledge/lint-violations.md 에 자동 append
 *   [개선]  baseline 비교 — 새 위반만 차단, 기존 issue 는 known 처리
 *
 * Exit code:
 *   0 — 새 위반 없음 (commit 통과)
 *   1 — 새 위반 발견 (commit 차단)
 *
 * 옵션:
 *   --baseline-update  : 현재 위반을 baseline 으로 동결 (사용자가 수정 의도 없을 때)
 *   --report-only      : exit 0 강제 (CI 용 — 기록만)
 *
 * (CLAUDE.md § 0-1 자동화 안전장치 통합)
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')
const KNOWLEDGE_DIR = path.join(ROOT, 'harness-engineering/knowledge')
const VIOLATIONS_LOG = path.join(KNOWLEDGE_DIR, 'lint-violations.md')
const BASELINE_FILE = path.join(KNOWLEDGE_DIR, 'sql-lint.baseline.json')

const sqlLint = require('./sql-lint')
const sqlFnLint = require('./sql-fn-lint')
const apiTrace = require('./api-call-trace')
const uiCoverage = require('./ui-data-coverage')
const amountSignLint = require('./amount-sign-lint')
const helperCoverageLint = require('./helper-coverage-lint')
const sqlReservedAliasLint = require('./sql-reserved-alias-lint')
const sqlGroupByLint = require('./sql-group-by-lint')
const menuSyncLint = require('./menu-sync-lint')

const flags = new Set(process.argv.slice(2))

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
    return new Set((data.violations || []).map(v => `${v.file}:${v.ref}`))
  } catch { return new Set() }
}

function saveBaseline(violations) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    violations: violations.map(v => ({ file: v.file, ref: v.ref, table: v.table, column: v.column })),
    generatedAt: new Date().toISOString(),
    note: '기존 SQL 컬럼 위반 — known issue 로 처리. 새 위반만 lint fail.',
  }, null, 2))
}

function appendViolationLog(summary) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
  let header = ''
  if (!fs.existsSync(VIOLATIONS_LOG)) {
    header = `# Lint 위반 자동 기록

> harness-lint.js 가 commit 시점에 자동으로 append.
> 누적 위반 패턴을 분석해 시스템 차원 개선 방향 제시.

`
  }
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const lines = [
    `\n## ${ts}`,
    `- sql-lint: total=${summary.sqlLint.total}, new=${summary.sqlLint.newCount}, known=${summary.sqlLint.knownCount}`,
    `- sql-fn-lint: total=${summary.sqlFnLint.total}`,
    `- api-trace: broken=${summary.apiTrace.broken}, newBroken=${summary.apiTrace.newBroken}`,
    `- ui-coverage: warnings=${summary.uiCoverage.warnings}`,
  ]
  if (summary.sqlLint.newViolations.length > 0) {
    lines.push('  - **새 SQL 컬럼 위반**:')
    for (const v of summary.sqlLint.newViolations) {
      lines.push(`    - \`${v.file}:${v.line}\` ${v.ref} (table \`${v.table}\` 에 \`${v.column}\` 없음)`)
    }
  }
  if (summary.sqlFnLint.violations.length > 0) {
    lines.push('  - **회색 함수 사용**:')
    for (const v of summary.sqlFnLint.violations) {
      lines.push(`    - \`${v.file}:${v.line}\` \`${v.fn}\``)
    }
  }
  fs.appendFileSync(VIOLATIONS_LOG, header + lines.join('\n') + '\n')
}

function main() {
  console.log('═══ harness-lint v1.0 (평가 → 훅 → 기록 → 개선) ═══\n')

  // [평가] 1. SQL 컬럼 검증
  console.log('▸ [1/4] sql-lint — $queryRaw 컬럼 검증')
  const sqlR = sqlLint.lint()
  const baseline = loadBaseline()
  const newSqlViolations = sqlR.violations.filter(v => !baseline.has(`${v.file}:${v.ref}`))
  const knownSqlViolations = sqlR.violations.filter(v => baseline.has(`${v.file}:${v.ref}`))
  console.log(`  ${sqlR.fileCount} files, ${sqlR.strictCount}+${sqlR.partialCount} tables`)
  console.log(`  total=${sqlR.violations.length}, new=${newSqlViolations.length}, known=${knownSqlViolations.length}`)
  for (const v of newSqlViolations.slice(0, 10)) {
    console.error(`  ❌ ${v.file}:${v.line} ${v.ref} (table ${v.table} has no '${v.column}')`)
  }

  // [평가] 2. SQL 함수 화이트리스트
  console.log('\n▸ [2/4] sql-fn-lint — 회색 함수 (MySQL 8.0+ 전용) 차단')
  const fnR = sqlFnLint.lint()
  console.log(`  ${fnR.fileCount} files, violations=${fnR.violations.length}`)
  for (const v of fnR.violations.slice(0, 10)) {
    console.error(`  ❌ ${v.file}:${v.line} ${v.fn}`)
  }

  // [평가] 3. API ↔ UI 호출 매핑
  console.log('\n▸ [3/4] api-call-trace — UI fetch ↔ API 라우트 매핑')
  const apiR = apiTrace.trace()
  // baseline 처리 — api-trace 는 이미 자체 baseline 있음
  const apiBaselinePath = path.join(KNOWLEDGE_DIR, 'api-trace.baseline.json')
  let apiBaselineSet = new Set()
  if (fs.existsSync(apiBaselinePath)) {
    try { apiBaselineSet = new Set(JSON.parse(fs.readFileSync(apiBaselinePath, 'utf-8')).brokenCalls || []) } catch {}
  }
  const newApiBroken = apiR.brokenCalls.filter(b => !apiBaselineSet.has(b.url))
  console.log(`  routes=${apiR.routes.length}, broken=${apiR.brokenCalls.length}, newBroken=${newApiBroken.length}, orphans=${apiR.orphanRoutes.length}`)
  for (const b of newApiBroken.slice(0, 10)) {
    console.error(`  ❌ ${b.url}  ← ${b.callers.slice(0, 2).join(', ')}`)
  }

  // [평가] 3.2. SQL alias 예약어 검사 (어제 'AS desc' 사고 방지)
  console.log('\n▸ [3.2] sql-reserved-alias-lint — alias 예약어 사용 차단')
  const aliasR = sqlReservedAliasLint.lint()
  const aliasBaselinePath = path.join(KNOWLEDGE_DIR, 'sql-reserved-alias-lint.baseline.json')
  let aliasBaselineSet = new Set()
  if (fs.existsSync(aliasBaselinePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(aliasBaselinePath, 'utf-8'))
      aliasBaselineSet = new Set((data.violations || []).map(v => `${v.file}:${v.line}:${v.alias}`))
    } catch {}
  }
  const newAlias = aliasR.violations.filter(v => !aliasBaselineSet.has(`${v.file}:${v.line}:${v.alias}`))
  console.log(`  ${aliasR.fileCount} files, total=${aliasR.violations.length}, new=${newAlias.length}`)
  for (const v of newAlias.slice(0, 5)) {
    console.error(`  ❌ ${v.file}:${v.line} AS ${v.alias} (예약어)`)
  }

  // [평가] 3.3. GROUP BY ↔ SELECT expression 정합성 (어제 only_full_group_by 사고 방지)
  console.log('\n▸ [3.3] sql-group-by-lint — GROUP BY alias expression 정합성')
  const gbR = sqlGroupByLint.lint()
  const gbBaselinePath = path.join(KNOWLEDGE_DIR, 'sql-group-by-lint.baseline.json')
  let gbBaselineSet = new Set()
  if (fs.existsSync(gbBaselinePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(gbBaselinePath, 'utf-8'))
      gbBaselineSet = new Set((data.violations || []).map(v => `${v.file}:${v.line}:${v.alias}`))
    } catch {}
  }
  const newGb = gbR.violations.filter(v => !gbBaselineSet.has(`${v.file}:${v.line}:${v.alias}`))
  console.log(`  ${gbR.fileCount} files, total=${gbR.violations.length}, new=${newGb.length}`)
  for (const v of newGb.slice(0, 5)) {
    console.error(`  ❌ ${v.file}:${v.line} GROUP BY ${v.alias} → expression: ${v.expr}`)
  }

  // [평가] 4-1. helper-coverage — corporate_cards / bank_account_mappings JOIN 헬퍼 사용 강제 (규칙 14, 15)
  console.log('\n▸ [3.4] helper-coverage-lint — JOIN 헬퍼 사용 강제')
  const helperR = helperCoverageLint.lint()
  const helperBaselinePath = path.join(KNOWLEDGE_DIR, 'helper-coverage-lint.baseline.json')
  let helperBaselineSet = new Set()
  if (fs.existsSync(helperBaselinePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(helperBaselinePath, 'utf-8'))
      helperBaselineSet = new Set((data.violations || []).map(v => `${v.file}:${v.line}`))
    } catch {}
  }
  const newHelper = helperR.violations.filter(v => !helperBaselineSet.has(`${v.file}:${v.line}`))
  console.log(`  ${helperR.fileCount} files, total=${helperR.violations.length}, new=${newHelper.length}`)
  for (const v of newHelper.slice(0, 5)) {
    console.error(`  ❌ ${v.file}:${v.line} ${v.table} (alias=${v.alias}) → ${v.helper} 사용 X`)
  }

  // [평가] 4-2. amount + 부호 사용 차단 (CLAUDE.md 규칙 18)
  console.log('\n▸ [3.5] amount-sign-lint — + 부호 사용 차단')
  const signR = amountSignLint.lint()
  const signBaselinePath = path.join(KNOWLEDGE_DIR, 'amount-sign-lint.baseline.json')
  let signBaselineSet = new Set()
  if (fs.existsSync(signBaselinePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(signBaselinePath, 'utf-8'))
      signBaselineSet = new Set((data.violations || []).map(v => `${v.file}:${v.line}`))
    } catch {}
  }
  const newSign = signR.violations.filter(v => !signBaselineSet.has(`${v.file}:${v.line}`))
  console.log(`  ${signR.fileCount} files, total=${signR.violations.length}, new=${newSign.length}`)
  for (const v of newSign.slice(0, 5)) {
    console.error(`  ❌ ${v.file}:${v.line}  ${v.label}`)
  }

  // [평가] 3.6. menu-sync — app/**/page.tsx ↔ menu-registry 동기화 (CLAUDE.md 자동 동기화 규칙)
  console.log('\n▸ [3.6] menu-sync-lint — app/**/page.tsx ↔ menu-registry 등록 강제')
  const menuR = menuSyncLint.lint()
  console.log(`  ${menuR.allPages.length} pages, registry=${menuR.registryMenus} + hidden=${menuR.hiddenPaths}, violations=${menuR.violations.length}`)
  for (const v of menuR.violations.slice(0, 5)) {
    console.error(`  ❌ menu-registry 에 등록 안 된 페이지: ${v}/page.tsx`)
  }

  // [평가] 4. UI 화면 데이터 정합성
  console.log('\n▸ [4/4] ui-data-coverage — 같은 API 호출 page 들 사이 누락 필드')
  const uiR = uiCoverage.buildCoverage()
  // (단순 buildCoverage 는 warnings 만 — 필요 시 별도 lint 호출)
  // 여기선 inline 으로 strict 임계치 적용
  const uiWarnings = []
  for (const [url, pageSet] of Object.entries(uiR.urlGroups)) {
    if (pageSet.size < 3) continue
    const pages = [...pageSet]
    const fieldUsage = {}
    for (const f of pages) {
      const p = uiR.pages.find(x => x.file === f)
      for (const fld of p.fields) {
        fieldUsage[fld] = fieldUsage[fld] || []
        fieldUsage[fld].push(f)
      }
    }
    for (const [fld, users] of Object.entries(fieldUsage)) {
      const usedRate = users.length / pages.length
      const missingCount = pages.length - users.length
      if (usedRate >= 0.8 && missingCount >= 1 && missingCount <= 2) {
        uiWarnings.push({ url, field: fld, missing: pages.filter(p => !users.includes(p)) })
      }
    }
  }
  console.log(`  ${uiR.pages.length} UI files, warnings=${uiWarnings.length} (정보성)`)

  // [기록] knowledge/lint-violations.md 자동 append
  const summary = {
    sqlLint: { total: sqlR.violations.length, newCount: newSqlViolations.length, knownCount: knownSqlViolations.length, newViolations: newSqlViolations },
    sqlFnLint: { total: fnR.violations.length, violations: fnR.violations },
    apiTrace: { broken: apiR.brokenCalls.length, newBroken: newApiBroken.length },
    uiCoverage: { warnings: uiWarnings.length },
  }
  appendViolationLog(summary)

  // [개선] 누적 위반 패턴 분석 (선택적 — 통계만)
  // baseline-update 모드 — sql-lint + alias + group-by 모두 동결
  if (flags.has('--baseline-update')) {
    saveBaseline(sqlR.violations)
    fs.writeFileSync(aliasBaselinePath, JSON.stringify({
      violations: aliasR.violations.map(v => ({ file: v.file, line: v.line, alias: v.alias })),
      generatedAt: new Date().toISOString(),
    }, null, 2))
    fs.writeFileSync(gbBaselinePath, JSON.stringify({
      violations: gbR.violations.map(v => ({ file: v.file, line: v.line, alias: v.alias })),
      generatedAt: new Date().toISOString(),
    }, null, 2))
    console.log(`\n[harness-lint] baseline updated`)
    console.log(`  sql: ${sqlR.violations.length} / alias: ${aliasR.violations.length} / group-by: ${gbR.violations.length}`)
    process.exit(0)
  }

  // 결과 집계
  const newCritical = newSqlViolations.length + fnR.violations.length + newApiBroken.length + newSign.length + newHelper.length + newAlias.length + newGb.length + menuR.violations.length
  console.log('\n═══ 결과 ═══')
  console.log(`  새 critical 위반: ${newCritical}`)
  console.log(`  known issue: ${knownSqlViolations.length} SQL + ${apiR.brokenCalls.length - newApiBroken.length} broken-call`)
  console.log(`  정보성 warning: ${uiWarnings.length} UI coverage`)
  console.log(`  기록: ${path.relative(ROOT, VIOLATIONS_LOG)}`)

  if (flags.has('--report-only')) {
    console.log('  --report-only 모드: exit 0')
    process.exit(0)
  }
  if (newCritical > 0) {
    console.error('\n❌ 새 critical 위반 — commit 차단')
    console.error('   수정 후 재시도, 또는 의도된 변경이라면:')
    console.error('   $ node harness-engineering/scripts/harness-lint.js --baseline-update')
    process.exit(1)
  }
  console.log('\n✅ 새 위반 없음 — commit 통과')
  process.exit(0)
}

if (require.main === module) main()
