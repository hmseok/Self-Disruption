# PR-HR-23b/c/d 통합 설계서 v2 — 회사별 직원 패널 단일 통합

> **세션**: happy-busy-euler (hr) · **작성**: 2026-05-29
> **트리거**: 사용자 「각 회사별로 구조가 동일해야 하는데 다르군요」 (2026-05-29)
> **사용자 선택**: Option A (단일 통합 패널 — CompanyEmployeePanel 한 화면)
> **GATE 진행**: G1 ✅ → G2 ✅ → **G3 (본 문서)** → G5 → G6 → G7 → G8 → G9
> **선결**: PR-HR-23a 설계서 (`COMPANY-EMPLOYEE-PANEL.md`) + 스켈레톤 (`CompanyEmployeePanel.tsx` 320줄) — 완료

---

## 1. 배경 — 현재 회사별 구조 차이 (코드 인덱스, Researcher GATE 2 결과)

| 회사 | sub-tab | 컴포넌트 | 라인 | 형태 |
|---|---|---|---|---|
| 🏢 **FMI** | 👥 직원 | `EmployeeListPanel` | 84 | 검색+필터+테이블 (트리 없음) |
| 🏢 **FMI** | 🏢 조직도 | `CompanyOrgPanel` | 161 | 직급+부서 **평면 카드** |
| 🏢 **FMI** | 💰 급여 | `PayrollOps` | 1,259 | FMI 전용 (영향 X) |
| 🚗 **RIDE** | 👥 직원 또는 🏢 조직도 | `RideOrgPanel` | **1,131** | 부서 트리 + 직원 + 모달 + 엑셀 통합 (sub-tab 의미 없음 — 둘 다 같은 화면) |
| ✨ **새 회사** | 👥 직원 또는 🏢 조직도 | `CompanyEmployeePanel` (스켈레톤) | 320 | 부서 트리 + 직원 테이블 2열 (PR-HR-23a) |

**불일치 결론**:
1. FMI 만 sub-tab 「직원 vs 조직도」 가 의미 있게 분리됨. RIDE/새 회사는 둘 다 동일 화면.
2. FMI 조직도 = 평면 (`departments` 테이블 + `positions`). RIDE/새 회사 = 계층 트리 (`ride_departments.parent_id`).
3. 회사 추가 시 자동 통일 안 됨 — 매번 새 컴포넌트 작성 위험.

**페인**:
- 사용자가 FMI 탭과 RIDE 탭 옮길 때마다 UI 패러다임 다름 → 학습 비용 + 답답함
- RideOrgPanel 1,131 라인은 분해 안 하면 다음 회사 추가 시 또 동일 거대 컴포넌트 복제 위험

---

## 2. 통일 목표 — Option A (사용자 결정)

**모든 회사가 단일 `CompanyEmployeePanel` 한 화면 사용**. sub-tab 「직원」 「조직도」 합쳐서 「직원」 하나만. FMI 만 「급여」 추가.

```
┌────────────────────────────────────────────────────────────────┐
│ PageTitle (자동)                                                │
├────────────────────────────────────────────────────────────────┤
│ 회사 토글: [🏢 FMI] [🚗 RIDE] [✨ 새 회사] [🔧 공통]            │
├────────────────────────────────────────────────────────────────┤
│ Sub-tab (회사별):                                                │
│   FMI:    [👥 직원] [💰 급여]                                    │
│   RIDE:   [👥 직원]                                              │
│   새 회사: [👥 직원]                                             │
│   공통:    [📩 초대] [💼 프리랜서] [🏛️ 회사] [🎭 역할] [🔧 admin]│
├────────────────────────────────────────────────────────────────┤
│ [DcStatStrip]  활성 N · 부서 M · 이번 달 입사 X · 퇴사 예정 Y   │
├────────────────────────────────────────────────────────────────┤
│ [DcToolbar] 🔍 검색 │ [활성만] [비활성 포함 (N)]                │
├──────────────┬─────────────────────────────────────────────────┤
│ 부서 트리      │ NeuDataTable (모든 컬럼 sortBy — Rule 18)       │
│ (Glass L3)    │ 이름▲ 부서 직급 고용 입사일 연락처 상태 액션   │
│ 전체 (N)      │                                                  │
│ ● 케어 17    │  ...                                              │
│   ● MT 17    │                                                   │
└──────────────┴─────────────────────────────────────────────────┘
```

---

## 3. 단계 분리 (3개 PR — 안전 분리)

### PR-HR-23b — FMI 직원 탭 마이그 (낮은 위험 · 먼저)

**작업**: `app/hr/page.tsx` 1326~1345 의 `<EmployeeListPanel ... />` → `<CompanyEmployeePanel companyKey="FMI" role={role} ... />`

**영향 파일**:
- `app/hr/page.tsx` (1줄 교체 + import 정리)
- `app/hr/_components/CompanyEmployeePanel.tsx` (props 확장 — extraColumns 로 FMI 의 '권한 chip' 컬럼 주입)
- `app/hr/_components/EmployeeListPanel.tsx` (deprecated 처리 — 23c 안정화 후 삭제)

**FMI 데이터 소스**:
- 직원: 기존 `/api/profiles` 또는 `/api/employees?company_key=FMI` (CompanyEmployeePanel 스켈레톤이 이미 후자 호출)
- 부서: `/api/departments?company_key=FMI` (현재 평면 응답 — 23d 전까지 클라이언트가 평면을 단일 루트로 변환)

**FMI 전용 컬럼 (extraColumns 주입)**:
- 권한 chip (admin/master/user) — `EmployeeListPanel` 에 있던 컬럼 이식
- 소속 유형 chip (FMI 직원 / 시스템 관리자)

### PR-HR-23c — RIDE 직원 탭 마이그 (높은 위험 ★)

**작업**: `app/hr/page.tsx` 1574 의 `<RideOrgPanel />` → `<CompanyEmployeePanel companyKey="RIDE" role={role} bulkExcel={true} ... />`

**영향 파일**:
- `app/hr/page.tsx` (1줄 교체)
- `app/hr/_components/CompanyEmployeePanel.tsx` (props 확장 — bulk excel 모달, 부서 5색 글래스, ERP 계정 라벨)
- `app/hr/_components/RideOrgPanel.tsx` (**1,131 라인 분해**)

**RideOrgPanel 분해 인덱스** (mental dry-run):
| 영역 | 라인 추정 | 마이그 대상 |
|---|---|---|
| 5색 글래스 부서 트리 | 200 | `CompanyEmployeePanel` 의 `DepartmentTreeView` 강화 (color_tone props) |
| 직원 NeuDataTable | 150 | `CompanyEmployeePanel` 기본 (extraColumns 로 RIDE 특화) |
| 신규/편집 모달 | 350 | 새 컴포넌트 `EmployeeEditModal.tsx` 추출 — 회사 공통 |
| 엑셀 일괄 등록 모달 | 300 | 새 컴포넌트 `BulkExcelModal.tsx` 추출 — RIDE 전용 |
| 검색 + 필터 | 80 | `DcToolbar` (스켈레톤 이미 사용) |
| API fetch + state | 50 | `CompanyEmployeePanel` 본체 |

**RIDE 전용 컬럼 (extraColumns 주입)**:
- 고용 유형 (외주/정규직 — `companies.is_internal_host` 자동)
- ERP 계정 chip (본 ERP 계정 X 라벨)

**최종**: `RideOrgPanel.tsx` 삭제 (또는 deprecated 처리 후 다음 세션에 제거)

### PR-HR-23d — FMI 부서 트리 마이그 (DB 변경 — Migrator GATE 4)

**마이그 SQL** (`migrations/2026-05-29_pr_hr_23d_departments_tree.sql`):
```sql
-- 1. parent_id 컬럼 추가 (멱등 — IF NOT EXISTS 패턴)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'departments' AND column_name = 'parent_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE departments ADD COLUMN parent_id CHAR(36) NULL COMMENT ''부모 부서 — Tree (PR-HR-23d)'',
   ADD COLUMN color_tone VARCHAR(20) NULL COMMENT ''트리 표시 색상 톤'',
   ADD COLUMN sort_order INT NOT NULL DEFAULT 0,
   ADD KEY idx_dept_parent (parent_id)',
  'SELECT ''parent_id 이미 존재'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 검증: SELECT COUNT(*) FROM departments WHERE parent_id IS NULL; -- 기대치: 기존 부서 수
```

**API 변경**:
- `app/api/departments/route.ts` GET — `?company_key=FMI&tree=1` 옵션 추가
- 응답: `{ data: [{ id, name, parent_id, color_tone, children: [...] }] }` (재귀 트리)
- graceful fallback: `parent_id` 미적용 시 평면 응답 + `_migration_pending: true` (Rule 23)

**스켈레톤 호환**:
- `CompanyEmployeePanel.getDepartmentsTreeUrl('FMI')` 이미 `/api/departments?company_key=FMI` 호출 중. 23d 에서 `&tree=1` 추가.

---

## 4. End-to-End 시뮬레이션 (Rule 8)

### STEP 0 — 실제 데이터
사용자: **FMI** = 단독 회사, **RIDE** = 위탁사. RIDE 직원 17명 (케어/MT/CX/영업).

### STEP 1 — UI 진입 (RIDE 탭 클릭)
- `topCompany = 'RIDE'`, `topTab = 'employees'`
- 렌더: `<CompanyEmployeePanel companyKey="RIDE" role={role} bulkExcel={true} ... />`

### STEP 2 — API 호출
- `fetch('/api/ride-employees', { Authorization })` → `{ data: [{ id, name, department, position, ... }, ...] }`
- `fetch('/api/ride-departments/tree', { Authorization })` → `{ data: [{ id, name, parent_id, color_tone, children, employee_count }, ...] }`

### STEP 3 — 부서 트리 클릭 (예: "CX 17")
- `selectedDeptId = 'cx-dept-uuid'`
- `filteredEmployees = employees.filter(e => e.department_id === 'cx-dept-uuid')`
- 우측 테이블: CX 부서 직원 17명 표시

### STEP 4 — 검색 (예: "김")
- `search = '김'` → name/department/phone/email 매칭
- 트리 필터와 AND 결합

### STEP 5 — 신규 직원 버튼 클릭
- `EmployeeEditModal` 열림 (RIDE 컨텍스트 — 회사 자동 RIDE)
- 저장 → `POST /api/ride-employees` → mutate(employees) → 자동 refresh

### STEP 6 — FMI 탭 전환
- `topCompany = 'FMI'` → `<CompanyEmployeePanel companyKey="FMI" role={role} ... />`
- 동일 UI 패러다임 — 사용자 학습 비용 없음
- 23d 적용 후 부서 트리 = 직급+부서 계층 표시. 미적용 시 평면 단일 루트 + 부서 수만 표시.

---

## 5. 영향 받는 파일 인덱스 (Rule 11/12)

### 코드 (HR 세션 단독 staging)
```
app/hr/page.tsx                                  (3줄 교체)
app/hr/_components/CompanyEmployeePanel.tsx      (props 확장 + bulk excel + 5색 트리)
app/hr/_components/EmployeeListPanel.tsx         (deprecated)
app/hr/_components/RideOrgPanel.tsx              (분해 후 삭제 또는 deprecated)
app/hr/_components/CompanyOrgPanel.tsx           (FMI org 탭 제거 시 deprecated)
app/hr/_components/EmployeeEditModal.tsx         (신규 — 공통 모달)
app/hr/_components/BulkExcelModal.tsx            (신규 — RIDE 전용)
app/api/departments/route.ts                     (23d — ?tree=1 + graceful)
app/api/ride-departments/tree/route.ts           (확인 필요 — 이미 존재?)
```

### 마이그 (사용자 직접 실행 — Rule 23)
```
migrations/2026-05-29_pr_hr_23d_departments_tree.sql (신규 — 23d 만)
```

### _docs (Rule 22 — 의무)
```
app/hr/_docs/CHANGELOG.md          (+3줄: PR-HR-23b/c/d)
app/hr/_docs/DATA-MODEL.md         (departments.parent_id + color_tone 추가)
app/hr/_docs/UI-SPEC.md            (sub-tab 통일 + CompanyEmployeePanel 표준)
app/hr/_docs/SCENARIOS.md          (페르소나별 흐름 — admin / FMI master / RIDE master)
app/hr/_docs/OPERATIONS.md         (회사별 운영 사실 — 24/365 RIDE 외주)
```

### Cowork 영역 (Rule 21 — staging 대상)
**본 세션만**: `app/hr/**`, `app/api/departments/`, `migrations/2026-05-29_pr_hr_23d_*`

**절대 staging X** (다른 세션 영역):
- `app/(employees)/RideMTOps/*` (다른 세션)
- `app/api/ride-chargers/*` (다른 세션)
- `harness-engineering/knowledge/*.baseline.json` (다른 세션 갱신)
- `prisma/schema.prisma` (공통 파일 — 변경 안 함)

### 영향 받는 다른 페이지 (Rule 4)
- `/admin/*` (권한 페이지) — `EmployeeListPanel` import 시 영향 (현재 없음 — grep 결과)
- 사이드바 PR-HR-18 — 영향 없음 (회사 격리 로직 분리)
- 메인 세션 PR-COORD 시리즈 — 영향 없음

---

## 6. 회귀 위험 + 안전망 (Rule 9 + 10)

| 위험 | 안전망 |
|---|---|
| ★ RideOrgPanel 1,131라인 분해 중 누락 기능 | extraColumns + 모달 분리로 점진 마이그. 각 단계 시각 검수. |
| FMI departments.parent_id 미적용 시 트리 깨짐 | API graceful — `_migration_pending: true` 응답 + UI 「⚠ 마이그 미적용」 배너 (Rule 23) |
| 엑셀 일괄 등록 모달 회귀 | BulkExcelModal 추출 + RideOrgPanel 의 기존 로직 1:1 이식 |
| sortBy 누락 (Rule 18) | 모든 컬럼에 sortBy 의무 — code review 시 lint:harness 통과 |
| 줄바꿈/+부호 위반 (Rule 18/19) | 셀 `whiteSpace: nowrap`, 부호 X 색상으로 의미 (Rule 18) |
| 기존 RIDE 화면 사용 중 마이그 | RideOrgPanel 즉시 삭제 X — deprecated 표시 후 23c 안정화 1주 후 제거 |

---

## 7. 동형 패턴 인덱스 (Rule 14)

| 영역 | 본 PR 적용 | 향후 추가 회사 |
|---|---|---|
| 회사별 직원 패널 | ✅ FMI + RIDE + 새 회사 모두 CompanyEmployeePanel | 자동 (props 만) |
| 회사별 부서 데이터 | ✅ 모든 회사 트리 구조 (departments.parent_id 또는 ride_departments) | 새 회사용 `<key>_departments` 추가 시만 신설 |
| extraColumns 패턴 | ✅ FMI=권한, RIDE=고용유형/ERP — 새 회사도 동일 패턴 | 자동 |
| useCompanies hook (PR-HR-22) | ✅ 회사 토글 자동 노출 | 자동 |
| 회사 색상 (lib/company-brand.ts) | (PR-HR-19 후속 — 본 PR 영향 X) | — |

---

## 8. GATE 체크리스트 (Rule 27 — 매 PR 가시화 의무)

### PR-HR-23b (FMI 직원 마이그 — 첫 단계, 안전)
```
□ G3 본 설계서 + 사용자 GO ← 대기 중
□ G4 마이그 없음 (skip)
□ G5 tsc --noEmit + 영향 페이지 빌드 (영향: /hr 만)
□ G6 lint:harness (sql/sql-fn/api-trace/ui-coverage/cowork-staging) PASS
□ G7 사용자 시각 검수 (FMI 직원 탭 — Chrome MCP 또는 스크린샷)
□ G8 evaluate.js (있으면) ≥ 8.0
□ Rule 22 _docs (CHANGELOG + UI-SPEC) 갱신
```

### PR-HR-23c (RIDE 직원 마이그 — ★ 높은 위험)
```
□ G3 본 설계서 + 사용자 GO + 23b 안정 확인
□ G4 마이그 없음 (skip)
□ G5 tsc + next build 부분 + 영향 페이지 인덱스 보고
□ G6 lint:harness PASS + 동형 패턴 (FMI/RIDE 둘 다 검수)
□ G7 사용자 시각 검수 (RIDE 직원 탭 + 모달 + 엑셀 일괄)
□ G8 evaluate.js ≥ 8.0
□ Rule 22 _docs (CHANGELOG + UI-SPEC) 갱신
```

### PR-HR-23d (FMI 부서 트리 마이그 — DB 변경)
```
□ G3 본 설계서 + 사용자 GO
□ G4 마이그 SQL 사용자 검토 (Yellow — 멱등 + 검증 SELECT 포함)
□ G5 graceful fallback 확인 (_migration_pending 응답)
□ G6 lint:harness PASS
□ G7 사용자 시각 검수 (FMI 직원 탭 — 부서 트리 노출 확인)
□ G8 evaluate.js ≥ 8.0
□ Rule 22 _docs (CHANGELOG + DATA-MODEL) 갱신
□ 사용자 직접 마이그 SQL 실행 후 재 검수
```

---

## 9. 푸시 전 보고 (Rule 5)

각 PR commit 직전 사용자에게:
```
📋 변경 요약: 파일 N개, 추가 N줄, 삭제 N줄
🔬 검증: tsc PASS / lint PASS / 영향 페이지 빌드 PASS / 사용자 시각 검수 PASS
🚨 위험: (낮음/중간/높음) + 롤백 계획 (이전 컴포넌트 deprecated 유지)
→ 사용자 승인 후 push
```

---

## 10. 진입 결정 — 사용자 GO 키워드 대기 (Rule 7)

**다음 액션 후보**:
1. 「23b GO」 / 「23b 진행」 → PR-HR-23b 만 먼저 (가장 안전)
2. 「23b+c 같이 GO」 → 둘 함께 (FMI+RIDE 같은 commit 묶기 — 회사 영역이라 staging 안전)
3. 「23b+c+d 같이 GO」 → 전체 (마이그 포함 — 사용자가 SQL 실행 의지 있을 때)
4. 「설계 수정 요청」 → 본 설계서 v2 수정

명시적 「구현 진행 / 코딩하세요 / ㄱㄱ / 진행 / 바로 가시죠 / 해주세요」 키워드 받기 전 Generator 진입 금지 (Rule 7).
