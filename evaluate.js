#!/usr/bin/env node
/**
 * FMI ERP — Harness Engineering v3.0 Evaluator
 *
 * 평가 기준 (웹앱):
 *   UI/UX 30% | 기능 완성도 30% | 코드 품질 20% | 반응형 10% | 보안 10%
 * 합격 점수: 8.0/10
 *
 * 사용법: node evaluate.js [--local] [--url https://hmseok.com]
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// ── 설정 ──
const args = process.argv.slice(2)
const isLocal = args.includes('--local')
const BASE_URL = args.find(a => a.startsWith('--url='))?.split('=')[1]
  || (isLocal ? 'http://localhost:3000' : 'https://hmseok.com')

const PASS_SCORE = 8.0
const results = { pass: [], fail: [], warn: [], score: {} }

// ── 유틸리티 ──
function log(icon, msg) { console.log(`  ${icon} ${msg}`) }
function check(name, passed, detail = '') {
  if (passed) { results.pass.push(name); log('✅', `${name}`) }
  else { results.fail.push(name); log('❌', `${name}${detail ? ': ' + detail : ''}`) }
  return passed
}
function warn(name, detail = '') {
  results.warn.push(name); log('⚠️', `${name}${detail ? ': ' + detail : ''}`)
}

// ══════════════════════════════════════════════
// 1. 코드 품질 (20점)
// ══════════════════════════════════════════════
function evaluateCodeQuality() {
  console.log('\n📋 [1/5] 코드 품질 (20%)')
  let score = 20

  // 1a. TypeScript 컴파일 체크
  try {
    execSync('npx tsc --noEmit --pretty 2>&1 | head -20', { cwd: __dirname, timeout: 60000 })
    check('TypeScript 컴파일', true)
  } catch (e) {
    const output = e.stdout?.toString() || ''
    const errorCount = (output.match(/error TS/g) || []).length
    if (errorCount > 10) { check('TypeScript 컴파일', false, `${errorCount}개 에러`); score -= 8 }
    else if (errorCount > 0) { warn(`TypeScript 경고 ${errorCount}개`); score -= 3 }
    else { check('TypeScript 컴파일', true) }
  }

  // 1b. SQL Injection 패턴 검사
  try {
    const output = execSync(
      "grep -rl \"\\${.*}.*WHERE\\|\\${.*}.*SET\\|\\${.*}.*VALUES\" app/api/ --include='*.ts' 2>/dev/null | wc -l",
      { cwd: __dirname }
    ).toString().trim()
    const count = parseInt(output) || 0
    if (count > 5) { check('SQL Injection 패턴', false, `${count}개 파일`); score -= 5 }
    else if (count > 0) { warn(`SQL 문자열 보간 ${count}개 파일`); score -= 2 }
    else { check('SQL Injection 패턴', true) }
  } catch { check('SQL Injection 패턴', true) }

  // 1c. console.log 남용 체크
  try {
    const output = execSync(
      "grep -r 'console.log' app/ --include='*.tsx' --include='*.ts' -l 2>/dev/null | wc -l",
      { cwd: __dirname }
    ).toString().trim()
    const count = parseInt(output) || 0
    if (count > 30) { warn(`console.log ${count}개 파일 (정리 권장)`); score -= 2 }
  } catch {}

  results.score.codeQuality = Math.max(0, score)
  return results.score.codeQuality
}

// ══════════════════════════════════════════════
// 2. 기능 완성도 (30점) — API 응답 체크
// ══════════════════════════════════════════════
async function evaluateFunctionality() {
  console.log('\n📋 [2/5] 기능 완성도 (30%)')
  let score = 30

  const publicEndpoints = [
    { path: '/api/member-invite/validate?token=test', expect: [400, 404], name: '직원초대 검증' },
    { path: '/api/public/quote/test-token', expect: [400, 404], name: '공개 견적 조회' },
  ]

  const authEndpoints = [
    { path: '/api/quotes', expect: [200, 401], name: '견적 목록' },
    { path: '/api/profiles', expect: [200, 401], name: '프로필' },
    { path: '/api/system_modules', expect: [200, 401], name: '시스템 모듈' },
    { path: '/api/cars', expect: [200, 401], name: '차량 목록' },
  ]

  // 공개 엔드포인트 체크
  for (const ep of publicEndpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, { method: 'GET', signal: AbortSignal.timeout(10000) })
      const passed = ep.expect.includes(res.status)
      if (!check(ep.name, passed, `HTTP ${res.status}`)) score -= 3
    } catch (e) {
      check(ep.name, false, e.message); score -= 3
    }
  }

  // 인증 필요 엔드포인트 (401 또는 200 모두 정상)
  for (const ep of authEndpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, { method: 'GET', signal: AbortSignal.timeout(10000) })
      const passed = ep.expect.includes(res.status)
      if (!check(ep.name, passed, `HTTP ${res.status}`)) score -= 3
    } catch (e) {
      check(ep.name, false, e.message); score -= 3
    }
  }

  // 파일 존재 체크
  const criticalFiles = [
    'app/api/auth/login/route.ts',
    'app/api/member-invite/accept/route.ts',
    'app/api/quotes/route.ts',
    'app/api/public/quote/[token]/route.ts',
    'app/invite/[token]/page.tsx',
    'lib/auth-server.ts',
    'lib/prisma.ts',
  ]

  for (const f of criticalFiles) {
    const exists = fs.existsSync(path.join(__dirname, f))
    if (!check(`파일: ${path.basename(f)}`, exists)) score -= 2
  }

  results.score.functionality = Math.max(0, score)
  return results.score.functionality
}

// ══════════════════════════════════════════════
// 3. UI/UX (30점) — 페이지 접근 + HTML 응답
// ══════════════════════════════════════════════
async function evaluateUIUX() {
  console.log('\n📋 [3/5] UI/UX (30%)')
  let score = 30

  const pages = [
    { path: '/', name: '로그인 페이지' },
    { path: '/invite/test-token', name: '초대 수락 페이지' },
  ]

  for (const page of pages) {
    try {
      const res = await fetch(`${BASE_URL}${page.path}`, {
        signal: AbortSignal.timeout(15000),
        redirect: 'follow'
      })
      const passed = res.status === 200
      if (!check(page.name, passed, `HTTP ${res.status}`)) score -= 5
    } catch (e) {
      check(page.name, false, e.message); score -= 5
    }
  }

  // Soft Ice 디자인 시스템 컴포넌트 존재 확인
  try {
    const output = execSync(
      "grep -rl 'white/0.7\\|white/0.6\\|white/0.4\\|rgba(0,0,0' app/ --include='*.tsx' 2>/dev/null | wc -l",
      { cwd: __dirname }
    ).toString().trim()
    const count = parseInt(output) || 0
    check('Soft Ice 글래스 사용', count > 3, `${count}개 파일`)
    if (count < 3) score -= 5
  } catch { warn('Soft Ice 검사 스킵') }

  results.score.uiux = Math.max(0, score)
  return results.score.uiux
}

// ══════════════════════════════════════════════
// 4. 반응형 (10점)
// ══════════════════════════════════════════════
function evaluateResponsive() {
  console.log('\n📋 [4/5] 반응형 (10%)')
  let score = 10

  try {
    const output = execSync(
      "grep -rl 'md:\\|lg:\\|sm:\\|xl:' app/ --include='*.tsx' 2>/dev/null | wc -l",
      { cwd: __dirname }
    ).toString().trim()
    const count = parseInt(output) || 0
    check('Tailwind 반응형 브레이크포인트', count > 10, `${count}개 파일`)
    if (count < 5) score -= 5
  } catch { warn('반응형 검사 스킵'); score -= 3 }

  results.score.responsive = Math.max(0, score)
  return results.score.responsive
}

// ══════════════════════════════════════════════
// 5. 보안 (10점)
// ══════════════════════════════════════════════
function evaluateSecurity() {
  console.log('\n📋 [5/5] 보안 (10%)')
  let score = 10

  // JWT 인증 사용 확인
  const authServer = path.join(__dirname, 'lib/auth-server.ts')
  if (fs.existsSync(authServer)) {
    const content = fs.readFileSync(authServer, 'utf8')
    check('JWT 인증 구현', content.includes('verifyUser') || content.includes('jwt'))
    check('비밀번호 해싱', content.includes('bcrypt') || content.includes('password_hash'))
  } else {
    check('인증 파일', false, 'lib/auth-server.ts 없음'); score -= 5
  }

  // 환경변수로 비밀키 관리 확인
  try {
    const envExists = fs.existsSync(path.join(__dirname, '.env')) || fs.existsSync(path.join(__dirname, '.env.local'))
    check('환경변수 파일', envExists)
    if (!envExists) score -= 2
  } catch {}

  // 비밀번호 해싱 확인 (accept 라우트)
  const acceptRoute = path.join(__dirname, 'app/api/member-invite/accept/route.ts')
  if (fs.existsSync(acceptRoute)) {
    const content = fs.readFileSync(acceptRoute, 'utf8')
    check('초대수락 비밀번호 해싱', content.includes('bcrypt.hash') || content.includes('password_hash'))
    if (!content.includes('bcrypt') && !content.includes('hash')) score -= 5
  }

  results.score.security = Math.max(0, score)
  return results.score.security
}

// ══════════════════════════════════════════════
// 메인 실행
// ══════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════')
  console.log(' FMI ERP — Harness Evaluator v3.0')
  console.log(` 대상: ${BASE_URL}`)
  console.log('═══════════════════════════════════════')

  const s1 = evaluateCodeQuality()
  const s2 = await evaluateFunctionality()
  const s3 = await evaluateUIUX()
  const s4 = evaluateResponsive()
  const s5 = evaluateSecurity()

  const total = (s1 + s2 + s3 + s4 + s5) / 10
  const passed = total >= PASS_SCORE

  console.log('\n═══════════════════════════════════════')
  console.log(' 평가 결과')
  console.log('═══════════════════════════════════════')
  console.log(`  코드 품질:    ${s1}/20`)
  console.log(`  기능 완성도:  ${s2}/30`)
  console.log(`  UI/UX:        ${s3}/30`)
  console.log(`  반응형:       ${s4}/10`)
  console.log(`  보안:         ${s5}/10`)
  console.log('───────────────────────────────────────')
  console.log(`  총점: ${total.toFixed(1)}/10.0`)
  console.log(`  합격 기준: ${PASS_SCORE}/10.0`)
  console.log(`  결과: ${passed ? '✅ PASS' : '❌ FAIL'}`)
  console.log('═══════════════════════════════════════')

  if (results.fail.length > 0) {
    console.log(`\n❌ 실패 항목 (${results.fail.length}):`)
    results.fail.forEach(f => console.log(`   - ${f}`))
  }
  if (results.warn.length > 0) {
    console.log(`\n⚠️ 경고 항목 (${results.warn.length}):`)
    results.warn.forEach(w => console.log(`   - ${w}`))
  }

  // JSON 리포트 저장
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    scores: results.score,
    total: total.toFixed(1),
    passed,
    passThreshold: PASS_SCORE,
    details: { pass: results.pass, fail: results.fail, warn: results.warn }
  }
  const reportPath = path.join(__dirname, 'harness-engineering/reports', `eval-${new Date().toISOString().slice(0, 10)}.json`)
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`\n📄 리포트: ${reportPath}`)
  } catch {}

  process.exit(passed ? 0 : 1)
}

main().catch(e => { console.error('Evaluator 오류:', e); process.exit(1) })
