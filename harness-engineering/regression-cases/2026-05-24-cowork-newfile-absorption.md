# 회귀 케이스 — bare git commit 이 다른 세션 새 파일 흡수

> 발생: 2026-05-24 (sweet-amazing-galileo 메인 세션)
> 분류: Cowork 멀티 세션 staging 침범 (CLAUDE.md 규칙 21)
> 관련: cowork-staging-lint.js / 2026-05-06-cowork-staging-violation.md

## input

메인 세션이 `app/components/PageTitle.tsx` 한 파일만 커밋하려 함:

```
git add app/components/PageTitle.tsx
git commit -m "[PR-PT-TITLE] ..."     # ← bare commit
```

같은 시각 로또 세션이 자기 새 파일을 staging 해 둔 상태:

```
app/(employees)/RideVision/lotto/page.tsx        (status A — 신규)
app/(employees)/RideVision/_docs/CHANGELOG.md    (status A — 신규)
```

## expected

`[PR-PT-TITLE]` 커밋에 `PageTitle.tsx` **1개만** 포함.

## actual_before_fix

bare `git commit` 이 인덱스 전체를 커밋 → 로또 세션의 새 파일 2개까지
함께 commit (ff98153, 3 files). push 전 발견 → `git reset --soft` 후
`git commit <경로>` 명시로 재커밋하여 복구.

## root_cause

3-Why:
1. 왜 다른 세션 파일이 커밋됐나 → `git add <파일>` 은 한 파일만 stage 했지만
   인덱스에 로또 세션이 이미 stage 해 둔 파일이 남아 있었음.
2. 왜 그게 다 커밋됐나 → 인자 없는 `git commit` 은 **인덱스 전체**를 커밋함.
   `git commit <경로>` 였다면 해당 경로만 커밋됐을 것.
3. 왜 cowork-staging-lint 가 못 막았나 → staged = `_common`(PageTitle) +
   `RideVision`(실모듈 1개). multi-module 규칙은 **실제 모듈 ≥ 2** 일 때만
   발동 → 실모듈 1개라 통과. 「공통파일 + 다른 세션 모듈 1개」 사각지대.

## prevention

1. **자동화 (PR-COORD-9)** — cowork-staging-lint 에 `new-file-mix` 규칙 추가:
   새로 생성된 파일(status A)이 포함된 commit 이 여러 영역
   (실제 모듈 / `_common` / `_harness`)에 걸치면 차단.
   `_db`(마이그레이션) · `_root`(설정)는 새 기능에 동반 가능하므로 영역 제외.
   pre-commit + pre-push hook 양쪽에서 검증.
2. **행동 규칙** — 부분 커밋 시 bare `git commit` 금지.
   `git commit <경로>` 로 경로를 명시하거나, `git commit` 전
   `git diff --cached --name-only` 로 staged 목록을 반드시 확인.
