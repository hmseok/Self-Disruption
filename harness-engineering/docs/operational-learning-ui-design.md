# 운영학습 UI 설계서 (Phase 3.1)

> 작성: 2026-04-18 / Planner
> 근거: Researcher 조사 보고서 (lib/rent-calc-engine.ts, Phase 2 모듈 분리 완료 상태)
> 승인 대상: 사용자

---

## 1. 목적

v2.0 엔진에 이미 구현된 운영학습 함수(`analyzeActualVsPredicted`, `suggestBusinessRules`)를 사용자가 사용할 수 있는 UI로 연결한다. 예측값과 실제 결과를 비교해 기준표 품질을 지속적으로 개선하는 피드백 루프를 구축한다.

**완성 후 가능해지는 것**
- 계약 완료된 차량의 실제 원가(감가/보험/정비/세금/사고비)를 기록할 수 있다
- 각 견적별로 예측 vs 실제 자동 비교 (정확도 %, 편차 원화, 상태 표시)
- 최근 스냅샷 N건 분석 → BusinessRules 자동 추천 리스트
- 추천값 [적용] 버튼 한 번으로 기준표 값 업데이트 + SimulationPanel 즉시 반영

---

## 2. 페이지 위치 (후보 3안 — 사용자 확인 필요)

| 안 | 경로 | 접근 | 추천도 |
|---|------|------|--------|
| A | `/quotes/operational-learning` | 영업·견적 메뉴 하위 | ⭐⭐⭐ (견적 컨텍스트와 근접) |
| B | `/analytics/operational-learning` | 신설 "분석" 메뉴 | ⭐⭐ (향후 타 분석 페이지 확장 여지) |
| C | `/db/operational-learning` | 데이터관리 하위 | ⭐ (기준표와 근접하나 성격 다름) |

**Planner 추천: A안**. 운영학습은 견적 산출 로직의 개선 수단이므로 견적 메뉴 하위가 가장 자연스럽다.

---

## 3. 화면 구성 (텍스트 목업)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🧠 운영학습 대시보드                               [기간: 최근 90일 ▼]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  [KPI 스트립 — Level 3 스탯카드 4개, 블루/그린/앰버/퍼플 틴트]            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │ 스냅샷   │ │ 평균     │ │ 추천     │ │ 적용     │                     │
│  │  42건   │ │ 정확도   │ │ 대기     │ │ 완료     │                     │
│  │          │ │  78%    │ │  5건    │ │  2건    │                     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                     │
│                                                                           │
├───────────────┬───────────────────────────────────┬─────────────────────┤
│ [좌 필터 L2]  │  [중앙 메인 카드 L4]              │ [우 상세 L4]        │
│               │                                    │                      │
│ ━━ 기간 ━━    │  ┌ 스냅샷 목록 ─────────────────┐ │ ┌ 비교 상세 ──────┐ │
│ □ 최근 30일  │  │ 견적번호 차량 예측  정확도  상태 │ │ 견적 Q-0042       │ │
│ □ 최근 90일  │  │ Q-0042  쏘렌토 89만 ✅82% OK │ │ 차량: 쏘렌토       │ │
│ ☑ 최근 180일 │  │ Q-0039  카니발 120만 ⚠️65% LO│ │ 계약 24개월        │ │
│               │  │ Q-0036  GV80  145만 ✅91% OK │ │                    │ │
│ ━━ 차종 ━━    │  │ ...                            │ │ ┌ 항목별 비교 ──┐ │ │
│ ☑ 전체       │  │              [실적입력] [자동집계]│ │ │감가  30→32 ↑7%│ │ │
│ □ 경형       │  └────────────────────────────────┘ │ │ │보험   5→6 ↑20%│ │ │
│ □ 중형       │                                     │ │ │정비  10→12↑20%│ │ │
│ ☑ 대형       │  ┌ 카테고리별 정확도 (SVG) ───────┐│ │ │세금   2→2  0% │ │ │
│               │  │ 감가   ████████░░  78%      │ │ │ │사고   1→2↑100%│ │ │
│ ━━ 계약 ━━    │  │ 보험   ██████░░░░  62%      │ │ │ └──────────────┘ │ │
│ ☑ 반환       │  │ 정비   █████████░  88%      │ │ │                    │ │
│ □ 인수       │  │ 세금   ██████████ 100%      │ │ │ 전체 정확도: 65%   │ │
│               │  │ 사고   ████░░░░░░  40%      │ │ │ ⚠️ 기준값 조정 권장 │ │
│               │  └────────────────────────────────┘ │ └────────────────┘ │
│               │                                     │                      │
│               │  ┌ BusinessRules 자동추천 ────────┐│                      │
│               │  │ DEP_YEAR_1   20%→22% [적용]  ││                      │
│               │  │ 이유: 평균 감가편차 +7%       ││                      │
│               │  │ 신뢰도: high (샘플 15건)      ││                      │
│               │  │                                ││                      │
│               │  │ INSURANCE_LOADING 15%→18% [적용] │                      │
│               │  │ ...                            ││                      │
│               │  └────────────────────────────────┘│                      │
└───────────────┴───────────────────────────────────┴─────────────────────┘
```

---

## 4. 데이터 흐름

```
 ①  견적 저장 시
    POST /api/quotes → Quote 저장 후
    POST /api/operational-learning/snapshots (hook)
      → calc_snapshots 테이블에 예측 breakdown 저장

 ②  실적 입력 (수동)
    사용자가 "실적입력" 모달에서 감가/보험/정비/세금/사고 입력
    POST /api/operational-learning/actuals
      → operational_actuals 테이블 저장 (source='manual')

 ③  자동 집계 (반자동)
    "자동집계" 버튼 클릭 시
    POST /api/operational-learning/auto-aggregate { snapshotId, months }
      → FmiPayment.payment_category='정비' 월별 합 → actual_maintenance
      → FmiAccident.estimated_repair_cost 월별 합 → actual_accident_cost
      → operational_actuals 저장 (source='auto_payment'/'auto_accident')

 ④  비교 분석 (스냅샷 단건)
    사용자가 스냅샷 행 클릭 시
    GET /api/operational-learning/analyze?snapshotId=xxx
      → calc_snapshots + operational_actuals 조인
      → analyzeActualVsPredicted(predicted, actuals) 호출
      → 우측 패널에 결과 렌더

 ⑤  BusinessRules 추천 (필터된 전체)
    필터 적용된 스냅샷 전체를 snapshots 배열로 로드
    POST /api/operational-learning/suggest-rules { filters }
      → 서버에서 calc_snapshots 쿼리 → CalcSnapshot[] 복원 → suggestBusinessRules() 호출
      → suggestions[] 반환 → 페이지 하단 추천 카드에 표시

 ⑥  추천 적용
    [적용] 버튼 클릭 시
    PATCH /api/business-rules/[id] { rule_value: suggested_value }
      → business_rules 테이블 업데이트
      → SimulationPanel/견적 엔진에 즉시 반영
```

---

## 5. DB 스키마 변경 (Migrator 단계에서 실행)

### 신규 테이블 2개 (Raw SQL, Prisma 스키마는 후속 추가)

```sql
-- 5.1 견적 스냅샷 (예측값 저장)
CREATE TABLE IF NOT EXISTS calc_snapshots (
  id CHAR(36) PRIMARY KEY,
  quote_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36),
  contract_id CHAR(36),
  snapshot_date DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- 입력 요약
  purchase_price BIGINT,
  term_months INT,
  contract_type VARCHAR(20),
  annual_mileage INT,
  loan_rate DECIMAL(5,2),
  vehicle_class VARCHAR(50),

  -- 예측 원가 breakdown (월 기준)
  predicted_depreciation BIGINT,
  predicted_insurance BIGINT,
  predicted_maintenance BIGINT,
  predicted_tax BIGINT,
  predicted_accident_cost BIGINT,
  predicted_overhead BIGINT,
  predicted_margin BIGINT,
  predicted_rent BIGINT,

  -- CalcResult 원본 JSON (재분석/감사추적용)
  result_json LONGTEXT,

  INDEX idx_quote (quote_id),
  INDEX idx_vehicle (vehicle_id),
  INDEX idx_contract (contract_id),
  INDEX idx_date (snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5.2 실적 기록 (실제 값)
CREATE TABLE IF NOT EXISTS operational_actuals (
  id CHAR(36) PRIMARY KEY,
  snapshot_id CHAR(36),
  contract_id CHAR(36),
  recorded_month VARCHAR(7),  -- "2026-04"

  actual_depreciation BIGINT,
  actual_insurance BIGINT,
  actual_maintenance BIGINT,
  actual_tax BIGINT,
  actual_accident_cost BIGINT,

  source VARCHAR(20) DEFAULT 'manual',  -- 'manual' | 'auto_payment' | 'auto_accident'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_snapshot (snapshot_id),
  INDEX idx_contract (contract_id),
  INDEX idx_month (recorded_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**안전성 판정: 🟢 Green** — 신규 테이블만 추가, 기존 데이터 무영향.

---

## 6. API 엔드포인트

| 메서드 | 경로 | 용도 |
|-------|------|------|
| POST | `/api/operational-learning/snapshots` | 스냅샷 생성 (Quote 저장 훅) |
| GET | `/api/operational-learning/snapshots` | 스냅샷 목록 (필터 지원) |
| POST | `/api/operational-learning/actuals` | 실적 수동 입력 |
| GET | `/api/operational-learning/actuals?snapshotId=` | 특정 스냅샷 실적 조회 |
| POST | `/api/operational-learning/auto-aggregate` | 자동 집계 (FmiPayment/Accident) |
| GET | `/api/operational-learning/analyze?snapshotId=` | 단건 비교 분석 |
| POST | `/api/operational-learning/suggest-rules` | 추천 생성 (필터된 전체 분석) |
| PATCH | `/api/business-rules/[id]` | 기존 API 재사용 — 추천값 적용 |

모두 `verifyUser()` 인증 필수, MySQL `$queryRaw` tagged template 사용, SQL injection 금지 규칙 준수.

---

## 7. 컴포넌트 구조

```
app/quotes/operational-learning/
├── page.tsx                     — 페이지 컨테이너 (SSR: 빈 상태, CSR로 데이터 로드)
├── FilterPanel.tsx              — 좌측 필터 (기간/차종/계약타입)
├── KpiStrip.tsx                 — 상단 KPI 4카드
├── SnapshotTable.tsx            — 스냅샷 목록 + 실적입력/자동집계 버튼
├── ActualInputModal.tsx         — 실적 수동 입력 모달
├── AccuracyChart.tsx            — 카테고리별 SVG 막대 차트
├── RuleSuggestionPanel.tsx      — 추천 리스트 + 적용 버튼
├── ComparisonDetail.tsx         — 우측 상세 비교 패널
└── OperationalLearningContext.tsx — 필터/선택상태 Context
```

차트는 **recharts 설치 없이 수동 SVG**로 구현 (의존성 최소화 + 스타일 자유도). 단순한 수평 막대라 SVG 30줄 이내.

---

## 8. Soft Ice 디자인 적용

| 영역 | Level | 색상 |
|------|-------|------|
| 상단 KPI 카드 (4개) | 3 | blue/green/amber/purple 틴트 |
| 좌측 필터 패널 | 2 | 서브 패널 |
| 중앙 스냅샷 테이블 | 4 | 데이터 컨테이너 |
| 중앙 차트 카드 | 3 | blue 틴트 |
| 중앙 추천 카드 | 3 | purple 틴트 (확장 기능 느낌) |
| 우측 상세 패널 | 4 | 데이터 컨테이너 |
| 실적 입력 인풋 | 1 | inset shadow (오목) |
| 실적 입력 모달 | 4 | 모달 기본 |
| 카드 제목 | 투톤 (CLAUDE.md 권장) | — |

---

## 9. 단계별 구현 순서 (Generator 작업)

1. **Migrator**: 테이블 2개 생성 (🟢 Green)
2. **엔진 헬퍼 추가**: `lib/rent-calc-engine.ts`에 `createSnapshotFromCalcResult(calcResult, input): CalcSnapshotRow` 함수 (타입 변환)
3. **API 라우트 8개** (`app/api/operational-learning/*`)
4. **Quote 저장 훅 연결**: 기존 `POST/PATCH /api/quotes` 성공 직후 snapshot 자동 생성
5. **Context + 페이지 껍데기** (`page.tsx` + `OperationalLearningContext.tsx`)
6. **FilterPanel / KpiStrip** (단순 UI)
7. **SnapshotTable** + 행 클릭 → 우측 상세 패널 업데이트
8. **ComparisonDetail** (analyze API 호출 + 결과 테이블)
9. **ActualInputModal** (수동 입력 + 저장)
10. **자동집계 로직** (FmiPayment/FmiAccident 월별 합)
11. **AccuracyChart** (SVG 수평 막대)
12. **RuleSuggestionPanel** + 적용 버튼 연결
13. **네비 링크 추가** (영업·견적 메뉴 하위)

---

## 10. Must-have vs Nice-to-have

### Must-have (Phase 3.1 — 이번 범위)
- ✅ 스냅샷 자동 생성 (Quote 저장 시)
- ✅ 스냅샷 목록 + 필터
- ✅ 실적 수동 입력
- ✅ 단건 비교 분석 (analyzeActualVsPredicted)
- ✅ BusinessRules 추천 (suggestBusinessRules)
- ✅ 추천 적용 (PATCH business-rules)
- ✅ 카테고리별 정확도 차트 (SVG)
- ✅ Soft Ice 디자인

### Nice-to-have (Phase 3.2 — 후속)
- ⏩ FmiPayment/FmiAccident 자동 집계 (현재는 수동 우선)
- ⏩ 월별 정확도 시계열 차트
- ⏩ 리포트 PDF/Excel 다운로드
- ⏩ cron 자동 집계 (매월 1일)

**결정**: Phase 3.1에서 자동 집계 API만 스켈레톤(엔드포인트+기본 로직)으로 두고, 실제 FmiPayment 집계 쿼리는 Phase 3.2로 미룬다. 이번에는 수동 입력 중심으로 동작 완성도 확보.

---

## 11. 리스크 및 완화 방안

| 리스크 | 완화 |
|--------|------|
| 초기 데이터 부족 (< 5건) | 추천 카드에 "분석을 위해 최소 5건 필요" 메시지 + 샘플 가이드 |
| Quote.quote_detail에 CalcResult 없는 과거 견적 | 재계산 불가 안내, 이후 견적부터 스냅샷 기록 |
| BigInt 직렬화 (MySQL BIGINT → JSON) | `Number()` 캐스팅, null 체크 |
| 0 분모 / null | `predicted > 0 ? ... : 0` 조건 철저 |
| SQL injection | 전 구간 tagged template 사용 |

---

## 12. 예상 공수

- Migrator + API 8개: 1.5일
- Context + 페이지 + 6개 컴포넌트: 2.5일
- 자동집계 스켈레톤 + 차트: 0.5일
- Review/Design/Evaluate/Deploy: 0.5일
- **총합 약 5영업일 (1주)**

---

## 13. 사용자 확인 사항 — ✅ 2026-04-18 확정

1. **페이지 경로**: ✅ A안 `/quotes/operational-learning` 확정
2. **Phase 3.1 범위**: ✅ **자동집계까지 이번에 완전 구현** (FmiPayment/FmiAccident 쿼리 포함)
3. **실적 입력 단위**: ✅ **월별 다건 입력** → `operational_actuals`에 `(snapshot_id, recorded_month) UNIQUE` 제약

### 범위 변경에 따른 조정
- Must-have에 "FmiPayment/FmiAccident 자동 집계 쿼리" 편입
- 실적 입력 모달은 월별 그리드(스냅샷의 계약 기간 N개월을 행으로 표시)
- 예상 공수: 1주 → **1.5~2주**
- 감사 추적용 `rule_suggestion_logs` 테이블 추가 (3번째 테이블)
