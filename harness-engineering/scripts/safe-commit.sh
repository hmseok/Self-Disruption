#!/bin/bash
# safe-commit.sh — Cowork 멀티 세션 안전 commit + push
#
# Lock 충돌 자동 대기 → 풀리면 commit → push.
# 사용:
#   ./harness-engineering/scripts/safe-commit.sh '커밋 메시지'
#   COWORK_ALLOW_MULTI_MODULE=1 ./harness-engineering/scripts/safe-commit.sh '메시지'

set -e

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "Usage: $0 'commit message'"
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"

# ─── Lock 자동 대기 (최대 90초) ──────────────────────────────────
wait_for_lock() {
  local label="$1"
  local count=0
  local max=90
  while ls .git/index.lock .git/HEAD.lock .git/refs/heads/*.lock 2>/dev/null | grep -q '.'; do
    if [ $count -ge $max ]; then
      echo ""
      echo "⚠ ${max}s 대기했으나 lock 점유 중. 강제 제거하려면:"
      echo "   rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/*.lock"
      echo "   ./harness-engineering/scripts/safe-commit.sh '$MSG'"
      exit 1
    fi
    if [ $count -eq 0 ]; then
      echo -n "⏳ git lock 대기 [$label] "
    fi
    echo -n "."
    sleep 1
    count=$((count + 1))
  done
  if [ $count -gt 0 ]; then
    echo " ✓ (${count}s)"
  fi
}

# ─── 1. lock 대기 (commit 직전) ─────────────────────────────────
wait_for_lock "pre-commit"

# ─── 2. staged 보고 ──────────────────────────────────────────────
echo ""
echo "═══ staged 변경 ═══"
git diff --cached --stat | tail -20
echo ""

# ─── 3. cowork-staging-lint 검증 ─────────────────────────────────
echo "═══ cowork-staging-lint ═══"
node harness-engineering/scripts/cowork-staging-lint.js
LINT=$?

if [ $LINT -ne 0 ]; then
  if [ "${COWORK_ALLOW_MULTI_MODULE:-}" = "1" ]; then
    echo "⚠ multi-module 우회 (COWORK_ALLOW_MULTI_MODULE=1) — 진행"
  else
    echo ""
    echo "❌ Cowork lint 차단. 의도적 cross-module 이라면:"
    echo "   COWORK_ALLOW_MULTI_MODULE=1 $0 '$MSG'"
    exit 1
  fi
fi

# ─── 4. commit (lock 충돌 retry 5회) ─────────────────────────────
echo ""
echo "═══ commit ═══"
for attempt in 1 2 3 4 5; do
  wait_for_lock "commit-$attempt"
  if git commit -m "$MSG" 2> /tmp/safe-commit.err; then
    cat /tmp/safe-commit.err 2>/dev/null || true
    break
  fi
  ERR=$(cat /tmp/safe-commit.err)
  if echo "$ERR" | grep -qi 'lock'; then
    echo "⏳ commit lock 충돌 (시도 $attempt/5) — 5s 대기 후 retry..."
    sleep 5
    continue
  fi
  echo "❌ commit 실패:"
  echo "$ERR"
  exit 1
done

# ─── 5. push (lock 충돌 retry 5회) ───────────────────────────────
echo ""
echo "═══ push ═══"
for attempt in 1 2 3 4 5; do
  wait_for_lock "push-$attempt"
  if git push origin main 2> /tmp/safe-push.err; then
    cat /tmp/safe-push.err 2>/dev/null || true
    echo ""
    echo "✅ push 성공"
    exit 0
  fi
  ERR=$(cat /tmp/safe-push.err)
  if echo "$ERR" | grep -qi 'lock'; then
    echo "⏳ push lock 충돌 (시도 $attempt/5) — 5s 대기 후 retry..."
    sleep 5
    continue
  fi
  if echo "$ERR" | grep -qi 'rejected\|non-fast-forward'; then
    echo "⚠ origin 변경 — git pull --rebase 후 재시도..."
    git pull --rebase origin main || exit 1
    continue
  fi
  echo "❌ push 실패:"
  echo "$ERR"
  exit 1
done

echo "❌ 5회 retry 모두 실패"
exit 1
