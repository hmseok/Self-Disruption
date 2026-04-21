#!/usr/bin/env bash
# scripts/ship.sh — Claude가 작업한 내용을 한 줄로 배포
#
# 사용법:
#   bash scripts/ship.sh                  # .claude/commit-msg.txt + .claude/commit-files.txt 를 사용
#   bash scripts/ship.sh "커밋 메시지"     # 메시지 직접 지정 + git add -A 로 변경분 전체 스테이징
#
# 동작:
#   1) .git/index.lock 정리
#   2) (옵션) tsc/evaluate.js 스킵 플래그 없으면 실행
#   3) git add (파일 목록 or -A)
#   4) git commit -m
#   5) git push origin main
#   6) Cloud Run 헬스체크 (https://hmseok.com/ 200)
#
# 환경 변수:
#   SKIP_CHECK=1   → tsc/evaluate.js 건너뛰기 (빠른 배포용)
#   SKIP_HEALTH=1  → push 후 헬스체크 건너뛰기

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "📦 FMI ERP 배포 시작 — $(pwd)"

# ── 1. 잔여 lock 제거 ──────────────────────────
rm -f .git/index.lock
rm -f .git/HEAD.lock 2>/dev/null || true

# ── 2. 검증 (옵션) ────────────────────────────
if [ -z "$SKIP_CHECK" ]; then
  echo "🔍 evaluate.js 실행 중..."
  if ! node evaluate.js > /tmp/ship-eval.log 2>&1; then
    tail -40 /tmp/ship-eval.log
    echo "❌ evaluate.js 실패 — 수정 후 재시도하세요. (스킵: SKIP_CHECK=1 bash scripts/ship.sh)"
    exit 1
  fi
  grep -E "총점|결과" /tmp/ship-eval.log | tail -5
fi

# ── 3. 스테이징 ───────────────────────────────
MSG="$1"
if [ -z "$MSG" ]; then
  # 메시지 파일 기반 모드
  if [ ! -f .claude/commit-msg.txt ]; then
    echo "❌ .claude/commit-msg.txt 가 없습니다. 메시지를 인자로 주세요: bash scripts/ship.sh \"메시지\""
    exit 1
  fi
  if [ -f .claude/commit-files.txt ]; then
    # 파일 목록 기반
    xargs git add < .claude/commit-files.txt
  else
    git add -A
  fi
  echo "📝 커밋 중 ($(git diff --cached --numstat | wc -l | tr -d ' ') 파일)..."
  git commit -F .claude/commit-msg.txt
else
  # 메시지 인자 모드 → 변경분 전체
  git add -A
  echo "📝 커밋 중 ($(git diff --cached --numstat | wc -l | tr -d ' ') 파일)..."
  git commit -m "$MSG"
fi

# ── 4. 푸시 ───────────────────────────────────
echo "🚀 푸시 → origin/main ..."
git push origin main

# ── 5. 헬스체크 ────────────────────────────────
if [ -z "$SKIP_HEALTH" ]; then
  echo "⏳ Cloud Build 대기 중 (6분)..."
  sleep 360
  STATUS=$(curl -sS -o /dev/null -w "%{http_code}" https://hmseok.com/ || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "✅ 배포 완료 — https://hmseok.com/ (200)"
  else
    echo "⚠️  헬스체크 비정상 (HTTP $STATUS) — https://console.cloud.google.com/cloud-build/builds 확인"
    exit 2
  fi
fi

echo "🎉 ship 완료"
