#!/usr/bin/env node
/**
 * ui-data-coverage.js — 한 데이터 필드(예: sms_transaction_type)가
 *                        어느 UI 화면(page.tsx)에서 표출되는지 자동 매핑.
 *
 * 사용처: 새 필드 추가 시 누락 화면 자동 감지.
 *   2026-05-01 사건: sms_transaction_type 카드 탭 / 통장 탭 적용했지만
 *                     분류 검수 화면 누락 → 사용자 분노.
 *
 * 동작:
 *   1. schema-parser 로 컬럼 인덱스 확보
 *   2. app/**\/*.tsx 의 fetch URL + 필드 사용 패턴 스캔
 *   3. 같은 API 를 호출하는 page 들 사이에서 필드 사용 누락 감지
 *
 * 출력:
 *   - 인덱스: { fieldName: [page1, page2, ...] }
 *   - 부분 사용 (1~2 곳만 쓰는데 같은 API 호출하는 page 가 더 있음) → warning
 *
 * (CLAUDE.md § 0-1 규칙 12 자동화 안전장치)
 */
const fs = require('fs')
const path = require('path')
const { buildIndex } = require('./schema-parser')

const ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(ROOT, 'app')

function walkTsx(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '.git', 'api'].includes(entry.name)) continue
      walkTsx(full, out)
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function extractFetchUrls(src) {
  const urls = new Set()
  // fetch('/api/...') / fetch(`/api/...?x=y`)
  const re = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g
  let m
  while ((m = re.exec(src)) !== null) {
    let url = m[1]
    // query string 제거 + dynamic value 일반화 (예: ?id=${id} → ?id=*)
    url = url.split('?')[0].replace(/\$\{[^}]*\}/g, ':param')
    if (url.startsWith('/api/')) urls.add(url)
  }
  return [...urls]
}

function extractFieldUses(src, knownFields) {
  // `xxx.fieldName` 또는 `xxx?.fieldName` — known column 만
  const used = new Set()
  for (const f of knownFields) {
    const re = new RegExp(`[a-zA-Z_$][\\w$]*\\??\\.${f}\\b`)
    if (re.test(src)) used.add(f)
  }
  return used
}

function buildCoverage() {
  const { strict } = buildIndex()
  // 모든 컬럼 합집합
  const allCols = new Set()
  for (const cols of Object.values(strict)) {
    for (const c of cols) allCols.add(c)
  }

  const files = walkTsx(APP_DIR)
  const pages = []
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8')
    const urls = extractFetchUrls(src)
    const fields = extractFieldUses(src, allCols)
    pages.push({
      file: path.relative(ROOT, file),
      urls,
      fields: [...fields].sort(),
    })
  }

  // URL 별로 page 그룹 생성 + 그 그룹 내 필드 사용 빈도 집계
  const urlGroups = {}
  for (const p of pages) {
    for (const url of p.urls) {
      urlGroups[url] = urlGroups[url] || new Set()
      urlGroups[url].add(p.file)
    }
  }

  // 필드별 사용 page 인덱스
  const fieldIndex = {}
  for (const p of pages) {
    for (const f of p.fields) {
      fieldIndex[f] = fieldIndex[f] || new Set()
      fieldIndex[f].add(p.file)
    }
  }

  return { pages, urlGroups, fieldIndex }
}

if (require.main === module) {
  const { pages, urlGroups, fieldIndex } = buildCoverage()
  const totalFields = Object.keys(fieldIndex).length
  const totalUrls = Object.keys(urlGroups).length

  console.log(`[ui-coverage] ${pages.length} UI files scanned`)
  console.log(`[ui-coverage] ${totalUrls} unique API endpoints, ${totalFields} fields used in UI`)

  // 의심 패턴: 5+ pages 가 같은 url 그룹인데, 그 중 일부만 특정 필드 사용
  const warnings = []
  for (const [url, pageSet] of Object.entries(urlGroups)) {
    if (pageSet.size < 2) continue
    const pagesInGroup = [...pageSet]
    // 그룹 내 어느 page 가 어느 필드 쓰는지 매핑
    const fieldUsageInGroup = {}
    for (const f of pagesInGroup) {
      const p = pages.find(x => x.file === f)
      for (const fld of p.fields) {
        fieldUsageInGroup[fld] = fieldUsageInGroup[fld] || []
        fieldUsageInGroup[fld].push(f)
      }
    }
    for (const [fld, users] of Object.entries(fieldUsageInGroup)) {
      // strict: 그룹 page 의 80%+ 가 쓰는데 1~2곳만 안 쓰면 → 진짜 누락 의심
      const total = pagesInGroup.length
      const usedRate = users.length / total
      const missingCount = total - users.length
      if (total >= 3 && usedRate >= 0.8 && missingCount >= 1 && missingCount <= 2) {
        warnings.push({ url, field: fld, used: users, missing: pagesInGroup.filter(p => !users.includes(p)) })
      }
    }
  }

  if (warnings.length === 0) {
    console.log('[ui-coverage] ✅ no consistency warnings')
  } else {
    console.log(`[ui-coverage] ⚠️  ${warnings.length} potential coverage gap(s):`)
    for (const w of warnings.slice(0, 20)) {
      console.log(`  API ${w.url} :: field "${w.field}"`)
      console.log(`     used in: ${w.used.join(', ')}`)
      console.log(`     NOT in:  ${w.missing.join(', ')}`)
    }
    if (warnings.length > 20) console.log(`  ... and ${warnings.length - 20} more`)
  }

  // JSON 으로도 저장 (선택적 도구 — harness-lint 가 활용)
  const outPath = path.join(ROOT, 'harness-engineering/knowledge/ui-coverage.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const flat = {
    fields: Object.fromEntries(
      Object.entries(fieldIndex).map(([k, v]) => [k, [...v].sort()])
    ),
    urls: Object.fromEntries(
      Object.entries(urlGroups).map(([k, v]) => [k, [...v].sort()])
    ),
    warnings,
    generatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(outPath, JSON.stringify(flat, null, 2))
  console.log(`[ui-coverage] index written → harness-engineering/knowledge/ui-coverage.json`)

  // 정보성이라 exit 0
  process.exit(0)
}

module.exports = { buildCoverage }
