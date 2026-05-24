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
 *   harness-engineering/regression-cases/2026-05-24-cowork-newfile-absorption.md
 *
 * 검증 로직:
 *   1. git diff --cached --name-status 로 staged 파일 + 상태(A/M/D) 추출
 *   2. 각 파일을 「모듈 라벨」로 매핑
 *   3. 화이트리스트 라벨 (_common / _harness / _db / _root) 는 모듈 카운트 X
 *   4. [multi-module]  서로 다른 canonical 모듈이 ≥ 2 면 위반
 *   5. [new-file-mix]  새로 생성된 파일(A)이 포함된 commit 이 여러 영역
 *      (실제 모듈 / _common / _harness)에 걸치면 위반
 *
 * PR-COORD-8 (2026-05-22) — UI ↔ 전용 API 오탐 보완
 *   한 기능의 UI(`app/X/`)와 전용 API(`app/api/X/`)를 canonical 키로 묶어
 *   정상적인 단일기능 커밋이 multi-module 로 오탐되던 문제 해결.
 *
 * PR-COORD-9 (2026-05-24) — 새 파일 흡수 사각지대 보완
 *   사고: bare `git commit` 이 인덱스에 이미 staged 된 다른 세션의 새 파일
 *         (RideVision/lotto/page.tsx 등)을 함께 commit. 「공통파일 1 + 다른
 *         세션 모듈 1개」 는 실제 모듈이 1개뿐이라 multi-module(≥2) 규칙을
 *         통과 — 사각지대.
 *   보완: 새로 생성된 파일(status A)이 실제 모듈에 있으면서, 같은 commit 이
 *         여러 영역(실제 모듈 / _common / _harness)에 걸치면 차단.
 *         새 파일 = 명백한 "새 작업 단위" — 다른 영역과 섞이면 흡수 의심.
 *         (_db 마이그레이션 / _root 설정은 새 기능에 동반 가능 → 영역 카운트 제외)
 *
 * 우회 (의도적 cross-module / cross-area commit):
 *   - 환경변수: COWORK_ALLOW_MULTI_MODULE=1 git commit ...
 *
 * 사용:
 *   node harness-engineering/scripts/cowork-staging-lint.js
 *   node harness-engineering/scripts/cowork-staging-lint.js --check-commit <sha>
 */
const { execSync } = require('child_process')
const path = require('path')
const ROOT = path.resolve(__dirname, '../..')

// ─── name-status 파싱 ─────────────────────────────────────────────
// 입력: "A\tpath" / "M\tpath" / "R100\told\tnew" 형식 라인들
// 출력: [{ status: 'A'|'M'|'D'|'R'|'C'|'T', file: <현재 경로> }]
function parseNameStatus(out) {
  const entries = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    if (parts.length < 2) continue
    const status = parts[0][0] // R100 → 'R'
    const file = parts[parts.length - 1] // rename/copy 면 마지막이 새 경로
    entries.push({ status, file })
  }
  return entries
}

// ─── staged 파일 (status 포함) ────────────────────────────────────
function getStagedEntries() {
  try {
    const out = execSync('git diff --cached --name-status --diff-filter=ACMRTD', {
      cwd: ROOT,
      encoding: 'utf-8',
    })
    return parseNameStatus(out)
  } catch {
    return []
  }
}

// ─── 특정 commit 의 파일 (status 포함) ────────────────────────────
// pre-push hook 에서 사용 — 해당 commit 이 위반인지 검증
function getCommitEntries(sha) {
  try {
    const out = execSync(`git diff-tree --no-commit-id --name-status -r ${sha}`, {
      cwd: ROOT,
      encoding: 'utf-8',
    })
    return parseNameStatus(out)
  } catch {
    return []
  }
}

// 하위호환 — filename 만 반환
function getStagedFiles() {
  return getStagedEntries().map((e) => e.file)
}
function getCommitFiles(sha) {
  return getCommitEntries(sha).map((e) => e.file)
}

// ─── 모듈 라벨 매핑 ────────────────────────────────────────────────
//
// _common  : 공통 영역 (한 PR 에 여러 모듈과 같이 변경 OK)
// _harness : 하네스 인프라
// _db      : DB / 마이그레이션
// _root    : repo 루트 설정 / 문서
// 그 외    : 실제 모듈명 (e.g. 'RideAccidents', 'CallScheduler', 'cars', 'finance', 'admin')
//
// 한 commit 안에 실제 모듈이 ≥ 2 (canonical 기준) 면 위반.
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

// ─── canonical 모듈 키 (PR-COORD-8) ───────────────────────────────
// 한 기능의 UI(`RideAssets`) / 전용 API(`api:ride-assets`) / 전용 lib(`lib:ride-assets`)
// 를 같은 모듈로 묶기 위한 정규화 키.
//   1. `api:` / `lib:` prefix 제거
//   2. 소문자화 + 영숫자 외(하이픈·언더스코어 등) 제거
// → 'RideAssets', 'api:ride-assets', 'lib:ride_assets' 모두 'rideassets'.
// 서로 다른 기능('RideAccidents' vs 'CallScheduler') 은 다른 키로 남아 계속 차단.
function canonicalModule(label) {
  return label
    .replace(/^(api|lib):/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// ─── 영역(area) 키 (PR-COORD-9) ───────────────────────────────────
// new-file-mix 검사용 — 한 commit 이 몇 개 "영역"에 걸치는지 셀 때 사용.
//   · 실제 모듈   → 'mod:<canonical>'
//   · _common     → '_common'   (영역으로 셈)
//   · _harness    → '_harness'  (영역으로 셈)
//   · _db / _root → null        (마이그레이션·설정은 새 기능에 동반 가능 — 영역 제외)
function areaOf(file) {
  const m = moduleOf(file)
  if (m === '_common') return '_common'
  if (m === '_harness') return '_harness'
  if (m.startsWith('_')) return null // _db, _root — 자유롭게 동반 가능
  return 'mod:' + canonicalModule(m)
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
  // canonical 그룹핑 — UI ↔ api: ↔ lib: 같은 기능을 한 모듈로 병합
  const canonicalGroups = {}
  for (const [mod, list] of Object.entries(realModules)) {
    const key = canonicalModule(mod)
    if (!canonicalGroups[key]) canonicalGroups[key] = { canonical: key, labels: [], files: [] }
    canonicalGroups[key].labels.push(mod)
    canonicalGroups[key].files.push(...list)
  }
  return { realModules, whitelist, canonicalGroups }
}

// ─── 위반 판정 ─────────────────────────────────────────────────────

// [multi-module] 서로 다른 canonical 모듈이 2개 이상이면 위반.
function buildMultiModuleViolation(canonicalGroups, type) {
  const keys = Object.keys(canonicalGroups)
  if (keys.length <= 1) return []
  const modules = keys.map((k) => canonicalGroups[k].labels.join('+'))
  return [{
    type,
    modules,
    groups: keys.map((k) => canonicalGroups[k]),
    message: `여러 모듈이 한 commit 에 동시 staged: ${modules.join(', ')}`,
  }]
}

// [new-file-mix] 새로 생성된 파일(A)이 포함된 commit 이 여러 영역에 걸치면 위반.
// 사각지대 차단: 「공통파일 1 + 다른 세션이 새로 만든 모듈 1개」 처럼
// 실제 모듈이 1개뿐이라 multi-module 을 통과하는 흡수 사고를 잡음.
function buildNewFileMixViolation(entries) {
  const hasNewFile = entries.some((e) => e.status === 'A')
  if (!hasNewFile) return []
  const areas = new Set()
  for (const e of entries) {
    const a = areaOf(e.file)
    if (a) areas.add(a)
  }
  if (areas.size <= 1) return []
  return [{
    type: 'new-file-mix',
    modules: [...areas],
    message:
      `새로 생성된 파일이 포함된 commit 이 여러 영역에 걸침: ${[...areas].join(', ')} — ` +
      `다른 세션이 만든 새 작업을 흡수했을 가능성 (공통 파일은 § 7.2 별도 commit)`,
  }]
}

// ─── lint 실행 (staged 파일 검사) ─────────────────────────────────
function lint() {
  const entries = getStagedEntries()
  if (entries.length === 0) {
    return { stagedCount: 0, realModules: {}, whitelist: {}, canonicalGroups: {}, violations: [], skip: true }
  }
  const files = entries.map((e) => e.file)
  const { realModules, whitelist, canonicalGroups } = classify(files)
  const violations = [
    ...buildMultiModuleViolation(canonicalGroups, 'multi-module'),
    ...buildNewFileMixViolation(entries),
  ]
  return {
    stagedCount: files.length,
    realModules,
    whitelist,
    canonicalGroups,
    violations,
    skip: false,
  }
}

// ─── 특정 commit 검사 (pre-push hook 용) ──────────────────────────
function lintCommit(sha) {
  const entries = getCommitEntries(sha)
  if (entries.length === 0) {
    return { sha, stagedCount: 0, realModules: {}, whitelist: {}, canonicalGroups: {}, violations: [], skip: true }
  }
  const files = entries.map((e) => e.file)
  const { realModules, whitelist, canonicalGroups } = classify(files)
  const violations = [
    ...buildMultiModuleViolation(canonicalGroups, 'multi-module-commit'),
    ...buildNewFileMixViolation(entries),
  ]
  return {
    sha,
    stagedCount: files.length,
    realModules,
    whitelist,
    canonicalGroups,
    violations,
    skip: false,
  }
}

// ─── canonical 그룹 출력 헬퍼 ─────────────────────────────────────
function printCanonicalGroups(groups) {
  for (const g of Object.values(groups)) {
    const merged = g.labels.length > 1 ? `   (${g.labels.join(' + ')} — 동일 기능)` : ''
    console.log(`  · [${g.canonical}] ${g.files.length} files${merged}`)
  }
}

// ─── 실행 ─────────────────────────────────────────────────────────
if (require.main === module) {
  const argv = process.argv.slice(2)
  const checkCommitIdx = argv.indexOf('--check-commit')

  // ── pre-push hook 모드: --check-commit <sha> ──
  if (checkCommitIdx >= 0) {
    const sha = argv[checkCommitIdx + 1]
    if (!sha) {
      console.error('Usage: cowork-staging-lint.js --check-commit <sha>')
      process.exit(2)
    }
    const r = lintCommit(sha)
    if (r.skip) {
      console.log(`cowork-staging-lint --check-commit ${sha}: 변경 파일 0 — skip`)
      process.exit(0)
    }
    console.log(
      `cowork-staging-lint --check-commit ${sha.slice(0, 8)}: ${r.stagedCount} files, modules=${Object.keys(r.canonicalGroups).length}, whitelist=${Object.keys(r.whitelist).length}`
    )
    printCanonicalGroups(r.canonicalGroups)
    if (r.violations.length > 0) {
      if (process.env.COWORK_ALLOW_MULTI_MODULE === '1') {
        for (const v of r.violations) {
          console.warn(`\n⚠ commit 허용 (COWORK_ALLOW_MULTI_MODULE=1): ${v.message}`)
        }
        process.exit(0)
      }
      console.error('')
      console.error(`❌ Cowork 협업 위반 (CLAUDE.md 규칙 21) — commit ${sha.slice(0, 8)}`)
      for (const v of r.violations) {
        console.error(`   [${v.type}] ${v.message}`)
      }
      console.error('')
      console.error('   조치:')
      console.error(`     1. git reset --soft HEAD~1   # commit 풀기 (변경 보존)`)
      console.error('     2. 자기 모듈만 git add 후 다시 commit')
      console.error('     3. git push 재시도')
      console.error('')
      console.error('   의도적인 cross-module commit 이라면:')
      console.error('     COWORK_ALLOW_MULTI_MODULE=1 git push origin main')
      process.exit(1)
    }
    console.log('\n✅ commit 단일 모듈 영역 — 통과')
    process.exit(0)
  }

  // ── 기본 모드 — staged 파일 검사 (pre-commit hook 용) ──
  const r = lint()
  if (r.skip) {
    console.log('cowork-staging-lint: staged 0 files, skip')
    process.exit(0)
  }

  console.log(
    `cowork-staging-lint: ${r.stagedCount} staged files, modules=${Object.keys(r.canonicalGroups).length}, whitelist=${Object.keys(r.whitelist).length}`
  )
  printCanonicalGroups(r.canonicalGroups)
  for (const [mod, list] of Object.entries(r.whitelist)) {
    console.log(`  · [${mod} whitelist] ${list.length} files`)
  }

  if (r.violations.length > 0) {
    if (process.env.COWORK_ALLOW_MULTI_MODULE === '1') {
      for (const v of r.violations) {
        console.warn(`\n⚠ commit 허용 (COWORK_ALLOW_MULTI_MODULE=1): ${v.message}`)
      }
      process.exit(0)
    }
    console.error('')
    console.error('❌ Cowork 협업 위반 (CLAUDE.md 규칙 21)')
    console.error('   다른 세션 작업물을 흡수했을 가능성:')
    for (const v of r.violations) {
      console.error(`   [${v.type}] ${v.message}`)
    }
    console.error('')
    console.error('   조치:')
    console.error('     1. git reset HEAD 로 staged 풀기')
    console.error('     2. 자기 영역만 명시적 add — 예:')
    console.error('        git add "app/(employees)/<자기 모듈>/"')
    console.error('     3. git status 로 staged 파일 확인 (다른 모듈/새 파일 X)')
    console.error('     4. 다시 commit — bare `git commit` 대신 `git commit <경로>` 권장')
    console.error('')
    console.error('   의도적인 cross-module commit 이라면:')
    console.error('     COWORK_ALLOW_MULTI_MODULE=1 git commit ...')
    process.exit(1)
  }

  console.log('\n✅ staged 가 단일 모듈 영역 — 통과')
  process.exit(0)
}

module.exports = {
  lint,
  lintCommit,
  moduleOf,
  canonicalModule,
  areaOf,
  classify,
  buildMultiModuleViolation,
  buildNewFileMixViolation,
  getStagedFiles,
  getCommitFiles,
  getStagedEntries,
  getCommitEntries,
}
