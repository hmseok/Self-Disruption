# CLAUDE — CallScheduler 모듈 보조 메모

> **위치**: `/app/CallScheduler/_docs/CLAUDE-CallScheduler.md`
> **범위**: 본 모듈 한정 보조 규칙. 부모 `/CLAUDE.md`(51KB) 와 충돌 시 부모가 우선, 본 메모는 부모를 보강.

## 0. 모듈 정체성

- 명칭: **근무시간표 분석 & 체크 배포**
- 책임: 콜센터 근무자의 월별 시프트 작성 → 분석 KPI → 배포(공지)
- 격리: 코드/문서/마이그레이션은 `app/CallScheduler/` + `prisma/schema.prisma` `cs_*` + `migrations/*call_scheduler*.sql` 한정
- **소속 네비 그룹**: `Employee of Ride Inc.` (사용자 통보 — 2026-05-03)
  - 향후 같은 그룹에 들어올 다른 직원 페이지들과 형제 관계
  - 네비 등록 시 ClientLayout `PATH_TO_GROUP` / `BUSINESS_GROUPS` 매핑 별도 작업으로
  - 현 MVP 1차 PR 에서는 직진입 URL `/CallScheduler` 로만 검증

## 1. 절대 따를 부모 규칙 (재확인)

| 규칙 | 의미 | CallScheduler 적용 |
|------|------|------|
| §6 SQL | PostgreSQL 문법·`$1` placeholder·`RETURNING *` 금지, MySQL 8.0 only | API 라우트 모든 raw SQL 적용 |
| §10 Soft Ice | GLASS L1~L5 + COLORS bg* + pillStyle | ScheduleGrid·KpiStrip·DistributionDialog 모두 |
| 규칙 17 | 모듈 폴더 격리, cross-module import 금지 | components/ utils/ 모두 모듈 내부에 |
| 규칙 18 | 테이블 모든 컬럼 sortBy + defaultSort | AnalyticsPanel 적용 |
| 규칙 19 | 셀 한 줄, `<div>` 2개 금지 | AssignmentCell 단일 라인 |
| 규칙 20 | `alert()` 금지, 글래스 패널로 결과 | DistributionDialog 응답 처리 |
| 규칙 4 | 사이드바·라우트 정합성 | system_modules / ClientLayout / PageTitle 4곳 동기화 |

## 2. 본 모듈 추가 규칙

### 2.1 prefix 일관성
- 테이블명: 반드시 `cs_` 접두사
- API 경로: `/api/call-scheduler/*` (URL 폴더는 `CallScheduler` 그대로)
- 컴포넌트 prop 타입: 모두 `app/CallScheduler/utils/types.ts` 단일 source of truth

### 2.2 시간 처리
- DB 저장: `TIME` 타입은 24h `HH:MM:SS`
- `is_overnight=1` 슬롯의 종료 시간은 다음 날을 의미 (TIMESTAMPDIFF 시 +1 DAY)
- timezone: 서버/DB 모두 Asia/Seoul, 클라이언트도 KST 표시

### 2.3 worker.color_tone
- enum 7값 외 입력 차단 (입력 폼 select)
- 신규 워커 생성 시 default `'none'`
- 부모 디자인 토큰(COLORS.bg*) 외 hex 직접 사용 금지

### 2.4 special_code 처리
- DB enum 6값 (`none|am_free|pm_free|am_half|pm_half|off`)
- UI 표시는 한국어 매핑 utils (`SPECIAL_LABEL`)
- computed_hours 계산은 항상 서버 측 (UI 신뢰 X)

### 2.5 sql-lint 통과 의무
- raw SQL은 모든 컬럼이 schema.prisma 또는 migration SQL 에 존재해야 함
- `cs_workers.full_name` 같은 추측 금지 → `name`

### 2.6 amount-sign-lint
- 본 모듈은 금액 표시가 없지만, 시간 비교 표시(`+1.5h` 등)도 `+` 부호 금지 (규칙 18 동일 적용)

## 3. 미배포·미등록 상태 가이드

- MVP 1차 PR에서:
  - 네비 등록(4곳 동기화) **보류** → 직진입 `/CallScheduler` URL로 QA
  - Prisma 마이그레이션 SQL **작성만** (사용자 직접 적용)
  - 시드(워커 16명, 슬롯 13개) SQL 동봉
- 사용자 확인 후 별도 커밋:
  - 네비 등록
  - 권한 가드 (PermissionGate)
  - Excel 업로드 파서

## 4. 관련 문서

- 데이터 모델: `_docs/DATA-MODEL.md`
- UI 스펙: `_docs/UI-SPEC.md`
- 원천 자료 분석: `_docs/SOURCE-ANALYSIS.md`
- 검증 로그: `_docs/VERIFICATION.md` (마지막 단계에서 생성)

## 5. 변경 이력

| 날짜 | 변경 | 작성자 |
|------|------|------|
| 2026-05-03 | 초안 작성, 5월 스케줄 분석 반영 | Claude |
