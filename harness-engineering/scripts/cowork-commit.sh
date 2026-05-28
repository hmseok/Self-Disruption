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

# PR-COORD-12 (2026-05-27 사용자 요청):
#   「내 commit 파일이 아니면 push 에서 제외」.
#   각 cowork 세션이 자기 commit 에 Cowork-Session: trailer 자동 추가.
#   push 전 lineage 스캔 — 다른 세션 tagged commit 있으면 차단.
#   (untagged commit 은 legacy/ambiguous — 통과)
SESSION_ID="$(echo "$PWD" | sed -nE 's|^/sessions/([^/]+)(/.*)?$|\1|p')"
SESSION_ID="${SESSION_ID:-${COWORK_SESSION_ID:-unknown}}"

# PR-COORD-11 hotfix (operations 세션 보고 2026-05-26):
#   /tmp/ 는 cowork 세션간 공유라 다른 세션 UID 소유 파일 충돌 → Permission denied.
#   mktemp 으로 세션별 unique 경로 확보, trap 으로 종료 시 정리.
COMMIT_ERR=$(mktemp -t cowork-commit.XXXXXX.err 2>/dev/null || mktemp "${TMPDIR:-.git}/cowork-commit.XXXXXX.err")
PUSH_ERR=$(mktemp -t cowork-push.XXXXXX.err 2>/dev/null || mktemp "${TMPDIR:-.git}/cowork-push.XXXXXX.err")
trap 'rm -f "$COMMIT_ERR" "$PUSH_ERR"' EXIT

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
# 2026-05-27 강화 (PR-COORD-14):
#   (a) 5분 이상 묵은 lock — 시간 기반 (기존)
#   (b) 0-byte lock — disk-full / crash 잔존 (시간 무관 즉시 제거)
#   (c) unlink 실패 (다른 UID 소유) → mac 터미널 한 줄 안내
# 2026-05-28 hotfix (PR-COORD-15):
#   exec 9>"$LOCK_FILE" 가 자기 락 파일을 0-byte 로 truncate 함 → find -empty 가
#   본 락도 잡아서 stale 로 오인 → 자기 락 rm 시도 → FUSE mount .git/ unlink 제한
#   (mac sandbox 격리) 으로 EPERM → 매번 차단 발생. fix: 자기 락 제외.
STALE_LOCKS=$(find .git -maxdepth 3 -name "*.lock" \( -mmin +5 -o -empty \) ! -path ".git/cowork-pipeline.lock" 2>/dev/null)
if [ -n "$STALE_LOCKS" ]; then
  echo "⚠ stale / 0-byte lock 검출 — 제거 시도:"
  echo "$STALE_LOCKS" | sed 's/^/   /'
  PERM_DENIED=""
  for lock in $STALE_LOCKS; do
    if ! rm -f "$lock" 2>/dev/null; then
      PERM_DENIED="$PERM_DENIED $lock"
    fi
    # rm 성공해도 파일 남아있으면 (실제 권한 거부) PERM_DENIED 에 추가
    [ -e "$lock" ] && PERM_DENIED="$PERM_DENIED $lock"
  done
  if [ -n "$PERM_DENIED" ]; then
    echo ""
    echo "❌ 일부 lock 권한 거부 (다른 UID 소유 — 디스크 가득 사고 잔존 가능성):"
    echo "$PERM_DENIED" | tr ' ' '\n' | sort -u | sed 's/^/   /'
    echo ""
    echo "   mac 터미널에서 한 번만 실행 부탁드립니다:"
    echo "     cd $(pwd)"
    for lock in $(echo "$PERM_DENIED" | tr ' ' '\n' | sort -u); do
      [ -n "$lock" ] && echo "     rm -f $lock"
    done
    echo ""
    exit 1
  fi
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
# PR-COORD-11 2차 hotfix (operations 세션 보고 2026-05-26):
#   pre-commit hook 의 harness-lint 가 broad-scope UI lint 로 다른 세션 working-tree
#   변경까지 검출 → 본 commit 무관하게 차단.
#   COWORK_LINT_STAGED_ONLY=1 로 broad-scope lint skip (commit-critical 만 유지).
export COWORK_LINT_STAGED_ONLY=1
echo ""
echo "═══ 3. commit (pathspec 한정 + Cowork-Session trailer) ═══"
# PR-COORD-12: 메시지 끝에 Cowork-Session trailer 자동 추가 → push 시점 식별 가능.
COMMIT_MSG="$MSG

Cowork-Session: $SESSION_ID"
if ! git commit -m "$COMMIT_MSG" -- "${PATHSPEC[@]}" 2> "$COMMIT_ERR"; then
  ERR=$(cat "$COMMIT_ERR")
  echo "❌ commit 실패:"
  echo "$ERR"
  exit 1
fi
COMMIT_SHA=$(git rev-parse HEAD)
echo "✅ commit ${COMMIT_SHA:0:8} (Cowork-Session: $SESSION_ID)"

# ── 4. push 전 — 다른 세션 commit 검출 (PR-COORD-12) ────────────
echo ""
echo "═══ 4. lineage 검사 — 다른 세션 commit 차단 ═══"
git fetch origin main --quiet 2>/dev/null || true
UNPUSHED=$(git log origin/main..HEAD --format='%H' 2>/dev/null)
OTHER_LIST=""
MINE_COUNT=0
UNTAGGED_COUNT=0
for sha in $UNPUSHED; do
  TAG=$(git show -s --format='%B' "$sha" | grep -E '^Cowork-Session: ' | tail -1 | sed 's/^Cowork-Session: //' | tr -d '[:space:]')
  if [ -z "$TAG" ]; then
    UNTAGGED_COUNT=$((UNTAGGED_COUNT + 1))
  elif [ "$TAG" = "$SESSION_ID" ]; then
    MINE_COUNT=$((MINE_COUNT + 1))
  else
    SUBJECT=$(git show -s --format='%s' "$sha")
    OTHER_LIST="${OTHER_LIST}$(printf '\n  · %s [%s] %s' "${sha:0:8}" "$TAG" "$SUBJECT")"
  fi
done
echo "  unpushed: 본 세션 $MINE_COUNT / untagged(legacy) $UNTAGGED_COUNT / 다른 세션 $(echo "$OTHER_LIST" | grep -c '·' || echo 0)"

if [ -n "$OTHER_LIST" ]; then
  if [ "${COWORK_ALLOW_PIGGYBACK:-}" = "1" ]; then
    echo "⚠ 다른 세션 commit 함께 push 허용 (COWORK_ALLOW_PIGGYBACK=1):"
    echo "$OTHER_LIST"
  else
    echo ""
    echo "❌ 다른 세션 commit 이 lineage 에 있음 — push 차단:$OTHER_LIST"
    echo ""
    echo "조치 (권장):"
    echo "  1) 해당 세션이 자기 push 끝낸 후"
    echo "  2) git pull --rebase origin main"
    echo "  3) npm run cowork:commit -- ... (재시도)"
    echo ""
    echo "또는 의도적 piggy-back (드물게):"
    echo "  COWORK_ALLOW_PIGGYBACK=1 npm run cowork:commit -- ..."
    exit 1
  fi
fi

# ── 5. push (pull --rebase 자동, 최대 3회 retry) ────────────────
echo ""
echo "═══ 5. push ═══"
for attempt in 1 2 3; do
  if git push origin main 2> "$PUSH_ERR"; then
    echo "✅ push 성공"
    echo ""
    echo "🔓 파이프라인 락 자동 해제 (스크립트 종료)"
    exit 0
  fi
  ERR=$(cat "$PUSH_ERR")
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
