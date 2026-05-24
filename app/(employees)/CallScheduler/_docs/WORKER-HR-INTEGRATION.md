# CallScheduler — 워커 ↔ 인사마스터 통합 설계서

> 2026-05-24 · 작성: 통합 설계 (사용자 검토 대기 — 구현 전 GATE-3)
> 트리거: 「워커가 인사마스터에서 와야 하지 않나 / ID 매칭은 워커 설정에 있어야」

---

## 0. 정정 — WHR-A-fix (2026-05-24, 구현 후 데이터 검증)

> 본 설계서는 인사마스터를 `profiles` 로 가정했으나 **틀렸다**. 아래가 정정된 사실.

**인사마스터 = `ride_employees`** (profiles 아님).

- CallScheduler 워커 16명은 `profiles` 에 없음 (이름 매칭 0/16 — 전소현만 우연히 profiles 계정 보유).
- 16명은 `ride_employees`(department='콜센터')에 있음.
- 정식 연결 컬럼 = **`cs_workers.employee_id` → `ride_employees.id`** (FK `fk_cs_worker_employee`, 2026-05-03 신설). 16명 전원 이미 정상 연결됨.
- `profiles` ↔ `ride_employees` 는 `ride_employees.profile_id` 로 옵션 연결 (로그인 계정 있는 직원만). 콜센터 16명은 전부 NULL.
- 3층 구조: `profiles`(로그인 계정) ←옵션← `ride_employees`(인사 마스터) ←`employee_id`← `cs_workers`(콜센터 스케줄링).

**아래 § 본문에서 `profiles` / `profile_id` 라고 쓴 부분은 모두 `ride_employees` / `employee_id` 로 읽을 것.**

- § 3-2 KT ID / Cafe24 ID 매칭, § 4 UI, § 5 Phase 계획은 유효 — 연동 컬럼만 `employee_id`.
- § 3-3 「백필」 불필요 — `employee_id` 는 이미 채워져 있음. 대신 `ride_employees` 콜센터 중복 정리(`2026-05-24_ride_employees_dedup.sql`) 수행.
- § 6 「확정 사항」 1번 `profiles.department='CX팀'` → 실제는 `ride_employees.department='콜센터'`.

데이터 검증 근거: 2026-05-24 진단 — `cs_workers` 16명 ↔ `ride_employees` linkage_status 전원 OK / `ride_employees` 콜센터 48행(활성16+중복32, 중복은 dedup 으로 정리).

---

## 1. 현황

### 1-1. 인사마스터 = `profiles` 테이블
회사 직원 마스터. (prisma `Profile` 모델)

| 컬럼 | 용도 |
|------|------|
| `id` (CHAR36) | 직원 PK |
| `email` (unique) | 로그인 ID |
| `name` | 이름 |
| `phone` | 전화번호 |
| `department` | 부서 (예: 'CX 컨택센터') |
| `position` | 직급 |
| `role` | admin / manager / member |
| `is_active` | 재직 여부 |

### 1-2. `cs_workers` — 현재 독립 목록
CallScheduler 워커 16명을 **이름으로 따로 시드**한 독립 테이블.
- 정체성: `name`, `phone`, `email`, `color_tone`, `kt_id`, `cafe24_user_id`, `view_token`
- 스케줄링: `group_label`, `work_cycle_*`, `max_*`, `min_days_per_month`, `blocked_slot_ids`, `preferred_dow_*`
- **`profile_id` FK 컬럼이 이미 존재** — 인사마스터 연결용 훅인데 안 쓰임 (전부 NULL 추정)

### 1-3. 문제점
1. **이중 입력** — 인사에 직원 등록 + CallScheduler에 워커 또 등록
2. **출처 불일치** — 같은 사람의 이름/전화번호가 profiles · cs_workers 두 곳
3. **ID 매칭 위치** — KT ID·Cafe24 사용자 매칭이 「KPI 설정」에 있음. 워커 정체성이므로 「설정 › 워커」가 맞음
4. **3자 연동 기반 부재** — 인사마스터 ↔ KT ID ↔ Cafe24 를 잇는 단일 person 축이 없음

---

## 2. 목표

- `cs_workers` 는 **「인사마스터 직원 중 CX 콜센터 상담원」 인 사람의 스케줄링 레코드**
- 워커 추가 = 인사마스터에서 직원 선택 (자유 입력 X)
- 이름·전화번호 단일 출처 = `profiles`
- KT ID·Cafe24 ID 매칭 UI = 「설정 › 워커」 (WorkersTab)
- person 축: `profiles` ← `cs_workers`(profile_id) → `kt_id` / `cafe24_user_id`

---

## 3. 데이터 모델 설계

### 3-1. `cs_workers.profile_id` 활용
- `profile_id` 를 실제 사용 — `cs_workers` 1행 ↔ `profiles` 1행 (UNIQUE).
- `name` / `phone` / `email` 은 **캐시 컬럼으로 유지** (profiles 에서 동기화).
  - 이유: 수많은 기존 쿼리가 `cs_workers.name` 사용 → 전면 JOIN 교체는 위험·과대.
  - profile_id 없는 레거시 워커도 graceful (캐시 name 으로 동작).
- 캐시 동기화: 워커 생성/수정 시 profiles 값 복사. (선택) 주기적 sync 도구.

### 3-2. KT ID / Cafe24 ID
- `cs_workers.kt_id` · `cs_workers.cafe24_user_id` **그대로 유지** (CX 콜센터 전용 식별자라 워커 레코드가 맞는 자리).
- 매칭 UI 만 「KPI 설정 › 상담원 매칭」 → 「설정 › 워커」로 이동.

### 3-3. 마이그레이션 없음 / 최소
- 컬럼은 이미 다 있음 (`profile_id` 포함). **스키마 변경 거의 불필요**.
- 데이터 백필만: 기존 16 워커의 `profile_id` 를 이름 매칭으로 채움 (1회성 SQL, 매칭 실패 행은 NULL 유지 → UI에서 "인사 미연결" 표시).

---

## 4. UI 변경

### 4-1. WorkersTab (설정 › 워커)
- **워커 추가** — 「+ 워커」 → 인사마스터 직원 선택 모달:
  - `profiles` 목록 (is_active=1, 기본 필터 `department LIKE '%CX%'` — 해제 가능)
  - 이미 cs_workers 에 있는 직원은 제외/회색
  - 선택 → `cs_workers` 행 생성 (profile_id + name/phone 복사)
- **워커 행** — 인사 연결 표시(직원명·부서·직급), KT ID·Cafe24 사용자 드롭다운(현 AgentMappingSection 이식)
- 이름/전화번호는 읽기 전용(인사마스터 출처) — 색상·그룹·cycle·ID매칭만 편집

### 4-2. KPI 설정 › 상담원 매칭
- AgentMappingSection 의 per-워커 KT/Cafe24 매칭 → WorkersTab 으로 이동
- 「전체 자동 매칭」 일괄 도구는 WorkersTab 상단 액션으로 같이 이동 (또는 KPI설정에 링크만)

---

## 5. 단계별 진행안

| Phase | 내용 | 규모 |
|-------|------|------|
| **A** | 인사마스터 직원 선택 API + WorkersTab 「직원 선택」 모달 + profile_id 저장. 기존 워커 profile_id 백필 SQL | 중 |
| **B** | KT ID·Cafe24 매칭 UI 를 WorkersTab 으로 이식 (KPI 설정에서 제거/링크) | 중 |
| **C** | 이름/전화 캐시 동기화 — 워커 저장 시 profiles 값 복사 + 인사 정보 변경 반영 | 소 |

---

## 6. 확정 사항 (사용자 확인 완료 — 2026-05-24)

1. **CX 콜센터 상담원 식별** = `profiles.department = 'CX팀'`. 직원 선택 모달 기본 필터.
2. **현 16 워커** — 모두 `profiles` 에 등록돼 있음 (외부인력/라이드 분류). → 이름 매칭 백필 가능.
3. **profile_id 필수** — 독립(인사 미연결) 워커 불허. 모든 워커는 인사마스터 직원에서 생성. `profile_id` NOT NULL 지향. 백필 안 된 레거시 워커는 UI 에서 "인사 미연결" 경고 + 직원 연결 유도.
4. **이름 = 인사마스터 출처 고정(읽기전용)**. cs_workers 별칭 편집 불가. 동명이인은 `profile_id` 로 구분.

---

## 7. 비고
- `cs_workers` 의 스케줄링 필드(group/cycle/limit/preference)는 전부 유지 — CallScheduler 고유.
- 이 통합은 자동생성·근태·KPI 어디에도 파괴적 변경 없음 (profile_id 는 추가 링크일 뿐).
- 외부 의존: 없음 (profiles 는 내부 DB).
