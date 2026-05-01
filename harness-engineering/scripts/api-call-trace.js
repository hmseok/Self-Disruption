#!/usr/bin/env node
/**
 * api-call-trace.js — API 라우트 ↔ UI fetch 호출처 자동 매핑.
 *
 * 사용처:
 *   - 새 API 만들 때 어느 UI 가 호출할지 명시
 *   - 기존 API 수정 시 grep 으로 모든 호출처 자동 파악
 *   - 호출처 0 인 API = 죽은 코드 후보
 *   - UI 가 호출하는데 라우트 없는 = 깨진 호출
 *
 *   2026-05-01 사건: 카드 거래 탭 표시 — `/list` API 만 수정하고
 *                    실제 사용 API `/finance-upload` 누락.
 *
 * (CLAUDE.md § 0-1 규칙 11-B 자동화 안전장치)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const API_DIR = path.join(ROOT, 'app/api')
const APP_DIR = path.join(ROOT, 'app')

function discoverRoutes(dir = API_DIR, base = '/api') {
  const routes = []
  if (!fs.existsSync(dir)) return routes
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // [id], [...slug], [[...optional]] 모두 :param 로 정규화
      const seg = entry.name.startsWith('[') ? ':param' : entry.name
      routes.push(...discoverRoutes(full, `${base}/${seg}`))
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      routes.push({ url: base, file: path.relative(ROOT, full) })
    }
  }
  return routes
}

function walkTsx(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git', 'api'].includes(entry.name)) continue
      walkTsx(full, out)
    } else if (/\.(tsx|ts|jsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

// fetch URL 정규화 — 동적 세그먼트 → :param
function normalize(url) {
  return url.split('?')[0]
            .replace(/\$\{[^}]*\}/g, ':param')
            .replace(/\/\d+/g, '/:id')
            .replace(/\/$/, '')
}

function trace() {
  const routes = discoverRoutes()
  const routeUrls = new Set(routes.map(r => normalize(r.url)))

  const callers = {} // url -> Set<file>
  const unknownCalls = [] // UI 가 호출하는데 라우트 없는 케이스

  for (const file of walkTsx(APP_DIR)) {
    const src = fs.readFileSync(file, 'utf-8')
    const re = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g
    let m
    while ((m = re.exec(src)) !== null) {
      let url = m[1]
      if (!url.startsWith('/api/')) continue
      const normalized = normalize(url)
      callers[normalized] = callers[normalized] || new Set()
      callers[normalized].add(path.relative(ROOT, file))
    }
  }

  // 매핑 결과
  const orphanRoutes = [] // 호출자 없는 API
  const brokenCalls = [] // UI 가 호출하는데 라우트 없는

  for (const r of routes) {
    const norm = normalize(r.url)
    if (!callers[norm] || callers[norm].size === 0) {
      orphanRoutes.push(r)
    }
  }
  for (const [url, files] of Object.entries(callers)) {
    // routeUrls 매칭 — 동적 세그먼트 고려
    const matched = [...routeUrls].some(ru => {
      // 단순 일치 또는 :param 매칭
      const ruRe = new RegExp('^' + ru.replace(/:\w+/g, '[^/]+') + '$')
      return ruRe.test(url)
    })
    if (!matched) {
      brokenCalls.push({ url, callers: [...files] })
    }
  }

  return { routes, callers, orphanRoutes, brokenCalls }
}

if (require.main === module) {
  const { routes, callers, orphanRoutes, brokenCalls } = trace()
  console.log(`[api-trace] ${routes.length} API routes, ${Object.keys(callers).length} unique URLs called from UI`)

  // Baseline 로드 — 기존 broken calls 는 known issue 로 처리,
  // 새로 추가된 broken call 만 fail
  const baselinePath = path.join(ROOT, 'harness-engineering/knowledge/api-trace.baseline.json')
  let baseline = []
  if (fs.existsSync(baselinePath)) {
    try { baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')).brokenCalls || [] } catch {}
  }
  const baselineSet = new Set(baseline)
  const newBroken = brokenCalls.filter(b => !baselineSet.has(b.url))
  const knownBroken = brokenCalls.filter(b => baselineSet.has(b.url))

  if (newBroken.length > 0) {
    console.error(`[api-trace] ❌ ${newBroken.length} NEW broken call(s) — UI calls API that doesn't exist:`)
    for (const b of newBroken) {
      console.error(`  ${b.url}`)
      for (const c of b.callers.slice(0, 3)) console.error(`    ← ${c}`)
    }
    console.error('  → 라우트 추가하거나 호출 제거 후 재시도')
  } else if (knownBroken.length > 0) {
    console.log(`[api-trace] ⚠️  ${knownBroken.length} known broken call(s) (in baseline)`)
  } else {
    console.log('[api-trace] ✅ no broken UI calls')
  }

  if (orphanRoutes.length > 0) {
    console.log(`[api-trace] ⚠️  ${orphanRoutes.length} orphan route(s) — API with no UI caller:`)
    for (const o of orphanRoutes.slice(0, 10)) {
      console.log(`  ${o.url}  (${o.file})`)
    }
    if (orphanRoutes.length > 10) console.log(`  ... and ${orphanRoutes.length - 10} more`)
  }

  // JSON 저장 — harness-lint 가 활용
  const outPath = path.join(ROOT, 'harness-engineering/knowledge/api-trace.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify({
    routes: routes.map(r => ({ url: r.url, file: r.file, callers: [...(callers[normalize(r.url)] || [])].sort() })),
    orphanRoutes: orphanRoutes.map(r => r.url),
    brokenCalls: brokenCalls.map(b => ({ url: b.url, callers: b.callers })),
    generatedAt: new Date().toISOString(),
  }, null, 2))
  console.log(`[api-trace] index written → harness-engineering/knowledge/api-trace.json`)

  // 새로 추가된 broken call 만 fail
  process.exit(newBroken.length > 0 ? 1 : 0)
}

module.exports = { trace }
