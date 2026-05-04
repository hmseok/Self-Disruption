# CallScheduler — 중복 검수 + 기능 분리 보고서

> 사용자 명시 (2026-05-04): "중복 부분 보이는 것 같은데 검수해서 기능 분리"
> 21개 PR 누적 후 코드/UI/데이터 중복 점검.

## 1. 발견된 중복 / 분리 필요 영역

### 1-A. 직원 → 매니저 요청 흐름 중복 ⚠️ 가장 큼

**현재**:
| 흐름 | 테이블 | 신청 UI | 매니저 인입 |
|------|-------|---------|-----------|
| 시프트 교체 (PR-2Y) | `cs_swap_requests` | 마이페이지 시간표 행 [🙋 교체 요청] | 상세 [⋯] 빨간 배지 (count only) |
| 휴가 신청 (PR-2BB) | `cs_leaves` (status='pending') | (TBD) 마이페이지 [+ 휴가 신청] | (TBD) 매니저 휴가 탭 status 필터 |

**문제**: 두 흐름이 거의 동일한데 진입점/UI/처리화면이 별개 작성 중.

**제안 (Phase A — 즉시 적용)**:
- 두 요청을 **단일 통합 패널** "📥 직원 요청함" 으로:
  - 위치: 매니저 상세 페이지 [⋯] → "📥 요청 N건" → 통합 패널 (탭 2개: 휴가 / 시프트교체)
  - 또는 RideEmployees 의 "요청함" 신규 페이지로 분리 (모듈 격리)
- API 측은 그대로 (cs_leaves + cs_swap_requests 별도)
- UI 컴포넌트 1개로 통합 (`PendingRequestsPanel`)

**제안 (Phase B — 추후)**:
- DB 차원 통합 → `cs_employee_requests` (type='leave'|'swap', payload JSON)
- 단점: 기존 마이그레이션 깨짐 → 점진 마이그레이션 필요

→ **Phase A 만 즉시 적용 권장** (UI 통합으로 충분).

### 1-B. KPI / 분석 / 균형도 분산 ⚠️ 중

**현재**:
| 표시 위치 | 컴포넌트 | 정보 |
|----------|---------|------|
| 상세 페이지 상단 | `KpiStrip` (5타일) | 충원율 / 평균시간 / 반차·F / 미배정 / 균형도 |
| 분석 드로어 | `AnalyticsPanel` | 인당 워커별 시간/야간/반차/F |
| 작성 모드 좌측 | `ComposeMode` 워커 list | 각 워커 막대 + 평균선 + 편차 |

**문제**: "워커별 부담"이 3곳에 분산. 같은 데이터 다른 시각화.

**제안**:
- `KpiStrip` = 전체 요약 5타일 (그대로 유지)
- `AnalyticsPanel` = 워커별 상세 테이블 (기존)
- `ComposeMode` 좌측 = 작성 컨텍스트 한정 인디케이터 (기존)
- ✅ **다음 정리** — 세 가지 모두 같은 `useScheduleKpi()` 훅 또는 단일 source 에서 계산
  - 현재는 각자 useMemo 로 계산 → 동일 로직 3중복
  - 추후 `utils/kpi.ts` 로 추출

### 1-C. 헤더 [⋯ 더보기] 와 설정 진입 중복 ⚠️ 작음

**현재**:
- 헤더 [⋯] → "⚙️ 설정" → `/CallScheduler/settings`
- 헤더 외 추가 진입점 없음 (OK — 중복 없음)

**점검 결과**: 정리됨 ✅ (PR-2M 에서 통합)

### 1-D. 셀 즉석 액션 중복 ⚠️ 작음

**현재**:
| 동작 | 매트릭스 모드 (ScheduleGrid) | 작성 모드 (ComposeMode) |
|------|-----------------------------|-----------------------|
| 워커 배정 | 셀 클릭 → WorkerPicker | 좌측 워커 선택 + 일자 토글 |
| 특수코드 변경 | 셀 우클릭 → quick action (PR-2Z) | 상단 default special 토글 |
| 셀 비우기 | 우클릭 → "🗑 셀 비우기" | 일자 토글 (재클릭) |

**문제**: 같은 결과 두 경로. 사용자에게 학습 부담 없지만 코드 중복 일부 (special_code 처리 핸들러).

**제안**:
- ✅ 두 모드는 페르소나 다름 (매트릭스=조감, 작성=배정 입력) → 그대로 유지
- 공통 핸들러 `useAssignmentMutation()` 훅으로 추출 (PUT/DELETE 로직 1곳)
  - 현재: ScheduleGrid.handleSave/handleClear/handleQuickAction/handleSwap + ComposeMode.toggleCell/applyBulk 모두 비슷한 fetch 로직
  - 향후 정리: lib 또는 utils 로

### 1-E. ScheduleGrid 모드 토글 누적 ⚠️ 중

**현재** ScheduleGrid 상단:
- [👀 빈자리 강조] (PR-2S)
- [🔄 시프트 교체] (PR-2R)
- 추가 예정: 결근 일괄 / 워커 필터 등

**문제**: 토글이 늘어나면 산만. 한 번에 한 모드만 활성 가능한데 시각적 분리 부족.

**제안**:
- "🛠 도구" 드롭다운 메뉴로 통합 (모든 토글 한 곳)
- 또는 라디오 형태 (현재 모드 명시)
- 우선순위: 낮음 (지금 2개라 OK)

### 1-F. 휴일 vs 휴가 중복 ⚠️ 중 (이미 정리)

**이전 사고**: cs_holidays 의 'family' (패밀리데이) ↔ cs_leaves 의 'family' (경조)
**현재 (24/365 재구성 후)**:
- cs_holidays = 회사 공통 마커만 (참고용)
- cs_leaves = 모든 직원 휴무 (연차/패밀리데이/병가/공휴일/경조/기타)
- ✅ 정리 완료

### 1-G. 마이페이지 ↔ 토큰 페이지 ✅ 정리됨

**현재**: 둘 다 `MyScheduleView` 공통 컴포넌트 사용. 차이는 token prop 만. ✅ DRY OK.

### 1-H. cs_workers ↔ ride_employees 마스터 컬럼 중복 ⚠️ 큼 (점진)

**현재**:
| 컬럼 | cs_workers | ride_employees |
|------|-----------|---------------|
| name | ✅ | ✅ (마스터) |
| phone | ✅ deprecated | ✅ (마스터) |
| email | ✅ deprecated | ✅ (마스터) |
| profile_id | ✅ | ✅ |
| color_tone | ✅ (콜센터 특화) | ✅ (호환) |
| group_label | ✅ (콜센터 특화) | ✅ (호환) |

**문제**: 같은 정보 두 곳에 있음. 동기화 어긋날 위험.

**제안 (Phase 추후)**:
- cs_workers 의 마스터 컬럼 (name/phone/email) → 점진 deprecated, ride_employees JOIN 으로
- color_tone / group_label 은 **cs_workers 만 정답** (콜센터 특화)
- ride_employees 의 color_tone / group_label 은 **deprecated** 또는 마스터로 일원화 결정 필요

→ 본 보고서는 **Phase 결정만**. 즉시 정리 X (운영 데이터 영향).

## 2. 즉시 실행할 정리 (Phase A)

### A-1. 직원 요청 통합 패널

**작업**:
1. 매니저 상세 [⋯] 메뉴 항목 추가: "📥 직원 요청 (N건)"
2. 클릭 시 `EmployeeRequestsPanel` 모달 또는 사이드 드로어
3. 탭 2개: 「휴가 신청」(cs_leaves status='pending') / 「시프트 교체」(cs_swap_requests status='pending')
4. 각 행 [✓ 승인] / [✗ 반려] / [메모 입력]

**예상 파일**:
- `app/CallScheduler/components/EmployeeRequestsPanel.tsx` (신설)
- `[id]/page.tsx` 더보기 메뉴 항목 추가

### A-2. KPI 계산 훅 추출

**작업**:
1. `app/CallScheduler/utils/kpi.ts` 신설
2. `useScheduleKpi(detail)` 훅 export
3. KpiStrip / AnalyticsPanel / ComposeMode 좌측 모두 같은 훅 사용

**예상 파일**:
- `utils/kpi.ts` (신설)
- 위 3개 컴포넌트 import 변경

### A-3. Assignment Mutation 헬퍼

**작업**:
1. `app/CallScheduler/utils/assignmentApi.ts` 신설
2. `putAssignment()` / `deleteAssignment()` / `swapAssignments()` export
3. ScheduleGrid + ComposeMode 핸들러 모두 이 헬퍼 사용

**예상 파일**:
- `utils/assignmentApi.ts` (신설)
- ScheduleGrid / ComposeMode 핸들러 단순화

## 3. 진행 우선순위

| # | 작업 | 영향 | 작업량 |
|---|------|------|--------|
| **A-1** | 직원 요청 통합 패널 | 매니저 운영 매우 큼 | 중 |
| **A-2** | KPI 계산 훅 | 코드 정리, UX 영향 X | 작 |
| **A-3** | Assignment 헬퍼 | 코드 정리, UX 영향 X | 작 |
| **B (추후)** | cs_workers 마스터 컬럼 deprecated | 데이터 영향 큼 | 큼 |

## 4. 변경 이력

| 날짜 | 변경 |
|------|------|
| 2026-05-04 | 초안 작성, 8개 중복 영역 식별, Phase A 3건 즉시 적용 결정 |
