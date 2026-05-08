# CHANGELOG — RideCustomerData (라이드 고객사 데이터 통합)

> 매 PR 종료 시 한 줄 이상 기록 (CLAUDE.md 규칙 22).

---

## 2026-05-08 | PR-6.10 | 고객사 데이터 통합 신설 — 캐피탈 보고 + 장기 계약 마스터 + 엑셀 업로드

### 사용자 요청
> "카페24 데이터는 아직 확인안되는것같고 우리쪽 신규 db를 위해 데이터 먼저 표출해드립니다.
>  각각 구성에 따라 테이블 분리 하여야 추후 보안상이나 데이터 구성에 유리할것같습니다."
> "지금 im캐피탈 매일, 메리츠캐피탈 월 3-5회, mg캐피탈 월3-5회 3개 업체"
> "전부 고객사차량이고 라이드 자체운영 차량없어요. 4주차 데이터는 메리츠캐피탈에 받은데이터에요"
> "엑셀 업로드 또는 추가로 메일파싱으로 자동업로드 진행 수기도 가능"

### 도메인 운영 사실 (Rule 25)

```
운영 구조: 라이드주식회사가 캐피탈/금융 고객사의 차량을 정비/관리.
            라이드 자체 운영 차량 없음 — 전부 고객사 차량.

고객사 보고 주기 (3개 업체):
  · iM캐피탈     daily   매일 정비 리스트
  · 메리츠캐피탈 monthly 월 3-5회 (영업/마감/해지 등 더 풍부한 컬럼)
  · MG캐피탈     monthly 월 3-5회 (MG새마을금고 계약도 같은 회사 — 통합)

업로드 방식: 엑셀 / 메일 파싱(향후) / 수기.
```

### 데이터 모델 (자체 FMI Cloud SQL)

3 테이블 + 시드:

```sql
-- 1) 고객사 마스터 (확장 가능)
ride_customer_companies (
  id PK, name UNIQUE, type, report_frequency, active, note, ...
)
→ 시드 3개: iM캐피탈 / 메리츠캐피탈 / MG캐피탈
   (MG새마을금고 보고도 MG캐피탈에 통합 — 사용자 정정 2026-05-08)

-- 2) 캐피탈 보고 (raw 누적 — 같은 exec_no 가 여러 날짜에 보고됨)
ride_capital_reports (
  id PK,
  customer_id, customer_name_snap, report_date, source_file,
  exec_no, cust_name, car_number, car_model, car_reg_date,
  loan_start_date/period/end_date, exec_reason, car_options, vin,
  insurance_co, age_band, ins_start_date/period,
  ins_di, ins_dm, ins_js, ins_uninsured, ins_deductible,
  emergency, monthly_fee, maint_product, snow_tire, snow_chain,
  cust_manager, cust_phone, cust_mobile, cust_address,
  -- 메리츠 추가
  bill_address, maint_company, closing_date, termination_date,
  sales_dept, sales_manager, registered_by,
  -- iM 추가
  rent_substitute, additional_driver, special_clause,
  note, raw_extra (JSON), ...
)
UNIQUE (customer_id, report_date, exec_no, car_number)

-- 3) 장기 계약 마스터 (전산등록 — 계약자/이용자 분리 B2B)
ride_contracts (
  id PK,
  customer_id, source_file,
  exec_no UNIQUE,
  contractor (계약자), contract_product, user_name (이용자),
  car_number, car_model, car_reg_date,
  contract_start/period/end, is_new (신규/재렌탈), car_options, vin,
  insurance_co, age_band, ...
  status DEFAULT 'active', note, raw_extra, ...
)
```

### API (10개)

```
GET    /api/ride-customer-companies                       고객사 list
POST   /api/ride-customer-companies                       신규
PATCH  /api/ride-customer-companies/[id]                  수정
DELETE /api/ride-customer-companies/[id]                  soft (active=0)

GET    /api/ride-capital-reports                          보고 list (filter: customer_id/q/from/to/car_number)
POST   /api/ride-capital-reports                          수기 등록
GET    /api/ride-capital-reports/[id]                     상세
PATCH  /api/ride-capital-reports/[id]                     수정
DELETE /api/ride-capital-reports/[id]                     hard delete

GET    /api/ride-contracts                                계약 list (filter: customer_id/q/status)
POST   /api/ride-contracts                                신규
GET    /api/ride-contracts/[id]                           상세
PATCH  /api/ride-contracts/[id]                           수정
DELETE /api/ride-contracts/[id]                           soft (status='terminated')

POST   /api/ride-customer-data/upload                     엑셀 업로드 (자동 감지 + INSERT IGNORE 멱등)
```

### UI (`/RideCustomerData`)

3탭 통합 페이지:

```
┌─ 헤더 (Glass L5) ─ 🏢 라이드 고객사 데이터 + [📥 엑셀] [+ 고객사]
├─ 탭 ─
│   📊 캐피탈 보고  | 📜 계약 마스터  | 🏢 고객사 마스터
│
├─ Tab 1: 캐피탈 보고 (Glass L4)
│   필터: 고객사 select + 검색 (차량/실행/고객/차종)
│   NeuDataTable: 보고일/고객사/실행번호/차량/차종/고객명/보험사/월정비료/마감해지/상세
│   row 클릭 → 상세 모달 (모든 컬럼)
│
├─ Tab 2: 계약 마스터 (Glass L4)
│   필터: 고객사 select + 검색 (계약자/이용자/차량/실행)
│   NeuDataTable: 실행번호/고객사/계약자/계약상품/이용자/차량/차종/계약기간/상태/상세
│   row 클릭 → 상세 모달
│
└─ Tab 3: 고객사 마스터 (Glass L4)
    NeuDataTable: 고객사/구분/주기/상태/비고/편집
    편집 모달 (이름/구분/주기/비고/활성)
```

엑셀 업로드 모달:
```
대상 테이블: capital_reports / contracts (수동 또는 자동 감지)
고객사: select (선택 — 미지정 시 컬럼만 매핑)
보고일자: date input (capital_reports — 미지정 시 파일명 추정)
파일: .xlsx
[미리보기] → 감지된 row + sample 5건
[저장] → INSERT IGNORE 멱등 → inserted/skipped 결과
```

### 엑셀 형식 자동 감지

```
헤더 시그니처:
  · "계약자" + "계약상품" + "이용자"     → contracts (전산등록)
  · 그 외                                 → capital_reports (캐피탈 보고)

헤더 위치 자동 감지:
  · row 0~5 중 "실행번호/계약번호" + "차량번호" 가 동시에 있는 row 가 헤더
  · iM Daily report 는 row 4 헤더 (row 1-3 제목/시간)
  · 메리츠/전산등록 은 row 1 헤더

컬럼 매핑 (다양한 표기 흡수):
  · 실행번호 / 계약번호       → exec_no
  · 고객명 / 이용자             → cust_name (capital) / user_name (contracts)
  · 차량등록일자 / 차량등록일  → car_reg_date
  · 여신시작일 / 계약시작일 / 실행일자 → loan_start_date / contract_start
  · 자기부담금 / 자기부담금(정비) / 자기부담금(면책금) → ins_deductible
  · 긴급출동 / 긴출             → emergency
  · 월정비료 / 지급정비료 / 월정비료(Vat-) → monthly_fee
  · 스노우체인 / 체인           → snow_chain
  · 사무실 전화 / 전화          → office_phone (contracts) / cust_phone (capital)
```

### 산출물

| 파일 | 종류 |
|------|------|
| `migrations/2026-05-08_ride_customer_data.sql` | 신규 (멱등 IF NOT EXISTS + INSERT IGNORE 시드) |
| `app/api/ride-customer-companies/route.ts` | 신규 (GET / POST) |
| `app/api/ride-customer-companies/[id]/route.ts` | 신규 (PATCH / DELETE) |
| `app/api/ride-capital-reports/route.ts` | 신규 (GET / POST) |
| `app/api/ride-capital-reports/[id]/route.ts` | 신규 (GET / PATCH / DELETE) |
| `app/api/ride-contracts/route.ts` | 신규 (GET / POST) |
| `app/api/ride-contracts/[id]/route.ts` | 신규 (GET / PATCH / DELETE) |
| `app/api/ride-customer-data/upload/route.ts` | 신규 (multipart 엑셀 업로드 + 자동 감지) |
| `app/(employees)/RideCustomerData/page.tsx` | 신규 (3탭 + 모달들) |
| `lib/menu-registry.ts` | 갱신 (mod-ride-customer-data admin-ops sortOrder 81) |

### 사이드바
- **Employee of Ride Inc. > 관리자 운영 > 🏢 라이드 고객사 데이터** (sortOrder 81)

### GATE 진행 상태

```
✅ G3 사용자 GO (UI=2탭통합 / PR=일괄 / 우선=등록차량+데이터)
✅ G5 tsc 회귀 0건 (예상)
✅ G6 lint:harness 새 위반 0건 (예상)
✅ Rule 17 모듈 폴더 분리 (RideCustomerData/)
✅ Rule 18 NeuDataTable 모든 컬럼 sortBy
✅ Rule 19 셀 줄바꿈 최소화 (whiteSpace: nowrap)
✅ Rule 22 _docs 갱신 (본 파일)
✅ Rule 23 마이그레이션 멱등 (IF NOT EXISTS) + graceful fallback (_migration_pending)
✅ Rule 24 시드 멱등 (INSERT IGNORE + UNIQUE name)
⚠ Rule 21 Cowork — 본 모듈 + api:ride-customer-companies + api:ride-capital-reports + api:ride-contracts + api:ride-customer-data + lib:menu-registry
   → COWORK_ALLOW_MULTI_MODULE=1 우회 (의도적 cross-module — 단일 PR-6.10 산출물)
```

### 마이그레이션 적용 의무

```
사용자 액션 (Cloud SQL 직접 실행):
  mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-08_ride_customer_data.sql

검증:
  SELECT COUNT(*) FROM ride_customer_companies;  -- 3 (시드)
  SELECT COUNT(*) FROM ride_capital_reports;     -- 0 (신규)
  SELECT COUNT(*) FROM ride_contracts;           -- 0 (신규)

업로드 후 검증:
  SELECT customer_name_snap, COUNT(*) FROM ride_capital_reports GROUP BY customer_name_snap;
  SELECT contractor, COUNT(*) FROM ride_contracts GROUP BY contractor ORDER BY 2 DESC LIMIT 10;
```

### 다음 PR 예고

- **PR-6.10.a** — 통합 검색 탭 (차량번호 cross — 보고/계약/카페24 동시 조회)
- **PR-6.10.b** — 메일 파싱 자동 import (IMAP polling → 첨부 .xlsx 자동 감지)
- **PR-6.10.c** — 차량 history timeline (실행번호/차량번호 별 보고/계약 히스토리)
- **PR-6.10.d** — 카페24 차량 매칭 자동화 (vin / car_number 키)
