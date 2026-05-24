#!/usr/bin/env node
/**
 * pagetitle-coverage-lint.js — PageTitle 등록 누락 검사 (PR-PT-COV, 2026-05-24)
 *
 * 사용자 명령: 「브라우저 탭/헤더가 일부 페이지에서 깨짐 — 하네스에 규정하고 전수조사」
 *
 * 문제: app/components/PageTitle.tsx 는 PATH_TO_GROUP / PAGE_NAMES 를 손으로
 *       관리. menu-registry 에 등록된 실제 페이지가 PageTitle 에 누락되면
 *       헤더 breadcrumb 이 안 뜨고 브라우저 탭 제목이 generic('FMI ERP') 이 됨.
 *
 * 규칙: menu-registry.ts 의 MENUS 중 hidden 이 아닌 (= 실제 활성) 페이지는
 *       전부 PageTitle 의 PAGE_NAMES 에 등록돼 있어야 한다.
 *       (PAGE_NAMES 는 findBestMatch 로 상위 경로까지 매칭 — 하위 경로는
 *        부모만 등록돼 있으면 자동 커버)
 *
 * 실행: node harness-engineering/scripts/pagetitle-coverage-lint.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const PT_FILE = path.join(ROOT, 'app/components/PageTitle.tsx')
const MR_FILE = path.join(ROOT, 'lib/menu-registry.ts')

// const X = { ... } 블록에서 '/...' 키 추출
function extractKeys(src, varName) {
  const m = src.match(new RegExp('const ' + varName + '[^{]*\\{([\\s\\S]*?)\\n\\}'))
  if (!m) return new Set()
  return new Set((m[1].match(/'(\/[^']*)'\s*:/g) || []).map(k => k.replace(/'\s*:$/, '').replace(/^'/, '')))
}

// PR-PT-COV2 (2026-05-24) — 메뉴 페이지는 PageTitle 에 「자기 이름」 항목이
// 정확히 있어야 한다. 부모 경로 이름을 빌려쓰면(예: /finance/investor 가
// /finance 의 '재무 대시보드' 를 표시) 브레드크럼이 틀리므로 exact 검사.

function lint() {
  const pt = fs.readFileSync(PT_FILE, 'utf-8')
  const mr = fs.readFileSync(MR_FILE, 'utf-8')

  const PAGE_NAMES = extractKeys(pt, 'PAGE_NAMES')

  // HIDDEN_PATHS Set 추출
  const hp = mr.match(/HIDDEN_PATHS[^[]*\[([\s\S]*?)\]/)
  const hiddenPaths = new Set(
    hp ? (hp[1].match(/'(\/[^']*)'/g) || []).map(s => s.replace(/'/g, '')) : []
  )

  // MENUS 배열 — 각 entry 라인에서 path + inline hidden 추출
  const mm = mr.match(/const MENUS[^[]*\[([\s\S]*?)\n\]/)
  const violations = []
  let checked = 0
  if (mm) {
    for (const line of mm[1].split('\n')) {
      const pm = line.match(/\bpath:\s*'([^']+)'/)
      if (!pm) continue
      const p = pm[1]
      // inline `hidden: true` (sidebarHidden 은 대문자 H — 매칭 안 됨) 또는
      // HIDDEN_PATHS 에 포함 → 죽은/숨김 페이지, 검사 제외
      if (/\bhidden:\s*true/.test(line)) continue
      if (hiddenPaths.has(p)) continue
      checked++
      // exact 검사 — 메뉴 경로가 PAGE_NAMES 에 자기 키로 등록돼야 함
      if (!PAGE_NAMES.has(p)) {
        const nm = line.match(/\bname:\s*'([^']+)'/)
        violations.push({ path: p, name: nm ? nm[1] : '' })
      }
    }
  }
  return { checked, violations }
}

function main() {
  const r = lint()
  console.log(`  menu-registry 활성 메뉴 ${r.checked}개 검사, PageTitle 누락 ${r.violations.length}건`)
  for (const v of r.violations) {
    console.log(`    ❌ ${v.path} (${v.name}) — PageTitle 의 PAGE_NAMES 에 등록 필요`)
  }
  if (r.violations.length > 0) {
    console.log('    → app/components/PageTitle.tsx 의 PAGE_NAMES + 그룹 맵에 추가')
    process.exitCode = 1
  }
  return { total: r.violations.length, newCount: r.violations.length, violations: r.violations }
}

if (require.main === module) main()

module.exports = { main, lint }
