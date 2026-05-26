#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// cowork-reflog-integrity (PR-COORD-10 — 2026-05-26)
// 회귀 케이스: 2026-05-26 — 다른 세션 `git reset --hard origin/main` 으로
// 본 세션 unpushed commit (50556a2 P3+a) 가 lineage 에서 떨어진 사고.
// ───────────────────────────────────────────────────────────────
// 목적:
//   reflog 의 `commit:` 항목 중 — HEAD 에서도 origin/main 에서도 도달
//   불가능한 SHA 가 있으면 「분실된 commit」 으로 경고.
//   다른 세션 `reset --hard` / 강제 rewrite 가 본 세션 작업물 떨어뜨린
//   상황을 사후 탐지하고 재커밋 결정을 사용자에게 위임.
//
// 동작:
//   - `git reflog show --max-count=N` 파싱 → commit: 항목 SHA 수집
//   - 각 SHA → `merge-base --is-ancestor SHA HEAD` & ... origin/main
//   - 둘 다 false → 분실 후보 → 결과에 포함
//
// 의도된 amend/squash 의 부산물(원본 dangling) 도 탐지함 → false positive.
//   → 정보성(warn) 로 노출, 빌드 차단은 안 함.
//   사용자/에이전트가 보고 「내 정상 amend 였다 / 분실 회복 필요다」 판단.
//
// CLI:
//   node harness-engineering/scripts/cowork-reflog-integrity.js [--limit N]
//   node harness-engineering/scripts/cowork-reflog-integrity.js --json
//
// 통합: harness-lint.js sub-lint [3.11] — 정보성, 분실 0 이면 PASS.
// ═══════════════════════════════════════════════════════════════

const { execSync } = require('child_process')

const REFLOG_LIMIT = 60 // 최근 60개 HEAD 이동 검사
const SHORT_SHA = 8

function safeExec(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

function isAncestor(sha, ref) {
  try {
    execSync(`git merge-base --is-ancestor ${sha} ${ref}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// reflog show 의 한 줄에서 commit: 항목 SHA 추출
//   포맷: <sha> HEAD@{N}: commit[ (initial|amend)]: <message>
const REFLOG_COMMIT_RE = /^([0-9a-f]{7,40}) HEAD@\{\d+\}: commit(?: \([^)]+\))?:/

function collectReflogCommits(limit) {
  const out = safeExec(`git reflog show --max-count=${limit}`)
  if (!out) return []
  const seen = new Set()
  const result = []
  for (const line of out.split('\n')) {
    const m = line.match(REFLOG_COMMIT_RE)
    if (!m) continue
    const sha = m[1]
    if (seen.has(sha)) continue
    seen.add(sha)
    // 추출: 한 줄에서 message
    const msg = line.replace(REFLOG_COMMIT_RE, '').trim()
    const subject = safeExec(`git log -1 --format=%s ${sha}`)
    const author = safeExec(`git log -1 --format=%an ${sha}`)
    const time = safeExec(`git log -1 --format=%cr ${sha}`)
    result.push({ sha, message: msg, subject, author, time })
  }
  return result
}

function check(limit = REFLOG_LIMIT) {
  // origin/main 최신 확보 (실패해도 진행)
  try { execSync('git fetch origin main --quiet', { stdio: 'ignore' }) } catch {}

  const commits = collectReflogCommits(limit)
  const orphaned = []
  for (const c of commits) {
    if (isAncestor(c.sha, 'HEAD')) continue
    if (isAncestor(c.sha, 'origin/main')) continue
    orphaned.push(c)
  }
  return { totalScanned: commits.length, orphaned }
}

function format(result) {
  const { totalScanned, orphaned } = result
  if (orphaned.length === 0) {
    return `  reflog ${totalScanned}개 commit 스캔, 분실 0건`
  }
  const lines = [
    `  ⚠ reflog ${totalScanned}개 commit 스캔, 분실 후보 ${orphaned.length}건`,
    `    (HEAD 도 origin/main 도 도달 불가 — 다른 세션 reset --hard 가능성)`,
    `    의도된 amend/squash 의 부산물이면 무시.`,
    `    분실로 확인되면:  git cherry-pick <sha>  로 재반영.`,
    ``,
  ]
  for (const c of orphaned) {
    lines.push(`    · ${c.sha.slice(0, SHORT_SHA)}  [${c.time}]  ${c.author}  — ${c.subject}`)
  }
  return lines.join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  let limit = REFLOG_LIMIT
  let asJson = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') limit = parseInt(argv[++i], 10) || REFLOG_LIMIT
    if (argv[i] === '--json') asJson = true
  }
  const r = check(limit)
  if (asJson) {
    console.log(JSON.stringify(r, null, 2))
    return r
  }
  console.log(format(r))
  return r
}

module.exports = { check, format, main }

if (require.main === module) {
  main()
}
