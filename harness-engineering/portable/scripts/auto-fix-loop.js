#!/usr/bin/env node
/**
 * Harness Engineering — Auto-Fix Loop (최대 15회)
 *
 * evaluate.js를 실행하고 FAIL이면 Claude Code CLI를 호출해
 * 실패 항목을 자동 수정 → git push → Cloud Run 배포 대기 → 재평가.
 *
 * 사용법:
 *   node harness-engineering/scripts/auto-fix-loop.js
 *   node harness-engineering/scripts/auto-fix-loop.js --local              # 로컬 검증
 *   node harness-engineering/scripts/auto-fix-loop.js --max=10             # 최대 10회
 *   node harness-engineering/scripts/auto-fix-loop.js --no-push            # push 없이 로컬만
 *   node harness-engineering/scripts/auto-fix-loop.js --no-deploy-wait     # 배포 대기 스킵
 */

const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const MAX = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '15')
const isLocal = args.includes('--local')
const noPush = args.includes('--no-push') || isLocal
const noDeployWait = args.includes('--no-deploy-wait') || isLocal
const HEALTH_URL = isLocal ? 'http://localhost:3000' : 'https://hmseok.com'
const ROOT = path.resolve(__dirname, '../..')
const REPORT_DIR = path.join(ROOT, 'harness-engineering/reports')
const LOOP_LOG = path.join(REPORT_DIR, 'auto-fix-loop.log')

fs.mkdirSync(REPORT_DIR, { recursive: true })

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOOP_LOG, line + '\n')
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts })
}

function runEval() {
  const evalArgs = ['evaluate.js', '--json']
  if (isLocal) evalArgs.push('--local')
  const r = spawnSync('node', evalArgs, { cwd: ROOT, encoding: 'utf8' })
  const latest = path.join(REPORT_DIR, 'eval-latest.json')
  if (!fs.existsSync(latest)) {
    log(`❌ eval-latest.json 미생성. stderr: ${r.stderr?.slice(0, 500)}`)
    return null
  }
  return JSON.parse(fs.readFileSync(latest, 'utf8'))
}

function buildFixPrompt(report, iter) {
  const failures = (report.failureDetails || []).map((f, i) =>
    `${i + 1}. [${f.category}] ${f.item}\n   원인: ${f.reason || '(없음)'}\n   힌트: ${f.hint || '(없음)'}`
  ).join('\n')

  return `너는 FMI ERP 프로젝트의 자동 수정 에이전트다.
\`evaluate.js\`가 ${report.fail.length}개 항목에서 실패했다 (총점 ${report.total}/10, 합격 ${report.passThreshold}).

[현재 반복 횟수] ${iter}/${MAX}
[대상 URL] ${report.baseUrl}

[실패 항목 + 수정 힌트]
${failures}

[규칙]
- CLAUDE.md와 HARNESS.md를 먼저 읽고 프로젝트 구조와 컨벤션을 파악할 것
- 실패 힌트를 기준으로 최소 변경으로 수정하라
- 절대 \`evaluate.js\`나 \`harness-engineering/scripts/\`를 수정하지 마라
- MySQL 전용 문법만 사용 (PostgreSQL \`$1\`, RETURNING 금지)
- 정적 검사용 grep 패턴을 만족시키기 위한 더미 코드 금지
- 수정 후 변경된 파일 목록을 stdout에 출력하라

이제 수정을 시작하라.`
}

async function pollHealth(timeoutMs = 600000) {
  const start = Date.now()
  const url = `${HEALTH_URL}/api/health`
  let lastStatus = 'pending'
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (res.status === 200) {
        log(`✅ 헬스체크 200 (${Math.round((Date.now() - start) / 1000)}s)`)
        return true
      }
      lastStatus = `HTTP ${res.status}`
    } catch (e) { lastStatus = e.message.slice(0, 60) }
    await new Promise(r => setTimeout(r, 15000))
  }
  log(`⚠️ 헬스체크 타임아웃 (${lastStatus})`)
  return false
}

async function waitForDeploy() {
  if (noDeployWait) return
  log('⏳ Cloud Run 배포 대기 (최대 10분)...')
  await new Promise(r => setTimeout(r, 60000)) // 1분 대기 후 폴링 시작
  await pollHealth(540000)
}

async function main() {
  log(`════════════════════════════════════════`)
  log(`Harness Auto-Fix Loop 시작 (max=${MAX})`)
  log(`대상: ${HEALTH_URL}`)
  log(`Push: ${noPush ? 'OFF' : 'ON'} / Deploy wait: ${noDeployWait ? 'OFF' : 'ON'}`)
  log(`════════════════════════════════════════`)

  for (let iter = 1; iter <= MAX; iter++) {
    log(`\n──── Iteration ${iter}/${MAX} ────`)

    log('▶ evaluate.js 실행')
    const report = runEval()
    if (!report) {
      log('❌ 평가 실행 실패. 루프 중단.')
      process.exit(2)
    }
    log(`총점: ${report.total}/10 (${report.passed ? 'PASS' : 'FAIL'}), 실패 ${report.fail.length}개`)

    if (report.passed) {
      log(`🎉 ${iter}회차에서 합격! 종료.`)
      process.exit(0)
    }

    if (iter === MAX) {
      log(`❌ 최대 반복(${MAX}) 도달. 미합격 상태로 종료.`)
      process.exit(1)
    }

    log('▶ Claude Code CLI 호출 (자동 수정)')
    const prompt = buildFixPrompt(report, iter)
    const fixRes = spawnSync(
      'claude',
      ['-p', prompt, '--allowedTools', 'Edit Read Write Bash Glob Grep'],
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 600000 }
    )
    if (fixRes.status !== 0) {
      log(`⚠️ Claude CLI exit ${fixRes.status} — 다음 반복에서 재시도`)
    }

    log('▶ git 변경 확인')
    const status = sh('git status --porcelain')
    if (!status.trim()) {
      log('⚠️ 변경 사항 없음. 다음 반복.')
      continue
    }
    log(`변경된 파일:\n${status}`)

    if (noPush) {
      log('🛑 --no-push 모드. 커밋 안 함, 다음 반복으로 (로컬 재평가)')
      continue
    }

    log('▶ git add/commit/push')
    try {
      sh('git add -A')
      sh(`git commit -m "auto-fix: iteration ${iter} (${report.fail.length} failures)"`)
      sh('git push origin main')
      log('✅ push 완료')
    } catch (e) {
      log(`❌ git 작업 실패: ${e.message?.slice(0, 200)}`)
      continue
    }

    await waitForDeploy()
  }
}

main().catch(e => {
  log(`❌ 루프 예외: ${e.stack || e.message}`)
  process.exit(2)
})
