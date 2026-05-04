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
                 ├─< cs_assignments >── cs_workers
cs_schedules ────┤
                 └─< cs_distributions
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

## 4. computed_hours 계산 규칙

- 기본 = `TIMESTAMPDIFF(MINUTE, start_time, end_time + IF(is_overnight, INTERVAL 1 DAY, INTERVAL 0 DAY)) / 60`
- `am_half`(오전반차) = 기본 / 2 (오전분만 차감)
- `pm_half`(오후반차) = 기본 / 2
- `am_free`/`pm_free` = 0 (해당 슬롯 무근무, 근무자 NULL 가능)
- `off` = 0
- 작성/수정 시 API에서 계산 후 저장 (read 성능)

## 5. 마이그레이션 파일

`migrations/20260503_call_scheduler_init.sql` — CREATE TABLE 5개 + 시드 (cs_shift_slots 13개, cs_workers 16명) + 인덱스.
