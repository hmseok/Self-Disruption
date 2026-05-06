#!/usr/bin/env node
/**
 * cowork-staging-lint.js — Cowork 멀티 세션 staging 침범 차단
 *
 * 사고 (2026-05-06): 두 코워크 세션 동시 작업 중 한 세션이 `git add .`
 * 실행하여 다른 세션 작업물 1,407 라인 흡수.
 * commit 0956dae [RideAccidents PR-6.3.c] 안에 CallScheduler PR-2SS 모두 묶임.
 *
 * 회귀 케이스:
 *   harness-engineering/regression-cases/2026-05-06-cowork-staging-violation.md
 *
 * 검증 로직:
 *   1. git diff --cached --name-only 로 staged 파일 추출
 *   2. 각 파일을 「모듈 라벨」로 매핑
 *   3. 화이트리스트 라벨 (_common / _harness / _db / _root) 는 카운트 X
 *   4. 실제 모듈 라벨 set 의 size > 1 → 위반 (commit 차단)
 *
 * 우회 (의도적 cross-module commit):
 *   - 환경변수: COWORK_ALLOW_MULTI_MODULE=1 git commit ...
 *   - 또는 commit 메시지에 [multi-module] 또는 [cross] prefix
 *     (메시지 검사는 commit-msg hook 에서 별도 — 본 스크립트는 ENV 만)
 *
 * 사용:
 *   node harness-engineering/scripts/cowork-staging-lint.js
 *   COWORK_ALLOW_MULTI_MODULE=1 node harness-engineering/scripts/cowork-staging-lint.js
 */
const { execSync } = require('child_process')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')

// ─── staged 파일 목록 ──────────────────────────────────────────────
function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACMRTD', {
      cwd: ROOT,
      encoding: 'utf-8',
    })
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

// ─── 모듈 라벨 매핑 ────────────────────────────────────────────────
//
// _common  : 공통 영역 (한 PR 에 여러 모듈과 같이 변경 OK)
// _harness : 하네스 인프라
// _db      : DB / 마이그레이션
// _root    : repo 루트 설정 / 문서
// 그 외    : 실제 모듈명 (e.g. 'RideAccidents', 'CallScheduler', 'cars', 'finance', 'admin')
//
// 한 commit 안에 실제 모듈 라벨이 ≥ 2 면 위반.
function moduleOf(file) {
  // ── 화이트리스트: 공통 영역 ──
  if (file.startsWith('app/components/')) return '_common'
  if (file.startsWith('app/utils/')) return '_common'
  if (file.startsWith('app/styles/')) return '_common'
  if (file.startsWith('app/globals.')) return '_common'
  if (file === 'app/layout.tsx' || file === 'app/page.tsx') return '_common'

  // ── 화이트리스트: 하네스 인프라 ──
  if (file.startsWith('harness-engineering/')) return '_harness'

  // ── 화이트리스트: DB ──
  if (file.startsWith('prisma/')) return '_db'
  if (file.startsWith('migrations/')) return '_db'

  // ── 실제 모듈: app/api/<module>/... ──
  // 단 `_api`, `_lib` 같은 underscore prefix 는 공통
  let m = file.match(/^app\/api\/([^/_][^/]*)/)
  if (m) {
    const mod = m[1]
    // 화이트리스트 API (cross-cutting)
    if (['auth', 'health', 'system_modules', 'menu-registry'].includes(mod)) return '_common'
    return `api:${mod}`
  }

  // ── 실제 모듈: app/(group)/<module>/... ──
  m = file.match(/^app\/\([^)]+\)\/([^/]+)/)
  if (m) {
    const mod = m[1]
    // (employees)/common 같은 공통 폴더 화이트리스트
    if (['common', 'shared', '_common'].includes(mod)) return '_common'
    return mod
  }

  // ── 실제 모듈: app/<top-module>/... (route group 없는 평면 구조) ──
  m = file.match(/^app\/([^/(_][^/]*)/)
  if (m) {
    const mod = m[1]
    return mod
  }

  // ── lib/ 분기: lib/<module>-*.ts 는 모듈 전용, 외에는 공통 ──
  if (file.startsWith('lib/')) {
    const mPrefix = file.match(/^lib\/([a-zA-Z0-9-]+?)(?:-db|-helper|-helpers|-client|-server)\.ts$/)
    if (mPrefix) {
      // 모듈 전용 lib (예: lib/cafe24-db.ts) → 모듈 'cafe24'
      // 단 menu-registry / auth-server / auth-client / prisma 같은 공통은 _common
      const baseName = mPrefix[1]
      if (['menu-registry', 'auth', 'prisma'].includes(baseName)) return '_common'
      return `lib:${baseName}`
    }
    return '_common' // 일반 lib/ 파일
  }

  // ── 루트 설정 / 문서 ──
  if (
    file === 'package.json' ||
    file === 'package-lock.json' ||
    file.startsWith('tsconfig') ||
    file.startsWith('next.config') ||
    file.startsWith('tailwind.config') ||
    file.startsWith('eslint.config') ||
    file === '.gitignore' ||
    file === 'Dockerfile' ||
    file === '.dockerignore' ||
    file.startsWith('.env')
  ) {
    return '_root'
  }
  if (/^[A-Z][A-Z_-]*\.md$/.test(file)) return '_root' // CLAUDE.md, HARNESS.md, README.md 등
  if (file.startsWith('docs/')) return '_root'

  // 알 수 없는 영역 → 일단 공통 (보수적)
  return '_common'
}

// ─── 분류 ──────────────────────────────────────────────────────────
function classify(files) {
  const byModule = {}
  for (const f of files) {
    const mod = moduleOf(f)
    byModule[mod] = byModule[mod] || []
    byModule[mod].push(f)
  }
  // 화이트리스트 (_ 시작) 와 실제 모듈 분리
  const realModules = {}
  const whitelist = {}
  for (const [mod, list] of Object.entries(byModule)) {
    if (mod.startsWith('_')) {
      whitelist[mod] = list
    } else {
      realModules[mod] = list
    }
  }
  return { realModules, whitelist }
}

// ─── lint 실행 ─────────────────────────────────────────────────────
function lint() {
  const files = getStagedFiles()
  if (files.length === 0) {
    return { stagedCount: 0, realModules: {}, whitelist: {}, violations: [], skip: true }
  }

  const { realModules, whitelist } = classify(files)
  const moduleNames = Object.keys(realModules)
  const violations = []

  if (moduleNames.length > 1) {
    violations.push({
      type: 'multi-module',
      modules: moduleNames,
      detail: realModules,
    })
  }

  return {
    stagedCount: files.length,
    realModules,
    whitelist,
    violations,
    skip: false,
  }
}

// ─── 실행 ─────────────────────────────────────────────────────────
if (require.main === module) {
  const r = lint()
  if (r.skip) {
    console.log('cowork-staging-lint: staged 0 files, skip')
    process.exit(0)
  }

  console.log(
    `cowork-staging-lint: ${r.stagedCount} staged files, modules=${Object.keys(r.realModules).length}, whitelist=${Object.keys(r.whitelist).length}`
  )
  for (const [mod, list] of Object.entries(r.realModules)) {
    console.log(`  · [${mod}] ${list.length} files`)
    for (const f of list.slice(0, 3)) {
      console.log(`      ${f}`)
    }
    if (list.length > 3) console.log(`      ... (${list.length - 3} more)`)
  }
  for (const [mod, list] of Object.entries(r.whitelist)) {
    console.log(`  · [${mod} whitelist] ${list.length} files`)
  }

  if (r.violations.length > 0) {
    if (process.env.COWORK_ALLOW_MULTI_MODULE === '1') {
      console.warn('\n⚠ multi-module commit allowed (COWORK_ALLOW_MULTI_MODULE=1)')
      process.exit(0)
    }
    console.error('')
    console.error('❌ Cowork 협업 위반 (CLAUDE.md 규칙 21)')
    console.error('   한 commit 에 여러 모듈 영역이 동시 staged.')
    console.error('   다른 세션 작업물을 흡수했을 가능성.')
    console.error('')
    console.error('   감지된 모듈:')
    for (const mod of Object.keys(r.realModules)) {
      console.error(`     · ${mod}`)
    }
    console.error('')
    console.error('   조치:')
    console.error('     1. git reset HEAD 로 staged 풀기')
    console.error('     2. 자기 영역만 명시적 add — 예:')
    console.error('        git add "app/(employees)/<자기 모듈>/"')
    console.error('     3. git status 로 staged 파일 확인 (다른 모듈 X)')
    console.error('     4. 다시 commit')
    console.error('')
    console.error('   의도적인 cross-module commit 이라면:')
    console.error('     COWORK_ALLOW_MULTI_MODULE=1 git commit ...')
    process.exit(1)
  }

  console.log('\n✅ staged 가 단일 모듈 영역 — 통과')
  process.exit(0)
}

module.exports = { lint, moduleOf, classify, getStagedFiles }
