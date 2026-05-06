# CallScheduler — 데이터 모델

> 적용 범위: `/app/CallScheduler/**` 한정. 부모 프로젝트 공통 테이블(profiles 등)은 그대로 참조.
> DB: MySQL 8.0 (Cloud SQL). 마이그레이션: `migrations/YYYYMMDD_call_scheduler_init.sql` 수동 SQL 방식.

## 0. 네이밍 규칙

- 테이블 prefix: **`cs_`** (call scheduler) — 기존 fmi_ 와 명확히 구분, 모듈 격리 보장
- 컬럼: snake_case
- PK: `id BIGINT UNSIGNED AUTO_INCREMENT` (단순 키), 단 `cs_workers.id`는 Profile 연동 가능성 위해 `CHAR(36) UUID` 검토 → 일단 BIGINT 채택, 별도 `profile_id CHAR(36) NULL` 옵션 컬럼

## 1. 모델 다이어그램

```
cs_shift_slots ──┐
                 ├─< cs_assignments >── cs_workers (priority/dow_avoid/required/max/pattern)
cs_schedules ────┤                          │
                 └─< cs_distributions       │
                                             │
cs_shift_groups ──< cs_group_members ────────┘
       │
       └─< cs_group_min_coverage (PR-2QQ-d-2 — 그룹 × 요일 × 최소 인원)
```

## 2. 테이블 정의

### 2.1 `cs_shift_slots` — 시프트 라인 정의 (마스터)

| 컬럼 | 타입 | NULL | 기본 | 설명 |
|------|------|------|------|------|
| id | BIGINT UNSIGNED AI | NN | | PK |
| code | VARCHAR(16) | NN | | "L01"~"L13" 등 라인 코드, UNIQUE |
| label | VARCHAR(64) | NN | | 표시명 ("07:30~16:30") |
| start_time | TIME | NN | | 09:00:00 |
| end_time | TIME | NN | | 18:00:00 |
| is_overnight | TINYINT(1) | NN | 0 | 1=익일 종료 |
| **next_day_blocking_hours** | TINYINT | NN | 0 | **PR-2SS-b** — 종료 후 N시간 안 다른 슬롯 시작 금지 (야간 디폴트 16) |
| **max_consecutive_days** | TINYINT | Y | NULL | **PR-2SS-b** — 연속 N일 한도 (NULL=무제한, 야간 디폴트 3 — PR-2SS-c 활용) |
| ~~min_seniority_months~~ | ~~TINYINT~~ | | | **PR-2SS-d revert (2026-05-06)** — 컬럼 DROP, 매니저 직접 판단 |
| **night_period_start** | TIME | Y | NULL | **PR-2SS-e** — 가산 시간대 시작 (예: 22:00:00, NULL=가산 없음) |
| **night_period_end** | TIME | Y | NULL | **PR-2SS-e** — 가산 시간대 종료 (자정 넘음 가능) |
| **night_premium_rate** | DECIMAL(4,2) | NN | 0.00 | **PR-2SS-e** — 가산율 (0.50=50%, 현재 정책 0) |
| category | VARCHAR(16) | NN | 'day' | day / evening / overnight |
| sort_order | INT | NN | 0 | 캘린더 행 순서 |
| is_active | TINYINT(1) | NN | 1 | soft delete |
| created_at, updated_at | DATETIME | NN | NOW | |

UNIQUE: `(code)`, INDEX: `(sort_order, is_active)`

### 2.2 `cs_workers` — 근무자

| 컬럼 | 타입 | NULL | 기본 | 설명 |
|------|------|------|------|------|
| id | BIGINT UNSIGNED AI | NN | | PK |
| name | VARCHAR(32) | NN | | 표시명 ("박지훈") |
| profile_id | CHAR(36) | Y | | profiles.id FK 옵션 |
| color_tone | ENUM('blue','gray','green','amber','violet','red','none') | NN | 'none' | 셀 배경 토큰 |
| group_label | VARCHAR(16) | Y | | "주간" / "야간" / "저녁" — 분석 그룹핑 |
| phone | VARCHAR(32) | Y | | 잔디/SMS 배포용 |
| email | VARCHAR(128) | Y | | |
| is_active | TINYINT(1) | NN | 1 | |
| created_at, updated_at | DATETIME | NN | NOW | |

INDEX: `(is_active, group_label)`, UNIQUE: `(name, is_active)` 고려 (동명이인 시 별칭)

### 2.3 `cs_schedules` — 월별 스케줄 헤더

| 컬럼 | 타입 | NULL | 기본 | 설명 |
|------|------|------|------|------|
| id | BIGINT UNSIGNED AI | NN | | PK |
| year | SMALLINT | NN | | 2026 |
| month | TINYINT | NN | | 5 (1-12) |
| title | VARCHAR(128) | Y | | "2026년 5월 근무표" |
| status | ENUM('draft','published','archived') | NN | 'draft' | |
| source | ENUM('manual','excel') | NN | 'manual' | |
| published_at | DATETIME | Y | | |
| published_by | CHAR(36) | Y | | profiles.id |
| note | TEXT | Y | | 변경 메모 |
| created_at, updated_at | DATETIME | NN | NOW | |

UNIQUE: `(year, month)` — 한 달 한 스케줄 (재작성 시 덮어쓰기 / archive 후 재생성)

### 2.4 `cs_assignments` — 일자×슬롯×근무자 배정 (그리드 1셀)

| 컬럼 | 타입 | NULL | 기본 | 설명 |
|------|------|------|------|------|
| id | BIGINT UNSIGNED AI | NN | | PK |
| schedule_id | BIGINT UNSIGNED | NN | | FK cs_schedules.id ON DELETE CASCADE |
| work_date | DATE | NN | | YYYY-MM-DD |
| shift_slot_id | BIGINT UNSIGNED | NN | | FK cs_shift_slots.id |
| worker_id | BIGINT UNSIGNED | Y | | FK cs_workers.id, NULL=공석/F-only |
| special_code | ENUM('none','am_free','pm_free','am_half','pm_half','off') | NN | 'none' | 오전F/오후F/오전반차/오후반차/휴무 |
| computed_hours | DECIMAL(4,2) | NN | 0.00 | special_code 반영 실 근무시간 (분석용 캐시) |
| **day_hours** | DECIMAL(4,2) | Y | NULL | **PR-2SS-e** — 일반 시간 (computed_hours 에서 야간 시간 분리) |
| **night_hours** | DECIMAL(4,2) | Y | NULL | **PR-2SS-e** — 가산 시간대 시간 |
| **premium_hours** | DECIMAL(4,2) | Y | NULL | **PR-2SS-e** — 가산 적용 후 (= night × rate) |
| note | VARCHAR(255) | Y | | |
| created_at, updated_at | DATETIME | NN | NOW | |

UNIQUE: `(schedule_id, work_date, shift_slot_id, worker_id)` — **PR-2OO**: 1셀 N워커 허용 (같은 그룹 멤버 동시 근무)
- 이전: `uq_cs_asn_cell (schedule_id, work_date, shift_slot_id)` — 1셀 1워커
- 현재: `uq_cs_asn_cell_worker (schedule_id, work_date, shift_slot_id, worker_id)` — 1셀 N워커
- NULL worker_id 다중 row 허용 (InnoDB NULL semantics) — 빈 셀 표현
INDEX: `(work_date)`, `(worker_id, work_date)`

### 2.5 `cs_distributions` — 체크/배포 이력

| 컬럼 | 타입 | NULL | 기본 | 설명 |
|------|------|------|------|------|
| id | BIGINT UNSIGNED AI | NN | | PK |
| schedule_id | BIGINT UNSIGNED | NN | | FK cs_schedules.id |
| channel | ENUM('jandi','email','link','manual') | NN | 'manual' | |
| recipient_count | INT | NN | 0 | |
| recipients_snapshot | JSON | Y | | [{worker_id, name, channel_addr}] |
| status | ENUM('queued','sent','partial','failed') | NN | 'queued' | |
| response_meta | JSON | Y | | provider 응답 |
| sent_at | DATETIME | Y | | |
| sent_by | CHAR(36) | Y | | profiles.id |
| created_at | DATETIME | NN | NOW | |

INDEX: `(schedule_id, sent_at)`

## 3. 분석 뷰 / 집계 쿼리 (페이지 KPI)

쿼리 자체는 view 없이 raw SQL로 API에서 수행 (sql-lint 적용 대상).

```sql
-- 인당 월 근무시간
SELECT w.id, w.name,
       SUM(a.computed_hours) AS total_hours,
       COUNT(*) AS shift_count
FROM cs_assignments a
JOIN cs_workers w ON w.id = a.worker_id
WHERE a.schedule_id = ? AND a.special_code != 'off'
GROUP BY w.id, w.name
ORDER BY total_hours DESC;

-- 시프트 충원율
SELECT s.code, s.label,
       COUNT(a.id) AS filled,
       (SELECT COUNT(*) FROM cs_assignments WHERE schedule_id=? AND shift_slot_id=s.id) AS total
FROM cs_shift_slots s
LEFT JOIN cs_assignments a ON a.shift_slot_id=s.id AND a.worker_id IS NOT NULL AND a.schedule_id=?
GROUP BY s.id, s.code, s.label
ORDER BY s.sort_order;
```

### 2.W `cs_workers` 추가 컬럼 (PR-2QQ-d-1 + d-3 + PR-2SS-c)

| 컬럼 | 타입 | NULL | 기본 | PR | 설명 |
|------|------|------|------|-----|------|
| is_external | TINYINT(1) | NN | 0 | d-b | 외부 직원 표식 (🔒) |
| priority_level | TINYINT | NN | 2 | d-1 | 1=최우선 / 2=일반 / 3=백업 |
| preferred_dow_avoid | VARCHAR(16) | Y | NULL | d-1 | 비선호 요일 ('0,5' = 일·금) |
| **preferred_dow_prefer** | VARCHAR(16) | Y | NULL | **PR-2SS-g** | 희망 요일 ('1,3,5' = 월수금, Hard ranking 매치 우선) |
| required_days_per_month | TINYINT | Y | NULL | d-1 | 월 필수 일수 |
| max_days_per_month | TINYINT | Y | NULL | d-1 | 월 최대 일수 |
| work_pattern_text | VARCHAR(64) | Y | NULL | d-1 | 자유 패턴 메모 |
| cycle_days_on | TINYINT | Y | NULL | d-3 | 연속 근무일 |
| cycle_days_off | TINYINT | Y | NULL | d-3 | 연속 휴무일 |
| cycle_start_date | DATE | Y | NULL | d-3 | cycle 1일차 |
| preferred_dow_only | VARCHAR(16) | Y | NULL | d-3 | 한정 요일 ('1,3,5' = 월수금만) — **폐기 (PR-2QQ-d-revert)** |
| **max_consecutive_work_days** | TINYINT | Y | NULL | **PR-2SS-c** | 워커별 연속 근무 한도 (NULL=무제한, slot.max_consecutive_days 와 둘 중 작은 값) |
| **blocked_slot_ids** | JSON | Y | NULL | **PR-2SS-c** | 절대 안 들어가는 슬롯 ID 배열 (예: `["L13-id"]` = 야간 거부) |

INDEX: `idx_cs_w_priority (priority_level, is_active)`

**자동 생성 알고리즘 활용** (PR-2QQ-d-3):
1. `cycle_*` 정의 시: `(date - cycle_start_date) % (on+off) < on` 인 날만 후보
2. `preferred_dow_only` 정의 시: 그 요일만 후보 (한정)
3. `preferred_dow_avoid` 정의 시: 그 요일 후순위 (피함, 부족 시 들어감)
4. `priority_level` ASC + `required` 미달 우선 + by_dow/total ASC + last_date 거리 DESC

### 2.Y `cs_group_member_skip_dates` — 그룹 차원 회피일 (PR-2SS-h-1)

| 컬럼 | 타입 | NULL | 기본 | 설명 |
|------|------|------|------|------|
| id | CHAR(36) | NN | | PK |
| group_id | CHAR(36) | NN | | FK cs_shift_groups.id ON DELETE CASCADE |
| worker_id | CHAR(36) | NN | | FK cs_workers.id ON DELETE CASCADE |
| start_date | DATE | NN | | 회피 시작일 |
| end_date | DATE | NN | | 회피 종료일 (start <= end) |
| reason | VARCHAR(255) | Y | NULL | 사유 메모 (선택) |
| status | ENUM | NN | 'requested' | requested / approved / rejected / canceled |
| requested_by | CHAR(36) | Y | NULL | 신청자 profile_id |
| requested_at | DATETIME | Y | NULL | |
| approved_by | CHAR(36) | Y | NULL | 승인자 profile_id |
| approved_at | DATETIME | Y | NULL | |
| created_at, updated_at | DATETIME | NN | NOW | |

INDEX: `idx_lookup_worker (worker_id, start_date, end_date)`, `idx_group_status (group_id, status, start_date)`

**알고리즘**: status='approved' 만 자동 생성 후보 제외. Warning 'group_skip' 발생 (사유 메모 포함).

**cs_leaves 와 차이**:
- 그룹 한정 (group_id 포함) — cs_leaves 는 워커 차원 전체
- 정식 휴가 X — 발급량 차감 X (cs_leave_quotas 미관여)
- 단순 회피 — 종일만 (반차 X — 그룹 회피는 의미상 종일)

### 2.X `cs_group_min_coverage` — 그룹 최소 인원 (PR-2QQ-d-2)

| 컬럼 | 타입 | NULL | 기본 | 설명 |
|------|------|------|------|------|
| id | CHAR(36) | NN | | PK |
| group_id | CHAR(36) | NN | | FK → cs_shift_groups, ON DELETE CASCADE |
| dow | TINYINT | Y | NULL | 0=일, 6=토. NULL=매일 디폴트 |
| min_workers | TINYINT | NN | 1 | 최소 동시 근무자 |
| created_at, updated_at | DATETIME | NN | NOW | |

UNIQUE: `(group_id, dow)` — dow=NULL 1행 + 0~6 N행
INDEX: `idx_cs_gmc_group (group_id)`

**조회 우선순위**: 특정 dow 행 > NULL (디폴트)

**입력 예시**:
```sql
-- 야간콜 그룹: 매일 2명, 금요일 3명, 일요일 1명
INSERT INTO cs_group_min_coverage (id, group_id, dow, min_workers) VALUES
  (UUID(), '<야간콜id>', NULL, 2),  -- 매일 디폴트
  (UUID(), '<야간콜id>', 5,    3),  -- 금
  (UUID(), '<야간콜id>', 0,    1);  -- 일
```

자동 생성 알고리즘 (PR-2QQ-d-3 예정) 에서 워커 풀 크기 결정에 사용.

## 4. computed_hours 계산 규칙

- 기본 = `TIMESTAMPDIFF(MINUTE, start_time, end_time + IF(is_overnight, INTERVAL 1 DAY, INTERVAL 0 DAY)) / 60`
- `am_half`(오전반차) = 기본 / 2 (오전분만 차감)
- `pm_half`(오후반차) = 기본 / 2
- `am_free`/`pm_free` = 0 (해당 슬롯 무근무, 근무자 NULL 가능)
- `off` = 0
- 작성/수정 시 API에서 계산 후 저장 (read 성능)

## 5. 마이그레이션 파일

`migrations/20260503_call_scheduler_init.sql` — CREATE TABLE 5개 + 시드 (cs_shift_slots 13개, cs_workers 16명) + 인덱스.
