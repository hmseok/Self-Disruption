---
name: harness
description: FMI ERP 하네스 규칙 로드 — 새 코워크 세션 시작 시, 또는 「하네스」/「규칙」/「코워크 협업」 키워드 등장 시 호출. CLAUDE.md 의 21개 규칙을 한눈에 확인하고 핵심 규칙 (코워크 협업 / SQL 검증 / UI 규칙 / 결과 메시지) 의 적용 의무 안내.
---

# FMI ERP — 하네스 규칙 (Quick Reference)

> 코워크 세션이 같은 repo 작업 시 반드시 따라야 하는 21개 규칙.
> 자세한 내용: `/CLAUDE.md` (root) — 본 skill 은 한 페이지 요약.

---

## 🚨 0-1. 강제 규제 (NON-NEGOTIABLE)

| # | 규칙 | 핵심 |
|---|------|------|
| 1 | **풀 파이프라인 강제** | 외부 API / DB 대량 쓰기 / 새 통합 패턴 → GATE 1~9 모두 |
| 2 | **즉답 화이트리스트** | typo / UI 텍스트 / 단순 패턴 추가만 즉답 OK |
| 3 | **외부 LLM/유료 API** | 모델 quirk + N=1 dry-run + 루프 안전망 2중 |
| 4 | **GATE 5 영향 검증** | 빌드 + import 체인 + 연관 페이지 + 사이드바 정합 |
| 5 | **Push 전 필수 보고** | 변경 요약 + 검증 + 위험 + 롤백 계획 |
| 6 | **UI 변경 → GATE 7 Designer** | Chrome MCP 또는 사용자 스크린샷 검수 의무 |
| 7 | **답변 해석** | "옵션 N" = 방향만 / "구현 진행" = 코딩 GO |
| 8 | **End-to-End 시뮬레이션** | SMS / Webhook / batch 등 다단계 파이프라인 사전 시뮬레이션 |
| 9 | **회귀 케이스 자동 등록** | 사용자 "안 돼요" 1회 → regression-cases 기록 |
| 10 | **Apply 후 자기 검증** | 대량 UPDATE → 검증 SQL + UI alert 「PASS N / FAIL M」 |
| 11 | **SQL 컬럼 사전 검증** | schema.prisma 직접 확인, 추측 금지 |
| 12 | **UI 화면 데이터 정합성** | 같은 데이터 표출 모든 화면 동시 적용 |
| 13 | **외부 시스템 호환성** | MySQL 함수 / 라이브러리 / 환경변수 사전 검증 |
| 14 | **동형 패턴 자동 확장** | 같은 부류 영역 인덱스 → 동시 적용 |
| 15 | **반복 실수 자동 차단** | N회 실수 → lint hook 자동 신설 |
| 16 | **시간 걸리는 작업 = 플로팅 진행률** | `AIProgressFloater` 의무 (alert 금지) |
| 17 | **모듈 폴더 분리 + import 경계** | `app/(admin)/finance/` 등 route group, 모듈 간 import 금지 |
| 18 | **테이블 모든 컬럼에 정렬** | `NeuDataTable` 모든 column 에 `sortBy` 의무 + 「+ 부호 절대 금지」 |
| 19 | **줄바꿈 최소화** | 셀: `white-space: nowrap`, 의미 중복 컬럼 제거 |
| 20 | **결과 메시지 UI 의무** | alert 금지, 글래스 패널로 (성공 녹색 / 실패 빨강) |
| **21** | **★ Cowork 멀티 세션 협업 ★** | 작업 영역 인덱스 + 명시 staging + 순차 push |

---

## 🤝 규칙 21 — Cowork 멀티 세션 협업 (강조)

> **다른 코워크 세션이 같은 repo 작업 중이면 반드시 적용**.

### 발동 조건
- 사용자가 「다른 코워크에서 작업중」 명시
- `git status` 에 자기 영역 외 modified/untracked 파일 보임
- `prisma/schema.prisma` / `ClientLayout.tsx` 같은 공통 파일 modified
- 같은 시각 다른 세션이 동일 repo 진행 중인 정황

### 작업 절차 (코드 작성 / staging 전 의무)

```
[A] 작업 영역 인덱스
   1. 자기 작업 영역 명시 (예: app/CallScheduler/, app/api/call-scheduler/)
   2. 다른 세션 영역 식별 (untracked 중 자기 영역 외)
   3. 공통 파일 정리 책임 — 사용자에게 "어느 세션이 정리할지" 확인

[B] staging 원칙
   ❌ git add . / git add -A — 절대 금지
   ✅ git add app/MyModule/ app/api/my-module/ — 명시적 폴더만
   ✅ git status 결과 사용자 보고 (staged + unstaged + untracked)

[C] 순차 push
   1. 한 세션 push 끝날 때까지 다른 세션은 commit 만 준비, push 대기
   2. 두 번째 세션은 git status 로 첫 commit 반영 확인 후 push
   3. conflict 시: git checkout HEAD -- <공통파일> 로 main 우선

[D] 사용자 보고
   1. 어느 파일 staging — 어느 파일 양보
   2. 공통 파일 (schema.prisma 등) 누가 정리
   3. 마이그레이션 SQL 누가 실행 (보통 사용자 직접)
```

### 금지 사항
- `git add .` / `git add -A` — 다른 세션 작업물 침범
- 공통 파일 임의 수정 후 commit
- 다른 세션 Untracked 폴더를 자기 commit 에 포함
- 다른 세션 push 안 끝났는데 force push / 동시 push

---

## 🚦 신규 세션 부트스트랩

새 코워크 세션 시작 시 권장 절차:

```
1. CLAUDE.md 읽기 (자동 로드됨)
2. 본 skill (/harness 또는 skill: harness) 호출 — 핵심 21개 한눈에
3. 작업 영역 결정 (예: app/MyModule/) → 다른 세션과 충돌 없는지 확인
4. git status → 자기 영역만 staging
5. 검증 → 빌드 + lint + GATE 5 영향 검증
6. 사용자 보고 후 push
```

---

## 📚 자세한 내용

- `/CLAUDE.md` — 21개 규칙 전체 (각 규칙 위반 사례 + 자동화 안전장치 포함)
- `/HARNESS.md` — 기능 현황 + 모듈 상태
- `/harness-engineering/agents/` — 9인 에이전트 프롬프트
- `/harness-engineering/knowledge/` — 자가 학습 저장소 (patterns / common-errors / lint-violations 등)
- `/harness-engineering/scripts/` — lint hooks (sql-lint / api-call-trace / ui-data-coverage 등)

## 🛠️ 자동화 명령어

```bash
npm run lint:harness           # 5종 lint 통합 실행
npm run lint:harness:report    # 정보성 (exit 0)
npm run lint:harness:baseline  # 현재 위반 동결 (known issue)
npm run harness:install-hook   # pre-commit hook 설치
```

---

**이 skill 을 호출하면 위 21개 규칙이 컨텍스트에 로드됩니다. 작업 시작 전 반드시 호출 권장.**
