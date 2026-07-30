# FMI ERP — 프로젝트 가이드 v4.0 (2026-07-30 전면 개편)

> 기존 하네스 체계(v3.0, 규칙 30개)는 폐지. 백업: `_archive/CLAUDE-v3-harness-2026-07-30.md`
> 새 방향: **가볍고, 쓸 수 있는 수준으로.** 규칙보다 결과물 중심.

## 프로젝트 개요

- **서비스**: FMI ERP — 렌터카 사업 통합 관리 (차량·계약·재무·인사)
- **회사**: 주식회사 에프엠아이 (단독 회사)
- **배포**: https://hmseok.com (GCP Cloud Run)
- **스택**: Next.js 16 (App Router) / React / TypeScript / Prisma Raw SQL / MySQL 8 (Cloud SQL)
- **인증**: Custom JWT (`lib/auth-server.ts`, localStorage `fmi_token`)

## 2026-07 개편 방향

1. **단순하게** — 화면 하나 = 파일 하나 = 목적 하나. 1,000줄 넘는 페이지 파일 금지.
2. **중복 제거** — 같은 데이터의 화면은 한 곳으로 통합 (재무 중복 3쌍, 계약 2계통 통합 대상).
3. **죽은 코드 정리** — 도달 불가 탭/링크/hidden 페이지는 삭제.
4. **목업 먼저** — 큰 화면 변경은 `_mockups/`의 HTML 시안으로 확정 후 구현.

개편 기준 문서: `_docs/REDESIGN-2026-07.md` (기능 재정의 + 새 IA)

## 꼭 지킬 것 (최소 규칙)

1. **MySQL 전용** — PostgreSQL 문법($1, RETURNING) 금지. `$queryRaw` tagged template 또는 `$queryRawUnsafe(sql, ...params)`.
2. **SQL Injection 금지** — 문자열 보간으로 쿼리 조립 금지, 파라미터 바인딩 사용.
3. **컬럼명 추측 금지** — `prisma/schema.prisma` 확인 후 사용.
4. **커밋 전 빌드 확인** — `npx tsc --noEmit` 최소, 큰 변경은 `npx next build`.
5. **멀티 세션 주의** — `git add .` 금지, 자기 작업 파일만 명시적으로 add.
6. **UI 텍스트는 한국어** — 개발 용어(dry-run, mock, Phase N 등) 화면 노출 금지.
7. **큰 변경은 사용자 확인 후** — DB 마이그레이션, 대량 UPDATE, 외부 API 호출은 먼저 보고.
8. **SQL 정리는 개편과 함께** — 새로 만들거나 재작성하는 API는 타입드 Prisma Client(`prisma.모델.findMany` 등) 우선. raw SQL은 복잡한 집계/JOIN에만 쓰되 파라미터 바인딩 필수. 개편에서 손대지 않는 기존 raw SQL은 미리 일괄 전환하지 않는다 (2~9단계에서 재작성·삭제될 코드).

## 구조

```
app/            Next.js 페이지 + API
lib/            유틸 (auth, prisma, menu-registry = 메뉴 단일 소스)
prisma/         스키마 (42 모델)
_docs/          설계 문서
_mockups/       화면 시안 (HTML, 브라우저에서 바로 열기)
_archive/       폐기 코드/문서 백업
```
