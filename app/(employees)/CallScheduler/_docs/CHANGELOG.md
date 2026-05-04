# CallScheduler — CHANGELOG

> 매 PR 종료 시 한 줄 이상 기록 의무 (CLAUDE.md 규칙 22)
> 본 세션 (2026-05-03 ~ 05-04) 의 PR 누적

## 2026-05-04 (밤 — 그룹 최소 인원 셋팅)

### PR-2QQ-d-2 — cs_group_min_coverage (디폴트 + 요일 예외)
- 운영 사실 (Rule 25): 그룹별로 매일 최소 N명 + 특정 요일만 다른 인원 (예: 금요일 피크 3명, 일요일 1명)
- DB 마이그레이션: `2026-05-04_cs_group_min_coverage.sql`
  - 신규 테이블 `cs_group_min_coverage` (id / group_id / dow nullable / min_workers)
  - UNIQUE (group_id, dow) — dow=NULL = 매일 디폴트 1행 + 0~6 요일 예외 N행
  - FK ON DELETE CASCADE
  - max_workers 폐기 (사용자 결정 — 사용 안 함)
- API:
  - `GET /api/call-scheduler/shift-groups/[id]/min-coverage` — 행 모두 반환 (dow=NULL 우선)
  - `PUT /api/call-scheduler/shift-groups/[id]/min-coverage` — 일괄 재정의 (DELETE + INSERT 패턴)
  - graceful: 마이그 미적용 시 GET 빈 배열 + `_migration_pending: true`
- UI `GroupEditor`:
  - 좌측 패널 하단에 "⚖️ 최소 인원 (자동 생성용)" 섹션 추가
  - 매일 디폴트 1칸 + 요일별 7칸 (빈 칸 = 디폴트 사용)
  - 요일 라벨 색상 (일=빨강 / 토=파랑)
  - graceful: 마이그 미적용 시 안내 배너
- 자동 생성 알고리즘에서 활용 예정 (PR-2QQ-d-3)

## 2026-05-04 (밤 — 워커 제약 모델)

### PR-2QQ-d-1-fix — 일요일 비선호 자동 표시 버그
- 사용자 보고: 모든 워커가 편집 시 일요일이 비선호로 표시됨 + 해제 후 저장 안 됨
- 원인: `''.split(',')` → `['']` → `Number('')` === 0 (일요일) 로 잘못 파싱
- 수정: 빈 토큰 먼저 제거 후 Number() 파싱 + 0~6 범위 필터

### PR-2QQ-d-1 — 워커 제약 모델 + WorkersTab UI 강화
- 운영 사실 (Rule 25): 외부/내부 통합 모델. priority + 비선호 요일 + 필수/최대 일수 + 자유 패턴.
- DB 마이그레이션: `2026-05-04_cs_workers_constraints.sql`
  - `cs_workers.priority_level TINYINT DEFAULT 2` (1=최우선, 2=일반, 3=백업)
  - `cs_workers.preferred_dow_avoid VARCHAR(16)` ('0,5' = 일·금)
  - `cs_workers.required_days_per_month TINYINT NULL`
  - `cs_workers.max_days_per_month TINYINT NULL`
  - `cs_workers.work_pattern_text VARCHAR(64)` (외부 + 일반 통합 — 자유 메모)
  - 인덱스: `idx_cs_w_priority (priority_level, is_active)`
  - external_pattern → work_pattern_text 자동 마이그
- API:
  - `/api/call-scheduler/workers` GET/POST: 새 컬럼 graceful 추가
  - `/api/call-scheduler/workers/[id]` PATCH: 새 컬럼 화이트리스트
- UI `WorkersTab`:
  - 편집 모드 시 ConstraintsPanel 펼침 (colSpan row)
  - 좌측: 우선순위 (P1/P2/P3) + 외부 직원 토글 + 비선호 요일 (7 button)
  - 우측: 월 필수/최대 일수 + 자유 패턴 메모
  - 비편집 모드: 외부 직원 🔒 배지 + P1 빨간 배지 표시
  - 저장 시 RideEmployees PATCH (color/group) + cs_workers PATCH (constraints) 동시
- **외부 직원 엑셀 업로드 폐기** — `ExternalScheduleDialog` + `external-schedule` API orphan
  - 상세 [⋯] 메뉴에서 항목 제거
  - 코드 파일 자체는 남아있음 (commit 시 git rm 필요)

## 2026-05-04 (밤 — 사소한 UX 보강)

### PR-2QQ-fix1 — RideEmployees 목록 헤더 뒤로가기
- `/RideEmployees` 메인 목록 페이지 헤더에 [← 근무시간표] 링크 추가
- new / [id] 페이지는 이미 있었으나 메인 목록 페이지만 누락

## 2026-05-04 (밤 — 외부 직원 + manual_lock)

### PR-2QQ-b — 외부 직원 + manual_lock + 엑셀 업로드
- 운영 사실 (Rule 25): 야간 슬롯 L13 외부 직원 정동민(1명, 2-on-2-off)이 1순위. 매월 매니저가 엑셀로 외부 일정 업로드.
- DB 마이그레이션: `2026-05-04_cs_external_workers.sql`
  - `cs_workers.is_external TINYINT(1)` (1순위 표식)
  - `cs_workers.external_pattern VARCHAR(128)` (자유 메타)
  - `cs_assignments.manual_lock TINYINT(1)` (자동 생성 보존)
  - 인덱스: `idx_cs_asn_lock (schedule_id, manual_lock)`
- API:
  - `/api/call-scheduler/workers` GET/POST: is_external + external_pattern 지원 (graceful)
  - `/api/call-scheduler/workers/[id]` PATCH 신설 (cs_workers 직접 수정, RideEmployees 와 분리)
  - `/api/call-scheduler/schedules/[id]/external-schedule` POST/GET 신설:
    - GET = 엑셀 템플릿 다운로드 (외부 직원 + 야간 슬롯 자동 샘플)
    - POST = 엑셀 업로드 → manual_lock=1 upsert (preview/apply)
  - `/api/call-scheduler/schedules/[id]` GET: manual_lock + is_external 응답 (graceful)
  - `/api/call-scheduler/schedules/[id]/auto-generate`:
    - manual_lock 셀 항상 skip-existing (overwrite 무시)
    - clear_first 시 manual_lock=1 보존 (조건부 DELETE)
- UI:
  - `ExternalScheduleDialog` 신설 (720px) — 템플릿 → 업로드 → preview → apply
  - 상세 [⋯] 메뉴: [🔒 외부 직원 일정] 항목 추가
  - `AssignmentCell`: manual_lock=1 셀에 🔒 아이콘 prefix

## 2026-05-04 (밤 — KPI 균형도 상세)

### PR-2QQ-c — KPI 균형도 상세 (야간/금야간/일야간)
- WorkerKpi 확장: `fri_overnight`, `sun_overnight`, `weekend_count`, `weekday_count`
- API `/api/call-scheduler/schedules/[id]`: work_date 의 day-of-week 로 카운트
- AnalyticsPanel:
  - 균형도 카드 4개 (전체 야간 / 시간 편차 / 금야간 / 일야간) — max-min range + min/avg/max
  - 인당 분석 테이블 컬럼 확장: 금야 / 일야 / 주말 추가 (10 컬럼)
  - 편차 알림: 금/일 야간 range >= 3 시 빨간 배너
  - 워커별 금/일 야간 빨강 강조 (평균의 1.5배 초과)
- 운영 사실 (Rule 25): 야간 워커는 금/일 비선호 → 균등 분배 시각화

## 2026-05-04 (밤 — 그룹 마스터 강화)

### PR-2QQ-a — 그룹 마스터 UI 강화 (카테고리/카드/색상)
- DB 마이그레이션: `2026-05-04_cs_shift_groups_category.sql`
  - `cs_shift_groups.category VARCHAR(32)` 추가 (default 'general')
  - `cs_shift_groups.color_tone` ENUM 7→14 (indigo/sky/teal/lime/orange/pink/slate 추가)
  - `cs_workers.color_tone` 동일 14개로 확장
  - 인덱스: `idx_cs_grp_category (category, sort_order)`
- API:
  - `/api/call-scheduler/shift-groups` GET: 멤버 chip 정보 + category 응답 (graceful — 컬럼 없어도 'general' fallback)
  - POST/PATCH: category 인자 지원 + color_tone 14개 화이트리스트
- UI `GroupsTab`:
  - 카테고리 필터 pill (전체 / 주간 / 야간 / 특수 / 일반 / 사용자 정의)
  - 정렬 옵션 (커스텀 순서 / 시작 시간 / 이름 / 멤버 수)
  - 카테고리별 섹션 표시 (sort_order 모드 + 전체 필터 시)
  - 그룹 카드 상세화: 좌측 색상바 + 시간/익일 배지 + 패턴 detail (custom 요일 명시) + 멤버 chip stack (워커 색상 적용) + 설명
  - 카드 안 [▲▼] 순서 변경 버튼 (sort_order 모드)
- UI `GroupEditor`:
  - 카테고리 선택 (pill + 직접 입력)
  - 색상 picker → 14 dot swatches (그룹 색상)
- UI `WorkersTab`:
  - 직원 색상 picker → 14 dot swatches
- 유틸 `palette.ts`: 14개 토큰 매핑 (TONE_BG/BORDER/TEXT/SOLID)
- 유틸 `types.ts`: ColorTone union 14개 + COLOR_TONE_OPTIONS hex 동봉

## 2026-05-04 (밤 — 메뉴 정리 추가)

### PR-2PP — 상세 [⋯] 메뉴 단순화
- 공통 셋팅 6개 항목 제거 (시간/그룹/직원/직원마스터/공휴일/휴가)
- 이유: 목록 헤더의 [📋 직원마스터] / [⚙️ 설정] 직접 버튼과 중복 (PR-2NN-fix 와 일관)
- 상세 [⋯] 에는 본 월 한정 작업만 잔존:
  - 작업: 공지로 변경 / 자동 생성 / 직원 요청 / 분석·배포 이력
  - 위험: 삭제

## 2026-05-04 (밤 — 동시 근무 허용)

### PR-2OO — 1셀 N워커 동시 근무 (운영 사실 반영, Rule 25)
- 운영 사실: 같은 그룹 안 멤버가 같은 시간 슬롯에 동시 출근 (예: 야간콜 4명 모두 22-08)
- DB 마이그레이션: `cs_assignments` UNIQUE KEY 변경
  - 이전: `(schedule_id, work_date, shift_slot_id)` — 1셀 1워커 강제
  - 변경: `(schedule_id, work_date, shift_slot_id, worker_id)` — 1셀 N워커 허용
- API `auto-generate`: existingMap 키를 `(date, slot, worker)` 단위로 변경
- API `assignments PUT`: `assignment_id` 옵션 인자 추가 — 특정 row UPDATE 명시
  - `worker_id` + (date, slot) 키로 upsert (멀티 워커 지원)
- 매트릭스 UI: 1셀에 워커 chip 세로 stack + [+] 추가 버튼
  - `cellMap`: `Map<string, Assignment>` → `Map<string, Assignment[]>`
  - 빈 셀 클릭 → 새 워커 추가 picker
  - 기존 chip 클릭 → 그 워커 수정 picker
- 버그: 자동 생성 시 `Duplicate entry '...' for key 'uq_cs_asn_cell'` 1062 에러 해결

### PR-2NN-fix — 목록 페이지 헤더 단순화
- [⋯] 드롭다운 폐기 (6개 셋팅 탭 = 모두 같은 settings 페이지로 → 중복)
- [📋 직원 마스터] + [⚙️ 설정] 2개 직접 버튼만 노출

## 2026-05-04 (저녁 — UX 보강)

### PR-2MM — 자동 생성 모달 자동 미리보기
- 모달 열림 시 자동으로 미리보기 실행 (300ms debounce)
- 옵션 변경 시 자동 재계산 (overwrite/clear/skip-holidays/mark-leaves)
- 적용 버튼 활성화 조건 완화 — `to_insert + to_update > 0` 이면 항상 활성
- 변경 사항 0건 시 비활성 + tooltip "변경 사항 없음"
- "✨ N건 적용" 버튼 라벨로 적용 분량 즉시 노출
- 생성 안 눌리던 사용자 보고 즉시 반영

### PR-2NN — 목록 페이지 [⋯] 더보기 메뉴
- `/CallScheduler` 메인 헤더에 [⋯] 메뉴 추가 (상세 페이지와 동일 패턴)
- 메뉴 항목: 시간 / 그룹 / 직원 / 직원마스터 / 공휴일 / 휴가 + 설정 페이지
- 매월 새 월 만들기 전 / 후 셋팅 직접 진입 (목록 페이지에서도 가능)
- 외부 클릭 시 자동 닫기 (mousedown 핸들러)

## 2026-05-04 (오후 — 추가 정리)

### Route Group 이동 — `app/(employees)/`
- `app/CallScheduler/` → `app/(employees)/CallScheduler/`
- `app/RideEmployees/` → `app/(employees)/RideEmployees/`
- URL 변경 없음 (Route Group `()` 은 URL에 안 나타남)
- import 경로 일괄 sed: `@/app/CallScheduler` → `@/app/(employees)/CallScheduler`
- 직원 토큰 링크 유효 (`/CallScheduler/e/<token>` 그대로)

### PR-2II — 직원 마이페이지 휴가 신청
- `LeaveRequestDialog` 신설 (480px 모달)
- 마이페이지 [🙋 휴가 신청] — 토큰 모드는 status='pending' 자동
- 종류 선택 시 회사 정책 default 자동 (PR-2HH 활용)
- 빠른 프리셋 (반차 4h / 패밀리 3h / 종일 8h) + 차감 미리보기

### PR-2JJ — RideEmployees 엑셀 일괄 등록
- API: `GET /template` (샘플 .xlsx) + `POST /bulk-upload` (preview/apply)
- `BulkUploadDialog` 신설 (800px) — 5타일 결과 (전체/정상/중복/오류/빈)
- 이름 중복 자동 skip + 안내 시트 포함
- RideEmployees 목록에 [📤 일괄 등록] / [🔧 중복 정리] 버튼

### PR-2KK — 월 생성 + 자동 채우기 통합
- `/CallScheduler/new` 폼에 ☑ 자동 채우기 체크박스 (기본 ON, 보라색 배너)
- 생성 직후 `auto-generate?mode=apply` 자동 호출 → 그룹 패턴 + 휴가 반영
- 진행 상태 라벨 (월 생성 → 자동 생성 → 결과 N건 → 이동)
- 전월 복제 선택 시 비활성 (복제로 채워지므로)

### PR-2LL — [⋯] 더보기 메뉴 확장 (셋팅 직접 진입)
- 상세 페이지 [⋯] 메뉴 재구성:
  - 작업: 공지 / 자동 생성 / 직원 요청 / 분석
  - **공통 셋팅 (월과 무관 — 한 번만)**: 시간 / 그룹 / 직원 / 직원마스터 / 공휴일 / 휴가 6개 직접 항목
  - 위험: 삭제
- `settings/page.tsx` `useSearchParams` + `Suspense` — `?tab=...` query 수신
- 사이드바 변경 없음 (단일 진입점 유지) — 매월 셋팅 X
- 운영 흐름: 셋팅 한 번 → 매월 [+ 새 월] (자동 채우기) → 미세 조정

## 2026-05-04 (오전)

### PR-2AA — 휴가 발급량 + 잔여 자동 차감
- 마이그레이션: `cs_leave_quotas` 테이블 신설 (worker × year × month × leave_type, 반차 0.5일 단위)
- API: `GET/POST /api/call-scheduler/leave-quotas` (잔여 자동 계산) + `PUT /bulk` (일괄 발급)
- UI: `QuotaBulkDialog` — 연차(연1회) / 패밀리데이(월1회) / 병가(연단위) 프리셋
- 영향: LeavesTab 헤더에 [💼 일괄 발급] 버튼 + 워커별 잔여 표시 (예정)

### 휴일/휴가 24/365 재구성
- 사용자 명시: 24/365 콜센터 운영, 공휴일도 일부 직원 근무
- cs_holidays.exclude_auto 디폴트 `true → false` 변경
- 휴일 탭: "🏖 회사 휴일" → "🏖 공휴일 (참고)" — 자동 제외 X, 시각화 + 일괄 적용 도구
- 휴가 탭: 종류 추가 — `familyday` (패밀리데이) + 사용자 운영 흐름 반영
- 영향: HolidaysTab 안내 배너 추가, LeavesTab 종류 6개로 확장

### PR-2M ~ PR-2P — 헤더 정리 + 설정 페이지 5탭
- **2M** 상세 헤더 단순화: 7버튼 → [✍️작성/📋매트릭스/📅날짜별] + [⚡배포] + [⋯더보기]
  - 더보기 메뉴: 공지/초안 토글 · 분석 · 설정 · 삭제
- **2N** 워커 탭: RideEmployees 와 cs_workers 양방향 연동, 미활성 후보 알림
- **2O** 휴일 마스터: cs_holidays 마이그레이션 + UI (year 필터, 종류별 통계)
- **2P** 연차 마스터: cs_leaves 마이그레이션 + UI (워커×기간×반차+사유)

### PR-2Q ~ PR-2Z — 매니저/직원 양방향 강화
- **2Q** 균형도 경보: KPI 5번째 타일, ±20% 벗어난 워커 카운트 (양호/주의/위험)
- **2R** 시프트 교체: 매트릭스 [🔄] 토글 → 두 셀 클릭 = swap
- **2S** 빈자리 한눈: 매트릭스 상단 [👀] 토글 + 빈 셀 빨간 점선 강조
- **2T** 워커 부담 인디케이터: ComposeMode 좌측 워커 list 막대 + 평균선 + 편차 색상
- **2V** 캘린더 다운로드: 마이페이지 [📥] iCal(.ics) export — 휴대폰 캘린더 import
- **2W** 같은 날 동료: 마이페이지 캘린더 셀 클릭 → 그날 시프트별 동료 모달 (본인 강조)
- **2X** 새 공지 배지: 공지 7일 이내 시 "🆕 새 공지" 펄스 애니메이션
- **2Y** 시프트 교체 요청: cs_swap_requests 테이블 + 직원 신청 + 매니저 [⋯] 카운트 배지
- **2Z** 결근/병가 즉석: 매트릭스 셀 우클릭 → 휴무/오전반차/오후반차/F/비우기 quick action

### PR-2C — 직원 마이페이지 + 토큰 진입
- `/CallScheduler/me` (로그인) + `/CallScheduler/e/[token]` (영구 링크)
- API: `/api/call-scheduler/me` (token 모드는 published 만 노출)
- 컴포넌트: `MyScheduleView` (인사 + KPI + 캘린더 + 상세 시간표)
- ride_employees.public_token 컬럼 — RideEmployees 페이지에서 발급/재발급/폐기

## 2026-05-03

### PR-2J — 자동 생성 API + 버튼
- API: `POST /api/call-scheduler/schedules/[id]/auto-generate`
  - 그룹 패턴 (all_days/all_weekdays/weekends_only/custom) + 전략 (all_members/rotation)
  - skip_holidays / mark_leaves / overwrite_existing / clear_first 옵션
- UI: ComposeMode 상단 보라색 배너 + AutoGenerateDialog (preview → apply)

### PR-2L — 날짜별 뷰 (3번째 모드)
- 모드 토글: ✍️작성 / 📋매트릭스 / 📅날짜별
- 일자 카드 grid + 그날 시프트별 워커 list (DayDetailModal)

### PR-2I — 그룹 마스터
- 마이그레이션: cs_shift_groups + cs_group_members
- 그룹 = 시프트 + 패턴 + 전략 + 멤버
- `/settings` 그룹 탭 + GroupEditor (멤버 순서 ↑↓)

### PR-2H — 워커 기준 작성 모드
- 매트릭스 외 두 번째 모드 — 워커 1명씩 시프트 + 일자 토글
- 빠른 입력 매크로 (평일/주말/요일별/한줄 입력) + 한 줄 입력 파서

### PR-2A / PR-2B — 풀폭 + 직원 마스터
- 메인 캘린더 max-width 제거 + AnalyticsDrawer (우측 슬라이드)
- 셀 60→44px → 31일 한 화면
- ride_employees 마스터 + RideEmployees CRUD 페이지

## 2026-05-03 (모듈 신설)

### PR-1 v1 MVP
- migrations: cs_shift_slots / cs_workers / cs_schedules / cs_assignments / cs_distributions
- 시드: 13 시프트 + 16 워커 (5월 스케줄 분석 기반)
- API 6 + UI 3 페이지 (목록/등록/상세) + 컴포넌트 6
