# 2026-05-09 — Cowork 위반: PR-UX3-A 다른 세션 흡수

## 요약
다른 cowork 세션이 commit `8fc5ddd "PR-6.11.a 정산서 등록"` 에 본 세션의 PR-UX3-A
작업물 (lib/category-meta.ts + processing-status + bank-card/page.tsx) 을 흡수해
함께 커밋. Rule 21 위반.

## 시계열
- 11:07 다른 세션이 .git/HEAD.lock 생성 (commit 시도)
- 11:27 본 세션이 staging 시도 → index.lock 충돌
- 11:38 두 세션 모두 lock 보유 (stale)
- 11:40 본 세션이 stale lock 제거 후 commit `b8e009b` 시도
- 그 사이 다른 세션이 `git add .` 또는 `-A` 로 본 세션의 working tree 변경물
  포함하여 commit `8fc5ddd` 생성 + push 완료
- 본 세션의 b8e009b 는 CallScheduler/_docs/CHANGELOG.md + GroupEditor.tsx
  (다른 세션의 staged 잔재) 만 포함

## 영향
- 본 세션 PR-UX3-A 코드는 origin/main 에 정상 반영 (8fc5ddd 안에 11 파일 중 3개)
- 단, commit 메시지 추적 어려움 (다른 PR 과 섞임)
- 본 세션의 의도된 commit 메시지 ([PR-UX3-A]) 는 미푸시 상태로 폐기

## Root Cause
- 다른 cowork 세션이 `git add .` / `-A` 사용 (Rule 21 금지 항목)
- pre-commit hook 의 cowork-staging-lint 가 우회 또는 비활성
- 본 세션의 file write 후 다른 세션이 working tree 스캔하여 흡수

## 재발 방지
- (이미 있는) cowork-staging-lint 의 hook 강제력 점검 필요
- 다른 세션이 명시 폴더만 add 하도록 규칙 강화
- 본 세션은 file write 후 즉시 stage + commit (간격 최소화)
- Untracked file 도 working tree 에 있으면 다른 세션이 흡수할 수 있음 — 가드 필요

## 결론
기능 적용 자체는 정상. 향후 작업은 정상 진행. 단, hook 강제력 향상 필요.
