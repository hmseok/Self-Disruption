#!/bin/bash
# 저장소 정리 스크립트 — 130개 파일 제거 (46.4MB)
# 로컬 레포에서 실행: bash apply-cleanup.sh

set -e

cd "$(dirname "$0")"

echo "==> 최신 origin/main pull"
git fetch origin
git checkout main
git pull --ff-only origin main

echo "==> .cxx 빌드 아티팩트 untrack"
git rm -r --cached mobile/android/app/.cxx 2>/dev/null || true

echo "==> 중복/잔여 파일 untrack"
git rm --cached "package-lock 2.json" 2>/dev/null || true
git rm --cached public/excel_import.json public/excel_parsed2.json 2>/dev/null || true

echo "==> 디스크에서도 삭제"
rm -rf mobile/android/app/.cxx
rm -f "package-lock 2.json" public/excel_import.json public/excel_parsed2.json

echo "==> mobile/.gitignore 업데이트"
if ! grep -q "android/app/.cxx/" mobile/.gitignore; then
  sed -i.bak 's|android/app/build/|android/app/build/\nandroid/app/.cxx/|' mobile/.gitignore
  rm -f mobile/.gitignore.bak
fi
git add mobile/.gitignore

echo "==> 커밋"
git commit -m "chore: 불필요 파일 정리 — .cxx 빌드 아티팩트, 중복 파일 제거 (130개, 46.4MB)

- mobile/android/app/.cxx/ (127 files, 46.4MB) — Android CMake 빌드 아티팩트
- package-lock 2.json (248KB) — macOS 중복 파일
- public/excel_import.json, public/excel_parsed2.json — 개발 잔여물
- mobile/.gitignore에 android/app/.cxx/ 추가 (재추적 방지)

배포 속도 개선 및 저장소 크기 감소 목적."

echo "==> migration-backfill 엔드포인트 패치 적용"
if [ -f migration-backfill-ffcd2c6.patch ]; then
  git am migration-backfill-ffcd2c6.patch
fi

echo "==> 푸시"
git push origin main

echo "✅ 완료 — Cloud Build 5~10분 대기"
