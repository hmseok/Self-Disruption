# CHARGERS — 설계서 v2 (PR 단계 분할)

> **작성**: 2026-05-22 (chargers 세션 / focused-clever-planck)
> **근거**: `CHARGERS-PERSONAS.md` + `CHARGERS-DATA-MODEL.md`
> **상태**: Planner 설계서 — PR별 사용자 GO 키워드 후 코드 진입 (Rule 7 / 27)
> **세션 책임**: `app/(employees)/RideMTOps/chargers/*` + `app/api/ride-chargers/*`

---

## 1. 목표

충전사업자(플러그링크) 위탁 충전기 5만기에 대한 **점검·유지보수·정산 풀 워크플로우**.
b-1(단순 자산 CRUD)을 폐기하고 7단계 운영 흐름(`CHARGERS-PERSONAS.md` §3)을 시스템화.

---

## 2. 모듈 구조

### 2.1 페이지 — `/RideMTOps/chargers` (단일 라우트, 내부 5탭)

```
MTOpsNavTabs (순회정비 / 법정검사 / 충전기)
└ /RideMTOps/chargers
   ├ 탭1 자산      — 충전소·충전기 목록 (서버 페이지네이션 + 권역/개소 필터)
   ├ 탭2 스케줄    — 점검 일정 생성·배정 (리스트 + 캘린더)
   ├ 탭3 현장작업  — 점검 결과 입력 + 보고서 기본내용 + 사진 업로드
   ├ 탭4 검수      — 보고서 검수 + 사업자 제출 체크
   └ 탭5 정산      — 단가표 + 정산 생성·확정 (관리자 전용 탭)
```

UI 표준: `PageTitle` 자동 헤더 / `DcStatStrip` / `DcToolbar` / `NeuDataTable`
(모든 컬럼 `sortBy` — Rule 18). 결과 메시지는 글래스 패널 (Rule 20).

### 2.2 API — `app/api/ride-chargers/*`

```
stations/route.ts            GET 목록(페이지네이션) / POST 등록
stations/[id]/route.ts       PATCH / DELETE
devices/route.ts             GET / POST
devices/[id]/route.ts        PATCH / DELETE
inspections/route.ts         GET / POST
inspections/[id]/route.ts    PATCH / DELETE
inspection-photos/route.ts   GET / POST(업로드) / DELETE
report-templates/route.ts    GET / POST / PATCH
report-generate/route.ts     POST — 양식 + 데이터 → xlsx 생성
settlement-rates/route.ts    GET / POST / PATCH
settlements/route.ts         GET / POST / PATCH
import/route.ts              POST — 구글시트/엑셀 마스터 임포트
```

모든 라우트 — `verifyUser` + `canAccessPage(['/RideMTOps/chargers'])`, 마이그레이션
미적용 graceful fallback (`_migration_pending` — Rule 23).

---

## 3. PR 단계 분할 (6개)

> 각 PR은 시작 시 Rule 27 GATE 체크리스트 가시화, 종료 시 `_docs` 갱신 (Rule 22).

### C1 — 마이그레이션 + 마스터 + 구글시트 임포트 + 자산 탭
- `migrations/2026-05-2x_rc_charger_tables.sql` — 7테이블 (멱등 `CREATE TABLE IF NOT EXISTS`) + b-1 `DROP TABLE IF EXISTS`
- b-1 잔재 제거: `ride_chargers` API 3개 + `ride-charger-maintenance` + 구 page.tsx + 구 마이그 파일
- 구글시트/엑셀 임포트 도구 — 컬럼 매핑 UI, `gsheet_row_key` UPSERT 멱등 (Rule 24), `AIProgressFloater` 진행률 (Rule 16)
- 자산 탭 — 충전소 목록 (서버 페이지네이션, 권역/개소/상태 필터), 충전소 클릭 → 충전기 N기 펼침
- **선행**: 사용자 구글시트 컬럼 공유 → 매핑 확정

### C2 — 점검 스케줄링
- 스케줄 탭 — 점검 일정 생성 (충전소 선택 + 유형 + 예정일), 담당자 배정
- 유형별 자동 생성 보조 (월간 일괄 생성 등 — batch는 2중 안전망, Rule 3)
- 리스트 + 월 캘린더 뷰, 현장직원 「내 담당만」 필터
- 감리 — `due_date = 배정일 + 10일` 자동, 기한 임박 강조

### C3 — 현장 작업 + 사진 + 보고서 기본내용
- 현장작업 탭 — 점검 결과 입력 (체크리스트), `rc_report_templates.default_content` 기본값 로드
- 사진 업로드 — 양식별 `photo_slots` 구분 카테고리, 모바일 촬영 고려
- 저장소 결정 (로컬/GCS) — C3 착수 시 확정
- 상태 전이: 예정 → 작업중 → 보고서작성

### C4 — 보고서 양식 관리 + 자동 생성 + 다운로드
- 양식 관리 — 유형별 xlsx 양식 업로드 (`rc_report_templates`)
- 보고서 생성 — 양식 + `report_data` + 사진 치환 → xlsx (`xlsx` skill 활용)
- 다운로드, `report_file_path` 저장

### C5 — 검수 + 사업자 제출
- 검수 탭 — 사무실직원 보고서 검수 → 통과 / 사진보완요청(재작업)
- `report_uploaded` "업로드함" 체크 (사업자 구글드라이브 수동 업로드 후)
- 상태 전이: 제출 → 검수중 → 재작업 ↺ / 완료

### C6 — 정산
- 정산 탭 (관리자 전용) — `rc_settlement_rates` 단가표 관리
- 완료 점검 → 단가 적용 정산 자동 생성, 별건 수동 입력
- 관리자 확정 (`status: 입력→확정→요청완료`), 귀속월별 집계
- 결과는 글래스 패널 (Rule 20)

---

## 4. 핵심 설계 결정 (확정)

| # | 결정 | 내용 |
|---|------|------|
| D1 | 마스터 2단 구조 | 충전소(개소) 1 : N 충전기(기). 점검은 충전소 단위 |
| D2 | 현장전환 | 충전사업자 매각 → 회사 전환작업 (로고/펌웨어/테스트/사진/도색) — 점검 유형 5번째 |
| D3 | 정산 단가 | 점검유형 단위 단가표 (급속/완속 구분 없음) + 별건 수동 |
| D4 | 모듈 경로 | `/RideMTOps/chargers` 유지, 내부 5탭 멀티 |

---

## 5. 위험 요소 & 대응

| 위험 | 대응 |
|------|------|
| 5만기 — 목록 성능 | 서버 페이지네이션 의무, 권역/개소 필터 우선, 인덱스 설계 (DATA-MODEL §2~3) |
| 구글시트 컬럼 불일치 | C1 임포트 — 컬럼 매핑 UI + dry-run 미리보기, `gsheet_row_key` UPSERT |
| 마이그레이션 미적용 | 전 API graceful fallback + `_migration_pending` 배너 (Rule 23) |
| 재임포트 중복 | `UNIQUE(gsheet_row_key)` UPSERT 멱등 (Rule 24) |
| 사진 대용량 | C3 — 저장소/압축 정책 별도 결정 |
| 공통 파일 변경 | menu-registry/PageTitle 변경 시 메인 세션 합의 (Rule 21) |

---

## 6. 공통 파일 영향 (Rule 21)

| 파일 | 변경 | 시점 |
|------|------|------|
| `lib/menu-registry.ts` | `mod-mt-chargers` 이미 등록됨 — 변경 불필요 가능성 높음 | C1 점검 |
| `app/components/PageTitle.tsx` | `/RideMTOps/chargers` 등록 여부 점검 | C1 점검 |

→ 변경 필요 시 메인 세션(sweet-amazing-galileo) 사전 합의 후 단독 commit.

---

## 7. GATE 체크리스트 (매 PR — Rule 27)

각 PR 시작 시: G3 설계 세부 + 시뮬레이션 → 사용자 GO → G5 tsc/build →
G6 lint:harness + 동형패턴 → G7 시각검수 (Chrome MCP/스크린샷) → G8 evaluate.js →
Rule 22 `_docs` 갱신 (CHANGELOG/DATA-MODEL/UI-SPEC).

---

본 문서는 PR 진행에 따라 갱신.
