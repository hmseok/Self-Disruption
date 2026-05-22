# CHARGERS — 데이터 모델 (Rule 22)

> **작성**: 2026-05-22 (chargers 세션 / focused-clever-planck)
> **근거**: `CHARGERS-PERSONAS.md` + 보고서 실파일 헤더 필드 분석
> **상태**: 설계 초안 — C1 마이그레이션의 근거. 실제 SQL은 C1 GO 후 작성
> **DB**: MySQL 8.0 (Cloud SQL r-care-db, fmi_op). 테이블 접두어 `rc_` (ride charger)

---

## 0. b-1 테이블 폐기

C1 마이그레이션에서 멱등 처리:
```sql
DROP TABLE IF EXISTS ride_charger_maintenance;
DROP TABLE IF EXISTS ride_chargers;
```
(b-1은 미배포 — DB에 없으면 무동작. 마이그 파일/API/페이지는 C1에서 제거)

---

## 1. 테이블 관계 도식

```
rc_stations (충전소·개소)  1 ──┬── N  rc_devices (충전기·기)
                                │
                                └── N  rc_inspections (점검 작업)  1 ── N  rc_inspection_photos
                                                  │
                                                  1
                                                  └── 1  rc_settlements (정산)

rc_report_templates  (유형별 보고서 양식 — 독립)
rc_settlement_rates  (점검유형별 단가표 — 독립)
```

핵심 단위: **점검 1건 = 충전소(개소) 1곳**. 5만기는 `rc_devices` 행 수.

---

## 2. rc_stations — 충전소(개소) 마스터

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| region | VARCHAR(64) | 권역 |
| station_name | VARCHAR(200) NOT NULL | 개소명 |
| address | VARCHAR(300) | 주소 |
| detail_location | VARCHAR(200) | 상세위치 (지상1층 등) |
| lat / lng | DECIMAL(10,7) | 좌표 |
| operator | VARCHAR(64) | 충전사업자 (예: 플러그링크) |
| manufacturer | VARCHAR(128) | 제조사 |
| install_type | VARCHAR(32) | 스탠드형/벽걸이형/일체형/파워뱅크형 |
| indoor_outdoor | VARCHAR(16) | 옥내/옥외 |
| device_count | INT DEFAULT 0 | 충전기 총수 (캐시) |
| status | VARCHAR(16) DEFAULT '운영' | 운영/중지/철거 |
| memo | VARCHAR(500) | |
| source | VARCHAR(16) DEFAULT 'gsheet' | gsheet / manual |
| gsheet_row_key | VARCHAR(160) | 구글시트 원본 식별 — **재임포트 멱등성** (Rule 24) |
| created_at / updated_at | DATETIME | 자동 |
| created_by / created_by_name | VARCHAR | 등록자 |

인덱스: `idx_st_region(region)`, `idx_st_name(station_name)`, `idx_st_status(status)`,
`UNIQUE uq_st_gsheet(gsheet_row_key)` (구글시트 재임포트 시 UPSERT 키)

---

## 3. rc_devices — 충전기(기) 마스터

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| station_id | VARCHAR(36) NOT NULL | → rc_stations.id |
| charger_id | VARCHAR(64) NULL | 공식 충전기 ID (환경부/사업자 — **일부만 보유**) |
| device_no | VARCHAR(32) | 분전함/기 번호 (예: 분전함1) |
| charger_type | VARCHAR(16) | 완속 / 급속 |
| connector_type | VARCHAR(32) | DC콤보/DC차데모/AC3상/AC단상5핀 |
| model | VARCHAR(128) | 모델 |
| serial_no | VARCHAR(128) | 일련번호 |
| capacity_kw | DECIMAL(8,2) | 용량 |
| voltage | VARCHAR(32) | 전압 |
| status | VARCHAR(16) DEFAULT '정상' | 정상/점검중/고장/폐기 |
| memo | VARCHAR(500) | |
| gsheet_row_key | VARCHAR(160) | 재임포트 멱등성 |
| created_at / updated_at / created_by / created_by_name | | |

인덱스: `idx_dv_station(station_id)`, `idx_dv_chargerid(charger_id)`,
`idx_dv_type(charger_type)`, `idx_dv_status(status)`, `UNIQUE uq_dv_gsheet(gsheet_row_key)`

---

## 4. rc_inspections — 점검 작업 (충전소 단위)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| station_id | VARCHAR(36) NOT NULL | → rc_stations.id |
| inspect_type | VARCHAR(24) NOT NULL | 월간/분기/반기/감리/현장전환 |
| scheduled_date | DATE | 예정일 |
| due_date | DATE | 완료 기한 (감리 = 배정+10일) |
| work_date | DATE | 실제 작업일 |
| assignee_id | VARCHAR(36) | 담당 현장직원 |
| assignee_name | VARCHAR(64) | |
| status | VARCHAR(20) DEFAULT '예정' | 예정/작업중/보고서작성/제출/검수중/재작업/완료 |
| review_result | VARCHAR(24) | 검수 결과 (통과/사진보완요청 등) |
| report_uploaded | TINYINT(1) DEFAULT 0 | 사업자 드라이브 "업로드함" 체크 |
| report_upload_date | DATE | 보고서 업로드일 (마스터 시트 컬럼) |
| supplement_round | TINYINT DEFAULT 0 | 보완(재작업) 차수 — 시트의 1차/2차 보완 (0/1/2) |
| supplement_note | VARCHAR(500) | 보완 필요 내용 |
| operator_confirmed | TINYINT(1) DEFAULT 0 | 충전사업자(플러그링크) 최종확인 |
| report_file_path | VARCHAR(500) | 생성된 보고서 파일 경로 |
| report_data | JSON | 보고서 작성 내용 (체크리스트 결과 등) |
| weather / temp_humidity | VARCHAR(32) | 점검 환경 |
| memo | TEXT | 특이사항/종합의견 |
| created_at / updated_at / created_by / created_by_name | | |

인덱스: `idx_in_station(station_id)`, `idx_in_type(inspect_type)`, `idx_in_status(status)`,
`idx_in_sched(scheduled_date)`, `idx_in_assignee(assignee_id)`

---

## 5. rc_inspection_photos — 점검 사진

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| inspection_id | VARCHAR(36) NOT NULL | → rc_inspections.id |
| device_id | VARCHAR(36) NULL | → rc_devices.id (기기별 사진일 때) |
| category | VARCHAR(64) | 충전소전경/분전반외부/분전반내부/MCCB/작동상태/도색전/도색후… |
| slot_no | INT DEFAULT 1 | 구분 내 순번 |
| file_path | VARCHAR(500) | 저장 경로 |
| file_name | VARCHAR(255) | 원본 파일명 |
| uploaded_at | DATETIME | |
| created_by / created_by_name | VARCHAR | |

인덱스: `idx_ph_inspection(inspection_id)`, `idx_ph_device(device_id)`, `idx_ph_category(category)`

---

## 6. rc_report_templates — 보고서 양식 (유형별)

> 점검 유형별 양식 상이 — 충전사업자 지정 (실파일 4종 분석).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| inspect_type | VARCHAR(24) NOT NULL | 월간/분기/반기/감리/현장전환 |
| name | VARCHAR(200) | 양식 이름 |
| file_path | VARCHAR(500) | 업로드된 xlsx 양식 파일 |
| photo_slots | JSON | 보고서 기준 사진 구분 슬롯 정의 |
| default_content | JSON | **보고서 기본 내용** (체크리스트 기본값 — C3에서 사용) |
| version | INT DEFAULT 1 | |
| is_active | TINYINT(1) DEFAULT 1 | |
| created_at / updated_at / created_by / created_by_name | | |

인덱스: `idx_tpl_type(inspect_type)`, `idx_tpl_active(is_active)`

---

## 7. rc_settlement_rates — 정산 단가표 (점검유형 단위)

> D3 확정: 급속/완속 구분 없음 — **점검유형으로만** 단가 구분.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| inspect_type | VARCHAR(24) NOT NULL | 월간/분기/반기/감리/현장전환 |
| unit_price | DECIMAL(12,2) NOT NULL | 건당 단가 |
| effective_from | DATE NOT NULL | 적용 시작일 (단가 변경 이력) |
| memo | VARCHAR(300) | |
| created_at / updated_at | DATETIME | |

인덱스: `UNIQUE uq_rate(inspect_type, effective_from)` — 멱등 + 단가 이력. 최신 단가는 `effective_from` 최댓값

---

## 8. rc_settlements — 정산 건

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(36) PK | UUID |
| inspection_id | VARCHAR(36) NULL | → rc_inspections.id (별건은 NULL) |
| station_id | VARCHAR(36) NULL | 필터용 denormalize |
| inspect_type | VARCHAR(24) | |
| is_extra | TINYINT(1) DEFAULT 0 | 별건 여부 (수동 입력) |
| title | VARCHAR(200) | 별건 내용 |
| amount | DECIMAL(12,2) NOT NULL | 정산 금액 |
| status | VARCHAR(16) DEFAULT '입력' | 입력/확정/요청완료 |
| settled_month | VARCHAR(7) | 정산 귀속월 (예: 2026-05) |
| confirmed_by / confirmed_at | VARCHAR / DATETIME | 관리자 확정 |
| memo | VARCHAR(300) | |
| created_at / updated_at / created_by / created_by_name | | |

인덱스: `idx_se_inspection(inspection_id)`, `idx_se_station(station_id)`,
`idx_se_status(status)`, `idx_se_month(settled_month)`

---

## 9. 점검 유형 enum (6종 — 2026-05-22 마스터 파일 분석 확정)

| 값 | 설명 | 주기/기한 |
|----|------|----------|
| `월간` | 정기점검(월) | 매월 |
| `분기` | 정기점검(분기) | 분기 |
| `반기` | 정기점검(반기) | 반기 |
| `감리` | 시공감리 | 배정 후 **10일 이내** 완료 |
| `고장` | 고장점검 | 신고 기반 (주기 없음) — 마스터 대시보드 [고장점검] 확인 |
| `현장전환` | 충전사업자(플러그링크 → 한화모티브) 전환작업 (로고스티커·펌웨어·충전테스트·전체사진·도색) | 캠페인 |

---

## 10. 마스터 시트 컬럼 매핑 (2026-05-22 업로드 2파일 분석)

업로드 파일: `라이드_26년 상반기 감리_정기점검 충전기 목록 (2).xlsx`,
`(한화모티브)현장전환 충전소 목록_라이드.xlsx`. 시트별 헤더 행 위치가 다름
(감리/정기 = 5행, 현장전환 = 6행) → 임포트 도구는 **헤더 행 지정 + 컬럼 매핑 UI** 필요.

| 시트 컬럼 | → rc_ 매핑 | 비고 |
|----------|-----------|------|
| 지역코드 / 지역 / 권역 | `rc_stations.region` | 파일별 컬럼명 상이 |
| 충전소ID (=플링 프로젝트ID) | `rc_stations` 비즈니스키 | 파일별 상이 |
| 충전소명 | `rc_stations.station_name` | |
| 주소 | `rc_stations.address` | |
| 한전고객번호 | `rc_stations` (신규 컬럼 `kepco_no`) | C1 추가 |
| 관리소 연락처 / 담당자 연락처 | `rc_stations` 연락처 | |
| chargerId / 충전기ID / 한화 충전기번호 | `rc_devices.charger_id` | **파일별 ID 체계 상이 — 일부만 보유** |
| Device ID | `rc_devices` (신규 컬럼 `device_ext_id`) | PL10210918 형식 |
| 충전기 상세위치 | `rc_devices.device_no` / 상세위치 | |
| 채널 수 | `rc_devices` (신규 `channel_count`) | |
| 완/급속 | `rc_devices.charger_type` | |
| 충전기 모델 / 모델정보 | `rc_devices.model` | "캐스트프로 14kW" 형태 — 용량 분리 파싱 |

> C1 마이그레이션에 `rc_stations.kepco_no`, `rc_devices.device_ext_id`,
> `rc_devices.channel_count` 컬럼 반영 (위 매핑 근거).

### 남은 미확정 (각 PR 착수 시)
- 정산 단위 — 점검 건 vs 커넥터 (시트에 "정산기준(커넥터)" 표기 → C6 확정)
- 사진 저장소 — 로컬/GCS (C3 착수 시)

---

본 문서는 마이그레이션 추가/변경 시 갱신 (Rule 22).
