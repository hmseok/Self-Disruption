#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# cowork-commit.sh (PR-COORD-11 — 2026-05-26)
# Cowork 멀티 세션 안전 commit + push (race-free).
# ───────────────────────────────────────────────────────────────
# 문제: 여러 세션이 같은 .git/index 공유 → stage·commit·push 사이
#       다른 세션이 끼어들어 elsewhere 작업물 흡수 / 메시지·내용 mismatch.
#
# 해법: flock(2) 으로 「stage → commit → push」 파이프라인 전체를 직렬화.
#       모든 cowork 세션이 본 스크립트 (또는 동등 락 파일) 사용 시 race 0.
#
# 사용:
#   harness-engineering/scripts/cowork-commit.sh 'commit message' -- <pathspec...>
#   COWORK_ALLOW_MULTI_MODULE=1 harness-engineering/scripts/cowork-commit.sh ...
#   npm run cowork:commit -- 'message' -- <pathspec...>
#
# 동작:
#   1. .git/cowork-pipeline.lock 에 flock -w 600 (최대 10분 대기)
#   2. 락 잡힌 동안: git add <pathspec> → cowork-staging-lint → git commit -- <pathspec>
#   3. 락 잡힌 동안: pull --rebase 자동 (necessary 시) → git push origin main
#   4. 락 자동 해제 (스크립트 종료 시 fd 닫힘)
#
# 예외 처리:
#   · flock timeout (10분 초과) → 다른 세션 작업 중 의심, 사용자 보고
#   · staging-lint 차단 → COWORK_ALLOW_MULTI_MODULE=1 환경변수 안내
#   · push non-fast-forward → 자동 pull --rebase 후 재시도 (락 유지)
# ═══════════════════════════════════════════════════════════════

set -e

# ── 인자 파싱 ────────────────────────────────────────────────────
MSG=""
PATHSPEC=()
SEPARATOR_SEEN=0
for arg in "$@"; do
  if [ "$arg" = "--" ]; then
    SEPARATOR_SEEN=1
    continue
  fi
  if [ "$SEPARATOR_SEEN" = "0" ] && [ -z "$MSG" ]; then
    MSG="$arg"
    continue
  fi
  if [ "$SEPARATOR_SEEN" = "1" ]; then
    PATHSPEC+=("$arg")
  fi
done

if [ -z "$MSG" ] || [ ${#PATHSPEC[@]} -eq 0 ]; then
  echo "Usage: $0 'commit message' -- <pathspec...>"
  echo "Example: $0 '[hotfix] my fix' -- lib/foo.ts app/bar.tsx"
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"

LOCK_FILE=".git/cowork-pipeline.lock"
LOCK_TIMEOUT=600  # 10분

# ── flock 가용성 확인 ────────────────────────────────────────────
if ! command -v flock >/dev/null 2>&1; then
  echo "⚠ flock 명령 없음 — race-free 보장 불가. 폴백: safe-commit.sh 사용."
  echo "   harness-engineering/scripts/safe-commit.sh '$MSG'"
  exit 3
fi

# ── 파이프라인 락 획득 (최대 10분 대기) ──────────────────────────
echo "🔒 cowork-pipeline.lock 획득 시도 (최대 ${LOCK_TIMEOUT}s)..."
exec 9>"$LOCK_FILE"
if ! flock -w "$LOCK_TIMEOUT" 9; then
  echo ""
  echo "❌ ${LOCK_TIMEOUT}s 대기했으나 다른 세션이 파이프라인 락 점유 중."
  echo "   다른 세션 작업 종료 확인 후 재시도:"
  echo "     $0 '$MSG' -- ${PATHSPEC[*]}"
  exit 1
fi
echo "✅ 락 획득 — 파이프라인 시작 (이 세션 단독 stage·commit·push)"
echo ""

# 락이 잡힌 동안에는 다른 cowork 세션이 같은 락 대기 중 → race 0

# ── stale .git/*.lock 정리 (자기 락이 아니면 절대 건드림 X) ──
# 위 flock 잡았다면 다른 세션 git 명령은 .git/index.lock 못 만듦 (직렬화 됨)
# 다만 cowork 진입 전 남은 stale 만 점검
STALE_LOCKS=$(find .git -maxdepth 3 -name "*.lock" -mmin +5 2>/dev/null)
if [ -n "$STALE_LOCKS" ]; then
  echo "⚠ 5분 이상 묵은 stale lock 검출 — 제거:"
  echo "$STALE_LOCKS" | sed 's/^/   /'
  echo "$STALE_LOCKS" | xargs rm -f
fi

# ── 1. stage (pathspec 명시) ─────────────────────────────────────
echo "═══ 1. stage: ${PATHSPEC[*]} ═══"
git add -- "${PATHSPEC[@]}"
echo ""
echo "─── staged ───"
git diff --cached --stat | tail -30
echo ""

# ── 2. cowork-staging-lint 검증 ──────────────────────────────────
echo "═══ 2. cowork-staging-lint ═══"
LINT_OUT=$(node harness-engineering/scripts/cowork-staging-lint.js 2>&1) || LINT_R=$?
LINT_R=${LINT_R:-0}
echo "$LINT_OUT"

if [ $LINT_R -ne 0 ]; then
  if [ "${COWORK_ALLOW_MULTI_MODULE:-}" = "1" ]; then
    echo "⚠ multi-module 우회 (COWORK_ALLOW_MULTI_MODULE=1) — 진행"
  else
    echo ""
    echo "❌ cowork-staging-lint 차단. 의도적 cross-module 이면:"
    echo "   COWORK_ALLOW_MULTI_MODULE=1 $0 '$MSG' -- ${PATHSPEC[*]}"
    exit 1
  fi
fi

# ── 3. commit (pathspec 명시 — atomic, race-free) ───────────────
echo ""
echo "═══ 3. commit (pathspec 한정) ═══"
if ! git commit -m "$MSG" -- "${PATHSPEC[@]}" 2> /tmp/cowork-commit.err; then
  ERR=$(cat /tmp/cowork-commit.err)
  echo "❌ commit 실패:"
  echo "$ERR"
  exit 1
fi
COMMIT_SHA=$(git rev-parse HEAD)
echo "✅ commit ${COMMIT_SHA:0:8}"

# ── 4. push (pull --rebase 자동, 최대 3회 retry) ────────────────
echo ""
echo "═══ 4. push ═══"
for attempt in 1 2 3; do
  if git push origin main 2> /tmp/cowork-push.err; then
    echo "✅ push 성공"
    echo ""
    echo "🔓 파이프라인 락 자동 해제 (스크립트 종료)"
    exit 0
  fi
  ERR=$(cat /tmp/cowork-push.err)
  if echo "$ERR" | grep -qi 'rejected\|non-fast-forward'; then
    echo "⚠ origin 변경 (다른 세션 push 함) — pull --rebase 후 재시도 (${attempt}/3)"
    if ! git pull --rebase origin main 2>&1 | tail -5; then
      echo "❌ rebase 실패 — 수동 해결 필요"
      exit 1
    fi
    continue
  fi
  echo "❌ push 실패:"
  echo "$ERR"
  exit 1
done

echo "❌ 3회 push retry 실패"
exit 1
