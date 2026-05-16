# HR (인사 마스터) — 페르소나 & 시나리오 (1차 초안)

> **작성**: 2026-05-11 (sweet-amazing-galileo 메인 세션)
> **목적**: 신설 hr 세션 인계 자료 — meetings 세션 위임 요청 (V2-Dept-FK 전제).
> **상태**: 1차 초안 — 사용자 인터뷰 후 hr 세션이 보강 의무.
> **Rule**: CLAUDE.md Rule 25 (운영 사실 인터뷰) + Rule 26 (페르소나 의무).

---

## 0. 운영 사실 인터뷰 — hr 세션 첫 작업 (Rule 25 의무)

hr 세션이 시작하면 사용자에게 다음 질문 후 본 문서 보강:

### [A] 부서 구조
1. 현재 부서 종류? (예: 콜센터 / 운영 / 정비 / MT팀 / 영업 / 관리)
2. 부서 트리 (parent_id) 필요? (예: 운영 > 정비팀 > MT팀)
3. 부서장 (manager_id) 지정 필요?
4. 부서별 색상 (color_tone) 표시?

### [B] 직원 관리 흐름
1. 입사 → 부서배정 → 보직변경 → 퇴사 단계
2. 보직변경 이력 추적? 또는 현재 상태만?
3. 직원 일괄 부서 변경 기능 필요?

### [C] 권한
1. HR 담당자 (인사 마스터 관리)
2. 부서장 (자기 부서원 조회)
3. 일반 직원 (본인 정보 조회만)
4. admin (모든 권한)

### [D] 연계 모듈
1. cs_workers (콜센터) — 이미 employee_id FK 연결됨
2. meetings.department — 현재 free text → department_id FK 마이그 예정 (V2-Dept-FK)
3. CallScheduler 그룹 분류 → ride_departments 통합?
4. 급여 (app/admin/payroll) 연계?

### [E] UI
1. /hr/people — 직원 list (DcStatStrip / DcToolbar / NeuDataTable 의무)
2. /hr/people?focus=<id> — 직원 행 highlight (meetings V2-C-Ride 멘션 destination)
3. /hr/org — 부서 트리 + 부서장
4. /hr/payroll — 급여 (별도)

---

## 1. 페르소나 1 — HR 담당자 (주 페르소나)

### 1.1 프로필
- 직무: 직원 마스터 관리 (입사 / 퇴사 / 부서변경 / 정보 갱신)
- 도구 (현재): 엑셀 + 본 페이지 (운영 시작 단계)
- 도구 (목표): /hr 모듈 통합 관리
- 페인 포인트:
  1. ride_employees.department 가 free text → 일관성 깨짐 (콜센터 / 콜센타 / Call Center 등 혼재 가능)
  2. 부서 트리 없음 → 운영>정비팀>MT팀 같은 계층 표현 불가
  3. meetings / cs_workers 모듈과 부서 매핑 불일치

### 1.2 KPI
- 직원 마스터 정합성 (department_id FK 100%)
- 부서장 지정률
- 인사 변동 이력 추적

---

## 2. 시나리오 — End-to-End

### Step 1. 부서 마스터 등록
- /hr/org 에서 부서 신설:
  - name (예: '콜센터')
  - parent_id (계층 구조)
  - manager_id (부서장)
  - color_tone (UI 표시 색상)
- ride_departments 신규 row

### Step 2. 직원 부서 배정
- /hr/people 에서 직원 → 부서 dropdown
- ride_employees.department_id 갱신
- 일괄 변경: 여러 직원 체크 → 부서 선택 → 일괄 update

### Step 3. 직원 정보 갱신
- 입사일 / 직급 / 연락처 / 상태 (active/inactive)
- 보직변경 시 이력 추적 (옵션 — 사용자 결정)

### Step 4. 연계 모듈 활용
- meetings.department_id 가 ride_departments.id FK 참조
- CallScheduler 의 group_label / cs_workers 매핑
- 부서 변경 시 연계 모듈 자동 갱신 (또는 manual)

---

## 3. 페르소나 2 — 부서장

- 자기 부서원 조회 + 부서 정보 수정 (옵션)
- 직원 부서 배정 권한 X (HR 담당자만)

## 4. 페르소나 3 — admin

- 모든 권한
- 부서 트리 재구성 / 부서 삭제 / 부서장 변경

## 5. 페르소나 4 — 일반 직원

- 본인 정보 조회만 (`/work-essentials/my-info`)
- 부서 마스터 변경 권한 X

---

## 6. 현재 페이지 상태

```
app/hr/
├── page.tsx          (대시보드)
├── people/           (직원 list)
├── payroll/          (급여 — 별도 모듈)
├── org/              (부서 — 신설 필요)
└── _components/      (공통 컴포넌트)
```

**미흡**:
- DcStatStrip / DcToolbar / NeuDataTable 적용 여부 확인 필요
- 부서 트리 페이지 (/hr/org) 미구현 가능성
- ride_departments 테이블 신설 필요

---

## 7. hr 세션 작업 우선순위 (위임)

### Phase 1 — 부서 마스터 + 인사 정합성
- [ ] _docs/HR-PERSONAS.md 사용자 인터뷰 후 보강 (본 문서)
- [ ] _docs/HR-DATA-MODEL.md 보강 (테이블 도식)
- [ ] migrations — ride_departments 신설 + ride_employees.department_id FK
- [ ] /hr/people 디자인 표준 적용 (DcStatStrip / DcToolbar / NeuDataTable)
- [ ] /hr/org 부서 트리 + 부서장 지정 UI

### Phase 2 — 연계 모듈 마이그
- [ ] meetings.department free text → department_id FK 마이그 (V2-Dept-FK)
- [ ] cs_workers 통합 검토
- [ ] /hr/people?focus=<id> highlight 기능 (V2-C-Ride 멘션 destination)

### Phase 3 — 보강 기능
- [ ] 보직변경 이력 (옵션)
- [ ] 직원 일괄 부서 변경 UI
- [ ] 급여 연계 (/admin/payroll)

---

## 8. 디자인 표준 (필수)

- PageTitle 자동 사용 (자체 헤더 X)
- DcStatStrip (5 stat — 활성 직원 / 부서별 / 신규 입사 / 퇴사 예정 / 변경 대기)
- DcToolbar (검색 + 부서/직급 필터)
- NeuDataTable (Rule 18 — 모든 컬럼 sortBy 의무)
- Glass 5단계 (Level 4/3/2/1)
- Rule 19 줄바꿈 최소화 (whiteSpace: nowrap)
- Rule 20 결과 글래스 패널 (alert 최소화)

기준 페이지: `/loans`, `/finance/settlement`

---

본 문서는 hr 세션이 운영 사실 인터뷰 후 보강.
