#!/usr/bin/env bash
# Harness Engineering v3.1 — Portable Installer
#
# 사용법:
#   bash /path/to/portable/install.sh                # 현재 디렉토리에 설치
#   bash /path/to/portable/install.sh /target/dir    # 특정 디렉토리에 설치

set -euo pipefail

PORTABLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$(pwd)}"

echo "════════════════════════════════════════"
echo " Harness Engineering v3.1 Installer"
echo "════════════════════════════════════════"
echo " 소스: $PORTABLE_DIR"
echo " 대상: $TARGET"
echo ""

if [ ! -d "$TARGET" ]; then
  echo "❌ 대상 디렉토리가 없습니다: $TARGET"
  exit 1
fi

cd "$TARGET"

# 1. 충돌 검사
CONFLICTS=()
[ -f CLAUDE.md ] && CONFLICTS+=("CLAUDE.md")
[ -f HARNESS.md ] && CONFLICTS+=("HARNESS.md")
[ -f evaluate.js ] && CONFLICTS+=("evaluate.js")
[ -d harness-engineering ] && CONFLICTS+=("harness-engineering/")

if [ ${#CONFLICTS[@]} -gt 0 ]; then
  echo "⚠️  기존 파일이 있습니다:"
  for f in "${CONFLICTS[@]}"; do echo "   - $f"; done
  echo ""
  read -p "덮어쓸까요? 기존 파일은 .bak으로 백업됩니다 (y/N) " yn
  case "$yn" in [Yy]*) ;; *) echo "취소됨."; exit 1;; esac
  for f in "${CONFLICTS[@]}"; do
    if [ -e "$f" ] && [ ! -e "${f%/}.bak" ]; then
      mv "$f" "${f%/}.bak"
      echo "  📦 백업: $f → ${f%/}.bak"
    fi
  done
fi

# 2. 디렉토리 생성
mkdir -p harness-engineering/{agents,knowledge/archive,scripts,templates,reports/screenshots,docs,handover}

# 3. 파일 복사
echo "▶ 파일 복사 중..."
cp "$PORTABLE_DIR/CLAUDE.md.template" CLAUDE.md
cp "$PORTABLE_DIR/HARNESS.md.template" HARNESS.md
cp "$PORTABLE_DIR/evaluate.js" evaluate.js
cp -r "$PORTABLE_DIR/agents/"* harness-engineering/agents/
cp -r "$PORTABLE_DIR/knowledge/"* harness-engineering/knowledge/ 2>/dev/null || true
cp -r "$PORTABLE_DIR/scripts/"* harness-engineering/scripts/
cp -r "$PORTABLE_DIR/templates/"* harness-engineering/templates/
cp "$PORTABLE_DIR/README.md" harness-engineering/README.md

chmod +x evaluate.js harness-engineering/scripts/*.js

# 4. .gitignore 추가
GITIGNORE_LINES=(
  "harness-engineering/reports/screenshots/"
  "harness-engineering/reports/auto-fix-loop.log"
  "harness-engineering/reports/eval-latest.json"
)
if [ -f .gitignore ]; then
  for line in "${GITIGNORE_LINES[@]}"; do
    grep -qxF "$line" .gitignore || echo "$line" >> .gitignore
  done
else
  printf '%s\n' "${GITIGNORE_LINES[@]}" > .gitignore
fi

# 5. Playwright 설치 안내
echo ""
echo "▶ Playwright 설치 (npm install -D playwright && npx playwright install chromium)"
read -p "지금 설치할까요? (Y/n) " yn
case "$yn" in
  [Nn]*)
    echo "스킵. 나중에 직접:"
    echo "  npm install -D playwright"
    echo "  npx playwright install chromium"
    ;;
  *)
    if [ -f package.json ]; then
      npm install -D playwright
      npx playwright install chromium
    else
      echo "⚠️  package.json이 없습니다. Node 프로젝트가 아닌가요? 수동 설치 필요."
    fi
    ;;
esac

# 6. Claude Code CLI 확인
echo ""
if command -v claude >/dev/null 2>&1; then
  echo "✅ Claude Code CLI 발견: $(claude --version 2>&1 | head -1)"
else
  echo "⚠️  Claude Code CLI 미설치 — Auto-Fix 루프를 사용하려면 설치 필요"
  echo "    설치: https://docs.claude.com/en/docs/claude-code/quickstart"
fi

echo ""
echo "════════════════════════════════════════"
echo " ✅ 설치 완료"
echo "════════════════════════════════════════"
echo ""
echo "다음 단계:"
echo "  1. CLAUDE.md를 본인 프로젝트에 맞게 편집"
echo "  2. HARNESS.md를 본인 프로젝트에 맞게 편집"
echo "  3. evaluate.js의 BASE_URL/엔드포인트/파일 목록 수정"
echo "  4. node evaluate.js --no-browser 로 첫 실행"
echo ""
echo "자세한 내용: harness-engineering/README.md"
