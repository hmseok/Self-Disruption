# Lint 위반 자동 기록

> harness-lint.js 가 commit 시점에 자동으로 append.
> 누적 위반 패턴을 분석해 시스템 차원 개선 방향 제시.


## 2026-05-01 23:42:00
- sql-lint: total=39, new=39, known=0
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/admin-invite/route.ts:25` pc.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/admin-invite/route.ts:25` pu.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/assignments/route.ts:41` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/assignments/route.ts:80` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/assignments/route.ts:124` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/assignments/route.ts:124` ap.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/contracts/send-email/route.ts:282` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/contracts/status/route.ts:117` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.vehicle_class (table `cars` 에 `vehicle_class` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.fuel_type (table `cars` 에 `fuel_type` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.vehicle_class (table `cars` 에 `vehicle_class` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.fuel_type (table `cars` 에 `fuel_type` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.vehicle_class (table `cars` 에 `vehicle_class` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.fuel_type (table `cars` 에 `fuel_type` 없음)
    - `app/api/finance/mappings/route.ts:27` c.card_issuer (table `corporate_cards` 에 `card_issuer` 없음)
    - `app/api/finance/mappings/route.ts:27` c.card_type (table `corporate_cards` 에 `card_type` 없음)
    - `app/api/finance/mappings/route.ts:27` c.card_holder_type (table `corporate_cards` 에 `card_holder_type` 없음)
    - `app/api/finance/mappings/route.ts:27` c.valid_thru (table `corporate_cards` 에 `valid_thru` 없음)
    - `app/api/finance/mappings/route.ts:27` c.issued_at (table `corporate_cards` 에 `issued_at` 없음)
    - `app/api/finance/mappings/route.ts:27` c.expires_at (table `corporate_cards` 에 `expires_at` 없음)
    - `app/api/finance/mappings/route.ts:27` c.payment_bank (table `corporate_cards` 에 `payment_bank` 없음)
    - `app/api/finance/mappings/route.ts:27` c.payment_account (table `corporate_cards` 에 `payment_account` 없음)
    - `app/api/finance/mappings/route.ts:27` c.payment_day (table `corporate_cards` 에 `payment_day` 없음)
    - `app/api/finance/mappings/route.ts:27` c.monthly_limit (table `corporate_cards` 에 `monthly_limit` 없음)
    - `app/api/finance/mappings/route.ts:27` c.previous_card_number (table `corporate_cards` 에 `previous_card_number` 없음)
    - `app/api/finance/mappings/route.ts:27` c.department (table `corporate_cards` 에 `department` 없음)
    - `app/api/finance/mappings/route.ts:27` c.memo (table `corporate_cards` 에 `memo` 없음)
    - `app/api/finance/transactions/list/route.ts:55` t.bank_name (table `transactions` 에 `bank_name` 없음)
    - `app/api/finance/transactions/list/route.ts:55` t.card_company (table `transactions` 에 `card_company` 없음)
    - `app/api/lib/assignment-engine.ts:186` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/lib/assignment-engine.ts:333` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/lib/assignment-engine.ts:446` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/operations/fleet/route.ts:51` c.location (table `cars` 에 `location` 없음)
    - `app/api/operations/fleet/route.ts:51` c.mileage (table `cars` 에 `mileage` 없음)
    - `app/api/payroll/[id]/route.ts:52` pr.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/payroll/route.ts:46` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/profiles/route.ts:35` p.position_id (table `profiles` 에 `position_id` 없음)
    - `app/api/profiles/route.ts:35` p.department_id (table `profiles` 에 `department_id` 없음)
    - `app/api/profiles/route.ts:35` p.employee_name (table `profiles` 에 `employee_name` 없음)

## 2026-05-01 23:42:18
- sql-lint: total=39, new=39, known=0
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/admin-invite/route.ts:25` pc.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/admin-invite/route.ts:25` pu.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/assignments/route.ts:41` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/assignments/route.ts:80` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/assignments/route.ts:124` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/assignments/route.ts:124` ap.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/contracts/send-email/route.ts:282` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/contracts/status/route.ts:117` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.vehicle_class (table `cars` 에 `vehicle_class` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.fuel_type (table `cars` 에 `fuel_type` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.vehicle_class (table `cars` 에 `vehicle_class` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.fuel_type (table `cars` 에 `fuel_type` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.vehicle_class (table `cars` 에 `vehicle_class` 없음)
    - `app/api/cost-standards/rollup/route.ts:55` cars.fuel_type (table `cars` 에 `fuel_type` 없음)
    - `app/api/finance/mappings/route.ts:27` c.card_issuer (table `corporate_cards` 에 `card_issuer` 없음)
    - `app/api/finance/mappings/route.ts:27` c.card_type (table `corporate_cards` 에 `card_type` 없음)
    - `app/api/finance/mappings/route.ts:27` c.card_holder_type (table `corporate_cards` 에 `card_holder_type` 없음)
    - `app/api/finance/mappings/route.ts:27` c.valid_thru (table `corporate_cards` 에 `valid_thru` 없음)
    - `app/api/finance/mappings/route.ts:27` c.issued_at (table `corporate_cards` 에 `issued_at` 없음)
    - `app/api/finance/mappings/route.ts:27` c.expires_at (table `corporate_cards` 에 `expires_at` 없음)
    - `app/api/finance/mappings/route.ts:27` c.payment_bank (table `corporate_cards` 에 `payment_bank` 없음)
    - `app/api/finance/mappings/route.ts:27` c.payment_account (table `corporate_cards` 에 `payment_account` 없음)
    - `app/api/finance/mappings/route.ts:27` c.payment_day (table `corporate_cards` 에 `payment_day` 없음)
    - `app/api/finance/mappings/route.ts:27` c.monthly_limit (table `corporate_cards` 에 `monthly_limit` 없음)
    - `app/api/finance/mappings/route.ts:27` c.previous_card_number (table `corporate_cards` 에 `previous_card_number` 없음)
    - `app/api/finance/mappings/route.ts:27` c.department (table `corporate_cards` 에 `department` 없음)
    - `app/api/finance/mappings/route.ts:27` c.memo (table `corporate_cards` 에 `memo` 없음)
    - `app/api/finance/transactions/list/route.ts:55` t.bank_name (table `transactions` 에 `bank_name` 없음)
    - `app/api/finance/transactions/list/route.ts:55` t.card_company (table `transactions` 에 `card_company` 없음)
    - `app/api/lib/assignment-engine.ts:186` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/lib/assignment-engine.ts:333` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/lib/assignment-engine.ts:446` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/operations/fleet/route.ts:51` c.location (table `cars` 에 `location` 없음)
    - `app/api/operations/fleet/route.ts:51` c.mileage (table `cars` 에 `mileage` 없음)
    - `app/api/payroll/[id]/route.ts:52` pr.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/payroll/route.ts:46` p.employee_name (table `profiles` 에 `employee_name` 없음)
    - `app/api/profiles/route.ts:35` p.position_id (table `profiles` 에 `position_id` 없음)
    - `app/api/profiles/route.ts:35` p.department_id (table `profiles` 에 `department_id` 없음)
    - `app/api/profiles/route.ts:35` p.employee_name (table `profiles` 에 `employee_name` 없음)

## 2026-05-01 23:42:30
- sql-lint: total=39, new=0, known=39
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-01 23:44:47
- sql-lint: total=40, new=1, known=39
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/_test-violation.ts:3` p.nonexistent_column (table `profiles` 에 `nonexistent_column` 없음)

## 2026-05-01 23:45:06
- sql-lint: total=39, new=0, known=39
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-01 23:49:22
- sql-lint: total=39, new=0, known=39
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 00:08:23
- sql-lint: total=42, new=3, known=39
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/admin/card-match-diag/route.ts:75` cc.previous_card_number (table `corporate_cards` 에 `previous_card_number` 없음)
    - `app/api/admin/card-match-diag/route.ts:75` cc.department (table `corporate_cards` 에 `department` 없음)
    - `app/api/admin/card-match-diag/route.ts:75` cc.card_type (table `corporate_cards` 에 `card_type` 없음)

## 2026-05-02 00:08:36
- sql-lint: total=42, new=3, known=39
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/admin/card-match-diag/route.ts:75` cc.previous_card_number (table `corporate_cards` 에 `previous_card_number` 없음)
    - `app/api/admin/card-match-diag/route.ts:75` cc.department (table `corporate_cards` 에 `department` 없음)
    - `app/api/admin/card-match-diag/route.ts:75` cc.card_type (table `corporate_cards` 에 `card_type` 없음)

## 2026-05-02 00:08:59
- sql-lint: total=42, new=3, known=39
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/admin/card-match-diag/route.ts:75` cc.previous_card_number (table `corporate_cards` 에 `previous_card_number` 없음)
    - `app/api/admin/card-match-diag/route.ts:75` cc.department (table `corporate_cards` 에 `department` 없음)
    - `app/api/admin/card-match-diag/route.ts:75` cc.card_type (table `corporate_cards` 에 `card_type` 없음)

## 2026-05-02 00:09:09
- sql-lint: total=42, new=0, known=42
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 00:49:52
- sql-lint: total=42, new=0, known=42
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 01:00:32
- sql-lint: total=43, new=1, known=42
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/auto-classify/dry-run/route.ts:93` t.card_company (table `transactions` 에 `card_company` 없음)

## 2026-05-02 01:01:38
- sql-lint: total=43, new=1, known=42
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/auto-classify/dry-run/route.ts:93` t.card_company (table `transactions` 에 `card_company` 없음)

## 2026-05-02 01:01:59
- sql-lint: total=43, new=1, known=42
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/auto-classify/dry-run/route.ts:93` t.card_company (table `transactions` 에 `card_company` 없음)

## 2026-05-02 01:02:08
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 01:05:30
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 01:10:18
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 01:13:38
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 01:31:55
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 01:48:52
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
