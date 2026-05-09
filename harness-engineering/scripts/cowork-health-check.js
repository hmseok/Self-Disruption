#!/usr/bin/env node
/**
 * cowork-health-check.js — Cowork 세션 자가 진단 (PR-COWORK, 2026-05-09)
 *
 * 사용:
 *   node harness-engineering/scripts/cowork-health-check.js
 *   node harness-engineering/scripts/cowork-health-check.js --fix
 *
 * 점검 항목:
 *   1. core.hooksPath — 다른 세션 경로 가리키는지
 *   2. .git/hooks/ — pre-commit / pre-push 존재 + executable
 *   3. .git/index.lock — stale lock (>5분 경과 시 경고)
 *   4. .git/HEAD.lock — stale lock
 *   5. cowork-staging-lint — 스크립트 존재
 *
 * --fix 옵션:
 *   - 잘못된 hooksPath 자동 unset
 *   - stale lock 자동 제거 (>5분)
 *   - hook executable 권한 자동 부여
 *
 * 회귀 케이스: 2026-05-09-cowork-hooks-path-broken.md
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const args = new Set(process.argv.slice(2))
const FIX_MODE = args.has('--fix')

let warnCount = 0
let errCount = 0
let fixCount = 0

function check(label, ok, detail, fixFn) {
  if (ok) {
    console.log(`  ✓ ${label}`)
    return
  }
  warnCount++
  console.warn(`  ⚠ ${label}`)
  if (detail) console.warn(`     ${detail}`)
  if (fixFn && FIX_MODE) {
    try {
      const r = fixFn()
      if (r === false) errCount++
      else fixCount++
    } catch (e) {
      console.error(`     ❌ 자동 수정 실패: ${e.message}`)
      errCount++
    }
  }
}

console.log(`cowork-health-check (${FIX_MODE ? 'FIX' : 'CHECK'} mode)`)
console.log(`  ROOT: ${ROOT}`)
console.log('')

// 1. core.hooksPath
//    유효한 path 목록 (둘 중 하나면 OK):
//      a. 미설정 (기본 .git/hooks/ 사용)
//      b. ROOT/.git/hooks (절대 경로 명시)
//      c. harness-engineering/git-hooks (repo-tracked — cowork-init 가 설정)
console.log('▸ git config — core.hooksPath')
let hooksPathRaw = ''
try {
  hooksPathRaw = execSync('git config --get core.hooksPath', { cwd: ROOT, encoding: 'utf-8' }).trim()
} catch {
  hooksPathRaw = ''
}
const validPaths = [
  '',                                                 // (a) 미설정
  path.join(ROOT, '.git/hooks'),                      // (b) 본 세션 .git/hooks
  path.join(ROOT, 'harness-engineering/git-hooks'),   // (c) repo-tracked
]
if (!hooksPathRaw) {
  check('core.hooksPath 미설정 (기본 .git/hooks 사용)', true)
} else {
  const actualHooksPath = path.resolve(ROOT, hooksPathRaw)
  const isValid = validPaths.some(vp => vp && actualHooksPath === vp)
  if (isValid) {
    const isRepoTracked = actualHooksPath === path.join(ROOT, 'harness-engineering/git-hooks')
    check(`core.hooksPath 정상${isRepoTracked ? ' (repo-tracked)' : ''}`, true)
  } else {
    check(
      `core.hooksPath 잘못된 경로 가리킴`,
      false,
      `현재: ${hooksPathRaw}\n     허용: 미설정 / .git/hooks / harness-engineering/git-hooks`,
      () => {
        execSync('git config --unset core.hooksPath', { cwd: ROOT })
        console.log('     ✅ unset 완료 (기본 .git/hooks 사용)')
      },
    )
  }
}

// 2. hook 파일 존재 + executable
console.log('\n▸ .git/hooks/ — pre-commit / pre-push')
const HOOK_DIR = path.join(ROOT, '.git/hooks')
for (const hookName of ['pre-commit', 'pre-push']) {
  const hp = path.join(HOOK_DIR, hookName)
  if (!fs.existsSync(hp)) {
    check(`${hookName} 미설치`, false,
      `npm run harness:install-hook 실행 권장`,
      () => {
        console.warn('     ⚠ install-hook.js 호출 권장 (자동 설치 skip — 의도적)')
        return false
      })
    continue
  }
  const stat = fs.statSync(hp)
  const isExec = (stat.mode & 0o111) !== 0
  if (!isExec) {
    check(`${hookName} executable 권한 없음`, false,
      `mode: ${(stat.mode & 0o777).toString(8)}`,
      () => {
        fs.chmodSync(hp, 0o755)
        console.log('     ✅ chmod 755 완료')
      })
  } else {
    check(`${hookName} 정상 (executable)`, true)
  }
}

// 3. stale locks
console.log('\n▸ .git/*.lock — stale lock 검출')
const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5분
for (const lockName of ['index.lock', 'HEAD.lock']) {
  const lp = path.join(ROOT, '.git', lockName)
  if (!fs.existsSync(lp)) {
    check(`${lockName} 없음`, true)
    continue
  }
  const stat = fs.statSync(lp)
  const ageMs = Date.now() - stat.mtimeMs
  const ageMin = Math.round(ageMs / 1000 / 60)
  if (ageMs > STALE_THRESHOLD_MS) {
    check(
      `${lockName} stale (${ageMin}분 경과)`,
      false,
      `다른 세션 crash 가능성 — 자동 제거 권장`,
      () => {
        fs.unlinkSync(lp)
        console.log(`     ✅ ${lockName} 제거 완료`)
      },
    )
  } else {
    check(`${lockName} 존재 (${ageMin}분 경과 — 다른 세션 작업 중일 가능성)`, false,
      `5분 미만 — 잠시 대기 권장 (자동 제거 X)`)
  }
}

// 4. cowork-staging-lint 스크립트 존재
console.log('\n▸ harness-engineering/scripts/cowork-staging-lint.js')
const lintPath = path.join(ROOT, 'harness-engineering/scripts/cowork-staging-lint.js')
check('cowork-staging-lint.js 존재', fs.existsSync(lintPath))

// 5. 다른 cowork 세션 감지 (정보성)
console.log('\n▸ 다른 cowork 세션 감지 (정보성)')
try {
  const sessionsDir = '/sessions'
  if (fs.existsSync(sessionsDir)) {
    const sessions = fs.readdirSync(sessionsDir).filter(s => !s.startsWith('.'))
    const myMatch = ROOT.match(/\/sessions\/([^/]+)/)
    const me = myMatch ? myMatch[1] : null
    const others = sessions.filter(s => s !== me)
    if (others.length > 0) {
      console.log(`  ℹ 다른 세션 ${others.length}개 감지: ${others.slice(0, 3).join(', ')}${others.length > 3 ? '...' : ''}`)
      console.log(`  ℹ 본 세션: ${me || 'unknown'}`)
      console.log(`  ℹ Rule 21 — staging 시 자기 모듈만 명시 add`)
    } else {
      console.log(`  ✓ 다른 세션 없음`)
    }
  }
} catch {}

console.log('\n═══ 결과 ═══')
console.log(`  경고: ${warnCount}, 자동 수정: ${fixCount}, 실패: ${errCount}`)
if (warnCount === 0) {
  console.log('  ✅ 모든 점검 통과')
  process.exit(0)
}
if (FIX_MODE && errCount === 0) {
  console.log(`  ✅ ${fixCount}건 자동 수정 — 정상화 완료`)
  process.exit(0)
}
if (!FIX_MODE) {
  console.log(`  ⚠ ${warnCount}건 경고 — npm run cowork:fix 로 자동 수정 가능`)
}
process.exit(warnCount > 0 && !FIX_MODE ? 1 : 0)
