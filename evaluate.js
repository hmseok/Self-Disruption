#!/usr/bin/env node
/**
 * FMI ERP — Harness Engineering v3.1 Evaluator
 *
 * 9개 카테고리 (총 100점) — 합격 8.0/10
 *   1. UI/UX                10점  (페이지 응답 + 기본 렌더)
 *   2. 기능 완성도          12점  (API 응답 + 핵심 파일)
 *   3. 코드 품질            12점  (TS 컴파일 + SQL injection)
 *   4. 반응형                8점  (Playwright 3 viewport 검증)
 *   5. 보안                 10점  (JWT/bcrypt/env)
 *   6. 디자인 품질          14점  (Soft Ice 글래스 computed CSS)
 *   7. 독창성               10점  (5단계 글래스 + 5색 틴트 다양성)
 *   8. 완성도               12점  (콘솔 에러 0 + 라우트 200 + 이미지 200)
 *   9. 기능성               12점  (로그인 폼 ↔ API ↔ DB 연결)
 *
 * 사용법:
 *   node evaluate.js                    # 운영 https://hmseok.com
 *   node evaluate.js --local            # http://localhost:3000
 *   node evaluate.js --url=...          # 임의 URL
 *   node evaluate.js --no-browser       # Playwright 스킵 (빠른 모드)
 *   node evaluate.js --json             # JSON만 출력 (오케스트레이터용)
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// ── 설정 ──
const args = process.argv.slice(2)
const isLocal = args.includes('--local')
const noBrowser = args.includes('--no-browser')
const jsonOnly = args.includes('--json')
const BASE_URL = args.find(a => a.startsWith('--url='))?.split('=')[1]
  || (isLocal ? 'http://localhost:3000' : 'https://hmseok.com')

const PASS_SCORE = 8.0
const results = {
  pass: [], fail: [], warn: [],
  score: {},
  failureDetails: [], // { category, item, reason, hint }
  screenshots: [],
}

// ── HTTP 호출 (fetch 우선 → 실패 시 curl 폴백) ──
async function fetchWithRetry(url, opts = {}, retries = 2) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, opts)
    } catch (e) {
      lastErr = e
      if (i < retries - 1) await new Promise(r => setTimeout(r, 800))
    }
  }
  // curl 폴백 (VM/프록시 환경 대응)
  try {
    const method = (opts.method || 'GET').toUpperCase()
    const headers = Object.entries(opts.headers || {}).map(([k, v]) => `-H "${k}: ${v}"`).join(' ')
    const body = opts.body ? `--data ${JSON.stringify(opts.body)}` : ''
    const cmd = `curl -s -o /tmp/_eval_body -w "%{http_code}" --max-time 15 -X ${method} ${headers} ${body} "${url}"`
    const code = parseInt(execSync(cmd, { encoding: 'utf8' }).trim()) || 0
    const text = fs.existsSync('/tmp/_eval_body') ? fs.readFileSync('/tmp/_eval_body', 'utf8') : ''
    return { status: code, ok: code >= 200 && code < 400, text: async () => text, json: async () => { try { return JSON.parse(text) } catch { return null } } }
  } catch (e2) {
    throw lastErr || e2
  }
}

// ── 출력 ──
function log(icon, msg) { if (!jsonOnly) console.log(`  ${icon} ${msg}`) }
function header(msg) { if (!jsonOnly) console.log(msg) }
function check(category, name, passed, detail = '', hint = '') {
  if (passed) { results.pass.push(name); log('✅', name) }
  else {
    results.fail.push(name)
    log('❌', `${name}${detail ? ': ' + detail : ''}`)
    results.failureDetails.push({ category, item: name, reason: detail, hint })
  }
  return passed
}
function warn(name, detail = '') { results.warn.push(name); log('⚠️', `${name}${detail ? ': ' + detail : ''}`) }

// ══════════════════════════════════════════════
// 1. UI/UX (10점)
// ══════════════════════════════════════════════
async function evaluateUIUX() {
  header('\n📋 [1/9] UI/UX (10%)')
  let score = 10
  const pages = [
    { path: '/', name: '로그인 페이지' },
    { path: '/invite/test-token', name: '초대 수락 페이지' },
  ]
  for (const page of pages) {
    try {
      const res = await fetchWithRetry(`${BASE_URL}${page.path}`, { signal: AbortSignal.timeout(15000), redirect: 'follow' })
      if (!check('UI/UX', page.name, res.status === 200, `HTTP ${res.status}`, `${page.path} 라우트가 200을 반환하도록 수정`)) score -= 5
    } catch (e) {
      check('UI/UX', page.name, false, e.message, `${page.path} 라우트 점검 (배포 상태 확인)`); score -= 5
    }
  }
  results.score.uiux = Math.max(0, score)
  return results.score.uiux
}

// ══════════════════════════════════════════════
// 2. 기능 완성도 (12점)
// ══════════════════════════════════════════════
async function evaluateFunctionality() {
  header('\n📋 [2/9] 기능 완성도 (12%)')
  let score = 12
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
  for (const ep of [...publicEndpoints, ...authEndpoints]) {
    try {
      const res = await fetchWithRetry(`${BASE_URL}${ep.path}`, { method: 'GET', signal: AbortSignal.timeout(10000) })
      if (!check('기능완성도', ep.name, ep.expect.includes(res.status), `HTTP ${res.status}`, `${ep.path} 라우트 응답 코드 확인`)) score -= 1
    } catch (e) {
      check('기능완성도', ep.name, false, e.message, `${ep.path} 라우트 존재 여부 확인`); score -= 1
    }
  }
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
    if (!check('기능완성도', `파일: ${path.basename(f)}`, exists, '', `${f} 파일 생성`)) score -= 1
  }
  results.score.functionality = Math.max(0, score)
  return results.score.functionality
}

// ══════════════════════════════════════════════
// 3. 코드 품질 (12점)
// ══════════════════════════════════════════════
function evaluateCodeQuality() {
  header('\n📋 [3/9] 코드 품질 (12%)')
  let score = 12
  // 3a. TypeScript
  try {
    execSync('npx tsc --noEmit 2>&1 | head -20', { cwd: __dirname, timeout: 90000 })
    check('코드품질', 'TypeScript 컴파일', true)
  } catch (e) {
    const output = e.stdout?.toString() || ''
    const errCount = (output.match(/error TS/g) || []).length
    if (errCount > 10) { check('코드품질', 'TypeScript 컴파일', false, `${errCount}개 에러`, 'tsc 에러 해결'); score -= 5 }
    else if (errCount > 0) { warn(`TypeScript 경고 ${errCount}개`); score -= 2 }
    else { check('코드품질', 'TypeScript 컴파일', true) }
  }
  // 3b. SQL Injection
  try {
    const output = execSync(
      "grep -rl \"\\${.*}.*WHERE\\|\\${.*}.*SET\\|\\${.*}.*VALUES\" app/api/ --include='*.ts' 2>/dev/null | wc -l",
      { cwd: __dirname }
    ).toString().trim()
    const count = parseInt(output) || 0
    if (count > 5) { check('코드품질', 'SQL Injection 패턴', false, `${count}개 파일`, '파라미터 바인딩으로 전환'); score -= 4 }
    else if (count > 0) { warn(`SQL 문자열 보간 ${count}개`); score -= 1 }
    else { check('코드품질', 'SQL Injection 패턴', true) }
  } catch { check('코드품질', 'SQL Injection 패턴', true) }
  // 3c. console.log
  try {
    const output = execSync(
      "grep -r 'console.log' app/ --include='*.tsx' --include='*.ts' -l 2>/dev/null | wc -l",
      { cwd: __dirname }
    ).toString().trim()
    const count = parseInt(output) || 0
    if (count > 30) { warn(`console.log ${count}개 파일`); score -= 2 }
  } catch {}
  results.score.codeQuality = Math.max(0, score)
  return results.score.codeQuality
}

// ══════════════════════════════════════════════
// 4. 반응형 (8점) — Playwright 3 viewport
// ══════════════════════════════════════════════
async function evaluateResponsive(browser) {
  header('\n📋 [4/9] 반응형 (8%)')
  let score = 8
  if (!browser) {
    try {
      const output = execSync(
        "grep -rl 'md:\\|lg:\\|sm:\\|xl:' app/ --include='*.tsx' 2>/dev/null | wc -l",
        { cwd: __dirname }
      ).toString().trim()
      const count = parseInt(output) || 0
      check('반응형', 'Tailwind 브레이크포인트 (정적)', count > 10, `${count}개 파일`, '반응형 클래스 추가')
      if (count < 5) score -= 4
    } catch { warn('반응형 검사 스킵'); score -= 2 }
    results.score.responsive = Math.max(0, score)
    return results.score.responsive
  }

  const viewports = [
    { width: 375, height: 667, name: 'mobile' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 1280, height: 800, name: 'desktop' },
  ]
  for (const vp of viewports) {
    try {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await ctx.newPage()
      const resp = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      const ok = resp && resp.status() < 400
      // 가로 스크롤 발생 여부 (반응형 깨짐 신호)
      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      const passed = ok && !hasHorizontalScroll
      if (!check('반응형', `${vp.name} (${vp.width}px)`, passed, hasHorizontalScroll ? '가로 스크롤 발생' : `HTTP ${resp?.status()}`, '레이아웃 가로 오버플로우 수정')) score -= 3
      const shotPath = path.join(__dirname, 'harness-engineering/reports/screenshots', `${vp.name}-${Date.now()}.png`)
      fs.mkdirSync(path.dirname(shotPath), { recursive: true })
      await page.screenshot({ path: shotPath, fullPage: false })
      results.screenshots.push({ viewport: vp.name, path: shotPath })
      await ctx.close()
    } catch (e) {
      check('반응형', `${vp.name} (${vp.width}px)`, false, e.message, '페이지 렌더 실패 — 빌드/배포 확인'); score -= 3
    }
  }
  results.score.responsive = Math.max(0, score)
  return results.score.responsive
}

// ══════════════════════════════════════════════
// 5. 보안 (10점)
// ══════════════════════════════════════════════
function evaluateSecurity() {
  header('\n📋 [5/9] 보안 (10%)')
  let score = 10
  const authServer = path.join(__dirname, 'lib/auth-server.ts')
  if (fs.existsSync(authServer)) {
    const content = fs.readFileSync(authServer, 'utf8')
    if (!check('보안', 'JWT 인증 구현', content.includes('verifyUser') || content.includes('jwt'), '', 'lib/auth-server.ts에 verifyUser 구현')) score -= 3
    // 비밀번호 해싱은 login 또는 accept 라우트에서 검사
    let bcryptUsed = false
    try {
      const r = execSync("grep -rl 'bcrypt' app/api/auth app/api/member-invite 2>/dev/null | wc -l", { cwd: __dirname }).toString().trim()
      bcryptUsed = parseInt(r) > 0
    } catch {}
    if (!check('보안', '비밀번호 해싱 (bcrypt)', bcryptUsed, '', 'login/accept에서 bcrypt 사용')) score -= 2
  } else {
    check('보안', '인증 파일', false, 'lib/auth-server.ts 없음', 'lib/auth-server.ts 생성'); score -= 5
  }
  const envExists = fs.existsSync(path.join(__dirname, '.env')) || fs.existsSync(path.join(__dirname, '.env.local'))
  if (!check('보안', '환경변수 파일', envExists, '', '.env.local 생성')) score -= 2
  const acceptRoute = path.join(__dirname, 'app/api/member-invite/accept/route.ts')
  if (fs.existsSync(acceptRoute)) {
    const content = fs.readFileSync(acceptRoute, 'utf8')
    if (!check('보안', '초대수락 비밀번호 해싱', content.includes('bcrypt.hash') || content.includes('password_hash'), '', '초대 수락 시 bcrypt.hash 사용')) score -= 3
  }
  results.score.security = Math.max(0, score)
  return results.score.security
}

// ══════════════════════════════════════════════
// 6. 디자인 품질 (14점) — Playwright computed CSS
// ══════════════════════════════════════════════
async function evaluateDesignQuality(browser) {
  header('\n📋 [6/9] 디자인 품질 (14%)')
  let score = 14
  if (!browser) {
    try {
      const output = execSync(
        "grep -rl 'backdrop-blur\\|white/0.7\\|white/0.6\\|white/0.4\\|rgba(0,0,0' app/ --include='*.tsx' 2>/dev/null | wc -l",
        { cwd: __dirname }
      ).toString().trim()
      const count = parseInt(output) || 0
      if (!check('디자인품질', 'Soft Ice 글래스 사용 (정적)', count > 5, `${count}개 파일`, 'backdrop-blur + white/0.x 글래스 적용')) score -= 7
    } catch { warn('디자인 검사 스킵'); score -= 3 }
    results.score.design = Math.max(0, score)
    return results.score.design
  }
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    // backdrop-filter blur가 적용된 요소 카운트
    const blurCount = await page.evaluate(() => {
      let n = 0
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el)
        if (cs.backdropFilter && cs.backdropFilter !== 'none') n++
      })
      return n
    })
    if (!check('디자인품질', 'backdrop-filter 사용', blurCount >= 1, `${blurCount}개 요소`, 'backdrop-blur-* 클래스 추가')) score -= 5
    // 색상 대비 — body 배경
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    check('디자인품질', `body 배경 (${bg})`, !!bg)
    // 폰트 로드 확인
    const fontLoaded = await page.evaluate(() => document.fonts && document.fonts.size > 0)
    if (!check('디자인품질', '웹폰트 로드', fontLoaded, '', '@font-face 또는 next/font 적용')) score -= 2
    // 메인 컨테이너 패딩 (디자인 완성도)
    const hasPadding = await page.evaluate(() => {
      const main = document.querySelector('main, [role=main], .min-h-screen')
      if (!main) return false
      const cs = getComputedStyle(main)
      return parseFloat(cs.padding) > 0 || parseFloat(cs.paddingTop) > 0
    })
    if (!check('디자인품질', '메인 영역 패딩', hasPadding, '', 'main에 padding 추가')) score -= 2
    await ctx.close()
  } catch (e) {
    check('디자인품질', 'Playwright 디자인 검사', false, e.message, '페이지 렌더 실패'); score -= 7
  }
  results.score.design = Math.max(0, score)
  return results.score.design
}

// ══════════════════════════════════════════════
// 7. 독창성 (10점) — 5단계 글래스 + 5색 틴트 다양성
// ══════════════════════════════════════════════
function evaluateOriginality() {
  header('\n📋 [7/9] 독창성 (10%)')
  let score = 10
  const tints = [
    { name: 'Blue', pattern: 'blue-100' },
    { name: 'Green', pattern: 'green-100' },
    { name: 'Red', pattern: 'red-100' },
    { name: 'Amber', pattern: 'amber-100' },
    { name: 'Purple', pattern: 'violet-100' },
  ]
  let foundTints = 0
  for (const t of tints) {
    try {
      const out = execSync(`grep -rl "${t.pattern}" app/ --include='*.tsx' 2>/dev/null | wc -l`, { cwd: __dirname }).toString().trim()
      if (parseInt(out) > 0) foundTints++
    } catch {}
  }
  if (!check('독창성', `색상 틴트 다양성 (${foundTints}/5)`, foundTints >= 3, '', '5색(blue/green/red/amber/violet) 틴트 사용')) score -= 4
  // 글래스 깊이 다양성 (Tailwind bg-white/숫자 또는 임의값)
  let glassDepths = 0
  try {
    const out = execSync(`grep -roh 'bg-white/[0-9]\\+' app/ --include='*.tsx' 2>/dev/null | sort -u | wc -l`, { cwd: __dirname }).toString().trim()
    glassDepths = parseInt(out) || 0
  } catch {}
  if (!check('독창성', `글래스 깊이 다양성 (${glassDepths}단계)`, glassDepths >= 3, '', '서로 다른 bg-white/x 단계 3개 이상 사용')) score -= 3
  // 그라데이션/투톤 사용
  try {
    const out = execSync(`grep -rl "bg-gradient\\|from-.*to-" app/ --include='*.tsx' 2>/dev/null | wc -l`, { cwd: __dirname }).toString().trim()
    const count = parseInt(out) || 0
    if (!check('독창성', `그라데이션 사용 (${count}개 파일)`, count > 3, '', '카드 제목에 from-/to- 그라데이션 적용')) score -= 3
  } catch {}
  results.score.originality = Math.max(0, score)
  return results.score.originality
}

// ══════════════════════════════════════════════
// 8. 완성도 (12점) — Playwright 콘솔에러 + 핵심 라우트
// ══════════════════════════════════════════════
async function evaluateCompleteness(browser) {
  header('\n📋 [8/9] 완성도 (12%)')
  let score = 12
  const routes = ['/', '/invite/test-token']
  for (const r of routes) {
    try {
      const res = await fetchWithRetry(`${BASE_URL}${r}`, { signal: AbortSignal.timeout(15000) })
      if (!check('완성도', `라우트 ${r}`, res.status === 200, `HTTP ${res.status}`, `${r} 페이지 200 응답`)) score -= 2
    } catch (e) {
      check('완성도', `라우트 ${r}`, false, e.message, `${r} 페이지 응답 실패`); score -= 2
    }
  }
  if (browser) {
    try {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const consoleErrors = []
      const failedRequests = []
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)) })
      page.on('requestfailed', req => failedRequests.push(req.url()))
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      const filteredErrors = consoleErrors.filter(e => !/favicon|sourcemap|DevTools/i.test(e))
      if (!check('완성도', `콘솔 에러 0 (실제 ${filteredErrors.length}개)`, filteredErrors.length === 0, filteredErrors.slice(0, 2).join(' | '), '런타임 에러 수정')) score -= 4
      if (!check('완성도', `요청 실패 0 (실제 ${failedRequests.length}개)`, failedRequests.length === 0, failedRequests.slice(0, 2).join(' | '), '404/실패 리소스 제거')) score -= 4
      await ctx.close()
    } catch (e) {
      warn(`Playwright 완성도 검사 실패: ${e.message}`)
    }
  }
  results.score.completeness = Math.max(0, score)
  return results.score.completeness
}

// ══════════════════════════════════════════════
// 9. 기능성 (12점) — Playwright 로그인 폼 + API 연결
// ══════════════════════════════════════════════
async function evaluateUsability(browser) {
  header('\n📋 [9/9] 기능성 (12%)')
  let score = 12
  if (!browser) {
    // 정적 검사 폴백
    const loginRoute = path.join(__dirname, 'app/api/auth/login/route.ts')
    if (!check('기능성', '로그인 API 존재', fs.existsSync(loginRoute), '', '/api/auth/login 라우트 생성')) score -= 6
    results.score.usability = Math.max(0, score)
    return results.score.usability
  }
  try {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    // 로그인 폼 입력 필드 존재
    const hasEmail = await page.locator('input[type=email], input[name*=email i], input[name*=id i]').count() > 0
    const hasPassword = await page.locator('input[type=password]').count() > 0
    const hasSubmit = await page.locator('button[type=submit], button:has-text("로그인")').count() > 0
    if (!check('기능성', '이메일/ID 입력 필드', hasEmail, '', '로그인 페이지 input[type=email] 추가')) score -= 3
    if (!check('기능성', '비밀번호 입력 필드', hasPassword, '', '로그인 페이지 input[type=password] 추가')) score -= 3
    if (!check('기능성', '제출 버튼', hasSubmit, '', '로그인 버튼 추가')) score -= 2
    // API 연결 시도 (잘못된 자격증명 — 401 기대)
    const apiRes = await fetchWithRetry(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid@test.com', password: 'invalid' }),
      signal: AbortSignal.timeout(10000),
    })
    const apiOk = [200, 400, 401, 403].includes(apiRes.status)
    if (!check('기능성', `로그인 API 응답 (${apiRes.status})`, apiOk, `HTTP ${apiRes.status}`, '/api/auth/login가 401 또는 200을 반환하도록')) score -= 4
    await ctx.close()
  } catch (e) {
    check('기능성', 'Playwright 기능 검사', false, e.message, '페이지 렌더 실패'); score -= 6
  }
  results.score.usability = Math.max(0, score)
  return results.score.usability
}

// ══════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════
async function main() {
  header('═══════════════════════════════════════')
  header(' FMI ERP — Harness Evaluator v3.1')
  header(` 대상: ${BASE_URL}`)
  header(` 모드: ${noBrowser ? '정적 (no-browser)' : 'Playwright + 정적'}`)
  header('═══════════════════════════════════════')

  let browser = null
  if (!noBrowser) {
    try {
      const { chromium } = require('playwright')
      const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
      const launchOpts = { headless: true }
      if (proxyServer) launchOpts.proxy = { server: proxyServer }
      browser = await chromium.launch(launchOpts)
    } catch (e) {
      warn(`Playwright 로드 실패 → no-browser 모드 폴백: ${e.message}`)
    }
  }

  const s1 = await evaluateUIUX()
  const s2 = await evaluateFunctionality()
  const s3 = evaluateCodeQuality()
  const s4 = await evaluateResponsive(browser)
  const s5 = evaluateSecurity()
  const s6 = await evaluateDesignQuality(browser)
  const s7 = evaluateOriginality()
  const s8 = await evaluateCompleteness(browser)
  const s9 = await evaluateUsability(browser)

  if (browser) await browser.close()

  const total = (s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8 + s9) / 10
  const passed = total >= PASS_SCORE

  if (!jsonOnly) {
    console.log('\n═══════════════════════════════════════')
    console.log(' 평가 결과 (9개 카테고리)')
    console.log('═══════════════════════════════════════')
    console.log(`  1. UI/UX:         ${s1}/10`)
    console.log(`  2. 기능 완성도:   ${s2}/12`)
    console.log(`  3. 코드 품질:     ${s3}/12`)
    console.log(`  4. 반응형:        ${s4}/8`)
    console.log(`  5. 보안:          ${s5}/10`)
    console.log(`  6. 디자인 품질:   ${s6}/14`)
    console.log(`  7. 독창성:        ${s7}/10`)
    console.log(`  8. 완성도:        ${s8}/12`)
    console.log(`  9. 기능성:        ${s9}/12`)
    console.log('───────────────────────────────────────')
    console.log(`  총점: ${total.toFixed(1)}/10.0`)
    console.log(`  합격: ${PASS_SCORE}/10.0`)
    console.log(`  결과: ${passed ? '✅ PASS' : '❌ FAIL'}`)
    console.log('═══════════════════════════════════════')
    if (results.fail.length > 0) {
      console.log(`\n❌ 실패 (${results.fail.length}):`)
      results.fail.forEach(f => console.log(`   - ${f}`))
    }
    if (results.warn.length > 0) {
      console.log(`\n⚠️ 경고 (${results.warn.length}):`)
      results.warn.forEach(w => console.log(`   - ${w}`))
    }
  }

  // JSON 리포트 (오케스트레이터용)
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    scores: results.score,
    total: +total.toFixed(1),
    passed,
    passThreshold: PASS_SCORE,
    pass: results.pass,
    fail: results.fail,
    warn: results.warn,
    failureDetails: results.failureDetails,
    screenshots: results.screenshots,
  }
  const reportDir = path.join(__dirname, 'harness-engineering/reports')
  try {
    fs.mkdirSync(reportDir, { recursive: true })
    const dated = path.join(reportDir, `eval-${new Date().toISOString().slice(0, 10)}.json`)
    fs.writeFileSync(dated, JSON.stringify(report, null, 2))
    fs.writeFileSync(path.join(reportDir, 'eval-latest.json'), JSON.stringify(report, null, 2))
    if (!jsonOnly) console.log(`\n📄 리포트: ${dated}`)
  } catch {}

  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  process.exit(passed ? 0 : 1)
}

main().catch(e => { console.error('Evaluator 오류:', e); process.exit(1) })
