# CompanyEmployeePanel — 회사별 직원 마스터 통일 패널 설계서

> PR-HR-23 (2026-05-28, hr 세션)
> 사용자 (2026-05-28): 「fmi/ride 탭 정리되어야 / 우리 구조에 맞게 신설로 진행」

## 1. 배경 — 현재 불일치

| 영역 | FMI | RIDE | 새 회사 |
|---|---|---|---|
| 직원 탭 컴포넌트 | `page.tsx` 인라인 (EmployeeListPanel + 모달) | `RideOrgPanel` 통합 (트리+직원+모달+엑셀) | ❌ 자동 노출 X |
| 부서 데이터 | `departments` (평면) + `positions` (직급) | `ride_departments` (트리) | — |
| 부서 트리 UI | 없음 (조직도 탭 분리) | 좌측 5색 글래스 트리 | — |
| 직원 컬럼 | 이름/회사/부서/권한/상태 | 이름/부서/직급/고용/입사일/연락처/상태 | — |
| 엑셀 일괄 등록 | 없음 | 있음 (컨택 명단) | — |
| ERP 계정 라벨 | 모두 정규직 | "본 ERP 계정 X" 외주 | — |

→ **회사 추가 시 자동 노출 안 됨**. UI 도 회사마다 다른 사용자 페인.

## 2. 신설 통일 구조 — `CompanyEmployeePanel`

### 2.1 레이아웃 (5층 표준 + 부서 트리 사이드)

```
┌────────────────────────────────────────────────────────────────┐
│ PageTitle (자동 — PageTitle.tsx)                                │
├────────────────────────────────────────────────────────────────┤
│ DcStatStrip (5 카드 + 액션)                                     │
│ [활성 N] [부서 M] [이번 달 입사 X] [퇴사 예정 Y]  [+ 신규 직원] [⤴ 엑셀]│
├────────────────────────────────────────────────────────────────┤
│ DcToolbar (검색 + 활성/비활성 필터)                              │
│ [🔍 이름·부서·연락처 검색] [활성만] [비활성 포함 (N)]              │
├──────────────┬─────────────────────────────────────────────────┤
│ 부서 트리      │ NeuDataTable (직원 리스트)                       │
│ (Glass L3)    │ 컬럼: 이름▲ 부서 직급 고용 입사일 연락처 상태 액션│
│ 전체 (N)      │  ─────────────────────────────────────────       │
│ ● 케어 17    │  김XX │ CX  │ 사원 │  -  │  -  │ 010..  │활성    │
│   ● MT 17    │  박XX │ CX  │  -  │  -  │  -  │ 010..  │활성    │
│   ● CX 17    │  ...                                              │
│ ● 영업 0     │                                                   │
└──────────────┴─────────────────────────────────────────────────┘
```

### 2.2 Props

```ts
interface CompanyEmployeePanelProps {
  companyKey: string                 // 'FMI' | 'RIDE' | 새 회사 키
  role: 'admin' | 'master' | 'user'  // 권한 분기
  /** 회사별 추가 컬럼 (옵션) — 기본 컬럼 외 회사 특화 */
  extraColumns?: TableColumn<any>[]
  /** 회사별 엑셀 일괄 등록 활성화 (기본 false) */
  bulkExcel?: boolean
}
```

### 2.3 내부 책임 (회사별 data source 분기)

```ts
// 회사별 API 분기
const employeesUrl = companyKey === 'RIDE'
  ? '/api/ride-employees'
  : `/api/employees?company_key=${companyKey}`

const departmentsUrl = companyKey === 'RIDE'
  ? '/api/ride-departments/tree'
  : '/api/departments?company_key=' + companyKey  // 신규 endpoint (PR-HR-23d)
```

### 2.4 책임 분리

- **본 패널** — UI 표현 (5층 표준)
- **외부 page.tsx** — 회사 토글 + 탭 전환 + 권한 가드
- **신규 endpoints (23d)** — FMI departments tree 형태 응답

## 3. 단계 (commit 4개)

| 단계 | 작업 | 영향 파일 |
|---|---|---|
| **23a** (본 PR) | 설계서 + 스켈레톤 컴포넌트 신설 (실제 마이그 X) | `_docs/COMPANY-EMPLOYEE-PANEL.md`, `CompanyEmployeePanel.tsx` |
| **23b** | FMI 직원 탭 마이그 (`page.tsx` 인라인 → 본 패널) | `app/hr/page.tsx` |
| **23c** | RIDE 직원 탭 마이그 (`RideOrgPanel` 분해 — bulk action 별도) | `app/hr/_components/RideOrgPanel.tsx`, `app/hr/page.tsx` |
| **23d** | FMI departments 트리 마이그 (parent_id 컬럼 + API 트리 응답) | `migrations/*`, `app/api/departments/route.ts` |

## 4. 우리 구조 맞춤 결정

- **부서 트리 통일** — FMI 도 계층 구조 (현재 평면 → 23d 에서 마이그)
- **외주/정규직 라벨** — `companies.is_internal_host` 기반 자동 (FMI=정규직, RIDE=외주)
- **엑셀 일괄 등록** — `bulkExcel` props 로 회사별 옵션 (기본 비활성, RIDE 만 활성)
- **새 회사 추가** — companies 테이블 row 추가만으로 자동 노출 (PR-HR-22 기반)

## 5. 마이그 안전성

- 기존 EmployeeListPanel / RideOrgPanel 즉시 제거 X — 마이그 검증 후 단계 폐기
- 23b/c 마이그 완료 → 사용자 시각 검수 → 기존 컴포넌트 deprecated 처리
- 회귀 위험 시 hotfix 분기 분리

## 6. 의존 PR

- PR-HR-15 (companies 메타) ✅
- PR-HR-22 (useCompanies hook) ✅
- PR-HR-18 (사이드바 회사 격리) ✅
- 본 PR-HR-23 → PR-HR-19 (회사 배지 강화) 도 가능
