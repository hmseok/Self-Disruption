# 2026-05-09 — Cowork hooksPath 오염 (Rule 21 hook 우회 root cause)

## 요약
본 세션의 git config `core.hooksPath` 가 **다른 cowork 세션의 hooks 경로** 를 가리키고
있어서, 본 세션이 commit 할 때 다른 세션의 (executable 권한 없는) hooks 가 실행 시도됨
→ 실패 → cowork-staging-lint 우회 → Rule 21 위반 (다른 세션 작업물 흡수) 사고 반복.

## 시계열 (2026-05-09)
- 11:07 ~ 11:51: 본 세션 PR-UX1.5 ~ PR-UX3-B 작업 중 commit 시 매번 경고:
  `hint: The '/sessions/clever-blissful-euler/.../hooks/post-index-change' hook was ignored because it's not set as executable.`
- 본 세션의 `.git/hooks/pre-commit` 은 정상 (executable, 806 bytes, harness-lint v1)
- 그러나 `git config --get core.hooksPath` 결과:
  `/sessions/clever-blissful-euler/mnt/Self-Disruption/.git/hooks`
- 즉 본 세션 git 이 다른 세션의 hooks 를 사용하려다 permission/exec 실패
- 결과: cowork-staging-lint 자동 실행 X → 다른 세션이 git add . 할 때 차단 못 함

## 영향
- PR-UX3-A (commit `8fc5ddd` 에 흡수) — 다른 세션 PR-6.11.a 안에 본 세션 작업물 3 파일 흡수
- PR-UX3-B (commit `d2d7df9` 에 흡수) — 다른 세션 factory-search Phase 6 안에 본 세션 3 파일 흡수
- 코드는 origin/main 에 정상 반영 → 사용자 기능 영향 X
- 단점: commit 메시지 추적 어려움, PR 단위 회고 불가

## Root Cause
다른 세션 (또는 도구) 이 본 세션 git config 의 `core.hooksPath` 를 자신의 hooks 디렉토리로
설정. 이유 추정:
- 공유 git 설정 시도 (각 세션이 자기 hooks 사용하게 의도했으나 잘못 설정)
- 또는 git worktree 흉내 시도

## 수정 (2026-05-09 — PR-COWORK)
1. **즉시**: `git config --unset core.hooksPath` (본 세션)
   - 이제 git 이 기본 `.git/hooks/` (본 세션의 정상 hooks) 사용
2. **install-hook.js 강화**: `checkHooksPath()` + `fixHooksPath()` 자가 진단 + auto-fix
   - 설치 시 hooksPath 가 ROOT/.git/hooks 와 다르면 경고 + 자동 unset
   - `--no-fix-config` 플래그로 수정 skip 가능
3. **신설 cowork-health-check.js**:
   - `npm run cowork:check` — 진단만 (hooksPath, hook executable, stale lock, 다른 세션 감지)
   - `npm run cowork:fix` — 자동 수정 모드 (5분 이상 stale lock, hooksPath unset, chmod 755)
4. **회귀 케이스**: 본 문서

## 재발 방지
- 새 cowork 세션 시작 시 `npm run cowork:check` 실행 권장 (또는 자동)
- install-hook.js 가 매번 hooksPath 자가 점검 → 오염 시 즉시 자동 수정
- 다른 세션이 같은 사고 발생 시 본 진단 도구로 자가 발견 가능

## 참고
- 동시 발생 사고: `2026-05-09-cowork-pr-ux3-a-absorbed.md`
- Rule 21: CLAUDE.md 규칙 21 — Cowork 멀티 세션 협업
