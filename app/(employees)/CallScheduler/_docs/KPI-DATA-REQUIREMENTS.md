# CX KPI — 데이터 요구사항 맵

> 2026-05-24 · 워커↔인사마스터 통합(WHR) + KPI 설정 완료 후 재검수
> 목적: KPI를 「우리 조건」으로 설정할 수 있게 된 지금, 그 설정이 실제로
> 점수를 내려면 **어떤 자료가 들어와야 하는지** 전 영역 점검.

---

## 1. KPI 영역 ↔ 필요 자료 ↔ 출처 ↔ 현황

| # | KPI 영역 | 산출 지표 | 필요 자료 | 출처 / 적재 방식 | 현황 |
|---|----------|-----------|-----------|------------------|------|
| 1 | 통화 실적 | 통화량 · AHT · IB/OB · 채널 · 캐피탈사/유형 드릴다운 | 콜 1건 단위 상담이력 | KT 「상담이력조회 상세」 엑셀 → `cs_call_records` (수동 업로드, `call_key` UNIQUE 멱등) | 매니저 업로드 의존 |
| 2 | 상담사 생산성 | 로그인시간 · IB/OB건·통화시간 · 후처리(ACW) · 대기 · 이석 · AHT | 상담원 × 기간 생산성 | KT 「생산성(상담사) 상세」 엑셀 → `cs_agent_productivity` (daily/monthly 혼재) | 매니저 업로드 의존 · **daily 여부 중요** |
| 3 | 응대현황 | IVR 인입·응대 / 큐(스킬)별 응대율 | IVR·큐 응대 통계 | KT 「응대현황」 엑셀 → `cs_response_ivr` / `cs_response_queue` | 매니저 업로드 의존 |
| 4 | 사고·긴급출동 접수량 | 일별 사고접수 · 긴급출동 접수 건수 (별도 카운팅, 취소 제외) | 접수 1건 단위 | Cafe24 ERP `acrotpth`(사고) / `aceesosh`(긴급출동) — read-only 조인 | Cafe24 연결됨 · 워커 귀속 = `cafe24_user_id` 매칭 필요 |
| 5 | WFM 필요인원 (Erlang C) | 시간대별 필요 상담사 수 · 시프트 과부족 | ① 콜 인입량 λ ② AHT ③ 산정기준 ④ 배정 커버 인원 | ① `cs_call_records` 시작시간 시간대 집계 ② `cs_call_records.duration_sec` ③ `cs_wfm_config` ④ `cs_assignments` × `cs_shift_slots` | ①② = 상담이력 적재 의존 · ③ 매니저 설정 · ④ 근무표 적재됨 |
| 6 | 근무 충원율 | 시간대별 배정 커버 인원 · 슬롯 충원율 | 일자 × 슬롯 배정 | `cs_assignments` + `cs_shift_slots` | 5월 근무표 적재됨 (249행) |
| 7 | 근태 (지각·조퇴) | 워커별 지각·조퇴 분/횟수 | ① 예정 시각 ② 실측 로그인/로그아웃 ③ 유예(grace) | ① 근무표 슬롯(`cs_shift_slots`) ② `cs_agent_productivity` **daily** `login_first`/`login_last` ③ `cs_kpi_attendance_config` | ⚠ 생산성 **daily 필수** + 워커 `kt_id` 매칭 필수 |
| 8 | 목표 달성률 | 지표별 목표 대비 % | 목표치 + 1~7 실측값 | `cs_kpi_targets` (매니저 입력) | 매니저가 목표 입력해야 |
| 9 | 상담원 종합 평가 | 가중 종합점수 | ① 계산지표 가중치 ② 각 지표 실측값 ③ 커스텀 항목 정의·점수 | ① `cs_kpi_eval_weights` ② 위 1~7 ③ `cs_kpi_eval_items` / `cs_kpi_eval_scores` | 가중치 설정 + 커스텀 점수 **수동 입력** |

---

## 2. 데이터 소스 인벤토리

### 2-1. 외부 입력 — KT 엑셀 (수동 업로드, 4종 구분)

| 엑셀 종류 | 적재 테이블 | 날짜 컬럼 | 멱등 키 | 업로드 라우트 |
|-----------|-------------|-----------|---------|---------------|
| 상담이력조회 상세 | `cs_call_records` | `call_date` | `call_key` (INSERT IGNORE) | `kpi/upload-call-records` |
| 생산성(상담사) 상세 | `cs_agent_productivity` | `period_label` | `(period_label, agent_kt_id)` (ON DUP UPDATE) | `kpi/upload-productivity` |
| 응대현황 (IVR) | `cs_response_ivr` | `stat_date` | `(stat_date, callee_number)` | `kpi/upload-response` |
| 응대현황 (큐) | `cs_response_queue` | `stat_date` | `(stat_date, skill)` | `kpi/upload-response` |

→ 적재 현황은 「KPI › 데이터」 탭(`kpi/data-status` API)이 소스별 충족율·중복·빠진 날짜로 표시.

### 2-2. 외부 입력 — Cafe24 ERP (read-only, 자동 조인)

| 테이블 | 내용 | 용도 |
|--------|------|------|
| `acrotpth` | 사고접수 이력 | 사고 접수량 (등록자 `otptgnus`) |
| `aceesosh` | 긴급출동(SOS) 접수 이력 | 긴급출동 접수량 (등록자 `esosgnus`) |
| `picuserm` | Cafe24 사용자 마스터 | 접수자 코드 → 이름 |

→ 별도 업로드 없음. `lib/cafe24-db` 로 직접 조회. 워커 귀속 = `cs_workers.cafe24_user_id`.

### 2-3. 내부 데이터 — CallScheduler

| 테이블 | 내용 |
|--------|------|
| `cs_assignments` | 일자 × 슬롯 × 워커 배정 (근무표) |
| `cs_shift_slots` | 시프트 슬롯 정의 (start/end/overnight) |
| `cs_workers` | 콜센터 워커 (+ `kt_id` · `cafe24_user_id` · `employee_id`) |
| `ride_employees` | 인사마스터 (워커의 이름·부서 출처) |

### 2-4. 설정 데이터 — 매니저 입력 (KPI 설정 탭)

| 테이블 | 설정 항목 | 미설정 시 영향 |
|--------|-----------|----------------|
| `cs_wfm_config` | 목표 응대율·응대시간·부재율·인터벌·점유율 | WFM 필요인원 산정 불가 |
| `cs_kpi_targets` | 팀·상담원별 지표 목표치 | 달성률 공백 |
| `cs_kpi_eval_weights` | 계산지표 사용·가중치 | 종합점수 계산 안 됨 |
| `cs_kpi_eval_items` / `cs_kpi_eval_scores` | 커스텀 평가 항목 정의·상담원별 점수 | 커스텀 항목 종합점수 미반영 |
| `cs_kpi_attendance_config` | 지각·조퇴 유예(grace) 분 | 0분(정시 엄격)으로 판정 |

---

## 3. 핵심 의존성 · 검수 포인트

### ✅ A. KT 엑셀 업로드 주기 — 주 1회 (지난주분) 확정 (2026-05-24)
KPI 영역 1·2·3·5·7·8·9 가 KT 엑셀에 의존. 안 올리면 절반 이상이 빈값.
→ **확정**: 상담이력·생산성·응대현황 3종을 **주 1회, 지난주분** 업로드.
  · KT 콘솔에서 날짜기준=일별로 한 주치를 받으면 일별 행이 그대로 적재됨 →
    일/주/월 KPI·근태는 정확히 산출되고 **반영만 한 주 지연**.
  · 「KPI › 데이터」 탭이 주별 충족율로 누락 주를 표시 → 빠진 주 추적.

### ✅ B. 생산성 daily 입수 — 가능 확인 (2026-05-24)
근태(지각·조퇴, 영역 7)는 `cs_agent_productivity` 의 **daily 행** `login_first`/`login_last`
가 있어야 판정 가능. → KT AICC 콘솔 「생산성(상담사)」 의 **날짜기준 = 일별** 선택 가능
확인. 최초로그인시간·최종로그아웃시간·로그인시간 컬럼 제공 → **근태 KPI 동작 가능**.
주의: 한 사람당 KT ID 여러 개 (화면 예: `ride_hjki` / `ride_hjk` / `hjki`) — 매칭 시
활성·최다 데이터 ID 선택 (WHR-B2 자동 추천 로직이 처리).

### ⚠ C. 워커 ID 매칭이 자료 흐름의 관문
워커별 집계(영역 1·2·3·5·7·9)는 `cs_workers.kt_id` / `cafe24_user_id` 매칭이
채워져야 성립. WHR-B2 로 매칭 UI 는 워커 편집에 통합 완료 — 단 **실제 매칭 실행은
별개**. 직전 화면 「KT 연결 0명」 = KT 쪽 미매칭 상태. 「✨ 전체 자동 매칭」 →
저장으로 채워야 KT 기반 KPI 가 워커별로 분해됨.

### ⚠ D. 설정 데이터는 매니저 입력 — 4종 모두 입력돼야 평가가 완성
WFM 기준 · 목표치 · 평가 가중치 · 커스텀 항목 — KPI 설정 탭에서 입력. 하나라도
비면 해당 영역(달성률·종합점수·WFM)이 공백.

### ⚠ E. 마이그레이션 적용 여부 확인 필요
`cs_kpi_*` 계열 테이블(eval_weights / eval_custom / attendance_config 등)이 Cloud SQL
에 실제 적용됐는지 점검 — 미적용 시 API 가 graceful 빈값/`migration_pending` 반환.

### ℹ F. per-상담원 응대율은 산출 불가 (설계 확정 한계)
미응대 콜은 특정 상담원에 귀속 불가 → 응대율은 **팀/큐 단위**만. 상담원 평가에는
OB 연결률(시도 대비 연결), 로그인 대비 통화시간 비율 등 실측 지표로 대체.

---

## 4. 현황 확인용 검증 SQL

KPI 설정 탭 적용 여부 + 매칭 충족도를 Cloud SQL 에서 한 번에 점검:

```sql
-- (1) KPI 설정 테이블 적재 여부 — 0행이면 매니저 입력/마이그레이션 필요
SELECT 'wfm_config'   AS t, COUNT(*) c FROM cs_wfm_config
UNION ALL SELECT 'targets',        COUNT(*) FROM cs_kpi_targets
UNION ALL SELECT 'eval_weights',   COUNT(*) FROM cs_kpi_eval_weights
UNION ALL SELECT 'eval_items',     COUNT(*) FROM cs_kpi_eval_items
UNION ALL SELECT 'attendance_cfg', COUNT(*) FROM cs_kpi_attendance_config;

-- (2) 워커 ID 매칭 충족도 — kt_id / cafe24_user_id 채워진 워커 수 (기대: 16 / 16)
SELECT
  SUM(kt_id IS NOT NULL AND kt_id <> '')                   AS kt_linked,
  SUM(cafe24_user_id IS NOT NULL AND cafe24_user_id <> '') AS cafe24_linked,
  COUNT(*)                                                 AS total
FROM cs_workers WHERE is_active = 1;

-- (3) KT 엑셀 적재 범위 — 최근 데이터가 며칠치인지
SELECT 'call_records' AS src, MIN(call_date) f, MAX(call_date) t, COUNT(*) c FROM cs_call_records
UNION ALL
SELECT 'productivity_daily', MIN(period_label), MAX(period_label), COUNT(*)
  FROM cs_agent_productivity WHERE period_kind='daily';
```

---

## 5. 다음 단계 (검수 후 결정 대상)

1. ~~KT 엑셀 3종 업로드 주기~~ → ✅ 주 1회(지난주분) 확정 (2026-05-24)
2. ~~KT 생산성 일 단위 입수 가능 여부~~ → ✅ 일별 가능 확인 (2026-05-24)
3. 워커 KT·Cafe24 **매칭 실행** (WHR-B2 UI 에서 자동 매칭) — C
4. KPI 설정 4종(WFM·목표·가중치·커스텀) 입력 — D
5. `cs_kpi_*` 마이그레이션 적용 점검 — E
