#!/usr/bin/env node
/**
 * cowork-init.js — 새 cowork 세션 초기화 (PR-COWORK 2026-05-09)
 *
 * 사용:
 *   npm run cowork:init
 *
 * 동작:
 *   1. health-check 실행 (자가 진단)
 *   2. core.hooksPath 를 repo-tracked 경로로 설정
 *      (harness-engineering/git-hooks/)
 *   3. hook 파일 executable 권한 보장
 *   4. 결과 보고
 *
 * 효과:
 *   - 모든 cowork 세션이 같은 hooks 사용 (git pull 로 자동 갱신)
 *   - .git/hooks/ 에 별도 설치 불필요
 *   - 다른 세션의 hooksPath 오염 자동 차단
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const REPO_HOOKS_REL = 'harness-engineering/git-hooks'
const REPO_HOOKS_ABS = path.join(ROOT, REPO_HOOKS_REL)

console.log(`cowork-init`)
console.log(`  ROOT: ${ROOT}`)
console.log('')

// 1. repo-tracked hooks 존재 확인
console.log('▸ repo-tracked hooks 확인')
let hooksOk = true
for (const hookName of ['pre-commit', 'pre-push']) {
  const hp = path.join(REPO_HOOKS_ABS, hookName)
  if (!fs.existsSync(hp)) {
    console.error(`  ❌ ${hookName} 미존재: ${hp}`)
    hooksOk = false
    continue
  }
  // executable 권한 보장
  const stat = fs.statSync(hp)
  if ((stat.mode & 0o111) === 0) {
    fs.chmodSync(hp, 0o755)
    console.log(`  ✓ ${hookName} executable 권한 부여 (chmod 755)`)
  } else {
    console.log(`  ✓ ${hookName} 정상`)
  }
}
if (!hooksOk) {
  console.error('\n❌ repo-tracked hooks 미존재 — git pull 후 재시도')
  process.exit(1)
}

// 2. core.hooksPath 설정
console.log('\n▸ core.hooksPath 설정')
let currentHooksPath = ''
try {
  currentHooksPath = execSync('git config --get core.hooksPath', { cwd: ROOT, encoding: 'utf-8' }).trim()
} catch {
  currentHooksPath = ''
}
if (currentHooksPath === REPO_HOOKS_REL) {
  console.log(`  ✓ 이미 정상 설정됨 (${REPO_HOOKS_REL})`)
} else {
  if (currentHooksPath) {
    console.log(`  현재: ${currentHooksPath} → 변경`)
  }
  execSync(`git config core.hooksPath ${REPO_HOOKS_REL}`, { cwd: ROOT })
  console.log(`  ✅ core.hooksPath = ${REPO_HOOKS_REL}`)
}

// 3. health-check 실행
console.log('\n▸ health-check 실행')
try {
  execSync('node harness-engineering/scripts/cowork-health-check.js --fix', {
    cwd: ROOT,
    stdio: 'inherit',
  })
} catch {
  // health-check 가 warning 으로 exit !=0 가능 — 계속 진행
}

console.log('\n═══ 초기화 완료 ═══')
console.log('  ✅ 모든 commit/push 가 cowork-staging-lint 자동 검증')
console.log('  ✅ 다른 세션과 같은 hooks 사용 (git pull 로 자동 갱신)')
console.log('')
console.log('  TIP: 다른 세션도 git pull 후 npm run cowork:init 권장')
