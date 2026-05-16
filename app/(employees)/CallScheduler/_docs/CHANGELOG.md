# CallScheduler — CHANGELOG

> 매 PR 종료 시 한 줄 이상 기록 의무 (CLAUDE.md 규칙 22)
> 본 세션 (2026-05-03 ~ 05-04) 의 PR 누적

## 2026-05-16 (N-19-a-fix) — GroupEditor 다시 열 때 rotation 데이터 누락 fix

### 사용자 보고
> "그룹 설정에서 저장이 안되는것같은데"

### 진단
- DB 확인 — cs_shift_groups.rotation_enabled=1, cs_group_shifts 5 row 모두 정상 저장됨
- 문제: `GET /api/call-scheduler/shift-groups/[id]` (단일 그룹 상세) 가 rotation_* 컬럼 + rotation_shifts list + 멤버 rotation_start_* 안 반환
- 결과: GroupEditor 다시 열면 토글 OFF / sequence 빈 칸으로 보임 (= "저장 안 됨" 으로 보임)
- 원인: N-19-a 에서 list GET / PATCH 만 확장하고 [id] 단일 GET 누락

### 변경 (`app/api/call-scheduler/shift-groups/[id]/route.ts`)
- graceful 컬럼 감지 추가 (hasCategory / hasSkipOnHolidays / hasRotation / hasGroupShifts / hasMemberRotation)
- 별도 SELECT 로 category / skip_on_holidays / rotation_* 조회 후 응답 group 객체에 merge
- `rotation_shifts` — cs_group_shifts JOIN cs_shift_slots 으로 sequence 반환
- 멤버 query 에 `rotation_start_date / rotation_start_index / rotation_end_date` 추가 (조건부)
- 응답 정규화 (blocked_slot_ids JSON parse 등)

### 효과
- 그룹 편집 화면을 닫았다 다시 열어도 로테이션 토글 + 시프트 sequence + 멤버 시작 시점 모두 그대로 표시
- DB 에는 정상 저장됐던 데이터가 UI 에 가시화됨

### 회고
- ⚠ N-19-a 때 GET list + PATCH 만 검증하고 [id] 단일 GET 미검증 — 동형 패턴 검사 부족
- Rule 14 (동형 패턴 자동 확장) 적용 사례 추가 — 새 컬럼 추가 시 list + 단일 + POST/PATCH 4개 모두 검증 의무

## 2026-05-16 (Phase N-20) — KPI 카드 드릴다운 확장 (5/5 카드 모두 클릭 가능)

### 사용자 의도
> "순서대로 가시죠" (N-18 균형도만 → 나머지 4 카드도 드릴다운 통일)

### 변경 (`app/(employees)/CallScheduler/components/KpiStrip.tsx`)
- DrillKey type 확장: 'fill' | 'avg' | 'half' | 'unfilled' | 'balance'
- 각 카드 clickable 조건 정의:
  · 충원율 — slots.length > 0
  · 평균시간 — activeWorkers.length > 0
  · 반차·F — half + free > 0
  · 미배정 — unfilled_slots > 0
  · 균형도 — alertCount > 0
- 한 번에 1 카드만 펼침 (다른 카드 클릭 시 자동 전환)
- 드릴다운 컴포넌트 4종 신설:
  · `FillDrilldown` — 슬롯별 충원율 (낮은 순)
  · `AvgDrilldown` — 워커별 시간 막대 + 평균 세로선 + 편차 %
  · `HalfDrilldown` — 워커별 반차/F 카운트
  · `UnfilledDrilldown` — 슬롯별 미배정 셀 카운트 + 비중 %
- 기존 `BalanceColumn` (N-18) 재사용

### UI 일관성
- 모든 드릴다운: 글래스 L1 + 타이틀 + × 닫기 + 정렬된 list
- 워커 칩: tone bg + 이름 + 보조 정보 + 우측 정렬된 수치
- 슬롯 항목: 코드 + 라벨 + 충원/미배정 카운트
- 색상 의미: 빨강=경고 / 앰버=주의 / 초록=양호

### 효과
- 사용자가 KPI 숫자 클릭 → 어떤 워커/슬롯에 문제 있는지 즉시 확인
- "균형도 12" 처럼 추상 수치가 구체 워커 list 로 분해됨
- 운영 결정 (멤버 추가 / 일수 조정 / 슬롯 정리) 의 근거가 명확해짐

### 검증
- tsc PASS (KpiStrip 0 errors)
- lint:harness 새 위반 0건
- 기존 N-18 균형도 드릴다운 동작 유지


## 2026-05-16 (Phase N-19-b) — 자동 생성 알고리즘: 그룹 rotation_enabled 시 워커별 시프트 순환

### 사용자 의도
> "주중 통합 그룹 1개 안에 7-18 / 8-17 / 9-18 시프트 다 넣고, 워커마다 매월(또는 N일) 자동 순환"
> (N-19-a 에서 데이터 + UI 완료, N-19-b 에서 자동 생성 적용)

### 변경 (`app/api/call-scheduler/schedules/[id]/auto-generate/route.ts`)
- Graceful 컬럼/테이블 감지 추가:
  · `hasGroupRotation` — cs_shift_groups.rotation_enabled
  · `hasGroupShifts` — cs_group_shifts 테이블
  · `hasMemberRotation` — cs_group_members.rotation_start_date
- 그룹 rotation 설정 별도 조회 — `groupRotMap<group_id, {enabled, period_kind, period_days}>`
- 그룹 ↔ 시프트 sequence 일괄 조회 — `groupShiftsMap<group_id, GroupShiftRow[]>`
- 멤버 rotation 시작 시점 일괄 조회 — `memberRotMap<group_id+'_'+worker_id, {start_date, start_index, end_date}>`
- 메인 loop 안 휴일 체크 직후 **rotation 분기** 추가:
  - rotation_enabled && shifts.length > 0 이면 새 path
  - 워커별 elapsed_periods 계산 (monthly = 자연 월 차이 / days = days / period_days)
  - `shift_index = (start_index + elapsed) % shifts.length`
  - `targetSlotId = shifts[shift_index].shift_slot_id`
  - 가드 적용: 휴가 풀-오프 / 그룹 회피일 (approved) / 멤버 시작일·종료일
  - plan.push (action='insert', special_code=am_half/pm_half/none)
  - continue (기존 path skip)
- rotation_enabled=false 그룹 → 기존 동작 그대로 유지 (백워드 호환)

### 알고리즘 (의사코드)
```
for each work_date in month:
  for each group g:
    if g.skip_on_holidays && isHoliday: skip
    if g.rotation_enabled && shifts.length > 0:
      for each member m:
        if leave==off || group_skip || isoDate<start_date || isoDate>end_date: skip
        elapsed = monthDiff(m.start_date, isoDate)  // or daysDiff / period_days
        shift_index = (m.start_index + elapsed) % shifts.length
        plan.push(isoDate, shifts[shift_index].slot_id, m.worker_id)
    else:
      기존 path (g.shift_slot_id 단일)
```

### 제한사항 (N-19-c 다음 단계)
- 슬롯 거부 (blocked_slot_ids) 미적용 — rotation 그룹의 시프트는 sequence 가 결정하므로 슬롯 거부와 충돌 시 경고만
- 연속 한도 (max_consecutive_work_days) 미적용 — rotation 은 전체 멤버 매일 출근 가정
- 익일 휴식 (next_day_blocking_hours) 미적용 — 같은 그룹 안에서 큰 시간 차 없으면 안전
- workerLastEnd / counter 갱신 단순화 — 다음 PR 에서 통합

### 효과
- 그룹 13개 → 통합 1개 운영 가능 (사용자 의도)
- 한 그룹 안에 시프트 sequence 정의 + 워커별 시작 시점 → 매월 자동 순환
- 자동 생성 시 워커 A는 1월 L01, 2월 L02, 3월 L03 → 4월 L01 로 자동 cycling

### 검증
- tsc PASS (auto-generate 0 errors)
- lint:harness 새 위반 0건
- 기존 단일 시프트 그룹은 rotation_enabled=0 default 라 영향 없음 (백워드 호환)

### 테스트 시나리오 (사용자 확인 권장)
1. 「주중 통합」 그룹 신규 + 시프트 sequence [L01, L02, L03]
2. 워커 A: start_date=2026-06-01, start_index=0 (6월 L01 시작)
3. 워커 B: start_date=2026-06-01, start_index=1 (6월 L02 시작)
4. 워커 C: start_date=2026-06-01, start_index=2 (6월 L03 시작)
5. 6월 자동 생성 → A=L01, B=L02, C=L03 (매일)
6. 7월 자동 생성 → A=L02, B=L03, C=L01 (1칸씩 이동)
7. 8월 자동 생성 → A=L03, B=L01, C=L02


## 2026-05-16 (Phase N-18 + N-19-a) — 균형도 드릴다운 + 그룹 multi-shift 로테이션

### N-18 — 균형도 KPI 카드 드릴다운
- KpiStrip.tsx — 균형도 카드 클릭 시 펼침 패널
- 과로 워커 list (빨강 +N%) / 부족 워커 list (앰버 -N%)
- 워커 칩 (tone bg) + 시간 + 평균 대비 편차 %
- alertCount > 0 일 때만 클릭 가능 (양호 시 단순 표시)

### N-19-a — 그룹 1개 안 시프트 sequence + 워커별 시작 시점 (마이그 + UI)

#### 사용자 의도
> "주중 통합 그룹 하나에 7-18 / 8-17 / 9-18 시프트 다 넣고, 워커마다 매월(또는 N일) 자동 순환"

#### 마이그레이션 (`migrations/2026-05-16_cs_group_shift_rotation.sql`, 멱등)
- **신설** `cs_group_shifts (id, group_id, shift_slot_id, sort_order)` — 그룹 ↔ 시프트 1:N + 순서 보존
- **ALTER** `cs_shift_groups` + `rotation_enabled` + `rotation_period_kind` ('monthly'|'days') + `rotation_custom_days`
- **ALTER** `cs_group_members` + `rotation_start_date` + `rotation_start_index` + `rotation_end_date`

#### API (graceful 컬럼 감지)
- `GET /shift-groups` — `rotation_enabled / period_kind / custom_days / rotation_shifts list` 응답
- `PATCH /shift-groups/[id]` — rotation 컬럼 + `rotation_shifts` body (DELETE + INSERT 동기화)
- `PUT /shift-groups/[id]/members` — 멤버별 rotation_start_date / index / end_date 추가

#### UI (`GroupEditor.tsx`)
- 「🔄 시프트 로테이션」 토글
- ON 시: 시프트 sequence (↑↓× 순서 조작) + 후보 칩에서 추가 + 주기 (매월 / N일 커스텀)
- 멤버 cfg 펼침에 추가: 시작일 / 시작 시프트 (1번 / 2번 / ...) / 종료일

#### 알고리즘 (auto-generate)
- **변경 없음** — rotation_enabled OFF default 라 기존 단일 shift_slot_id 동작 유지
- N-19-b 에서 알고리즘 변경 + 한 그룹 테스트 후 적용 예정

### 효과
- 그룹 13개 → 통합 1개 (예: 「주중 통합」) 운영 가능 (사용자 의도)
- 메뉴 복잡도 감소 + 워커별 자동 순환 가시화
- 균형도 알람 클릭으로 어떤 워커가 과로 / 부족인지 즉시 확인

### 검증
- tsc PASS (CallScheduler 0 errors)
- lint:harness 새 위반 0건 (ui-token baseline 갱신 — 543 위반 동결)
- 마이그 적용 후 검증 SQL 주석 포함

### 회고
- ⚠ Rule 22 위반 — 처음 commit 시 CHANGELOG 누락 (lock 정리 + cross-module 처리로 정신 팔림)
- 별도 hotfix commit 으로 추가 — 향후 staged 직전 CHANGELOG 체크 의무화 (자가 강화)


## 2026-05-16 (Phase N-17) — 대시보드 운영 풀세트 + KPI 통합

### 사용자 의도
> "이렇게 표출만 되는게 맞나요? 정보들이 별로 도움이 안되는데 대시보드에서"
> "KPI도 같이 넣을 예정이긴한데 직원 근무 분석이나 채용율 그리고 업무강도나 이런것들"
> "우리 시스템이 카페24 연동하고있으니 사고접수량, 긴출 및 기타 접수량, 상담등록량 추가"

### 변경 (제거)
- 운영 셋팅 펼침 카드 4종 (시프트/그룹/워커/quota) + 펼침 영역 통째로 제거
- 단순 카운트 (`opsCounts.slots/groups/workers/quotaWorkers`) 제거 — 대시보드 의미 없음

### 변경 (신설)
- **새 API**: `GET /api/call-scheduler/dashboard?date=YYYY-MM-DD` — 한 번 round-trip 에 9 KPI + 6 영역 묶음
- **새 컴포넌트** `_components/dashboard/` 7종:
  · `KpiStrip.tsx` — 운영 5 + 카페24 5 (2줄)
  · `NowWorkingStrip.tsx` — 현재 시각 active workers (24/365 가시화)
  · `TodayTomorrowGrid.tsx` — 오늘/내일 시프트별 워커
  · `PendingReviewsCard.tsx` — 검토 대기 (skip/leave/swap)
  · `EmptySlotsAlert.tsx` — 이번 주 min_coverage 미달 일자
  · `NextActionCard.tsx` — 월말 다음 달 생성 CTA
  · `UpcomingHolidaysCard.tsx` — 다음 14일 휴일 + 영향 그룹
- **page.tsx 재작성** — 8 영역 순차 표출, fetch 한 번으로 통합

### KPI 묶음 (9개)
**운영 인력 (5)**
- 인당 근무일 평균 + 최대/최소 워커
- 활성 워커 vs 필요 인원 (min_coverage 합)
- 야간 근무 비율 (is_overnight)
- 부하 편차 σ (워커간 근무일수 표준편차 — 균형 깨진 정도)
- 충원율 (filled / total)

**외부 부하 (5 — 카페24 + 자체)**
- 사고접수 (`aceesosh` esosmddt — graceful)
- 긴급출동 (`acrotpth` otptdcyn='Y' — graceful)
- 기타 접수 (`operations_dispatch_orders` created_at)
- 상담등록 (`operations_consultations` created_at)
- 카페24 총합

### 데이터 source
- cs_assignments / cs_workers / cs_shift_slots / cs_shift_groups / cs_group_min_coverage
- cs_holidays / cs_group_member_skip_dates / cs_leaves / cs_swap_requests
- cafe24Db (외부) — aceesosh / acrotpth
- operations_dispatch_orders / operations_consultations (자체)

### Graceful 처리
- 카페24 외부 DB 연결 실패 시 `null` → KPI 타일 "—" + "카페24 연결 안 됨" 라벨
- 모든 SQL try/catch — 마이그 미적용 / collation 이슈 안전
- skip_on_holidays 컬럼 없으면 affected_groups 빈 배열 (N-16 graceful)

### 효과
- 진입 즉시 24/365 운영 상태 파악 (지금 누가 / 오늘/내일 누가 / 빈자리 / 휴일)
- 검토 대기는 클릭으로 /requests 이동
- 월말 자동 생성 시기 자동 안내
- 외부 부하 (카페24 사고/긴급/상담) 실시간 가시화

### 검증
- tsc PASS (CallScheduler 0 errors)
- lint:harness 새 위반 0건
- lint:ui-design CallScheduler 0건


## 2026-05-15 (Phase N-16) — 그룹별 휴일 자동 제외 옵션 (skip_on_holidays)

### 사용자 의도
> "그룹설정에서 주중근무자들이 휴일은 빠져야 되는데 설정이 없는것같아 휴일설정에서 휴일로 들어간것에는 빠지도록 설정추가해줘 그부분은 또 다른근무그룹이 할수있게도 셋팅도 해야겠지?"

### 변경
- **마이그레이션**: `migrations/2026-05-10_cs_shift_groups_skip_on_holidays.sql`
  · `cs_shift_groups.skip_on_holidays TINYINT(1) NOT NULL DEFAULT 0` 추가 (멱등)
- **API GET `/api/call-scheduler/shift-groups`**: `hasSkipOnHolidays` 감지 + 별도 조회로 graceful 응답에 `skip_on_holidays` 포함
- **API POST `/api/call-scheduler/shift-groups`**: body `skip_on_holidays` 수용, INSERT 분기 (hasCategory && hasSkipOnHolidays / hasCategory only / legacy)
- **API PATCH `/api/call-scheduler/shift-groups/[id]`**: `ALLOWED_COLS` 에 `skip_on_holidays` 추가, graceful 컬럼 감지, boolean → 0/1 변환
- **UI `GroupEditor.tsx`**: 그룹 정의 섹션에 「🎌 휴일에는 자동 배정 제외」 체크박스 (설명 아래, 최소인원 위)
  · ON: 주중 근무 그룹 (휴일 자동 배정 제외)
  · OFF: 24/365 운영 그룹 (휴일에도 정상 배정)
- **알고리즘 `auto-generate/route.ts`**:
  · `GroupRow` 에 `skip_on_holidays` 추가
  · 그룹별 skip flag 별도 조회 → targetGroups 에 주입
  · 메인 루프 휴일 분기: `g.skip_on_holidays` 우선, 컬럼 미적용 시 legacy 전역 `skipHolidays` 사용
  · 전역 `skipHolidays` 는 master kill switch (전역 false 면 모든 그룹 휴일 정상 배정)

### 효과
- 주중 근무 그룹 (09:00~18:00 주4): `skip_on_holidays=1` → 자동 생성 시 cs_holidays 일자 후보 제외
- 야간/특수 그룹: `skip_on_holidays=0` → 휴일에도 정상 배정 (24/365 콜센터 유지)

### 검증
- tsc PASS (CallScheduler 모듈 0 errors)
- 마이그레이션 사용자 적용 완료 (skip_on_holidays / tinyint / default 0)


## 2026-05-09 (Phase K-3) — 자동 생성 알고리즘 그룹별 정교화 + AssignmentCell dow 색상 재활성

### 자동 생성 알고리즘
- WorkerConstraint → MemberConstraint + WorkerCycle 분리
- memberCons: Map<`${groupId}_${workerId}`, MemberConstraint> — multi-group 워커가 그룹마다 다른 priority/dow/한도 적용
- workerCycle: Map<workerId, WorkerCycle> — 외부 cycle 은 워커 글로벌 (모든 그룹 공통)
- ranking 시 lookupMember(g.id, wId) — 그룹 컨텍스트 lookup
- 슬롯 거부 / 연속 한도 / max_days_per_month / required_days_per_month / dow prefer/avoid 모두 멤버 단위
- isAvailableOnCycle 시그니처 변경 (cycle 정보만)

### AssignmentCell — dow 색상 layer 재활성
- 새 prop: `memberPreferDow`, `memberAvoidDow` (CSV "0,5") — ScheduleGrid 가 그룹 컨텍스트로 내림
- ScheduleGrid: `memberCfgMap = Map<\`${groupId}_${workerId}\`, { priority_level, dow_prefer, dow_avoid }>` 신설
- shift-groups GET 응답의 멤버 cfg 파싱 → cfgMap 채움
- 셀 호출 시 `slotGroups[slot.id].id + worker_id` 로 lookup → 색상 layer 재활성
- 효과: 같은 워커가 야간 그룹에서 화/목 희망, 주간 그룹에서 월/금 비선호 등 다른 색상 layer 표출

## 2026-05-10 (Phase N-15) — 회피일 통합 운영 (D안 — 메뉴 복잡도 최소)

### 사용자 의도
> "d 가 좋치 않을까요 점점 복잡해질수록 직관적으로 메뉴 복잡도가 적어야합니다"

### 변경 (/CallScheduler/requests 회피일 탭)
- **매니저 직접 등록 패널** 추가 (탭 위쪽):
  · 워커 chip (14명 tone bg + 선택 시 검정 pill)
  · 그룹 chip (워커 선택 시 그 워커가 속한 그룹만 자동 표출)
  · 시작일 / 종료일 / 사유 (선택)
  · [+ 등록] 즉시 `status='approved'`
  · 등록 후 워커/그룹 유지 (연속 입력 편의)
- 워커/그룹 fetch (workers + shift-groups API)
- 검증: 워커/그룹/일자 필수, 시작 ≤ 종료

### 효과
- 매니저가 **한 곳 (/requests 회피일 탭)** 에서:
  1. 직원 신청 검토 (기존)
  2. 직접 등록 (신규 — D안)
  3. 등록된 회피일 list (전체 필터)
- 깊은 메뉴 탐색 X (이전: ⚙ 설정 → 그룹 → 멤버 → 회피일 토글 4 클릭)
- "기본 셋팅" 가능 — 매니저가 미리 워커/그룹별 회피일 입력

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 0건

## 2026-05-10 (Phase N-14) — SubNav 운영/설정 분류 (사용자 의도)

### 사용자 피드백
> "시간부터 휴가랑 공휴일 은 전부 상위탭 설정으로 두고 하위로 빼도 될것같은데?
>  설정탭은 설정안으로 운영중인건 상위로 하면 느낌도 딱 맞네"
> "워커 그룹도 설정이니 넣어주세요"

### 변경
- **SubNav (상위, 운영만)**: 📊 대시보드 / 📋 직원 요청 / ⚙ 설정
  · 운영 중인 영역 (자주 보는 페이지) 만 상위 노출
  · 「⚙ 설정」 클릭 → settings 페이지 (모든 셋팅 통합)
- **settings 페이지 sub-nav (모든 셋팅)**: 🕐 시간 / 🚧 그룹 / 👥 워커 / 🎌 공휴일 / 💼 직원 휴가
  · 5 탭 유지 (그룹/워커도 셋팅이라 안에 포함 — 사용자 추가 의도)
  · 검정 pill 스타일 (정산 관리 §4 일관)

### 결과
- 매니저 직관: 운영 빈도 높은 그룹/워커는 상위, 자주 안 만지는 시간/공휴일/휴가는 설정 안
- 정산 관리와 같은 검정 pill 패턴 일관

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 0건

## 2026-05-10 (Phase N-13) — NeuDataTable 마이그 (CLAUDE.md §10 의무 컴포넌트 3종 완성)

### 변경
- 메인 page.tsx 의 자체 `<table>` 스케줄 list → **NeuDataTable**
- TableColumn<ScheduleListItem>[] 5 컬럼 (년/월 / 상태 / 근무자 / 충원율 / 최근 수정)
- 각 컬럼 sortBy 함수 — NeuDataTable 자체 정렬 (헤더 클릭)
- defaultSort 'year_month' / 'desc'
- onRowClick — 행 클릭 시 /CallScheduler/[id] navigate
- 자체 SortKey/SortDir/sorted/toggle/Th 함수 모두 제거 (NeuDataTable 자체 정렬)
- 빈 상태 emptyIcon "📅" + emptyMessage

### 효과
- CLAUDE.md §10 의무 컴포넌트 3종 완성:
  · ✓ DcStatStrip (N-10)
  · ✓ DcToolbar — settings 페이지 자체 nav 가 toolbar 역할 (이미 적용)
  · ✓ NeuDataTable (N-13)
- /loans (대출 관리) 와 동일 패턴

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 0건

## 2026-05-10 (Phase N-12) — PageTitle 자동 + 자체 헤더 모두 제거 (정산/대출 기준)

### 사용자 명령
> "CLAUDE.md 0-0 + 「🎨 페이지 디자인 표준」 정독.
>  페이지 헤더는 PageTitle 자동 — 자체 헤더 만들지 마세요.
>  기준: /loans (대출) 또는 /finance/settlement.
>  의무: DcStatStrip + DcToolbar + NeuDataTable.
>  검증: npm run lint:ui-design"

### PageTitle 등록 (`app/components/PageTitle.tsx`)
- PATH_TO_GROUP 에 CallScheduler 영역 추가 → group `cx`
- GROUP_LABELS 에 `cx: 'CX팀'` 신규
- PAGE_NAMES 에 6 페이지 등록:
  · /CallScheduler — 근무시간표 분석 & 배포
  · /CallScheduler/new — 새 월 만들기
  · /CallScheduler/settings — 설정
  · /CallScheduler/requests — 직원 요청 검토
  · /CallScheduler/skips — 회피일 검토
  · /CallScheduler/me — 내 시간표

### 자체 헤더 제거 (CLAUDE.md §10 위반 정정)
- **page.tsx**: Breadcrumb / 컬러점 / h1 / description 제거
  · 액션 버튼 (새 월 만들기 / 직원 마스터) → DcStatStrip actions 슬롯으로 이동
- **settings/page.tsx**: ← 링크 / h1 / description 제거
- **requests/page.tsx**: ← 링크 / h1 / description 제거 (필터만 우측 정렬)
- **new/page.tsx**: ← 링크 / h1 / description 제거
- **skips/page.tsx**: ← 링크 / h1 / description 제거 (필터만 우측 정렬)
- **[id]/page.tsx**: ← 링크 / h1 제거 (월 정보 + status pill 만 유지)

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 위반 0건

### 남은 작업 (선택)
- 메인 page.tsx 의 자체 `<table>` (스케줄 list) → NeuDataTable 마이그
- 운영 셋팅 펼침 (자체 SettingsTile div) → DcStatStrip 또는 DcToolbar 변형 사용

## 2026-05-10 (Phase N-11) — SubNav 검정 pill 패턴 (정산 관리 §4 준수)

### 사용자 피드백
> "상단부분이 정산페이지처럼 되어야합니다" + 정산/CallScheduler/factory-search 3 스크린샷 비교

### 문제
- N-9 의 SubNav 는 underline 스타일 (factory-search 와 같은 잘못)
- UI-DESIGN-STANDARD.md §4: **활성 검정 배경 #0f2440 + 흰 글씨**, 비활성 투명 + #64748b
- §6.2 factory-search 의 hr underline 위반 사례 명시

### 변경
- SubNav.tsx 재작성:
  · borderBottom 제거 (단순 padding-only 컨테이너)
  · 활성 탭: `background: #0f2440 + color: #fff + borderRadius: 8` (검정 pill)
  · 비활성 탭: `background: transparent + color: #64748b`
  · padding 8/16 fontSize 13 fontWeight 700 — 정산 관리 §4 동일
- 이모지 + 라벨 같은 string (fontSize 통일)

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 위반 0건

## 2026-05-10 (Phase N-10) — UI 디자인 표준 적용 (정산 관리 기준)

### 사용자 명령
> "CLAUDE.md 0-0 섹션 + 10 섹션 정독. 디자인 기준 = /finance/settlement (정산 관리).
>  표준 문서: _docs/UI-DESIGN-STANDARD.md. DcStatStrip + DcToolbar 의무 사용.
>  검증: npm run lint:ui-design"

### 변경 (UI-DESIGN-STANDARD.md §6.1 위반 정정)
- **메인 page.tsx**:
  · Breadcrumb 추가 ("운영 › 근무시간표 분석")
  · 페이지 제목 fontSize 22 → 20 / fontWeight 800 → 700 / 색 #0f2440
  · 컬러 점 (red/yellow/green) — 정산 관리와 동일
  · 큰 description 제거
  · 자체 KpiTile 4 카드 → **DcStatStrip 5 stat** (활성/공지/근무자/충원율/직원요청)
  · 헤더 액션 버튼 — 정산 관리 인라인 스타일 (5/12, 11/12)
- **[id]/page.tsx, settings/page.tsx, requests/page.tsx, new/page.tsx, skips/page.tsx**:
  · 페이지 제목 fontSize 22 → 20 / fontWeight 800 → 700 / 색 #0f2440
  · 큰 이모지 prefix 제거 (정산 관리 기준은 단순)
- **자체 stat 카드 (KpiTile, SettingsTile)** fontSize 24/22 → 18 (24px+ 위반 제거)

### 검증
- tsc CallScheduler 0 errors
- npm run lint:ui-design — CallScheduler 영역 위반 0건 ✓

### 표준 따라가야 할 다음 영역
- 자체 stat 카드 (KpiTile / SettingsTile) → DcStatStrip 으로 마이그 가능
- 검색바 → DcToolbar 적용 (현재 자체 구현 없음)

## 2026-05-09 (Phase N-9) — SubNav 표준 패턴 정정 (ClientLayout 중첩 제거)

### 사용자 피드백
> "ui 기준 다 어디갔나요? 컴포넌트? 기준 하네스? 다 아웃됌?"

### 문제 (N-8 잘못)
- ClientLayout (메인 사이드바 + 헤더 — `app/components/auth/ClientLayout.tsx`) 위에 자체 사이드바 만들어서 **중첩**
- factory-search 의 SubNav 패턴 (모듈 내 탭 line) 무시
- `lib/menu-registry.ts` SSOT 패턴 무시

### 정정
- `_components/SubNav.tsx` 신설 (factory-search 와 같은 탭 line 패턴)
  · 📊 대시보드 / 📋 직원 요청 / 🕐 시프트 / 🚧 그룹 / 👥 워커 / 🎌 공휴일 / 💼 휴가
  · settings 페이지는 `?tab=...` 매칭으로 활성 탭 표시
- `layout.tsx` 신설 — SubNav 자동 적용 (모든 자식 페이지)
- `page.tsx` 자체 사이드바 layout 제거 → 기존 단순 페이지 (대시보드)
- 기존 ClientLayout 메인 사이드바 그대로 (CallScheduler 메뉴 1개 — menu-registry SSOT)

### 결과
- ERP 표준 layout 회복: 메인 사이드바 (ClientLayout) + 모듈 SubNav (CallScheduler) + 페이지 컨텐트
- 다른 모듈 (factory-search 등) 과 동일 패턴

## 2026-05-09 (Phase N-8) — 사이드바 layout 통합 (매니저 통합 콘솔) [revert by N-9]

### 사용자 피드백
> "하위 편집도 기존 설정 페이지, 운영요약 전체설정 눌러도 기존페이지 이상하지않아요?
>  뭔가 페이지랑 구조가 정상적이지않을것같은데 전체 플로우를 점검해야하나"
> "B (사이드바 + 컨텐트) 가 쓰기엔 편하겠지?"

### 변경
- /CallScheduler 메인을 **사이드바 + 컨텐트 layout** 으로 재구성
- **좌측 사이드바** (220px sticky):
  · 📊 대시보드 / 📅 스케줄 / 📋 직원 요청 (⏳ 대기 카운트 배지)
  · ⚙ 운영 셋팅: 🕐 시프트 / 🚧 그룹 / 👥 워커 / 🎌 공휴일 / 💼 휴가 quota
  · 카운트 배지 (시프트/그룹/워커 N개)
  · 외부 link: 직원 마스터
- **우측 컨텐트** view 분기:
  · dashboard: 4 stat 카드 + 운영 셋팅 펼침 카드 + 최근 스케줄 5개
  · schedules: 전체 스케줄 list
  · requests: /CallScheduler/requests 페이지 link
  · shifts/groups/workers/holidays/leaves: settings tab 컴포넌트 임포트 (인플레이스 표출)
- **URL ?view=...** deep-link 동기화
- 기존 /CallScheduler/settings, /requests 페이지는 그대로 유지 (호환)

### 효과
- 매니저 1 페이지에서 모든 운영 영역 즉시 접근 (좌측 nav 1 클릭)
- "하위 편집이 같은 탭" 문제 해결 — 운영 셋팅이 메인 안에서 직접 표출/편집
- ERP 표준 layout — 데스크톱 운영팀에 익숙

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase N-7) — 메인 운영 셋팅 카드 인라인 펼침

### 사용자 피드백
> "뭘눌러도 상세는 같은탭인데 좀더 노력할순없었어?"

### 변경
- 운영 셋팅 카드 클릭 → 같은 탭 이동 X → **메인에서 인라인 펼침**
- 카드 ▶/▼ 토글 + 활성 시 boxShadow + translateY
- 펼침 영역 4종:
  · 🕐 시프트: 코드 + 시간 chip 그리드 (overnight 보라)
  · 🚧 그룹: 카테고리별 묶음 (야간 보라 / 주간 파랑 / 저녁 호박 / 특수 빨강) + 멤버 카운트
  · 👥 워커: tone bg chip + 🔒(외부) / 🏢(외부 cycle) 마크
  · 💼 휴가 quota: 잔여 부족 (< 3일) 워커 list — 0일은 빨강 보더, 1~2일 호박 보더
- 각 펼침 영역 [편집 →] 또는 [관리 →] 링크 — 깊은 편집은 settings 탭

### 효과
- 매니저가 메인에서 즉시 운영 디테일 파악 (시프트 9개 분포 / 그룹 13개 카테고리 / 워커 16명 chip / 잔여 부족 워커)
- 깊은 편집 필요 시만 settings 탭 진입

## 2026-05-09 (Phase N-6) — 메인 페이지 운영 셋팅 요약 카드

### 사용자 피드백
> "결국에 메인에 근무시간표 리스트 밖에없는데 설정에 저많은것들을 따로 들어가서 봐야하나?"

### 변경
- 메인 페이지에 「⚙️ 운영 셋팅 요약」 영역 신설 (스케줄 list 위)
- 4 카드 grid:
  · 🕐 시프트 N개 (시간대 정의) → /settings?tab=shifts
  · 🚧 그룹 N개 (시프트 + 멤버 + 패턴) → /settings?tab=groups
  · 👥 콜센터 워커 N명 → /settings?tab=workers
  · 💼 휴가 quota 셋팅 N/M 명 → /settings?tab=leaves
- 카드 hover translateY(-2px) + boxShadow
- 휴가 quota 셋팅 < 워커 수면 빨강 (위급 알림)
- 「전체 설정 →」 link 우측

### 운영 효과
- 매니저 메인에서 운영 상태 한눈에 (스케줄 list + 셋팅 요약)
- 설정 들어갈 필요 없이 카드 클릭 1번으로 해당 탭 직접 진입

## 2026-05-09 (Phase N-5) — GroupEditor 레이아웃 정리 (2분할 → 수직 1컬럼)

### 사용자 피드백
> "그룹편집 ui가 정리가 잘안된것같은데 / 큰 의미 없이 2분할된것같기도 하고"

### 변경
- 좌우 2분할 (`gridTemplateColumns: '1fr 1fr'`) → **수직 1컬럼** (`flexDirection: column`)
  · 위 카드: 그룹 정의 (이름/카테고리/색상/시프트/패턴/전략 — 가로 폭 활용)
  · 아래 카드: 멤버 + 후보 (가로 폭 넉넉)
- **최소 인원 collapsible** — 자주 안 만지는 셋팅 default 접힘
  · 토글 버튼: ⚖️ 최소 인원 [셋팅됨/미설정] [▶/▼]
  · 펼치면 매일 디폴트 + 요일별 grid
- padding 16 → 18 (시원시원 일관)
- 카드 gap 12 → 14

### L-1 효과
- 그룹 1개 편집 시 화면 좌우 빈 공간 X
- 멤버 영역이 가로 폭 활용해서 더 넓어짐 — 펼침 카드가 답답하지 않음
- 최소 인원은 필요 시만 펼침 (운영 빈도 적음)

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase N-4) — /requests 거절 사유 입력 모달

### 변경
- [✗ 거절] 즉시 거절 X → 모달 띄우고 사유 입력
- 거절 사유 textarea (4줄, placeholder 가이드)
- "거절 확정" 시 PATCH body 에 reason / resolution_note 포함
- skip / leave / swap 모두 동일 UX
- 사유는 직원 측 (MyScheduleView 또는 신청 list) 에 전달되어 거절 이유 명확

## 2026-05-09 (Phase N-3) — 직원별 휴가 잔여 시각화

### LeavesTab 신규 패널
- 「💼 {year}년 직원별 휴가 잔여」 — 카드 grid (auto-fill 280px)
- 각 카드: 워커 이름 + 휴가 종류별:
  · 라벨 (연차/패밀리데이/병가/...)
  · 잔여 N일 / 발급량 N (잔여 < 1 시 빨간 ⚠)
  · 사용량 막대 (≥90% 빨강 / ≥70% 노랑 / 그 외 파랑)
- quota 0 + 사용 0 인 종류는 숨김
- 잔여 적은 순 정렬 (위급한 워커 먼저)

## 2026-05-09 (Phase N-2) — MyScheduleView 디자인 시원시원

### 변경
- 헤더 액션 버튼 (휴가 신청 / 회피 신청 / 캘린더 다운로드) BTN.sm → BTN.md
- 보더 1px → 1.5px / fontWeight 700 → 800
- viewMode 토글 (월간/주간/오늘) padding 5/12 → 10/20, fontSize 12 → 14, fontWeight 700 → 800
- 활성 토글에 보더 2px + boxShadow

## 2026-05-09 (Phase N-1) — 자동 생성 미리보기 시각화 강화

### 변경
- AutoGenerateDialog 에 workers / slots prop 추가 (이름 lookup)
- shift-groups 별도 fetch — 그룹 이름 lookup
- warnings 안 worker_id slice → **워커 이름 (color tone bg)**
  · 🌙 익일 휴식 위반 시 "정동민" 등 명시
  · ⏱ 시간 겹침 시 슬롯 코드 (L05 × L13) 명시
- by_group chip → **그룹 이름 row + 생성수 + skip**
  (📊 야간콜 + 24, 🚧 주간 09-18 + 18 등)
- **🆕 워커별 예상 근무 분포 (균형 막대)** — plan 기반 워커별 카운트 합산
  · 워커 이름 + 색 + 막대 + 카운트
  · 전체 max 기준 비례
  · 균형 검토 즉시 가능

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase M-2) — 멤버 cfg 펼침 카드 시원시원 + 메인 헤더 ⏳ 카운트 배지

### 사용자 피드백
> "여기부분 ui 좀 제대로 표출했음 좋겠습니다. 숨지말고 시원시원하게 셋팅하자고요"

### MemberCfgPanel 큼직하게
- 들여쓰기: marginLeft 24 → 12 (시원하게 보여줌)
- padding: 10 → 18, gap: 10 → 18
- 보더 1px → 2px + 박스 그림자 추가
- 배경 0.92 → 0.96 (선명)
- 라벨: fontSize 10 → 13 fontWeight 700 → 800 + 부설명 inline
- P1/P2/P3 버튼: padding 5px → 14px, fontSize 11 → 14
- 요일 버튼: padding 4px → 10px, fontSize 10 → 13, borderRadius 4 → 8
- 입력 필드: padding 5/8 → 10/14, fontSize 11 → 14
- 슬롯 거부 chip: padding 3/8 → 8/14, fontSize 10 → 13, 활성 시 🚫 prefix
- gridGap 10 → 16

### 회피일 펼침 카드도 통일
- marginLeft 24 → 12, padding 8 → 16
- 보더 1 → 2 (호박색)
- 입력 필드 큼직 (padding 4/8 → 8/12, fontSize 11 → 13)
- + 추가 버튼 padding 4/10 → 8/18

### 메인 페이지 ⏳ 카운트 배지 (M-2 추가)
- /CallScheduler 페이지 mount 시 회피+휴가+교체 대기 카운트 fetch
- 「📋 직원 요청」 버튼:
  · 대기 0건 — 기본 디자인
  · 대기 N건 — 호박 배경 + ⏳ N 빨간 배지 (눈에 띄게)
- 매니저 한눈에 처리할 일 파악

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase M-1) — 매니저 직원 요청 통합 검토 페이지

### 사용자 의도
> 매니저 검토 동선 단순화 — 회피/휴가/교체 3 군데 흩어진 검토를 1 페이지로

### 신규 페이지: `/CallScheduler/requests`
- 3 탭: 🛌 회피일 / 🙋 휴가 / 🔄 시프트 교체
- 각 탭 ⏳ 대기 카운트 배지
- 상태 필터: 대기 / 승인됨 / 전체
- 일괄 검토 [✓ 승인] [✗ 거절] 버튼
- 회피는 그룹별 묶음 (기존 /skips 로직 재사용)

### 메인 페이지 링크
- `/CallScheduler` 헤더에 「📋 직원 요청」 버튼 추가 (⚙️ 설정 옆)

### 기존 화면 호환성
- `/CallScheduler/skips` (회피만) — 그대로 유지 (deep-link 호환)
- `EmployeeRequestsPanel` (모달) — 그대로 유지 ([⋯] 메뉴 안)
- 새 페이지는 통합 동선 추가 옵션

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase L-2) — 「내것만」 토글 + MyScheduleView 뷰 모드

### 사용자 요청
> "뷰도 일별로 보기 / 주간보기 / 내것만보기 등 지원"

### ScheduleGrid (매니저 매트릭스)
- Props 신규: `myWorkerId?: string` — 본인 워커 ID (없으면 토글 비활성)
- 「🙋 내것만」 토글 버튼 (외부/회피 토글 옆)
- ON 시 본인 워커 없는 셀 opacity 0.25 — 내 일정만 시각 강조
- 매트릭스 구조 (그룹/슬롯) 그대로 유지

### [id]/page.tsx
- /api/call-scheduler/me 호출하여 본인 worker_id fetch
- ScheduleGrid 에 myWorkerId prop 전달

### MyScheduleView (직원 본인)
- 뷰 모드 토글 (월간 / 주간 / 오늘)
- CalendarView prop 신규: `viewMode?: 'month' | 'week' | 'day'`
- month: 기존 그대로 (월 카드 그리드 + firstDow 빈칸)
- week: 오늘 포함 주 (일~토 7일) — 1행 grid
- day: 오늘 단일 일자 (또는 첫 일자) — 1 카드

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase L-1) — WeekView 신규 + 매니저 매트릭스 viewMode (월/주/일)

### 사용자 요청
> "뷰도 일별로 보기 / 주간보기 / 내것만보기 등 지원"

### WeekView 신규 컴포넌트
- 1주 7일 × 슬롯 매트릭스 (좁은 화면 가독성)
- ◀ 이전 주 / 이번 달 첫 주 / 다음 주 ▶ 이동
- 셀 폭 70px (월간 매트릭스보다 넓게 — 가독성)
- 슬롯 좌측 그룹 헤더 + 24h 시간 막대 + 6h 눈금 (ScheduleGrid 와 동일)
- 멤버 dow 색상 layer 재활성 (memberCfgMap)
- 월 경계 넘는 날짜는 흐릿하게 + 월 표시 (예: "5/3")
- 주간 뷰는 read-only — 편집은 매트릭스 모드 안내

### 매니저 [id]/page.tsx
- ViewMode 'week' 추가 — 토글 버튼 「📆 주간」
- 기존 「📋 매트릭스」 / 「📅 날짜별」 사이에 위치

### 검증
- tsc CallScheduler 0 errors

### L-2 (다음) 예정
- ScheduleGrid 에 「내것만 보기」 토글 (본인 워커 ID 매칭만 강조)
- MyScheduleView 에 viewMode (월/주/일 토글)

## 2026-05-09 (Phase K-2) — GroupEditor 멤버 카드 인라인 설정

### 사용자 의도
> "그룹에 인원 추가하면서 그 자리에서 셋팅"

### GroupEditor 변경
- 멤버 행 헤더 요약 칩: P1 / 🌟희망N / 🚫비선호N / 🛡연속한도 / 🚷슬롯거부
- ⚙ 펼침 토글 → MemberCfgPanel:
  - 🏷 우선순위 (P1/P2/P3)
  - 🌟 희망 / 🚫 비선호 요일 (toggle, 상호 배타)
  - 📈 월 필수 / 🛑 월 최대 / 🛡 연속 한도 (숫자, 빈칸=무제한)
  - 🚷 슬롯 거부 (모든 슬롯 chip toggle)
  - 📝 패턴 메모
- 새 멤버 추가 시 자동 펼침 (즉시 cfg 입력)
- 저장 시 PUT body — 새 형식 `members: [{worker_id, priority_level, ...}]`
- 신규 그룹: POST 후 cfg 별도 PUT (POST 가 priority 만 받음)

### 사고 회고 (코워크 멀티세션)
- 1차 작성 후 lock 충돌 → working tree 변경분 손실 → 재작성
- 향후: lock 발생 시 staging 결과 즉시 git diff > backup.patch 권장

## 2026-05-09 (Phase K-1) — 그룹 중심 설정 재구성 (DB + API + Worker UI 슬림)

### 사용자 의도
> "셋팅이 여기저기 가는게 불편 — 그룹에 인원 추가하면서 그 자리에서 셋팅"
> 워커 페이지는 그 결과/설정을 보여주는 쪽 (편집 X)

### 데이터 모델 변경
- cs_group_members 에 멤버별 8 컬럼 추가 (priority_level / preferred_dow_prefer/avoid /
  max_consecutive_work_days / required_days_per_month / max_days_per_month /
  blocked_slot_ids / work_pattern_text)
- cs_workers 의 위 8 컬럼 → 그룹멤버로 데이터 복사 후 cs_workers 에서 삭제
- cs_workers 는 정체성만: name/color_tone/group_label/is_external/external_pattern/
  cycle_days_on/off/cycle_start_date

### 마이그레이션
- migrations/2026-05-09_cs_phase_K_group_member_settings.sql (멱등 + 검증 SELECT)

### API 변경
- workers/route.ts: SELECT/INSERT 옮긴 컬럼 모두 제거, 정체성만
- workers/[id]/route.ts: PATCH ALLOWED 정체성 컬럼만 (color/group/is_external/external_pattern/cycle_*)
- shift-groups/route.ts: 멤버 응답에 8 멤버 설정 컬럼 추가 (graceful)
- shift-groups/[id]/members/route.ts: PUT body 확장 — `members: [{worker_id, priority_level, ...}]`
  (옛 `worker_ids` 호환)

### 자동 생성 알고리즘
- cs_workers SELECT 옮긴 컬럼 제거, 정체성 (cycle_*) 만
- cs_group_members JOIN 으로 워커별 첫 그룹 멤버 설정 fallback
  (그룹별 정교화는 K-2 별도)

### UI
- WorkersTab: 정체성만 (색상/그룹라벨/외부/외부cycle), 옮긴 필드 입력 모두 제거
- 안내 배너: "우선순위/요일/한도/슬롯거부/패턴은 「그룹」 탭의 멤버 카드에서"
- AssignmentCell: 워커 dow 색상 layer 임시 비활성 (그룹 컨텍스트 필요)

### K-2 (다음 commit) 예정
- GroupEditor 의 멤버 카드 인라인 설정 입력 (priority_level / dow_prefer/avoid / 한도 / 슬롯거부 / 패턴)
- 자동 생성 알고리즘 그룹별 정교화 (multi-group 워커가 각 그룹에서 다른 설정 적용)

### 검증
- tsc --noEmit CallScheduler 영역 0 errors
- 마이그레이션 검증 ① 8 컬럼 추가 PASS (사용자 확인)

## 2026-05-09 (Phase J-2C) — 외부/회피 행 매니저 전용 토글 (기본 숨김)

### 사용자 피드백
> "외부나 회피나 저런건 대놓고 표출하는건 별로야 다른직원들 눈도 있는데"

### 문제
- 정동민 외부 cycle 회색 막대 + 박혜정/김현정 등 회피 신청 🛌 행이 매트릭스에 그대로 표출
- 직원 시야에 노출 — 누가 외부 근무, 누가 회피 신청했는지 다른 직원이 알 수 있는 사생활 노출

### 해결
- ScheduleGrid 에 `showPrivate` state (기본 false)
- 툴바 토글 버튼: 🙈 외부/회피 숨김 ↔ 👁 외부/회피 표시 (기본 OFF)
- 매니저가 계획 시점에만 켜고 보는 용도
- 영향 영역:
  - thead 외부 cycle 행 (그룹 미배정 워커) — `showPrivate &&` 로 게이팅
  - thead 회피 행 — 동일 게이팅
  - tbody 그룹 섹션 안 외부/회피 행 — `sectionExt`/`sectionSkip` 둘 다 OFF 면 빈 배열
- 셀 자체 (AssignmentCell) 의 가드 위반 색상 등은 그대로 — 셀 안에서는 가독성 유지
- 향후: 직원 본인 화면 (CallScheduler/me) 에서는 본인 회피만 보이도록

### 검증
- tsc --noEmit CallScheduler 영역 0 errors
- lint:harness 새 위반 0건

## 2026-05-08 (Phase J-2B) — 매트릭스 화면 너비 축소 + 24h 시간 막대 가시화

### 사용자 피드백
> "화면도 뭔가 너무넓고 시간대 구성은 추가 안된것같고 24시간 구성으로"

### ScheduleGrid 변경
- 슬롯 좌측 td 너비: minWidth 200 / maxWidth 220 → **148 / 168**
- 일자 셀 너비: minWidth 56 → **48** (header / assignment td / group cycle/skip td 일치)
- 슬롯 좌측 시간 막대:
  - 항상 24h 스케일 (overnight 도 1440 분 기준)
  - overnight 슬롯 → **2 segment 분리 wrap** ([start→24:00] + [00:00→end], 두 번째 segment 65% opacity + 흰 dash 보더)
  - 막대 높이 6 → **12 px** (시각 가시성 강화)
  - **6시간 눈금** (0/6/12/18/24) — 12 시 라인 진하게 (0.18) + 나머지 (0.08)
  - **시간 라벨 행** (0 6 12 18 24) — monospace 7px
- 슬롯 코드/시간 한 줄로 압축 (그룹 chip 은 tbody 그룹 헤더 row 가 표출하므로 좌측 셀에서 제거 — Phase J-3 효과)

### 운영 효과
- 매트릭스 31 일 + 슬롯 행 합쳐도 화면 폭 ~25% 축소 (cell 56→48 + 좌측 200→148)
- 슬롯 시간대가 24h 막대로 직관 표출 → "L13 야간이 어디부터 어디까지 + 익일 wrap" 한눈에 파악
- 좌측 좁아져도 코드 + 시간 + 24h 막대 + 시간 라벨 모두 보임

### 검증
- tsc --noEmit PASS (CallScheduler 영역 0 errors)
- lint:harness 새 위반 0건

## 2026-05-08 (Phase J-3) — 그룹별 섹션 묶음 (매트릭스 시각 분리)

### Phase J-3 — 슬롯/cycle/회피를 그룹 영역에 통합 (사용자 5/8 의도)
- 사용자 의도: "회피나 근무 블럭은 정동민처럼 해당 근무그룹쪽에 표출"
- ScheduleGrid 변경:
  - thead 의 외부 cycle 행 / 회피일 행 = **그룹 미배정 워커만** 유지 (그룹 멤버는 tbody 그룹 섹션으로 이동)
  - tbody 의 슬롯 행 → React.Fragment 로 그룹별 섹션 구성:
    - 🚧 **그룹 헤더 row** (카테고리 색 + 멤버 카운트)
    - 🏢 그룹 멤버 외부 cycle 행 (들여쓰기)
    - 🛌 그룹 멤버 회피일 행 (들여쓰기)
    - L?? 슬롯 행 (기존)
  - 그룹 변경 시점에 헤더 + 그룹별 cycle/회피 자동 삽입
- 카테고리 색:
  - 야간 → 보라 / 저녁 → 호박 / 주간 → 파랑 / 특수 → 빨강
  - 헤더 보더 3px stripe
- 운영 효과:
  - 매니저 한눈에 "이 그룹은 누가 야간 / 누가 회피 / 어느 슬롯" 파악
  - 야간콜 그룹 영역 안에 정동민 외부 cycle + 회피 + L13 슬롯 행 모두 모임
  - 주간 09-18 영역엔 주간 워커 회피만

### 검증
- tsc --noEmit PASS
- lint:harness 새 위반 0건

## 2026-05-08 (Phase J-2A) — DayView 24h Timeline Gantt

### Phase J-2A — 일별 24시간 시간 매트릭스 (사용자 5/8 의도)
- 사용자 의도: "달력/시간 기준 → 그 안에 그룹/워커 표출"
- DayView 의 일자 디테일 패널 위에 **24h Timeline Gantt 추가**
  - X축: 0~24시 (overnight 포함 시 48h 스케일 자동)
  - Y축: 슬롯 (시작 시각 정렬)
  - 슬롯 막대: 시간 범위만큼 가로 폭, 색상 (주간 파랑 / 야간 보라)
  - 막대 안: 워커 chip 4명까지 + "외 N명"
  - 시간 헤더: 0/2/4/6...24 (overnight 시 0/2/4...48)
  - 12h / 24h 마커 (회색 세로선)
- hover 툴팁: "L13 20:30~08:30 — 정동민, 전정연, 윤민진"
- overnight 슬롯 자동 처리 — 48h 스케일 + 24h 마커 (날 경계 표시)

### 운영 효과
- 매니저가 일자 카드 펼치면 **시간대 분포 한눈에**:
  - "8시에 누가 일하나" → 막대 보면 즉시
  - "야간 인계 시간" → L12 19~23 + L13 20:30~08:30 겹침 시각
  - "9-18시 동시 일하는 사람" → 막대들 겹침 영역
- 기존 슬롯 list 도 유지 (디테일)

## 2026-05-08 (Phase J) — 시간대 + 그룹 같이 표출

### Phase J — 슬롯 좌측 컬럼 보강 (사용자 5/8 요청)
- 사용자 의도: "매트릭스에 실제 시간대 + 그룹 같이 표출"
- ScheduleGrid 변경:
  · `slotGroups` state — `/api/call-scheduler/shift-groups` fetch (slotId → group 매핑)
  · 슬롯 좌측 sticky 컬럼 폭 100→200px / minWidth 200, maxWidth 220
  · 카테고리별 색 stripe (좌측 3px border)
    - 야간 → violet / 저녁 → amber / 주간 → blue / 특수 → red / 일반 → gray
- 표출 구조 (각 슬롯 행):
  ```
  [stripe] L13 20:30~08:30 익  [야간콜]
            ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ (24h 시간 막대)
                    12h            24h
  ```
- 24h 시간 막대 (mini SVG-like div):
  · overnight 슬롯 → 48h 스케일
  · 슬롯 시작/종료 시각을 막대 left/width 로 시각화
  · 12h / 24h 마커 (회색 세로선)
- 그룹 chip:
  · 슬롯 라벨 옆 작은 pill (max-width 80, ellipsis)
  · 카테고리별 색
  · hover 툴팁: "그룹: {name} ({category})"

### 운영 효과
- 매니저가 매트릭스 첫 컬럼 보면 즉시 파악:
  · 슬롯 코드 (L13) + 시간 (20:30~08:30) + 익일 표시
  · 어느 그룹 (야간콜 / 주간 09-18 / 등)
  · 24h 시간대 막대 — 야간 vs 주간 시각 구분 (보라 vs 파랑)
- 사용자 원칙 충족: "시간대 + 그룹 같이 표출"

## 2026-05-08 (Phase E + F) — 가드 위반 시각화 + 빈 셀 사유

### Phase E — 가드 위반 시각화 (clientside)
- ScheduleGrid 에 `violationMap` 신설 — 워커별 일자별 위반 검사
  - **시간 겹침** (time_conflict): 같은 워커 같은 날 두 슬롯 시간 범위 비교
  - **익일 휴식** (next_day_block): overnight 종료 + slot.next_day_blocking_hours > 다음날 슬롯 시작
  - **연속 한도** (consec_limit): 워커별 연속 근무일 streak vs slot.max_consecutive_days
- AssignmentCell 신규 prop `violations: Set<...>`
- 시각 표시:
  - 🔴 시간 겹침 → 강한 빨강 보더 + ⏱ 아이콘
  - 🔴 익일 휴식 위반 → 빨강 보더 + 🌙 아이콘
  - 🟡 연속 한도 → 노랑 보더 + 📅 아이콘
- 우선순위: violation 보더 > Phase D 색상 layer

### Phase F — 빈 셀 사유 분석 (Phase 1)
- AssignmentCell 신규 prop `emptyReason: string`
- ScheduleGrid 에서 일자별 회피 신청자 (skipDates) 매핑
- 빈 셀 hover 툴팁: "비어있음 — 회피: 정동민, 윤민진⏳"
  - ⏳ 마크: 신청 대기 중

### 통합 hover 툴팁 형식
```
"{워커명} · {special} [✓ 희망 요일] [⏱ 시간 겹침]"
"비어있음 — 회피: 정동민, 윤민진⏳"
```

## 2026-05-08 (Phase G + H) — 직원 회피 신청 + 매니저 검토 통합

### Phase G — 직원 본인 회피일 신청
- 신설: `components/SkipRequestDialog.tsx`
  · 그룹 선택 (활성 그룹 chip) + 일자 범위 + 사유
  · POST /api/call-scheduler/shift-groups/[id]/skip-dates
  · status='requested' 명시 → 매니저 검토 대기
- MyScheduleView 헤더에 "🛌 회피 신청" 버튼 추가
  · 휴가 신청 (🙋) 옆에 나란히
  · 토큰 페이지 (/e/[token]) 도 같은 컴포넌트 사용 — 본인 토큰으로 동작

### Phase H — 매니저 검토 통합 페이지
- 신설: `/CallScheduler/skips` 페이지
- 기능:
  · 미래 90일 범위의 모든 그룹 회피일 일괄 표시
  · 필터: ⏳ 대기 / ✓ 승인됨 / 전체
  · 그룹별 묶음 표시 (Glass L4 카드)
  · 각 row: status pill + 워커명 + 일자 + 사유
  · 대기 신청에 [✓ 승인] / [✗ 거절] 버튼
- API: 기존 `GET /skip-dates` + `PATCH /skip-dates/[id]` 활용

### 운영 흐름 완성
```
직원 마이페이지 [🛌 회피 신청] → status='requested'
   ↓
매니저 /CallScheduler/skips 페이지 — 일괄 검토
   ↓
[✓ 승인] → status='approved'
   ↓
자동 생성 알고리즘이 후보 제외 (group_skip warning 발생)
   ↓
매트릭스 워커별 회피일 행에 🛌 표시 (h-4)
```

## 2026-05-08 (Phase B + C 일부 + D) — UI 가이드 + 매트릭스 직관화 + 색상 layer

### Phase B — UI 디자인 가이드 신설
- `_docs/UI-GUIDE.md` 작성
  · 버튼 크기 정책 (작은 버튼 지양 — 22×22 미만 mini 버튼 금지)
  · Glass L1~L5 깊이 정의
  · 매트릭스 셀 크기 (32px) + 14색 토큰
  · Phase D 색상 layer 정의

### Phase C 일부 — 매트릭스 셀 크기 확대
- AssignmentCell 높이 24 → **32px**
- AssignmentCell 폰트 11 → **12px**
- AssignmentCell 보더 radius 4 → 6
- ScheduleGrid 셀 td minWidth 44 → **56px**
- ScheduleGrid 헤더 th minWidth 44 → 56
- 사용자 원칙 충족: "쪼그만 버튼 지양, 시간대×워커 직관적"

### Phase D — 워커 조건 색상 layer (요일 매치)
- AssignmentCell 신규 prop `dow?: number` (0~6)
- `matchDow(csv, dow)` 헬퍼 — preferred_dow_avoid/prefer 매치 검사
- 매치 시 보더 강화:
  · 희망 요일 → 옅은 녹색 (rgba(34,197,94,0.55))
  · 비선호 요일 → 옅은 빨강 (rgba(239,68,68,0.55))
- 툴팁에 "[✓ 희망 요일]" / "[⚠ 비선호 요일]" 추가
- ScheduleGrid 가 `dowIndex(d)` 계산해서 prop 전달

## 2026-05-08 (Phase I) — 그룹별 우선순위 정책 표출

### PR-2SS-Phase-I — 매니저 판단 도구 (GroupEditor 정책 박스)
- 사용자 시나리오:
  > "야간 1번 직원이 근무가능일 지정 → 10일만 근무 → 빠질 날짜 지정 →
  >  다른 워커가 그 날짜 들어갈 때, 그 그룹의 우선순위 설정이 표출되어야"
  > "근무 안한지 오래된 순 / 근무시간 짧은 순 / 빼달라는 날짜 (제외) / 연차 포함"
- 변경 (GroupEditor 좌측 폼 끝에 신규 박스):
  - 🎯 우선순위 정책 — Glass L1 + 파랑 보더
  - ✓ 채울 워커 결정 7단계 (priority → prefer → avoid → required 미달 → by_dow → total → last_date)
  - ✗ 후보 제외 규칙 6개 (회피일 / 연차 / cycle / 슬롯거부 / 연속 / 익일)
  - 💡 정책 변경 위치 안내 (직원 탭 / 시간 탭 / 멤버 패널 / 휴가 탭)
- 운영 효과:
  - 매니저가 그룹 편집 시 한눈에 "이 그룹은 어떻게 채워지나" 파악
  - 사용자 의도 (5/8) "어떻게 설정해서 어떻게 활용하겠다는 매니저 판단이 서겠죠" 충족
  - 정책 변경하려면 어디 가야 하는지 즉시 안내

### 마스터플랜 신설 (`_docs/SESSION-MASTER-PLAN.md`)
- PR-2SS 시리즈 전체 회고 (a/b/c/d/e/g/h-1/h-1-fix/h-4 + Z2/Z3)
- 현재 시스템 상태 (DB / 알고리즘 ranking / UI 페이지 맵)
- 미완료 Phase B~I 정리 + 진행 순서

## 2026-05-08 — PR-2SS-h-4 (매트릭스 회피일 시각 표출)

### PR-2SS-h-4 — 매트릭스에 회피일 워커별 행 추가
- 사용자 원칙: 매트릭스 = '왜' 답하는 곳 / 설정 = 단일 입력 위치
  → 회피일 입력해도 매트릭스에 안 보이는 답답함 해소
- API 신설: `GET /api/call-scheduler/skip-dates?from=&to=&status=`
  - 모든 그룹 통합 조회 (status=approved,requested 디폴트)
  - graceful fallback (테이블 미적용 시 빈 배열)
- ScheduleGrid 변경:
  - 월간 회피일 fetch (schedule.year/month + status filter)
  - skipMap 매핑: `(worker_id, isoDate) → { status, reason, group_name }`
  - 외부 cycle 행 패턴 따라 **회피일 워커별 행** 추가 (요약 layer)
    · 🛌 (승인) — 노랑 배경
    · ⏳ (신청 대기) — 빨강 배경
    · hover 툴팁: "{워커} 회피 [그룹명] — 사유 — 일자"
- 매트릭스 시각 효과:
  - 외부 cycle 행 + 회피일 행이 일자별 헤더 아래 표출
  - 매니저가 한눈에 "왜 5/15 야간 비었지" 답 — 정동민 회피 행에 🛌 보임
- 다음 Phase (h-5/6/7):
  - h-5: 비선호/희망 요일 셀 색상 + cycle 회색 줄
  - h-6: 가드 위반 시각화 (익일 휴식 / 연속 한도 / 시간 겹침)
  - h-7: 빈 셀 hover 사유 분석

## 2026-05-06 (저녁 후) — PR-2SS-h-1-fix (회피일 모달 → 인라인 펼침)

### PR-2SS-h-1-fix — UX 개선 (사용자 피드백)
- 사용자 피드백: "쓰기 좀 불편" + "바로 표출 (모달 말고)"
- 변경:
  - 🛌 chip 클릭 → **모달** 대신 **그 자리에서 펼침** (accordion)
  - 한 명씩 펼친 상태로 다른 멤버 보면서 작업 가능
  - 빠른 입력 한 줄: 시작일 / `~` / 종료일 / 사유 / [+ 추가]
  - 시작일 입력 시 종료일 자동 동일 (단일 일자 빠른 입력)
- UI:
  - `expandedSkipWorkerId` state — 한 명씩 펼침
  - chip 라벨에 ▶ / ▼ 표시 (펼침 상태)
  - 펼친 영역: 기존 회피일 목록 (status pill + 승인/거절/삭제) + 빠른 입력 한 줄
  - 모달 (GroupSkipDatesModal) 컴포넌트 사용처 제거 (파일은 orphan 으로 남겨둠)

## 2026-05-06 (저녁) — PR-2SS-h-1 (그룹 회피일 — 매니저 측)

### PR-2SS-h-1 — 그룹 차원 회피일 (Group Member Skip Date)
- 사용자 시나리오: "정동민이 야간 그룹에서 5/15 빠지고 싶음" → ranking 으로 다른 멤버 자동 채움
- cs_leaves 와 별개 — 그룹 한정, 정식 휴가 X, 단순 회피
- DB 마이그레이션: `2026-05-06_cs_group_member_skip_dates.sql`
  - 신규 테이블 `cs_group_member_skip_dates` (id / group_id / worker_id / start_date / end_date / reason / status / requested_by/at / approved_by/at)
  - status: requested / approved / rejected / canceled
  - INDEX (worker_id, start_date, end_date), (group_id, status, start_date)
  - FK group/worker ON DELETE CASCADE
- API:
  - `GET    /api/call-scheduler/shift-groups/[id]/skip-dates?status=&from=&to=`
  - `POST   /api/call-scheduler/shift-groups/[id]/skip-dates` (매니저 직접 = 즉시 'approved')
  - `PATCH  /api/call-scheduler/shift-groups/[id]/skip-dates/[skipId]` (status / reason / start/end)
  - `DELETE /api/call-scheduler/shift-groups/[id]/skip-dates/[skipId]`
- 알고리즘:
  - 후보 필터에 `group_skip` hard exclude (approved status 만)
  - `groupSkipMap` 사전 로드 (월간 일괄)
  - `Warning` 타입 'group_skip' 추가 — sourceWarning 패널 분류
- UI:
  - `GroupEditor` 멤버 패널 — 워커별 🛌 chip (승인 N건 / 신청 M건 대기)
  - 클릭 시 `GroupSkipDatesModal` — 신청 목록 + 승인/거절/삭제 + 매니저 즉시 추가
  - 회피일 요약 (최대 3건 + 더보기) 인라인 표시
  - `AutoGenerateDialog` warning 'group_skip' pill + 디테일
- _docs / types: SkipStatus + GroupMemberSkipDate 타입 + 갱신
- 다음 단계 (h-2/h-3):
  - 직원 본인 신청 흐름 (마이페이지)
  - 매니저 검토 일괄 처리 화면

## 2026-05-06 — PR-2SS-d revert + PR-2SS-g (희망 요일)

### PR-2SS-d revert — 최소 경력 폐기 (사용자 운영 정책)
- 사용자 결정: 매니저가 신입 야간 직접 판단해서 배치, hard rule 강제 X
- DB 마이그레이션: `2026-05-06_cs_seniority_drop_prefer_dow.sql` (cs_shift_slots.min_seniority_months DROP + cs_workers.preferred_dow_prefer 신설)
- 알고리즘: hire_date LEFT JOIN 제거, monthsSince 헬퍼 폐기, seniority_short warning 제거
- API: shift-slots GET/POST/PATCH min_seniority_months 화이트리스트 제거 (graceful)
- UI: ShiftsTab 최소 경력 섹션 + 🌱{N}m 배지 폐기, AutoGenerateDialog seniority_short pill/디테일 폐기
- types.ts: ShiftSlot.min_seniority_months 제거

### PR-2SS-g — 희망 근무일 (Hard ranking)
- 운영 사실: 워커별 "이 요일 매치 시 우선 배정" 신규 정책
- DB 마이그레이션: cs_workers.preferred_dow_prefer VARCHAR(16) NULL 신설 ('1,3,5' = 월수금)
- 알고리즘: ranking 정렬 2순위 신설 (priority 다음, avoid 앞)
  ```
  1. priority_level ASC
  2. preferred_dow_prefer 매치 (NEW — 매치 우선)
  3. preferred_dow_avoid 매치 (기존 — 후순위)
  4. required 미달 우선
  5. by_dow ASC
  6. total ASC
  7. last_date 거리 DESC
  ```
- API: workers GET/POST/PATCH preferred_dow_prefer graceful 추가
- UI: WorkersTab ConstraintsPanel "🌟 희망 요일" 7-button chip 그리드 (비선호 위)
- types.ts: Worker.preferred_dow_prefer

## 2026-05-05 (저녁 — 야간 100% 설정화 시리즈)

### PR-2SS-e — 시간 분해 + 가산율 (KPI 보조)
- 운영 사실 (Rule 25): 야간 가산율 없음 (현재). 컬럼만 신설 — 향후 정책 변경 시 매니저 직접 설정.
- DB 마이그레이션: `2026-05-05_cs_time_breakdown.sql`
  - `cs_shift_slots.night_period_start TIME NULL` (가산 시간대 시작)
  - `cs_shift_slots.night_period_end TIME NULL` (가산 시간대 종료, 자정 넘음 가능)
  - `cs_shift_slots.night_premium_rate DECIMAL(4,2) DEFAULT 0` (가산율)
  - `cs_assignments.day_hours / night_hours / premium_hours DECIMAL(4,2) NULL`
- 알고리즘:
  - `computeBreakdown()` — slot 시간을 day/night 로 분해 (자정 넘는 가산 시간대 처리)
  - `intersectMin()` — 두 분 단위 구간 교집합
  - apply 단계: insert/update 시 day_hours/night_hours/premium_hours 동시 저장 (graceful)
- API:
  - `shift-slots GET/POST/PATCH`: 세 컬럼 graceful 추가
- UI:
  - `ShiftsTab` — 시간 분해 + 가산율 섹션 (가산 시작 / 종료 / 가산율 input)
- 운영 효과:
  - 현재 가산율 0 → 인건비 영향 없음
  - 향후 KPI 분석 페이지에서 야간시간 / 가산시간 누적 표시 가능

### PR-2SS-d — 신입 페어링 (최소 경력)
- 운영 사실 (Rule 25): 신입은 야간 안 보냄 (운영 정책)
- DB 마이그레이션: `2026-05-05_cs_shift_slots_min_seniority.sql`
  - `cs_shift_slots.min_seniority_months TINYINT NOT NULL DEFAULT 0`
  - 시드: `is_overnight=1` 슬롯에 6개월 자동 적용 (이미 손댄 row 보존)
- API:
  - `shift-slots GET/POST/PATCH`: 컬럼 graceful 추가
  - `auto-generate`: ride_employees LEFT JOIN (employee_id || name 매칭) → hire_date 로드
  - 후보 필터: hire_date 모르면 후보 X (안전), `monthsSince(hire_date, isoDate) < required` 면 제외
  - Warning 타입 'seniority_short' (실제 개월수 + 필요 개월수 응답)
- UI:
  - `ShiftsTab` — 안전 가드 섹션에 최소 경력 input + 카테고리 overnight 시 6개월 자동 제안
  - 시프트 목록에 `🌱{N}m` 작은 배지
  - `AutoGenerateDialog` — 경고 type 'seniority_short' 분류 표시
- 운영 효과:
  - 매니저가 야간 슬롯에 6개월 디폴트 두면 신입 자동 후보 제외
  - 입사일 모르는 워커도 자동 후보 X (운영 안전 보수)

### PR-2SS-c — 연속 한도 + 슬롯 거부
- DB 마이그레이션: `2026-05-05_cs_workers_blocked_consec.sql`
  - `cs_workers.max_consecutive_work_days TINYINT NULL` (워커별 연속 근무 한도)
  - `cs_workers.blocked_slot_ids JSON NULL` (슬롯 거부 명단)
- 알고리즘:
  - `workerConsec` Map — 일자별 누적 (선택 시 ++ / 휴무일 = 리셋 0)
  - `workedToday` Set — 그룹 무관 같은 날 1회만 카운트
  - 후보 필터에 slot_blocked + consec_limit hard exclude
  - slot.max_consecutive_days + worker.max_consecutive_work_days 둘 중 작은 값 적용
  - Warning 타입 추가: `consec_limit`, `slot_blocked`
- API:
  - `workers GET/POST/PATCH`: 두 컬럼 graceful + JSON 안전 파싱
- UI:
  - `WorkersTab` ConstraintsPanel — 연속 한도 input + 슬롯 거부 chip 그리드
  - `AutoGenerateDialog` — 경고 type 'consec_limit' / 'slot_blocked' 분류 표시
- 운영 효과:
  - 야간 슬롯 max_consecutive_days=3 + 워커별 한도 둘 중 작은 값 적용
  - "이 워커는 이 슬롯 절대 X" 같은 hard exclusion 표현 (예: 신입은 야간 거부)

### PR-2SS-a — REVERTED (사용자 통찰: ranking 으로 충분)
- 처음 cycle_kind ENUM (external | internal_pattern) 추가하려 했으나
- 사용자 통찰: **현재 자동 생성 알고리즘이 이미 "ranking 으로 빈자리 자동 채움"** 으로 동작
  - required_days_per_month 미달 우선 (정동민 10일 채우기)
  - by_dow / total ASC + last_date 거리 DESC (오래되고 적게 한 사람 우선)
  - cs_leaves 'off' 자동 제외 + ranking 백필
- internal_pattern 의 hard 패턴 강제는 ranking 으로 자연스럽게 표현됨 → over-engineering
- 모든 변경 revert (types / workers API / auto-generate / WorkersTab)
- 마이그레이션 파일은 mount 권한상 삭제 불가 → noop SELECT 으로 덮어씀 (실행해도 무해)

### PR-2SS-b — 익일 휴식 + 시간 겹침 가드
- 운영 사실 (Rule 25 — 사용자 인터뷰):
  - 야간 가산율 없음 / 연속 야간 한도 운영 기본 3일 / 야간 종료 후 휴식 자연 16시간
  - 휴일 야간 특수 인원 X / 신입 야간 금지 (PR-2SS-d 에서 시드)
- DB 마이그레이션: `2026-05-05_cs_shift_slots_safety_attrs.sql`
  - `cs_shift_slots.next_day_blocking_hours TINYINT NOT NULL DEFAULT 0`
  - `cs_shift_slots.max_consecutive_days TINYINT NULL`
  - 시드: `is_overnight=1` 슬롯에 16h / 3일 자동 적용 (이미 손댄 row 보존)
- API:
  - `shift-slots GET/POST/PATCH`: 두 컬럼 graceful 추가
  - `auto-generate`:
    - `workerLastEnd` Map — 워커별 마지막 슬롯 종료 시각 추적 (overnight 면 다음날 자정 이후)
    - 후보 필터에 `next_day_blocking_hours` 가드 — 직전 슬롯 종료 + N시간 < 오늘 슬롯 시작 → 후보 제외
    - apply 전 시간 겹침 검사 — 같은 (worker, date) 의 plan + existing + lock 슬롯들 시간 비교
    - `Warning` 다중 타입 (`missing` / `next_day_block` / `time_conflict`)
    - `summary.warn_by_type` 카운트 응답
- UI:
  - `ShiftsTab` — 안전 가드 입력 섹션 (종료 후 휴식 / 연속 한도) + 카테고리 'overnight' 시 16/3 자동 제안
  - 시프트 목록 테이블에 `🌙16h` `📅3` 작은 배지
  - `AutoGenerateDialog` — warning 패널 다중 타입 분류 표시 (인원 부족 / 익일 휴식 위반 / 시간 겹침)
- 운영 효과:
  - 야간조 누군가가 다른 그룹에 추가 멤버로 들어가도 다음날 새벽 자동 제외
  - manual_lock 으로 박는 시간 겹침도 미리 경고
  - 5월 케이스 회귀: 야간조 (정동민·전·윤) 모두 야간 그룹만 → 자연 격리, 동작 동일

## 2026-05-05 (새벽 — 매트릭스 외부 cycle 시각화)

### PR-2RR-a-fix — schedules API cycle 컬럼 응답
- 사용자 보고: 매트릭스에 외부 cycle 행 안 보임
- 원인: `/api/call-scheduler/schedules/[id]` GET 이 `is_external` 만 응답하고 `cycle_days_on/off/start_date` 누락
- 수정: workers SELECT 에 cycle 컬럼 graceful 추가 (`hasCycleCol` 체크)
- 회귀 케이스: `regression-cases/...api-data-missing.md` 같은 패턴 — 다음에 cycle 같은 새 컬럼 추가 시 schedules/[id] API 도 같이 갱신 필요

### PR-2RR-a — 매트릭스 외부 직원 cycle 시각화
- 매트릭스 일자 헤더 아래에 외부 직원(is_external + cycle 정의)별 한 줄 추가
- cycle on phase = 회색 막대 (외부 근무 — 당사 X)
- cycle off phase = 투명 (외부 휴무 — 당사 가능)
- 호버 툴팁: "정동민 외부 근무 (당사 X) — 2026-05-01"
- 라벨: 🏢 정동민 외부
- `utils/hours.ts` 에 `isOnExternalDuty()` 헬퍼 추가 (서버/클라 공용)
- 운영 효과:
  - 매니저가 매트릭스 보면서 정동민 외부 일정 한눈에 확인
  - 회색 셀 = 정동민이 들어올 수 없는 날 (자동 제외)
  - 흰색 셀 = 정동민 가능일 (협의 후 매니저가 직접 박음)

## 2026-05-05 (새벽 — d-3 회귀 + 데이터 분석 기반 단순화)

### PR-2QQ-d-revert — preferred_dow_only 폐기 + cycle 의미 반전
- **데이터 분석** (17개월 실 운영 데이터): dow_only 사용 사례 없음 → 폐기
- 정동민 cycle 5/1 start 2-on-2-off 패턴 검증 ✓ (외부 회사 일정 = 1년 고정)
- DB 마이그레이션: `2026-05-05_cs_workers_dow_only_drop.sql`
  - `cs_workers.preferred_dow_only` 컬럼 DROP (data 비어있음 — 안전)
- API:
  - `workers GET/POST/PATCH`: dow_only 필드 제거 (graceful)
- UI `WorkersTab` ConstraintsPanel:
  - "요일 한정" 7-button 영역 제거
  - "🔁 자동 근무 패턴" → "🏢 외부 근무 cycle (당사 X)" 라벨 변경
  - 입력 라벨: "근무일/휴무일" → "외부 근무일/외부 휴무일"
  - 안내: "외부 근무일은 자동 생성에서 당사 후보 제외"
- 자동 생성 알고리즘:
  - `cycleAllows()` → `isAvailableOnCycle()` 함수명 변경
  - 의미 반전: cycle on phase = 외부 근무 = 당사 X / cycle off phase = 외부 휴무 = 당사 가능
  - `dowOnlyAllows()` 함수 제거
  - 기존 알고리즘 흐름은 동일, cycle 의미만 운영 사실에 맞게 반전
- 운영 사실 (Rule 25):
  - 정동민 외부 cycle = 1년 고정 → 한 번 입력 후 매월 자동 적용
  - 외부 휴무일 16일 = 정동민 후보 풀
  - 매월 9-10일 = 매니저 협의 후 manual_lock (의견 수렴 도구는 PR-2RR 시리즈)

## 2026-05-04 (밤 — 자동 생성 알고리즘 v3)

### PR-2QQ-d-3 — 자동 생성 v3 + 패턴 모델 (cycle + 요일 한정)
- 운영 사실 (Rule 25): 외부 직원 (정동민) 의 2-on-2-off 패턴을 자동 생성에 직접 반영. 일반 직원도 같은 모델로 패턴 입력 가능. 요일 한정 (월·수·금만 출근) 도 지원.
- DB 마이그레이션: `2026-05-04_cs_workers_pattern.sql`
  - `cs_workers.cycle_days_on TINYINT NULL`
  - `cs_workers.cycle_days_off TINYINT NULL`
  - `cs_workers.cycle_start_date DATE NULL`
  - `cs_workers.preferred_dow_only VARCHAR(16) NULL` (avoid 와 의미 다름 — 한정)
- API:
  - `/api/call-scheduler/workers` GET/POST: 패턴 컬럼 graceful 추가
  - `/api/call-scheduler/workers/[id]` PATCH: 패턴 화이트리스트
  - `/api/call-scheduler/schedules/[id]/auto-generate` 알고리즘 v3 재작성:
    - 새 옵션: `use_priority` (기본 true), `enforce_min_coverage` (기본 true)
    - 통합 카운터 (워커 무관 그룹 합산)
    - 일자 우선 루프 (시간 순서 일관성)
    - min 결정: `lookupMinCoverage(group, dow) ?? lookupMinCoverage(group, NULL) ?? rotation_size or members.length`
    - 후보 필터: locked + leave(off) + max_days 초과 + cycle 휴무 phase + dow_only 미일치
    - 가중치 정렬 (priority → dow_avoid → required 미달 → by_dow ASC → total ASC → last_date 거리 DESC)
    - 부족 경고 `summary.warnings` 응답 (최대 50건)
- UI:
  - `WorkersTab` ConstraintsPanel — 자동 근무 패턴 영역 추가 (cycle 3 input + 요일 한정 7 button)
  - `AutoGenerateDialog` — 우선순위/최소인원 옵션 체크박스 + 부족 경고 표시
- 회귀 케이스 검토:
  - 빈 토큰 파싱 (regression-fix1) — `parseDowList` 헬퍼 사용
  - 1셀 N워커 (PR-2OO) — selected.size 안전
  - manual_lock 보존 (PR-2QQ-b) — 알고리즘에서 lockedSlotMap 카운트 포함

## 2026-05-04 (밤 — 그룹 최소 인원 셋팅)

### PR-2QQ-d-2 — cs_group_min_coverage (디폴트 + 요일 예외)
- 운영 사실 (Rule 25): 그룹별로 매일 최소 N명 + 특정 요일만 다른 인원 (예: 금요일 피크 3명, 일요일 1명)
- DB 마이그레이션: `2026-05-04_cs_group_min_coverage.sql`
  - 신규 테이블 `cs_group_min_coverage` (id / group_id / dow nullable / min_workers)
  - UNIQUE (group_id, dow) — dow=NULL = 매일 디폴트 1행 + 0~6 요일 예외 N행
  - FK ON DELETE CASCADE
  - max_workers 폐기 (사용자 결정 — 사용 안 함)
- API:
  - `GET /api/call-scheduler/shift-groups/[id]/min-coverage` — 행 모두 반환 (dow=NULL 우선)
  - `PUT /api/call-scheduler/shift-groups/[id]/min-coverage` — 일괄 재정의 (DELETE + INSERT 패턴)
  - graceful: 마이그 미적용 시 GET 빈 배열 + `_migration_pending: true`
- UI `GroupEditor`:
  - 좌측 패널 하단에 "⚖️ 최소 인원 (자동 생성용)" 섹션 추가
  - 매일 디폴트 1칸 + 요일별 7칸 (빈 칸 = 디폴트 사용)
  - 요일 라벨 색상 (일=빨강 / 토=파랑)
  - graceful: 마이그 미적용 시 안내 배너
- 자동 생성 알고리즘에서 활용 예정 (PR-2QQ-d-3)

## 2026-05-04 (밤 — 워커 제약 모델)

### PR-2QQ-d-1-fix — 일요일 비선호 자동 표시 버그
- 사용자 보고: 모든 워커가 편집 시 일요일이 비선호로 표시됨 + 해제 후 저장 안 됨
- 원인: `''.split(',')` → `['']` → `Number('')` === 0 (일요일) 로 잘못 파싱
- 수정: 빈 토큰 먼저 제거 후 Number() 파싱 + 0~6 범위 필터

### PR-2QQ-d-1 — 워커 제약 모델 + WorkersTab UI 강화
- 운영 사실 (Rule 25): 외부/내부 통합 모델. priority + 비선호 요일 + 필수/최대 일수 + 자유 패턴.
- DB 마이그레이션: `2026-05-04_cs_workers_constraints.sql`
  - `cs_workers.priority_level TINYINT DEFAULT 2` (1=최우선, 2=일반, 3=백업)
  - `cs_workers.preferred_dow_avoid VARCHAR(16)` ('0,5' = 일·금)
  - `cs_workers.required_days_per_month TINYINT NULL`
  - `cs_workers.max_days_per_month TINYINT NULL`
  - `cs_workers.work_pattern_text VARCHAR(64)` (외부 + 일반 통합 — 자유 메모)
  - 인덱스: `idx_cs_w_priority (priority_level, is_active)`
  - external_pattern → work_pattern_text 자동 마이그
- API:
  - `/api/call-scheduler/workers` GET/POST: 새 컬럼 graceful 추가
  - `/api/call-scheduler/workers/[id]` PATCH: 새 컬럼 화이트리스트
- UI `WorkersTab`:
  - 편집 모드 시 ConstraintsPanel 펼침 (colSpan row)
  - 좌측: 우선순위 (P1/P2/P3) + 외부 직원 토글 + 비선호 요일 (7 button)
  - 우측: 월 필수/최대 일수 + 자유 패턴 메모
  - 비편집 모드: 외부 직원 🔒 배지 + P1 빨간 배지 표시
  - 저장 시 RideEmployees PATCH (color/group) + cs_workers PATCH (constraints) 동시
- **외부 직원 엑셀 업로드 폐기** — `ExternalScheduleDialog` + `external-schedule` API orphan
  - 상세 [⋯] 메뉴에서 항목 제거
  - 코드 파일 자체는 남아있음 (commit 시 git rm 필요)

## 2026-05-04 (밤 — 사소한 UX 보강)

### PR-2QQ-fix1 — RideEmployees 목록 헤더 뒤로가기
- `/RideEmployees` 메인 목록 페이지 헤더에 [← 근무시간표] 링크 추가
- new / [id] 페이지는 이미 있었으나 메인 목록 페이지만 누락

## 2026-05-04 (밤 — 외부 직원 + manual_lock)

### PR-2QQ-b — 외부 직원 + manual_lock + 엑셀 업로드
- 운영 사실 (Rule 25): 야간 슬롯 L13 외부 직원 정동민(1명, 2-on-2-off)이 1순위. 매월 매니저가 엑셀로 외부 일정 업로드.
- DB 마이그레이션: `2026-05-04_cs_external_workers.sql`
  - `cs_workers.is_external TINYINT(1)` (1순위 표식)
  - `cs_workers.external_pattern VARCHAR(128)` (자유 메타)
  - `cs_assignments.manual_lock TINYINT(1)` (자동 생성 보존)
  - 인덱스: `idx_cs_asn_lock (schedule_id, manual_lock)`
- API:
  - `/api/call-scheduler/workers` GET/POST: is_external + external_pattern 지원 (graceful)
  - `/api/call-scheduler/workers/[id]` PATCH 신설 (cs_workers 직접 수정, RideEmployees 와 분리)
  - `/api/call-scheduler/schedules/[id]/external-schedule` POST/GET 신설:
    - GET = 엑셀 템플릿 다운로드 (외부 직원 + 야간 슬롯 자동 샘플)
    - POST = 엑셀 업로드 → manual_lock=1 upsert (preview/apply)
  - `/api/call-scheduler/schedules/[id]` GET: manual_lock + is_external 응답 (graceful)
  - `/api/call-scheduler/schedules/[id]/auto-generate`:
    - manual_lock 셀 항상 skip-existing (overwrite 무시)
    - clear_first 시 manual_lock=1 보존 (조건부 DELETE)
- UI:
  - `ExternalScheduleDialog` 신설 (720px) — 템플릿 → 업로드 → preview → apply
  - 상세 [⋯] 메뉴: [🔒 외부 직원 일정] 항목 추가
  - `AssignmentCell`: manual_lock=1 셀에 🔒 아이콘 prefix

## 2026-05-04 (밤 — KPI 균형도 상세)

### PR-2QQ-c — KPI 균형도 상세 (야간/금야간/일야간)
- WorkerKpi 확장: `fri_overnight`, `sun_overnight`, `weekend_count`, `weekday_count`
- API `/api/call-scheduler/schedules/[id]`: work_date 의 day-of-week 로 카운트
- AnalyticsPanel:
  - 균형도 카드 4개 (전체 야간 / 시간 편차 / 금야간 / 일야간) — max-min range + min/avg/max
  - 인당 분석 테이블 컬럼 확장: 금야 / 일야 / 주말 추가 (10 컬럼)
  - 편차 알림: 금/일 야간 range >= 3 시 빨간 배너
  - 워커별 금/일 야간 빨강 강조 (평균의 1.5배 초과)
- 운영 사실 (Rule 25): 야간 워커는 금/일 비선호 → 균등 분배 시각화

## 2026-05-04 (밤 — 그룹 마스터 강화)

### PR-2QQ-a — 그룹 마스터 UI 강화 (카테고리/카드/색상)
- DB 마이그레이션: `2026-05-04_cs_shift_groups_category.sql`
  - `cs_shift_groups.category VARCHAR(32)` 추가 (default 'general')
  - `cs_shift_groups.color_tone` ENUM 7→14 (indigo/sky/teal/lime/orange/pink/slate 추가)
  - `cs_workers.color_tone` 동일 14개로 확장
  - 인덱스: `idx_cs_grp_category (category, sort_order)`
- API:
  - `/api/call-scheduler/shift-groups` GET: 멤버 chip 정보 + category 응답 (graceful — 컬럼 없어도 'general' fallback)
  - POST/PATCH: category 인자 지원 + color_tone 14개 화이트리스트
- UI `GroupsTab`:
  - 카테고리 필터 pill (전체 / 주간 / 야간 / 특수 / 일반 / 사용자 정의)
  - 정렬 옵션 (커스텀 순서 / 시작 시간 / 이름 / 멤버 수)
  - 카테고리별 섹션 표시 (sort_order 모드 + 전체 필터 시)
  - 그룹 카드 상세화: 좌측 색상바 + 시간/익일 배지 + 패턴 detail (custom 요일 명시) + 멤버 chip stack (워커 색상 적용) + 설명
  - 카드 안 [▲▼] 순서 변경 버튼 (sort_order 모드)
- UI `GroupEditor`:
  - 카테고리 선택 (pill + 직접 입력)
  - 색상 picker → 14 dot swatches (그룹 색상)
- UI `WorkersTab`:
  - 직원 색상 picker → 14 dot swatches
- 유틸 `palette.ts`: 14개 토큰 매핑 (TONE_BG/BORDER/TEXT/SOLID)
- 유틸 `types.ts`: ColorTone union 14개 + COLOR_TONE_OPTIONS hex 동봉

## 2026-05-04 (밤 — 메뉴 정리 추가)

### PR-2PP — 상세 [⋯] 메뉴 단순화
- 공통 셋팅 6개 항목 제거 (시간/그룹/직원/직원마스터/공휴일/휴가)
- 이유: 목록 헤더의 [📋 직원마스터] / [⚙️ 설정] 직접 버튼과 중복 (PR-2NN-fix 와 일관)
- 상세 [⋯] 에는 본 월 한정 작업만 잔존:
  - 작업: 공지로 변경 / 자동 생성 / 직원 요청 / 분석·배포 이력
  - 위험: 삭제

## 2026-05-04 (밤 — 동시 근무 허용)

### PR-2OO — 1셀 N워커 동시 근무 (운영 사실 반영, Rule 25)
- 운영 사실: 같은 그룹 안 멤버가 같은 시간 슬롯에 동시 출근 (예: 야간콜 4명 모두 22-08)
- DB 마이그레이션: `cs_assignments` UNIQUE KEY 변경
  - 이전: `(schedule_id, work_date, shift_slot_id)` — 1셀 1워커 강제
  - 변경: `(schedule_id, work_date, shift_slot_id, worker_id)` — 1셀 N워커 허용
- API `auto-generate`: existingMap 키를 `(date, slot, worker)` 단위로 변경
- API `assignments PUT`: `assignment_id` 옵션 인자 추가 — 특정 row UPDATE 명시
  - `worker_id` + (date, slot) 키로 upsert (멀티 워커 지원)
- 매트릭스 UI: 1셀에 워커 chip 세로 stack + [+] 추가 버튼
  - `cellMap`: `Map<string, Assignment>` → `Map<string, Assignment[]>`
  - 빈 셀 클릭 → 새 워커 추가 picker
  - 기존 chip 클릭 → 그 워커 수정 picker
- 버그: 자동 생성 시 `Duplicate entry '...' for key 'uq_cs_asn_cell'` 1062 에러 해결

### PR-2NN-fix — 목록 페이지 헤더 단순화
- [⋯] 드롭다운 폐기 (6개 셋팅 탭 = 모두 같은 settings 페이지로 → 중복)
- [📋 직원 마스터] + [⚙️ 설정] 2개 직접 버튼만 노출

## 2026-05-04 (저녁 — UX 보강)

### PR-2MM — 자동 생성 모달 자동 미리보기
- 모달 열림 시 자동으로 미리보기 실행 (300ms debounce)
- 옵션 변경 시 자동 재계산 (overwrite/clear/skip-holidays/mark-leaves)
- 적용 버튼 활성화 조건 완화 — `to_insert + to_update > 0` 이면 항상 활성
- 변경 사항 0건 시 비활성 + tooltip "변경 사항 없음"
- "✨ N건 적용" 버튼 라벨로 적용 분량 즉시 노출
- 생성 안 눌리던 사용자 보고 즉시 반영

### PR-2NN — 목록 페이지 [⋯] 더보기 메뉴
- `/CallScheduler` 메인 헤더에 [⋯] 메뉴 추가 (상세 페이지와 동일 패턴)
- 메뉴 항목: 시간 / 그룹 / 직원 / 직원마스터 / 공휴일 / 휴가 + 설정 페이지
- 매월 새 월 만들기 전 / 후 셋팅 직접 진입 (목록 페이지에서도 가능)
- 외부 클릭 시 자동 닫기 (mousedown 핸들러)

## 2026-05-04 (오후 — 추가 정리)

### Route Group 이동 — `app/(employees)/`
- `app/CallScheduler/` → `app/(employees)/CallScheduler/`
- `app/RideEmployees/` → `app/(employees)/RideEmployees/`
- URL 변경 없음 (Route Group `()` 은 URL에 안 나타남)
- import 경로 일괄 sed: `@/app/CallScheduler` → `@/app/(employees)/CallScheduler`
- 직원 토큰 링크 유효 (`/CallScheduler/e/<token>` 그대로)

### PR-2II — 직원 마이페이지 휴가 신청
- `LeaveRequestDialog` 신설 (480px 모달)
- 마이페이지 [🙋 휴가 신청] — 토큰 모드는 status='pending' 자동
- 종류 선택 시 회사 정책 default 자동 (PR-2HH 활용)
- 빠른 프리셋 (반차 4h / 패밀리 3h / 종일 8h) + 차감 미리보기

### PR-2JJ — RideEmployees 엑셀 일괄 등록
- API: `GET /template` (샘플 .xlsx) + `POST /bulk-upload` (preview/apply)
- `BulkUploadDialog` 신설 (800px) — 5타일 결과 (전체/정상/중복/오류/빈)
- 이름 중복 자동 skip + 안내 시트 포함
- RideEmployees 목록에 [📤 일괄 등록] / [🔧 중복 정리] 버튼

### PR-2KK — 월 생성 + 자동 채우기 통합
- `/CallScheduler/new` 폼에 ☑ 자동 채우기 체크박스 (기본 ON, 보라색 배너)
- 생성 직후 `auto-generate?mode=apply` 자동 호출 → 그룹 패턴 + 휴가 반영
- 진행 상태 라벨 (월 생성 → 자동 생성 → 결과 N건 → 이동)
- 전월 복제 선택 시 비활성 (복제로 채워지므로)

### PR-2LL — [⋯] 더보기 메뉴 확장 (셋팅 직접 진입)
- 상세 페이지 [⋯] 메뉴 재구성:
  - 작업: 공지 / 자동 생성 / 직원 요청 / 분석
  - **공통 셋팅 (월과 무관 — 한 번만)**: 시간 / 그룹 / 직원 / 직원마스터 / 공휴일 / 휴가 6개 직접 항목
  - 위험: 삭제
- `settings/page.tsx` `useSearchParams` + `Suspense` — `?tab=...` query 수신
- 사이드바 변경 없음 (단일 진입점 유지) — 매월 셋팅 X
- 운영 흐름: 셋팅 한 번 → 매월 [+ 새 월] (자동 채우기) → 미세 조정

## 2026-05-04 (오전)

### PR-2AA — 휴가 발급량 + 잔여 자동 차감
- 마이그레이션: `cs_leave_quotas` 테이블 신설 (worker × year × month × leave_type, 반차 0.5일 단위)
- API: `GET/POST /api/call-scheduler/leave-quotas` (잔여 자동 계산) + `PUT /bulk` (일괄 발급)
- UI: `QuotaBulkDialog` — 연차(연1회) / 패밀리데이(월1회) / 병가(연단위) 프리셋
- 영향: LeavesTab 헤더에 [💼 일괄 발급] 버튼 + 워커별 잔여 표시 (예정)

### 휴일/휴가 24/365 재구성
- 사용자 명시: 24/365 콜센터 운영, 공휴일도 일부 직원 근무
- cs_holidays.exclude_auto 디폴트 `true → false` 변경
- 휴일 탭: "🏖 회사 휴일" → "🏖 공휴일 (참고)" — 자동 제외 X, 시각화 + 일괄 적용 도구
- 휴가 탭: 종류 추가 — `familyday` (패밀리데이) + 사용자 운영 흐름 반영
- 영향: HolidaysTab 안내 배너 추가, LeavesTab 종류 6개로 확장

### PR-2M ~ PR-2P — 헤더 정리 + 설정 페이지 5탭
- **2M** 상세 헤더 단순화: 7버튼 → [✍️작성/📋매트릭스/📅날짜별] + [⚡배포] + [⋯더보기]
  - 더보기 메뉴: 공지/초안 토글 · 분석 · 설정 · 삭제
- **2N** 워커 탭: RideEmployees 와 cs_workers 양방향 연동, 미활성 후보 알림
- **2O** 휴일 마스터: cs_holidays 마이그레이션 + UI (year 필터, 종류별 통계)
- **2P** 연차 마스터: cs_leaves 마이그레이션 + UI (워커×기간×반차+사유)

### PR-2Q ~ PR-2Z — 매니저/직원 양방향 강화
- **2Q** 균형도 경보: KPI 5번째 타일, ±20% 벗어난 워커 카운트 (양호/주의/위험)
- **2R** 시프트 교체: 매트릭스 [🔄] 토글 → 두 셀 클릭 = swap
- **2S** 빈자리 한눈: 매트릭스 상단 [👀] 토글 + 빈 셀 빨간 점선 강조
- **2T** 워커 부담 인디케이터: ComposeMode 좌측 워커 list 막대 + 평균선 + 편차 색상
- **2V** 캘린더 다운로드: 마이페이지 [📥] iCal(.ics) export — 휴대폰 캘린더 import
- **2W** 같은 날 동료: 마이페이지 캘린더 셀 클릭 → 그날 시프트별 동료 모달 (본인 강조)
- **2X** 새 공지 배지: 공지 7일 이내 시 "🆕 새 공지" 펄스 애니메이션
- **2Y** 시프트 교체 요청: cs_swap_requests 테이블 + 직원 신청 + 매니저 [⋯] 카운트 배지
- **2Z** 결근/병가 즉석: 매트릭스 셀 우클릭 → 휴무/오전반차/오후반차/F/비우기 quick action

### PR-2C — 직원 마이페이지 + 토큰 진입
- `/CallScheduler/me` (로그인) + `/CallScheduler/e/[token]` (영구 링크)
- API: `/api/call-scheduler/me` (token 모드는 published 만 노출)
- 컴포넌트: `MyScheduleView` (인사 + KPI + 캘린더 + 상세 시간표)
- ride_employees.public_token 컬럼 — RideEmployees 페이지에서 발급/재발급/폐기

## 2026-05-03

### PR-2J — 자동 생성 API + 버튼
- API: `POST /api/call-scheduler/schedules/[id]/auto-generate`
  - 그룹 패턴 (all_days/all_weekdays/weekends_only/custom) + 전략 (all_members/rotation)
  - skip_holidays / mark_leaves / overwrite_existing / clear_first 옵션
- UI: ComposeMode 상단 보라색 배너 + AutoGenerateDialog (preview → apply)

### PR-2L — 날짜별 뷰 (3번째 모드)
- 모드 토글: ✍️작성 / 📋매트릭스 / 📅날짜별
- 일자 카드 grid + 그날 시프트별 워커 list (DayDetailModal)

### PR-2I — 그룹 마스터
- 마이그레이션: cs_shift_groups + cs_group_members
- 그룹 = 시프트 + 패턴 + 전략 + 멤버
- `/settings` 그룹 탭 + GroupEditor (멤버 순서 ↑↓)

### PR-2H — 워커 기준 작성 모드
- 매트릭스 외 두 번째 모드 — 워커 1명씩 시프트 + 일자 토글
- 빠른 입력 매크로 (평일/주말/요일별/한줄 입력) + 한 줄 입력 파서

### PR-2A / PR-2B — 풀폭 + 직원 마스터
- 메인 캘린더 max-width 제거 + AnalyticsDrawer (우측 슬라이드)
- 셀 60→44px → 31일 한 화면
- ride_employees 마스터 + RideEmployees CRUD 페이지

## 2026-05-03 (모듈 신설)

### PR-1 v1 MVP
- migrations: cs_shift_slots / cs_workers / cs_schedules / cs_assignments / cs_distributions
- 시드: 13 시프트 + 16 워커 (5월 스케줄 분석 기반)
- API 6 + UI 3 페이지 (목록/등록/상세) + 컴포넌트 6
