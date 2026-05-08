# CallScheduler — 세션 마스터플랜 (2026-05-06 ~ 05-08)

> **세션 시작 의도** (사용자 2026-05-06):
> > "그룹의 상세설정과 근무표 표출 ui 구성이 맘에 안들어서 리뉴얼중입니다."
>
> **확장된 목표** (사용자 2026-05-08):
> > "날짜별이던 매트릭스던 시간대랑 근무자랑 직관적으로 잘보이도록 해서 가시죠
> > UI도 너무 쪼그만 버튼같은건 지양하고 전체적으로 지금한것도 분석해서 정리좀 하고 다음것도 전부 진행하시죠"
>
> **사용자 원칙** (2026-05-08):
> > "매트릭스/달력엔 모든 조건들이 보여야 '아 이래서 이렇게 구성했었지' 가 되어야 하고
> > 설정페이지들은 각각 적용기준위치에서 정확히 입력하고 컨펌할수있는 수정할수있는 복잡도를 최소화"

---

## 0. 핵심 설계 원칙

```
매트릭스/달력 = "관찰의 진실 (Source of Visibility)"
   ⤷ 모든 조건 시각화 → "왜 이 사람이 / 왜 비었는지" 즉시 답

설정 페이지 = "입력의 단일 위치 (Single Source of Input)"
   ⤷ 그룹 차원 → GroupEditor 만
   ⤷ 워커 차원 → WorkersTab 만
   ⤷ 슬롯 차원 → ShiftsTab 만
   ⤷ 회피 신청 → 직원 마이페이지 (매니저 빠른 입력은 GroupEditor 인라인 그대로)
   ⤷ 정식 휴가 → LeavesTab 만
```

---

## 1. 완료된 작업 (2026-05-06 ~ 05-08)

### 1-A. 야간 100% 설정화 시리즈

| PR | 영역 | DB | 알고리즘 | UI |
|----|------|-----|---------|-----|
| **PR-2SS-a** (revert) | cycle_kind ENUM 폐기 — 사용자 통찰: ranking 으로 충분 | — | — | — |
| **PR-2SS-b** | 익일 휴식(16h) + 시간 겹침 | slot.next_day_blocking_hours / max_consecutive_days | workerLastEnd Map + intersectMin | ShiftsTab 안전 가드 |
| **PR-2SS-c** | 연속 한도 + 슬롯 거부 | worker.max_consecutive_work_days / blocked_slot_ids | workerConsec + workedToday | WorkersTab 한도 + chip |
| **PR-2SS-d → revert** | 최소 경력 폐기 (매니저 직접 판단) | min_seniority_months DROP | — | — |
| **PR-2SS-e** | 시간 분해 (KPI 보조) | day_hours/night_hours/premium_hours | computeBreakdown | ShiftsTab 가산 입력 |
| **PR-2SS-g** | 희망 요일 (Hard ranking) | worker.preferred_dow_prefer | ranking 2순위 신설 | WorkersTab chip |

### 1-B. 그룹 차원 회피일 시리즈

| PR | 영역 | 결과 |
|----|------|-----|
| **PR-2SS-h-1** | cs_group_member_skip_dates 신설 + 매니저 UI (모달) | 그룹 차원 회피 시스템 |
| **PR-2SS-h-1-fix** | 모달 → 인라인 펼침 (UX 개선) | accordion + 빠른 입력 한 줄 |
| **PR-2SS-h-4** | 매트릭스 회피일 워커별 행 추가 | 외부 cycle 행 패턴 따라 시각화 |

### 1-C. 시스템 차원 안전장치 (Cowork 흡수 사고 방어)

| PR | 영역 | 결과 |
|----|------|-----|
| **PR-2SS-Z2** | CLAUDE.md 규칙 21 강화 (--no-verify 금지) | 다른 세션도 룰 준수 |
| **PR-2SS-Z3** | pre-push hook + cowork-staging-lint --check-commit | 3-layer 방어 활성 |

### 1-D. 회귀 케이스 기록

`harness-engineering/regression-cases/2026-05-06-cowork-staging-violation.md`:
- 1차 사고 (RideAccidents PR-6.3.c — CallScheduler 1,407 라인 흡수)
- 2차 사고 (PR-B10 — h-1-fix 233 라인 흡수)
- 3차 사고 (PR-B12 freelancers — Z2 흡수)
- 4차 사고 (M-V2 매처 — h-4 흡수)
- 사고 누적 4회 → 시스템 안전장치 강화 (Z3)

### 1-E. 마이그레이션 누적

| 파일 | 컬럼 |
|------|-----|
| `2026-05-05_cs_shift_slots_safety_attrs.sql` | next_day_blocking_hours / max_consecutive_days |
| `2026-05-05_cs_workers_blocked_consec.sql` | max_consecutive_work_days / blocked_slot_ids JSON |
| `2026-05-05_cs_shift_slots_min_seniority.sql` | min_seniority_months (이후 DROP — d-revert) |
| `2026-05-05_cs_time_breakdown.sql` | slot.night_period_* + asn.day/night/premium_hours |
| `2026-05-06_cs_seniority_drop_prefer_dow.sql` | min_seniority DROP + preferred_dow_prefer |
| `2026-05-06_cs_group_member_skip_dates.sql` | cs_group_member_skip_dates 테이블 신설 |

---

## 2. 현재 시스템 상태

### 2-A. 데이터 모델 (cs_*)

```
cs_shift_slots
  · is_overnight / next_day_blocking_hours / max_consecutive_days
  · night_period_start/end / night_premium_rate
cs_workers
  · priority_level / preferred_dow_avoid / preferred_dow_prefer
  · required/max_days_per_month / max_consecutive_work_days
  · cycle_days_on/off/start_date / blocked_slot_ids JSON
cs_shift_groups
  · pattern_type / generation_strategy / category
cs_group_members
  · worker_id / priority
cs_group_min_coverage
  · dow / min_workers
cs_group_member_skip_dates ★ NEW
  · status / requested_by/at / approved_by/at / reason
cs_assignments
  · worker_id / special_code / computed_hours / day/night/premium_hours
  · manual_lock
cs_leaves
  · leave_type / am_pm / hours / status (정식 휴가)
```

### 2-B. 자동 생성 알고리즘 ranking

```
1. priority_level ASC          (P1 우선)
2. preferred_dow_prefer 매치    (희망 요일 — Hard 우선)
3. preferred_dow_avoid 매치    (비선호 요일 — 후순위)
4. required_days 미달 우선
5. by_dow[dow] ASC
6. total ASC
7. last_date 거리 DESC
```

후보 필터 (hard exclude):
- locked (manual_lock=1)
- 종일 leaves (cs_leaves status=approved + am_pm=full)
- max_days_per_month 초과
- cycle 외부 근무 phase
- 익일 휴식 가드 (next_day_blocking_hours)
- 슬롯 거부 (blocked_slot_ids)
- 연속 한도 (max_consecutive_days)
- 그룹 회피일 (cs_group_member_skip_dates approved) ★

Warning 분류:
- missing / next_day_block / time_conflict
- consec_limit / slot_blocked / group_skip

### 2-C. UI 페이지 맵

```
/CallScheduler              월별 스케줄 목록 + KPI
/CallScheduler/[id]         매트릭스 (시프트 × 일자)
   · 외부 cycle 행 (워커별)
   · 회피일 행 (워커별 — h-4)  ★ NEW
   · 셀 — 슬롯 × 일자 × 워커 N명
/CallScheduler/me           직원 마이페이지 (휴가 신청만)
/CallScheduler/e/[token]    토큰 페이지 (직원 본인 — 비로그인)
/CallScheduler/settings     6 탭 (시간/그룹/직원/공휴일/직원휴가)
   · ShiftsTab — 슬롯 + 안전 가드 + 시간 분해
   · GroupsTab → GroupEditor — 그룹 + 멤버 + 회피일 인라인 (h-1-fix)
   · WorkersTab — 워커 + 우선순위 + 비선호/희망/cycle/슬롯거부/연속한도
   · HolidaysTab — 공휴일
   · LeavesTab — 정식 휴가 (annual/familyday/sick/etc)
```

---

## 3. 미완료 항목 (다음 단계)

### Phase B — UI 디자인 통일 가이드 (2026-05-08 사용자 요청)
- 큰 버튼 정책 (작은 chip/icon 버튼 지양)
- Glass 디자인 강화
- 매트릭스/날짜별/폼 전반 통일

### Phase C — 매트릭스 + 날짜별 직관 표시
- 셀 크기 확대 (24px → 36px+)
- 시간 정보 셀 자체에 표시
- 워커 색상 강화
- 작은 버튼 대거 제거

### Phase D — h-5 색상 layer
- 매트릭스 셀에 워커 조건 시각화
- 비선호 요일 옅은 빨강 / 희망 요일 옅은 녹색
- cycle 외부 근무 회색 줄

### Phase E — h-6 가드 위반 시각화
- 익일 휴식 위반 → 셀 빨강 ⚠
- 연속 한도 도달 → 셀 노랑 ⚠
- 시간 겹침 → 셀 빨강 ⏱

### Phase F — h-7 빈 셀 hover 사유 분석
- 빈 셀 hover → 후보 풀 분석
- "5/15 야간 빈 자리 — 후보 3명: 정동민(외부 cycle), 전정연(비선호 일요일), 윤민진(회피 신청 대기)"

### Phase G — h-2 직원 본인 회피 신청
- /CallScheduler/me + /e/[token] 에 회피 신청 모달
- 그룹 선택 + 일자 범위 + 사유
- status='requested' → 매니저 검토 대기

### Phase H — h-3 매니저 검토 통합 페이지
- /CallScheduler/skips 신설
- 모든 그룹 대기 신청 한 화면
- 일괄 승인/거절 batch

### Phase I — 그룹별 Ranking 정책 표출 (사용자 2026-05-08 추가 요청)

> **사용자 시나리오** (가장 어려운 부분):
> "야간 1번 직원이 근무 가능일을 지정했을 때 10일 근무만 하려고 할 때
> 그외에 뺄 근무일을 지정했을 때 그 날짜를 다른 워커가 들어갈 때
> 그 그룹은 우선순위 설정이 표출되어야 합니다"
>
> 우선순위 = 근무 안한지 오래된 순 + 근무시간 해당일 짧은 순 + 빼달라는 날짜(제외) + 연차포함

**현재 알고리즘 ranking** (모든 그룹 공통, 하드코딩):
```
1. priority_level ASC          (P1 우선 — 정동민)
2. preferred_dow_prefer 매치   (희망 요일)
3. preferred_dow_avoid 매치    (비선호 요일)
4. required 미달 우선          (월 N일 필수 자 우선)
5. by_dow[dow] ASC             (이 요일 적게 한 사람)
6. total ASC                   (전체 적게 한 사람) ★ "근무 시간 짧은 순"
7. last_date 거리 DESC         (오래 안 한 사람)   ★ "근무 안한지 오래된"
```

**후보 필터** (hard exclude):
- locked / 종일 leaves / max 초과 / cycle / 익일 휴식 / 슬롯 거부 / 연속 한도
- **그룹 회피일** ★ "빼달라는 날짜"
- **연차 (cs_leaves status=approved + am_pm=full)** ★ "연차 포함"

**문제**: 매니저가 알고리즘 보지 않고는 "어떻게 결정됐는지" 모름.

**해결 방향 (옵션 결정 필요)**:

| 옵션 | 의미 | 작업량 |
|------|------|------|
| **I-A — 표출만** | GroupEditor 에 ranking 정책 정보 박스 + 매트릭스 셀 hover 에 사유 (Phase F 와 통합) | M |
| **I-B — 커스터마이즈** | 그룹별 ranking 가중치/순서 수정 가능 (cs_shift_groups.ranking_policy JSON) | L (DB+UI+알고리즘) |

**제 권장: I-A 먼저** — 사용자 의도 = "매니저 판단 도구" 라 표출이 핵심. 향후 정책 다양화 필요 시 I-B 도입.

**I-A UI 구조**:
```
GroupEditor (그룹 편집) — 새 섹션 "🎯 우선순위 정책":
─────────────────────────────────
이 그룹의 자동 생성은 다음 순서로 결정됩니다:

  ① 우선순위 (P1 → P2 → P3)
  ② 희망 요일 매치 (워커 설정)
  ③ 비선호 요일 회피 (워커 설정)
  ④ 월 필수 일수 미달자 우선
  ⑤ 이 요일 적게 한 사람 (균등)
  ⑥ 근무 시간 짧은 사람 (월 누적)
  ⑦ 가장 오래 근무 안한 사람

후보 제외 규칙:
  · 그룹 회피일 (승인됨)
  · 연차 종일
  · 외부 cycle 근무 phase
  · 슬롯 거부 / 연속 한도 도달
  · 익일 휴식 위반

[💡 정책 변경은 다음 사항으로 가능]
  · 워커 우선순위 → 직원 탭
  · 회피일 → 위 멤버 패널 (🛌 chip)
  · 연차 → 직원 휴가 탭
─────────────────────────────────
```

**I-A 매트릭스 셀 hover 효과** (Phase F 와 통합):
```
배정 셀 hover:
  "정동민 — 5/13 야간 배정
   사유: P1 + 5/11 마지막 야간 (2일 전) + 월 5일 중 4일째
   → ranking 1순위 통과"

빈 셀 hover (회피일 행 + 슬롯 행 양쪽):
  "5/15 야간 빈 자리 — 후보 풀 분석:
     · 정동민: 외부 cycle 근무 phase (제외)
     · 전정연: 회피 신청 (대기) — 사유 '가족 행사'
     · 윤민진: 일·금 비선호 — 후순위
   → 자동 생성 시 윤민진 배정 (다른 후보 모두 제외)"
```

---

## 4. 진행 순서 + 예상 작업량

| Phase | 작업량 | DB | API | UI | 우선순위 |
|-------|------|----|-----|-----|--------|
| **B** UI 가이드 | XS | — | — | _docs | ⭐ 즉시 |
| **C** 매트릭스 직관화 | M | — | — | ScheduleGrid + DayView + AssignmentCell | ⭐ 즉시 |
| **D** h-5 색상 layer | S | — | — | AssignmentCell + utils | 사용자 효익 큼 |
| **E** h-6 가드 시각화 | M | — | API 응답 확장 | AssignmentCell | 데이터 안전성 |
| **F** h-7 hover 사유 | M | — | 후보 분석 API | hover panel | UX 강화 |
| **G** h-2 직원 신청 | M | — | API 확장 | me + token 페이지 | 운영 효율 |
| **H** h-3 매니저 검토 | M | — | API 통합 | skips 페이지 | 운영 효율 |
| **I-A** ranking 표출 | M | — | — | GroupEditor + AssignmentCell hover | ⭐⭐⭐ 매니저 판단 핵심 |

---

## 5. 사용자 원칙 적용 가이드

```
✓ 매트릭스에 모든 조건 시각화 (→ Phase C/D/E/F)
✓ 큰 버튼 / Glass 디자인 통일 (→ Phase B/C)
✓ 설정 페이지 단일 입력 위치 유지 (→ 현재 OK)
✓ 직원 신청 분리 (→ Phase G)
✓ 매니저 검토 통합 (→ Phase H)
✓ 흡수 사고 방어 (→ 완료, Z2/Z3)
```

---

## 6. 다음 작업 진입 권장 순서

```
Phase B (UI 가이드) → 즉시 시작
   ↓
Phase C (매트릭스 직관화) — 가장 큰 사용자 효익
   ↓
Phase D (색상 layer) — 작은 작업, 큰 효익
   ↓
Phase E (가드 시각화) — 알고리즘 결과 가시화
   ↓
Phase F (hover 사유) — 마지막 인사이트
   ↓
Phase G (직원 신청) — 운영 흐름 확장
   ↓
Phase H (매니저 검토) — 운영 흐름 마무리
```

---

## 7. 변경 이력

| 날짜 | 변경 |
|------|------|
| 2026-05-06 | PR-2SS-h-1 / h-1-fix / Z2 / Z3 |
| 2026-05-08 | PR-2SS-h-4 + Phase B~H 마스터플랜 작성 |
