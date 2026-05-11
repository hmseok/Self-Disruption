# 회귀 케이스: Rule 21 합의 의무 공통 파일 사전 보고 누락

**날짜**: 2026-05-10
**위반**: CLAUDE.md Rule 21 + `_docs/SESSIONS-COORDINATION.md` § 2

## 본 세션 정체성
Ride* 모듈 세션 — `app/(employees)/Ride*/` + `app/api/ride-*/` 만 자율 commit.
공통 파일 책임 = 메인 세션 (sweet-amazing-galileo).

## 위반 누적 (사전 보고 없이 변경한 합의 의무 파일)
| PR | 공통 파일 | 사전 보고 | 결과 |
|----|---------|----------|------|
| PR-6.9 | `lib/menu-registry.ts` | ❌ | origin push |
| PR-6.10 | `lib/menu-registry.ts` | ❌ | origin push |
| PR-6.10.g | `lib/audit-log.ts` (신설) | ❌ | origin push |
| PR-6.10.g | `migrations/2026-05-08_ride_audit_logs.sql` | ❌ | origin push |
| PR-6.10.h | `lib/page-access.ts` (신설) | ❌ | origin push |
| PR-6.11.a | `migrations/2026-05-08_ride_settlements.sql` | ❌ | origin push |
| PR-6.11.a | `lib/menu-registry.ts` | ❌ | origin push |
| PR-6.12.a | `migrations/2026-05-09_partner_factories.sql` | ❌ | origin push |
| PR-6.13 | `app/components/ride-ops/NavTabs.tsx` (신설) | ❌ | origin push |
| PR-6.13 | `app/(employees)/factory-search/_components/SubNav.tsx` | ❌ | origin push (다른 세션 모듈 침범) |
| PR-6.13.b | `app/components/ride-ops/PageHeader.tsx` (신설) | ❌ | origin push (이후 deprecated) |
| PR-6.13.c | `app/components/PageTitle.tsx` | ❌ | **commit 차단됨** |
| PR-HARNESS-1 | `harness-engineering/scripts/ui-token-lint.js` (신설) | ❌ | origin push |
| PR-HARNESS-1 | `harness-engineering/scripts/menu-path-duplicate-lint.js` (신설) | ❌ | origin push |
| PR-HARNESS-1 | `harness-engineering/scripts/harness-lint.js` | ❌ | origin push |
| PR-HARNESS-1 | `package.json` | ❌ | origin push |

## root_cause
- 사용자 GO 키워드를 받은 후 즉시 코드 작성 시작 → 공통 파일 분리 절차 생략
- 메인 세션 (sweet-amazing-galileo) 에 위탁 / 합의 패턴 미인지
- factory-search/_components/SubNav.tsx 등 다른 세션 모듈도 직접 수정 (Rule 21 위반)

## prevention
1. **PR 시작 시 「영향 파일 목록」 분류 의무**:
   - 자율 영역 (`app/(employees)/Ride*/`, `app/api/ride-*/`) — 즉시 진행
   - 합의 의무 — 사용자 사전 보고 + GO + 별도 commit
2. **공통 파일 변경 보고 템플릿**:
   ```
   [공통 파일 변경 알림]
   세션: Ride* 모듈
   변경 파일: app/components/PageTitle.tsx
   변경 내용: PATH_TO_GROUP 에 admin-ops 그룹 5 페이지 등록
   영향 범위: 다른 세션 페이지 등록 X
   다른 세션 작업 중인지 확인 부탁
   → GO 받고 진행
   ```
3. **자동화 안전장치 (TBD)** — `harness-engineering/scripts/cowork-common-file-lint.js`:
   - staged 파일에 합의 의무 파일이 있고 + commit message 에 "공통 파일 합의 GO" 명시 없으면 차단
   - 합의 의무 파일 목록 hardcode (SESSIONS-COORDINATION.md 동기화)

## fix
- PR-6.13.c 의 PageTitle 변경 unstage
- Ride* 페이지 3개만 본 세션 자율 commit
- PageTitle 등록은 메인 세션 (sweet-amazing-galileo) 에 위탁 보고

## 향후
- 본 세션은 Ride* 모듈만 자율
- 새 페이지 추가 → 메인 세션에 「PageTitle 등록 + menu-registry 등록 부탁드립니다」 보고 의무
- 마이그레이션 → 사용자에게 "DB 변경 사전 보고" 의무 추가
