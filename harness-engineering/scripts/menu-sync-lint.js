#!/usr/bin/env node
/**
 * menu-sync-lint.js — 신규 페이지 자동 등록 강제
 *
 * app/**\/page.tsx 자동 스캔 → URL path 추출 → lib/menu-registry.ts 의
 * MENUS 배열 또는 HIDDEN_PATHS 에 등록되어 있는지 검증.
 *
 * 신규 페이지 만들었는데 menu-registry 에 등록 안 했으면 commit 차단.
 * 사이드바 / 권한 페이지 / 초대 페이지 자동 동기화 보장.
 *
 * 화이트리스트:
 *   - 동적 라우트 [id], [...], [token] 등 (자식 라우트만 — 부모는 검증)
 *   - api / components / utils / lib / _docs / _tests 폴더 (페이지 X)
 *   - public / sign / invite / s (공개 페이지) — 권한 부여 대상 X
 *
 * 실행: node harness-engineering/scripts/menu-sync-lint.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(ROOT, 'app')
const REGISTRY_FILE = path.join(ROOT, 'lib/menu-registry.ts')

// ─── 페이지 path 자동 스캔 ───
function* walkPages(dir, urlPath = '') {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') {
      yield urlPath || '/'
    }
    if (entry.isDirectory()) {
      // 비페이지 폴더 skip
      if (['api', 'components', 'utils', 'lib', 'hooks'].includes(entry.name)) continue
      if (entry.name.startsWith('_')) continue // _docs, _tests, _layout 등
      // 동적 라우트는 children skip (부모만 검증 대상)
      if (entry.name.startsWith('[')) continue
      // 공개 페이지 — 권한 부여 대상 X
      if (['public', 'sign', 'invite', 's', 'preview'].includes(entry.name)) continue
      // 공백 포함 폴더 (다른 세션 작업 중 임시 그룹 폴더 등) — URL path 로 부적합
      if (entry.name.includes(' ')) continue
      // Next.js route group — (그룹명) 형태는 URL 에 영향 X
      if (entry.name.startsWith('(') && entry.name.endsWith(')')) continue
      yield* walkPages(path.join(dir, entry.name), urlPath + '/' + entry.name)
    }
  }
}

// ─── menu-registry.ts 에서 path 추출 ───
function extractRegistryPaths() {
  if (!fs.existsSync(REGISTRY_FILE)) return { menus: new Set(), hidden: new Set() }
  const src = fs.readFileSync(REGISTRY_FILE, 'utf-8')

  // MENUS 배열의 path: '...' 추출
  const menus = new Set()
  const menuRegex = /path:\s*['"]([^'"]+)['"]/g
  let m
  while ((m = menuRegex.exec(src)) !== null) {
    menus.add(m[1])
  }

  // HIDDEN_PATHS 의 entry 추출
  const hidden = new Set()
  const hiddenMatch = src.match(/HIDDEN_PATHS\s*=\s*new\s+Set<string>\s*\(\s*\[([\s\S]*?)\]\s*\)/)
  if (hiddenMatch) {
    const inner = hiddenMatch[1]
    const re = /['"]([^'"]+)['"]/g
    let h
    while ((h = re.exec(inner)) !== null) hidden.add(h[1])
  }

  return { menus, hidden }
}

// ─── 페이지 path 또는 부모 경로 중 하나가 등록되어 있으면 OK ───
// 예: /cars/new — 부모 /cars 가 등록되어 있으면 통과 (sub-page 는 메뉴 표시 X 의도)
function isCovered(p, menus, hidden) {
  let cur = p
  while (cur && cur !== '/' && cur !== '') {
    if (menus.has(cur)) return true
    if (hidden.has(cur)) return true
    cur = cur.replace(/\/[^/]+$/, '') // 마지막 segment 제거
  }
  return false
}

// ─── lint 실행 ───
function lint() {
  const { menus, hidden } = extractRegistryPaths()
  const allPages = Array.from(walkPages(APP_DIR))

  const violations = []
  for (const p of allPages) {
    if (p === '/' || p === '') continue
    if (isCovered(p, menus, hidden)) continue
    violations.push(p)
  }

  return { allPages, registryMenus: menus.size, hiddenPaths: hidden.size, violations }
}

// ─── 실행 ───
if (require.main === module) {
  const r = lint()
  console.log(`menu-sync-lint: ${r.allPages.length} pages, registry=${r.registryMenus} + hidden=${r.hiddenPaths}, violations=${r.violations.length}`)
  if (r.violations.length > 0) {
    console.error('  ❌ menu-registry 에 등록 안 된 페이지:')
    for (const v of r.violations) {
      console.error(`     ${v}/page.tsx`)
    }
    console.error('')
    console.error('  → lib/menu-registry.ts 의 MENUS 배열에 entry 추가 필요')
    console.error('     (또는 HIDDEN_PATHS 에 추가하여 사이드바 / 권한 페이지에서 숨김)')
  }
  process.exit(r.violations.length > 0 ? 1 : 0)
}

module.exports = { lint }
