# 2026-05-26 — PR-Q2-3 SQL 흡수 사고 (cowork-staging-lint 한계)

## 사고 요약

본 세션 (trusting-relaxed-keller, operations) 의 PR-Q2-3 마이그 SQL 2개가
다른 세션의 commit `96e9534 [PR-DESIGN-7] 자체 탭 strip 금지 + NeuFilterTabs 사용 의무 lint (재커밋)`
안에 흡수됨.

**흡수된 파일**:
- `migrations/2026-05-26_Q2_lt_quotes.sql` (119줄)
- `migrations/2026-05-26_Q2_drop_long_term_quotes.sql` (29줄)

**영향**:
- ✅ 데이터 손실 X (두 파일 모두 main 도달)
- ❌ commit 메시지 / GATE 기록 분리 실패
- ❌ 본 세션의 PR 단위 추적성 손상

## 타임라인

```
13:02  본 세션: 2 SQL 작성 (migrations/2026-05-26_Q2_*.sql)
       git add migrations/2026-05-26_Q2_*.sql
13:??  본 세션: git commit 시도 — harness-lint 차단
       (사유: staged 에 다른 세션 파일 포함 — multi-module:
              api:ride-employees, hr)
13:??  본 세션: git reset HEAD → 자기 파일만 다시 add → commit 재시도
13:04  다른 세션: PR-DESIGN-7 작업 commit (96e9534) 시도
       - cowork-staging-lint 통과 또는 우회 (방법 불명)
       - 본 세션이 reset 후 add 한 SQL 2개를 자기 commit 에 포함
       - push 완료
13:??  본 세션: git commit — "no changes added to commit" 결과
       (다른 세션이 이미 commit 으로 가져감)
13:??  git pull — Already up to date (이미 흡수된 SQL 받음)
```

## Root Cause (3-Why)

1. **Why** 다른 세션이 본 세션의 SQL 을 흡수했나?
   → 다른 세션의 `git add` 또는 `git commit` 시점에 본 세션의 staged 파일이
      working tree 에 존재 → 다른 세션이 자기 staged 와 합쳐서 commit

2. **Why** 두 세션 staged 가 합쳐졌나?
   → git index 는 repo 단위로 단일 — 두 세션이 같은 .git/index 공유
   → 한 세션의 `git add` 가 다른 세션의 staged 에 영향
   → 본 세션의 reset 후 add 와 다른 세션의 commit 가 거의 동시 발생

3. **Why** cowork-staging-lint 가 차단 안 했나?
   → 다른 세션의 commit 메시지 / 영역 라벨이 cowork-staging-lint 기준
      "단일 모듈" 로 통과했을 가능성 (PR-DESIGN-7 의 ui-design-lint 변경 +
      _docs/UI-DESIGN-STANDARD.md + migrations/2026-05-26_Q2_*.sql 의
      라벨 매핑이 `_docs` `_harness` `_root` 화이트리스트로 통과)

## Prevention

### 단기 (즉시 적용)

- 본 세션 `git add` 직전 항상 `git diff --cached --name-only` 로 기존 staged
  확인 → 다른 세션 파일 발견 시 보고 + reset
- commit 직후 즉시 `git log -1 --stat` 으로 자기 commit 내용 확인 →
  예상 외 파일 발견 시 즉시 보고

### 중기 (자동화 강화 TBD)

- `cowork-staging-lint` 확장:
  - 단일 모듈 commit 이라도 "다른 세션이 작성 중인 파일" 포함 여부 검출
  - 휴리스틱: 본 세션의 직전 30분 안 작성/수정한 파일과 비교
  - 또는 commit 직전 `.git/sessions/<id>/staged.txt` 기록 → cross-check
- 또는 git index 격리 — 세션별 별도 worktree (큰 변경, 보류)

### 권장 운영
- 큰 작업 (마이그+API+UI) 은 한 세션에서 짧은 시간 안에 commit + push 종결
- 다른 세션 활동 정황 (git status 에 자기 영역 외 파일 다수) 발견 시 1~3분
  대기 후 진행 (§ 21 "다른 세션 active 시 staging 시도 X")

## 동일 부류 사고

- 2026-05-06 cowork-staging-violation (1차 사고)
- 2026-05-09 cowork-pr-ux3-a-absorbed
- 2026-05-24 cowork-newfile-absorption
- **2026-05-26 본 사고 (4차)**

→ 같은 부류 4차 발생. § 0-1 의 "위반 5회+ 자율 개시 금지" 직전.
   중기 자동화 강화 (위) 우선 검토 필요.
