# DATA-MODEL — RideMTOps (MT팀 운영)

> 테이블 / 컬럼 / 관계. 새 마이그레이션 추가 시 갱신 (CLAUDE.md 규칙 22).

---

## ride_chargers — 충전기 자산 마스터

> migrations/2026-05-21_ride_chargers.sql · PR-6.14.b-1
> 자체 등록 (카페24 pluglink_charger 와 무관 — 사용자 결정 2026-05-21)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| charger_code | VARCHAR(64) NOT NULL | 충전기 ID (사용자 정의 고유키) — **UNIQUE** |
| station_name | VARCHAR(128) | 개소명 / 설치 위치명 |
| address | VARCHAR(255) | 설치 주소 |
| model | VARCHAR(128) | 충전기 모델 |
| charger_type | VARCHAR(32) | 급속 / 완속 |
| capacity_kw | DECIMAL(8,2) | 충전 용량 (kW) |
| installed_date | DATE | 설치일 |
| status | VARCHAR(16) DEFAULT '정상' | 정상 / 점검중 / 고장 / 폐기 |
| memo | VARCHAR(500) | 메모 |
| created_at / updated_at | DATETIME | 자동 |
| created_by / created_by_name | VARCHAR | 등록자 |

인덱스: `uq_ride_charger_code` (charger_code UNIQUE), `idx_charger_status`, `idx_charger_station`

---

## ride_charger_maintenance — 유지보수 이력 / 일정

> migrations/2026-05-21_ride_chargers.sql · PR-6.14.b-1

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| charger_id | VARCHAR(36) NOT NULL | ride_chargers.id FK |
| maint_type | VARCHAR(16) DEFAULT '정기점검' | 정기점검 / 고장수리 |
| scheduled_date | DATE | 예정일 |
| maint_date | DATE | 실제 작업일 |
| title | VARCHAR(200) | 작업 제목 |
| detail | TEXT | 작업 내용 |
| assignee | VARCHAR(64) | 담당자 |
| cost | DECIMAL(12,2) | 비용 |
| status | VARCHAR(16) DEFAULT '예정' | 예정 / 진행중 / 완료 |
| settled | TINYINT(1) DEFAULT 0 | 정산 완료 여부 (b-5) |
| created_at / updated_at | DATETIME | 자동 |
| created_by / created_by_name | VARCHAR | 등록자 |

인덱스: `idx_maint_charger`, `idx_maint_status`, `idx_maint_sched`, `idx_maint_type`

관계: `ride_charger_maintenance.charger_id → ride_chargers.id` (애플리케이션 FK — DELETE 시 이력 있으면 차단)

---

## 후속 PR 예정 테이블

- **b-3**: `ride_charger_maint_photos` — 작업 사진 (charger_maint_id FK)
- **b-4**: `ride_charger_report_templates` — 보고서 템플릿 (UI 업로드 관리)
