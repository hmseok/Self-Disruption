# CHANGELOG — RideSettlements (라이드 정산서)

> 매 PR 종료 시 한 줄 이상 기록 (CLAUDE.md 규칙 22).

---

## 2026-05-11 | PR-6.11.d | 정산서 → 카페24 enrichment → 차량 자동 등록

### 사용자 요청
> "정산서 기준으로 카페24데이터를 연동하여 최종 고객사등록차량에 적용이되어야함"

### 의도
정산서 = 운영 진실의 source. settlement_items 에 있는 차량 중 ride_contracts 미등록인
차량을 자동 식별 → 카페24 pmccarsm 데이터로 enrichment → 위탁사(customer_id) 기준으로
ride_contracts 일괄 INSERT.

### 변경
- **NEW** `app/api/ride-settlements/[id]/extract-vehicles/route.ts`
  - **GET**: settlement_items (car_number) → ride_contracts WHERE IN 으로 중복 체크 →
    미등록 후보 + 카페24 pmccarsm enrichment (carsidno/carsodnm/carsusnm)
  - **POST**: 선택한 item_ids 일괄 INSERT IGNORE 로 ride_contracts 등록
    (customer_id = settlement.customer_id, status = exec_status 기반 자동 판정)
- **수정** `app/(employees)/RideSettlements/page.tsx` SettlementDetailDrawer
  - 새 패널 "📋 정산서 → 차량 등록" — [📋 미등록 분석] 버튼 → 체크박스 리스트 →
    [✓ N건 등록] 버튼
  - 카페24 매칭 표시 (✓ 인디케이터)
  - 등록 완료 후 자동 재분석 (남은 미등록 목록 갱신)

### Soft Ice Glass 토큰 준수
기존 `'rgba(255,255,255,0.5)'` 하드코드 7곳 → `GLASS.L2.background` 토큰 적용
(ui-token-lint new violations 0)

### 영향 받는 테이블
- `ride_contracts` — INSERT (UNIQUE: exec_no) — settlement.customer_id 으로 위탁사 자동 매핑

### Verification
- tsc --noEmit: 본 PR 무관 (quotes/pricing pre-existing only)
- lint:harness: 새 critical 위반 0건

---

## 2026-05-08 | PR-6.11.a | 정산서 등록 + 검수 + 양식 4종 자동 감지 + multi-sheet split

### 사용자 요청
> "관리자운영 하위에 정산서등록 페이지를 만들겠습니다.
>  이페이지는 정산기준으로 데이터가 나오나 해당정산포함 기준으로 실제 우리가 종료되고
>  진행중인 차량을 명확히 할수있음으로 또 정산이 맞는지도 검수가 필요하고
>  그리고 이걸가지고 추가로 해당차량의 데이터를 카페24데이터와 매칭하고
>  우리가 기존에 등록하지못한 고객사 데이터도 만들어줄수있습니다."

### 도메인 운영 사실 (Rule 25)

```
정산서 = 운영 진실의 source
  · 정산 포함 = 진행 중 / 미포함 = 종료
  · 라이드 측 검수 확정/이의제기 워크플로우
  · 차량/실행번호 → 카페24 매칭 (PR-6.11.b 예정)
  · 미등록 고객사 후보 자동 추출 (PR-6.11.d 예정)

위탁사 (9개):
  · iM캐피탈        (daily — 매일 보고)
  · 메리츠캐피탈    (monthly 3-5회)
  · MG캐피탈        (monthly 3-5회 — 통합 위탁사 차주 별도)
  · 우리금융캐피탈  (월 마감 — 라이드 통합 보고 메인)
  · JB우리캐피탈
  · BNK캐피탈
  · 퍼시픽렌터카
  · 케이카
  · 삼성카드
```

### 양식 자동 감지 (4종)

| 시그니처 | 라벨 | 위탁사 |
|---------|------|--------|
| "정비비 정산 대상 리스트" + 정비코드(Platinum) + 마감사유 | meritz | 메리츠캐피탈 |
| "마감자료" + Self/Premium/Select + 시리즈 | im | iM캐피탈 |
| "총합/턴키/실비(콜센터)/차량 운행 여부" + 임차인명 | mg | MG캐피탈 |
| **"구분표" + 다중 위탁사 시트 (multi-split)** | ride-integrated | 통합 (parent + N children) |

**multi-sheet split**: ride-integrated 양식 1 파일 → parent 1 + children N 자동 생성. 시트명으로 자녀 위탁사 자동 매칭.

### 데이터 모델 (4 테이블)

```sql
ride_settlements                       -- 정산서 메타 (parent/child/single)
  id, customer_id, customer_name_snap, parent_settlement_id,
  layout_type, layout_signature, category,
  source_file, sheet_name,
  period_label, period_start, period_end,
  item_count, total_supply, total_vat, total_amount,
  status (pending/reviewing/confirmed/disputed),
  reviewed_by, reviewed_at, dispute_reason, raw_summary JSON, ...

ride_settlement_items                  -- 차량별 row + category
  id, settlement_id, layout_type, category,
  exec_no, car_number, car_model, vin,
  cust_name, sub_customer, product_name,
  base_fee, additional_fee, supply, vat, total, payment, fee_breakdown JSON,
  exec_date, loan_end_date, closing_date, termination_date,
  exec_status, exec_reason, closing_reason,
  installment_no/total/remaining,
  matched_cafe24_idno, matched_contract_id, matched_report_id,
  match_status, match_score, match_notes,
  raw_extra JSON, ...

ride_settlement_vehicle_status         -- 차량 운행 진실 source
  id, settlement_id, car_number, status (정상/마감/...)

ride_settlement_customer_candidates    -- 미등록 고객 후보 (승인 대기)
  id, settlement_id, candidate_name, candidate_type,
  status (pending/approved/rejected), promoted_to_company_id, ...
```

### API (5개)

```
GET    /api/ride-settlements                       list (filter customer/status/period/parent_only)
POST   /api/ride-settlements                       수기 신규
GET    /api/ride-settlements/[id]                  상세 + children
PATCH  /api/ride-settlements/[id]                  검수 상태 / 메타 수정 (audit log)
DELETE /api/ride-settlements/[id]                  cascade (children + items + vehicle_status)
GET    /api/ride-settlements/[id]/items            row 목록 (filter q/match/category/car)
POST   /api/ride-settlements/upload                양식 4종 자동 감지 + multi-sheet split
```

### UI (`/RideSettlements`)

```
┌─ 헤더 (Glass L5) ─ 💰 라이드 정산서 + [📥 정산서 업로드]
├─ 필터: 위탁사 select / 상태 select / 기간 input
├─ NeuDataTable (parent_only)
│   기간 / 위탁사 / 양식 / 카테고리 / 건수 / 합계 / 상태 / 검수일 / 상세
└─ 상세 drawer (우측 슬라이드 800px)
   · 검수 액션 (검수시작 / 확정 / 이의제기 + 사유)
   · 자녀 정산서 목록 (parent 인 경우)
   · 정산 내역 (items, 차량별)
```

### 산출물

| 파일 | 종류 |
|------|------|
| `migrations/2026-05-08_ride_settlements.sql` | 신규 (4 테이블 + 시드 6 위탁사) |
| `app/api/ride-settlements/route.ts` | 신규 (GET/POST) |
| `app/api/ride-settlements/[id]/route.ts` | 신규 (GET/PATCH/DELETE + audit log) |
| `app/api/ride-settlements/[id]/items/route.ts` | 신규 (GET) |
| `app/api/ride-settlements/upload/route.ts` | 신규 (양식 4종 자동 감지 + multi-split) |
| `app/(employees)/RideSettlements/page.tsx` | 신규 (목록 + 업로드 모달 + 상세 drawer) |
| `lib/menu-registry.ts` | 갱신 (mod-ride-settlements admin-ops sortOrder 82) |

### 사이드바
- **Employee of Ride Inc. > 관리자 운영 > 💰 라이드 정산서** (sortOrder 82)

### 마이그레이션 적용 의무

```
사용자 액션 (Cloud SQL 직접 실행):
  mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-08_ride_settlements.sql

검증:
  SELECT COUNT(*) FROM ride_customer_companies;          -- 9 (기존 3 + 신규 6)
  SELECT name FROM ride_customer_companies ORDER BY name;
  SELECT COUNT(*) FROM ride_settlements;                 -- 0 (신규)
```

### 다음 PR 예고

- **PR-6.11.b** — 자동 매칭 (차량번호/실행번호 → 카페24 pmccarsm + 자체 contracts/reports + match_score)
- **PR-6.11.c** — 정산 검수 강화 (활성/종료 자동 판정 + 합계 검증 + 의심 row hilight)
- **PR-6.11.d** — 미등록 고객 후보 추출 + 승인 → ride_customer_companies 자동 등록
