#!/usr/bin/env node
/**
 * menu-path-duplicate-lint.js — menu-registry path 중복 차단
 *
 * lib/menu-registry.ts 의 active entry (sidebarHidden=true 도 포함) 중
 * 같은 path 가 2회 이상 등록되면 차단.
 *
 * 트리거: PR-6.13 mod-ride-operations + mod-ride-vehicle-reg 둘 다 path=/RideVehicleRegistry
 *         menu-sync ambiguous + 권한 체크 혼동 가능
 *
 * 실행: node harness-engineering/scripts/menu-path-duplicate-lint.js
 *
 * PR-HARNESS-1 (2026-05-09)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const REGISTRY_FILE = path.join(ROOT, 'lib/menu-registry.ts')

function extractEntries(src) {
  // MENUS 배열 row 추출 — { id: '...', name: '...', path: '...', ... }
  // 단순 정규식 — 한 줄에 entry 1개 패턴 가정
  const entries = []
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith('//')) continue
    const idMatch = line.match(/id:\s*['"]([^'"]+)['"]/)
    const pathMatch = line.match(/path:\s*['"]([^'"]+)['"]/)
    if (idMatch && pathMatch) {
      entries.push({
        id: idMatch[1],
        path: pathMatch[1],
        line: i + 1,
        snippet: trimmed.substring(0, 100),
      })
    }
  }
  return entries
}

function main() {
  if (!fs.existsSync(REGISTRY_FILE)) {
    console.log('  menu-registry.ts 미존재 — skip')
    return { total: 0, newCount: 0, knownCount: 0, newViolations: [] }
  }
  const src = fs.readFileSync(REGISTRY_FILE, 'utf-8')
  const entries = extractEntries(src)

  // path 별 group
  const byPath = new Map()
  for (const e of entries) {
    if (!byPath.has(e.path)) byPath.set(e.path, [])
    byPath.get(e.path).push(e)
  }

  const duplicates = []
  for (const [pathVal, list] of byPath) {
    if (list.length >= 2) {
      duplicates.push({ path: pathVal, entries: list })
    }
  }

  console.log(`  registry entries=${entries.length}, unique paths=${byPath.size}, duplicates=${duplicates.length}`)
  if (duplicates.length > 0) {
    console.log('  ❌ menu-registry path 중복:')
    for (const d of duplicates) {
      console.log(`    path=${d.path} — ${d.entries.length} entries:`)
      for (const e of d.entries) {
        console.log(`      L${e.line} id=${e.id}`)
      }
    }
    process.exitCode = 1
  }

  return {
    total: duplicates.length,
    newCount: duplicates.length,  // 모든 중복은 새 위반 (baseline 없음)
    knownCount: 0,
    newViolations: duplicates.flatMap(d =>
      d.entries.map(e => ({ file: 'lib/menu-registry.ts', line: e.line, label: 'path-duplicate', snippet: e.snippet }))
    ),
  }
}

if (require.main === module) {
  main()
}

module.exports = { main }
