#!/usr/bin/env node
/**
 * helper-coverage-lint.js — 동형 패턴 헬퍼 사용 강제.
 *
 * 같은 부류 실수 누적 (CLAUDE.md 규칙 14, 15) — 자동 차단:
 *
 *   - corporate_cards JOIN 발견 시   → cardMappingJoinSql 사용 강제
 *   - bank_account_mappings JOIN 발견 시 → bankMappingJoinSql 사용 강제
 *
 *   직접 `cc.id = sms.card_id` 같은 단순 매칭은 last4 / raw_data fallback 누락 →
 *   같은 데이터의 다른 화면이 다른 정확도로 동작 (규칙 12 위반).
 *
 * 검사 대상: app/**\/route.ts (API 라우트 만 — page 의 SQL helper 함수 포함)
 *
 * 위반 예시:
 *   ❌ LEFT JOIN corporate_cards cc ON cc.id = sms.card_id COLLATE ...
 *   ❌ LEFT JOIN bank_account_mappings bam ON bam.account_alias = sms.card_alias
 *
 * 정상 예시:
 *   ✅ LEFT JOIN corporate_cards cc ON ${cardMappingJoinSql('cc', 'sms', 't')}
 *   ✅ LEFT JOIN bank_account_mappings bam ON ${bankMappingJoinSql('bam', 'sms', 't')}
 *
 * 화이트리스트 주석:
 *   // helper-coverage-allow: 단순 ID 비교만 필요 (예: bam_car JOIN)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(ROOT, 'app')
const LIB_DIR = path.join(ROOT, 'lib')

const PATTERNS = [
  {
    name: 'corporate_cards',
    helper: 'cardMappingJoinSql',
    // LEFT/INNER/JOIN ... corporate_cards (alias) ON
    // 단, lib/last4-match.ts 자체 (헬퍼 정의) 와 ${cardMappingJoinSql(...)} 호출은 제외
    // multiline ON 절 — 다음 LEFT/INNER/JOIN/WHERE/AND 까지 (대소문자 무시)
    joinRegex: /(?:LEFT\s+JOIN|INNER\s+JOIN|JOIN)\s+corporate_cards\s+(\w+)\s+ON\s+([\s\S]+?)(?=(?:\n\s*(?:LEFT|INNER|JOIN|WHERE|GROUP|ORDER|LIMIT|HAVING)\b)|`)/gi,
  },
  {
    name: 'bank_account_mappings',
    helper: 'bankMappingJoinSql',
    joinRegex: /(?:LEFT\s+JOIN|INNER\s+JOIN|JOIN)\s+bank_account_mappings\s+(\w+)\s+ON\s+([\s\S]+?)(?=(?:\n\s*(?:LEFT|INNER|JOIN|WHERE|GROUP|ORDER|LIMIT|HAVING)\b)|`)/gi,
  },
]

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (entry.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx'))) yield p
  }
}

function lint() {
  const violations = []
  let fileCount = 0

  // 검사 대상: app/api/ 안의 route.ts + lib/ 의 helper 사용처
  // lib/last4-match.ts 자체는 정의 파일 이라 제외
  const targets = []
  for (const f of walk(APP_DIR)) {
    if (f.includes('/api/') && f.endsWith('route.ts')) targets.push(f)
  }
  for (const f of walk(LIB_DIR)) {
    if (f.endsWith('last4-match.ts')) continue
    targets.push(f)
  }

  for (const file of targets) {
    fileCount++
    const src = fs.readFileSync(file, 'utf-8')
    const rel = path.relative(ROOT, file)

    // 화이트리스트 주석 라인 위치 수집
    const allowLines = new Set()
    src.split('\n').forEach((line, idx) => {
      if (/helper-coverage-allow/.test(line)) {
        // 다음 5줄 까지 화이트리스트
        for (let i = 1; i <= 5; i++) allowLines.add(idx + 1 + i)
      }
    })

    for (const { name, helper, joinRegex } of PATTERNS) {
      // regex state reset
      joinRegex.lastIndex = 0
      let match
      while ((match = joinRegex.exec(src)) !== null) {
        const [full, alias, onClause] = match
        // ON 절에 helper 호출 ${helper(...} 가 있으면 PASS
        if (new RegExp(`\\$\\{\\s*${helper}\\s*\\(`).test(onClause)) continue

        // 라인 번호 계산
        const lineNum = src.slice(0, match.index).split('\n').length
        if (allowLines.has(lineNum)) continue

        violations.push({
          file: rel,
          line: lineNum,
          table: name,
          alias,
          helper,
          onClause: onClause.trim().slice(0, 80),
        })
      }
    }
  }

  return { fileCount, violations }
}

if (require.main === module) {
  const r = lint()
  console.log(`helper-coverage-lint: ${r.fileCount} files, ${r.violations.length} violations`)
  for (const v of r.violations) {
    console.error(`  ❌ ${v.file}:${v.line} ${v.table} (alias=${v.alias}) → ${v.helper} 사용 X`)
    console.error(`     ON ${v.onClause}...`)
  }
  process.exit(r.violations.length > 0 ? 1 : 0)
}

module.exports = { lint }
