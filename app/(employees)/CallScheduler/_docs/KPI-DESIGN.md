# CX팀 통합 KPI 대시보드 — 상세 설계서

> 작성 2026-05-21 · GATE 3 (Planner) · 승인 대기
> 데이터: KT 상담이력 + KT 생산성 + Cafe24 접수·상담 + CallScheduler 근무

---

## 1. 목표

CX 컨택센터 매니저용 통합 KPI 대시보드. 상담원별 통화 실적·접수 처리·근무를
일/주/월로 한 화면에서 보고, 목표 대비 달성률을 관리한다.

---

## 2. 데이터 소스 (4종)

| 소스 | 단위 | 적재 방식 | 핵심 지표 |
|------|------|----------|----------|
| ① KT 상담이력조회 상세 | 콜 1건 | 엑셀 업로드 | 통화량·AHT·채널·캐피탈사·유형 (일/주/월 집계) |
| ② KT 생산성(상담사) 상세 | 상담원 × 기간 | 엑셀 업로드 | 로그인시간·IB/OB·후처리·대기·이석·AHT |
| ③ Cafe24 접수·상담 | 접수 1건 | 기존 DB 조인 (read-only) | 사고/대차/SMS 접수 처리 건수 |
| ④ CallScheduler 근무 | 근무 1셀 | 기존 DB (cs_assignments) | 근무시간·충원율 |

> ①②는 **반드시 구분 업로드**. 파일 종류를 사용자가 선택 → 각 전용 파서/테이블.

---

## 3. 신규 테이블 (마이그레이션)

### 3-1. `cs_call_records` ← ① KT 상담이력조회 상세

| 컬럼 | 타입 | KT 원본 컬럼 | 비고 |
|------|------|-------------|------|
| id | CHAR(36) PK | — | UUID |
| call_key | VARCHAR(64) | 콜키 | **UNIQUE** (재업로드 멱등) |
| center | VARCHAR(40) | 상담센터 | |
| channel | VARCHAR(20) | 채널정보 | 인바운드/아웃바운드 |
| type1 | VARCHAR(40) | 상담유형1 | 캐피탈사 |
| type2 | VARCHAR(40) | 상담유형2 | 사고/긴급출동/기타 |
| type3 / type4 | VARCHAR(40) | 상담유형3/4 | |
| agent_name | VARCHAR(40) | 상담사 | `이경미(ride_kmlee10)` → 이름 |
| agent_kt_id | VARCHAR(40) | 상담사 | 괄호 안 KT ID |
| department | VARCHAR(40) | 부서 | |
| position | VARCHAR(20) | 직급 | |
| transfer_count | INT | 호전환회수 | |
| call_date | DATE | 상담일 | `2026.05.21` 파싱 |
| start_time | TIME | 시작시간 | |
| end_time | TIME | 종료시간 | |
| duration_sec | INT | (계산) | 종료-시작 (자정 넘김 보정) |
| caller_phone | VARCHAR(30) | 발신자전화번호 | |
| session_key | VARCHAR(64) | 세션키 | |
| worker_id | CHAR(36) | (매핑) | cs_workers FK (nullable) |
| created_at | DATETIME | — | |

`UNIQUE KEY uq_cs_call_key (call_key)` — 같은 파일 재업로드 시 중복 차단 (규칙 24)

### 3-2. `cs_agent_productivity` ← ② KT 생산성(상담사) 상세

| 컬럼 | 타입 | KT 원본 | 비고 |
|------|------|---------|------|
| id | CHAR(36) PK | — | |
| period_label | VARCHAR(10) | 일자 | `2026-05`(월) 또는 `2026-05-21`(일) |
| period_kind | VARCHAR(10) | (파생) | 일자 형식으로 daily/monthly 판정 |
| department | VARCHAR(40) | 부서명 | |
| agent_name | VARCHAR(40) | 상담사명(ID) | 이름 |
| agent_kt_id | VARCHAR(40) | 상담사명(ID) | 괄호 안 ID |
| worker_id | CHAR(36) | (매핑) | cs_workers FK |
| login_first / login_last | TIME | 최초 로그인/최종 로그아웃 | |
| login_sec | INT | 로그인시간 | HH:MM:SS → 초 |
| ib_count / ib_talk_sec | INT | IB건 / IB통화시간 | |
| direct_ib_count / direct_ib_talk_sec | INT | 직통IB / 직통IB통화시간 | |
| ob_count / ob_attempt_count / ob_talk_sec | INT | OB건 / OB시도건 / OB통화시간 | |
| hold_count / hold_sec | INT | Hold건 / Hold시간 | |
| acw_count / acw_sec | INT | 후처리건 / 후처리시간 | |
| wait_count / wait_sec | INT | 대기건 / 대기시간 | |
| away_count / away_sec | INT | 이석건 / 이석시간 | |
| ib_att / direct_ib_att / ob_att | DECIMAL | IB_ATT / 직통IB_ATT / OB_ATT | |
| avg_hold / aht / acw | DECIMAL | 평균 Hold / AHT / ACW | |
| away_reasons | JSON | 이석사유1~3 + 시간1~3 | |
| is_active | TINYINT | (파생) | login_sec > 0 |
| created_at | DATETIME | — | |

`UNIQUE KEY uq_cs_prod (period_label, agent_kt_id)` — 같은 기간·상담원 재업로드 시 덮어쓰기(ON DUPLICATE UPDATE)

### 3-3. `cs_kpi_targets` — 목표치 마스터

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | CHAR(36) PK | |
| scope | VARCHAR(10) | 'team' / 'agent' |
| worker_id | CHAR(36) | scope=agent 시 (nullable) |
| metric | VARCHAR(30) | call_count / aht / intake_count / work_hours … |
| period_kind | VARCHAR(10) | daily / weekly / monthly |
| target_value | DECIMAL | |
| year / month | INT | 적용 월 |
| created_at | DATETIME | |

### 3-4. `cs_wfm_config` — 필요인원 산정 기준 (Erlang C)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | CHAR(36) PK | |
| target_service_level_pct | INT | 목표 응대율 % (예: 80) |
| target_answer_sec | INT | 목표 응대 시간 초 (예: 20) → "20초 내 80%" |
| shrinkage_pct | INT | 부재율 % (휴식·후처리·교육 등 — 필요인원 보정) |
| interval_minutes | INT | 산정 단위 (30 또는 60분) |
| max_occupancy_pct | INT | 최대 점유율 상한 (예: 85) |
| updated_at | DATETIME | |

> 단일 행(팀 기준) 또는 시프트 그룹별 다행 — 우선 단일 행으로 시작.

---

## 4. 상담원 매핑 (cs_workers ↔ KT ↔ Cafe24)

- KT 두 파일 모두 `상담사 = 이름(KT_ID)` 형식 → `agent_kt_id` 추출.
- 한 사람당 KT ID 여러 개 — **활성 ID = 생산성 파일에서 login_sec>0 인 행**.
- 1차: KT ID ↔ cs_workers 매핑 테이블이 없으면 → **이름 매칭** + 업로드 미리보기에서
  매니저가 미매칭 상담원 수동 연결.
- 매핑 결과는 `cs_workers` 에 `kt_id` 컬럼 추가(graceful)하여 영속화.
- 비활성 계정 행(login_sec=0)은 업로드 시 자동 제외.

---

## 5. 기능

### 5-1. KT 엑셀 업로드 (2종 구분)
- 업로드 화면에서 **파일 종류 선택**: `상담이력조회` / `생산성(상담사)`.
- 패턴 A (클라이언트 xlsx 파싱 → preview/apply). `leaves/bulk-upload` 패턴 재사용.
- 미리보기: 행 수, 상담원 매칭 결과(매칭/미매칭), 기간, 중복 건수.
- 적용: 상담이력 = `INSERT IGNORE` (call_key), 생산성 = `ON DUPLICATE KEY UPDATE`.
- `AIProgressFloater` 진행률 (규칙 16).
- 템플릿/가이드 시트 다운로드.

### 5-2. CX KPI 대시보드 (매니저용)
- 위치: CallScheduler 모듈 내 `KPI` 탭 (cs_ 테이블·라우트 그룹 재사용, 규칙 17).
- 기간 토글: 일 / 주 / 월.
- 상단 `DcStatStrip` 5카드: 총 통화량 · 평균 AHT · IB/OB 비율 · 접수 처리건수 · 충원율.
- 상담원별 `NeuDataTable`: 상담원 | 통화량(IB/OB) | AHT | 로그인시간 | 후처리·이석 | Cafe24 접수 | 근무시간 | 목표달성률. 전 컬럼 정렬 (규칙 18).
- 드릴다운: 캐피탈사별 / 유형별(사고·긴급출동·기타) — 상담이력 기반.

### 5-3. 목표 설정
- 매니저가 상담원/팀 목표치 입력 → KPI 대비 달성률 자동 계산·색상 표시.

### 5-4. 필요인원 산정 (WFM — Erlang C, 시간대별)

**입력**
- 콜 인입량 λ — `cs_call_records` 의 시작시간을 시간대(30/60분)별로 집계 → 인터벌당 평균 콜 수
- AHT — 해당 시간대 통화시간 평균 (`duration_sec`) 또는 생산성 파일 AHT
- 기준 — `cs_wfm_config` (목표 응대율·응대시간·부재율·최대 점유율)

**계산 (Erlang C)**
1. 제공부하 A(Erlang) = λ × AHT (동일 시간 단위)
2. Erlang C 공식으로 대기확률 P_w 계산 → 응대수준
   `SL = 1 − P_w · e^(−(N−A)·t/AHT)`
3. `SL ≥ 목표응대율` 을 만족하는 최소 상담사 수 N 탐색 (점유율 ≤ max_occupancy 도 가드)
4. 부재율 보정: 필요 인원 = ⌈ N ÷ (1 − shrinkage) ⌉

**출력**
- 시간대별 필요 상담사 수 (0~23시 또는 인터벌별)
- **실제 배정 인원 = 시간대별 커버 인원** (머릿수 아님):
  · `cs_assignments` × `cs_shift_slots`(start_time·end_time·is_overnight)
  · 매 시간대마다 "그 시각을 근무 중인 상담사 수"를 카운트
  · 한 명이 긴 시프트로 여러 시간대를 커버하면 그 시간대 전부에 +1
  · → 가변 근무시간·연장 근무·커버가 자동 반영
- 필요(Erlang C) vs 배정(커버 인원) 을 **시간대별로** 비교 → 과부족
- 일/주/월 집계 — 피크 시간대 기준 + 평균

**대시보드 표현**
- 시간대별 필요인원 막대 차트 (필요 vs 배정 커버 인원 오버레이)
- 시프트별(부엉·달빛·햇살 등) 과부족 카드 (🔴 부족 / 🟢 적정 / 🟡 과잉)
- 기준(`cs_wfm_config`) 인라인 편집

### 5-5. 물량 예측 — 향후 확장 (이번 작업 제외)

> 앞으로 추가될 물량(콜·접수)에 대한 예상 필요인원은 **Cafe24 고객사 등록차량
> 분석**을 기반으로 산정 예정. 단 해당 분석이 아직 미완성 → 본 작업에서는 제외.
>
> 설계상 자리만 확보: WFM 부하 모델(λ)이 「실측 인입량」 외에 「예상 인입량」도
> 입력으로 받을 수 있게 추상화. 등록차량 분석 완성 시 — 등록대수 → 콜/접수 전환율
> → 예상 λ → Erlang C → 예상 필요인원 으로 연결만 하면 됨.

---

## 6. API (신규)

| 라우트 | 메서드 | 용도 |
|--------|--------|------|
| `/api/call-scheduler/kpi/upload-call-records` | POST | ① 상담이력 업로드 (preview/apply) |
| `/api/call-scheduler/kpi/upload-productivity` | POST | ② 생산성 업로드 (preview/apply) |
| `/api/call-scheduler/kpi/dashboard` | GET | 통합 KPI 조회 (period, granularity) |
| `/api/call-scheduler/kpi/staffing` | GET | Erlang C 시간대별 필요인원 + 시프트 과부족 |
| `/api/call-scheduler/kpi/wfm-config` | GET/POST | 필요인원 산정 기준 CRUD |
| `/api/call-scheduler/kpi/targets` | GET/POST | 목표치 CRUD |
| `/api/call-scheduler/kpi/template` | GET | 업로드 양식 다운로드 |

---

## 7. 응대율 처리

per-상담원 응대율은 미응대 콜 귀속 불가 → **제외**.
대신 생산성 파일의 OB시도건 vs OB건(연결률), IB건, 로그인 대비 통화시간 비율 등
실측 지표로 대체.

---

## 8. 구현 순서

1. 마이그레이션 4종 (cs_call_records / cs_agent_productivity / cs_kpi_targets / cs_wfm_config) + cs_workers.kt_id
2. 업로드 API 2종 + 파서 + 미리보기 UI (파일 종류 구분)
3. KPI dashboard API + 페이지 (DcStatStrip + NeuDataTable + 일/주/월 토글)
4. WFM 필요인원 — Erlang C 엔진 + staffing API + 시간대별 차트 + 시프트 과부족
5. 목표 설정 + WFM 기준 설정 UI
6. 드릴다운 (캐피탈사/유형)

---

## 9. GATE / 한계

- GATE 4 마이그레이션: 🟡 Yellow — 사용자가 SQL 직접 적용 (규칙 23)
- 한계: KT 생산성 파일은 현재 월 단위 — 일/주 KPI 는 상담이력(콜 단위) 집계로 보완
- Cafe24 read-only graceful, MariaDB 10.1 회색 함수 금지 (규칙 13)
