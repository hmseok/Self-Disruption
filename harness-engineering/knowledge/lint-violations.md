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

## 2026-05-02 01:59:30
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 02:11:06
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 02:15:02
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 02:26:46
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 02:39:00
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 02:46:07
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 02:51:28
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 03:07:21
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 03:18:58
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 03:24:00
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 03:26:38
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 03:46:30
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 04:09:24
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 04:21:34
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 04:24:14
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 04:46:04
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 04:47:43
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 04:48:13
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 05:13:57
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 05:26:04
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 05:42:26
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 06:00:07
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 06:15:26
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 06:23:16
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 06:38:43
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 06:46:38
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 07:21:31
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 07:36:02
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 07:44:50
- sql-lint: total=43, new=0, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 23:41:52
- sql-lint: total=54, new=11, known=43
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32
  - **새 SQL 컬럼 위반**:
    - `app/api/auth/signup/route.ts:31` used_at (unprefixed) (table `member_invitations` 에 `used_at` 없음)
    - `app/api/codes/route.ts:56` group_code (unprefixed) (table `common_codes` 에 `group_code` 없음)
    - `app/api/finance/classify/route.ts:1004` deleted_at (unprefixed) (table `classification_queue` 에 `deleted_at` 없음)
    - `app/api/finance/classify/route.ts:1010` deleted_at (unprefixed) (table `classification_queue` 에 `deleted_at` 없음)
    - `app/api/finance/classify/route.ts:1211` deleted_at (unprefixed) (table `classification_queue` 에 `deleted_at` 없음)
    - `app/api/payroll/generate/route.ts:122` transaction_date (unprefixed) (table `classification_queue` 에 `transaction_date` 없음)
    - `app/api/payroll/meal-expenses/route.ts:38` is_active (unprefixed) (table `corporate_cards` 에 `is_active` 없음)
    - `app/api/payroll/meal-expenses/route.ts:121` is_active (unprefixed) (table `corporate_cards` 에 `is_active` 없음)
    - `app/api/upload-business-doc/route.ts:58` business_doc_url (unprefixed) (table `profiles` 에 `business_doc_url` 없음)
    - `app/api/vehicle-market-prices/route.ts:72` ownership_type (unprefixed) (table `cars` 에 `ownership_type` 없음)
    - `app/api/vehicle-market-prices/route.ts:72` purchase_price (unprefixed) (table `cars` 에 `purchase_price` 없음)

## 2026-05-02 23:42:06
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-02 23:51:29
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 00:56:22
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 01:33:46
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 01:46:11
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 02:00:11
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 02:03:10
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 02:28:05
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 02:39:22
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 02:49:41
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 03:07:01
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 03:08:35
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 03:53:46
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 03:58:54
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 04:18:15
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 04:39:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 04:49:15
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 05:08:19
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 05:32:58
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 05:44:35
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 05:47:34
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=32

## 2026-05-03 06:08:53
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 06:10:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 06:13:09
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 06:50:58
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 06:51:11
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:04:58
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:11:51
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:16:34
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:21:51
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:30:44
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:44:04
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:46:53
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:55:09
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/call-scheduler/shift-slots/[id]/route.ts:87` is_active (unprefixed) (table `cs_assignments` 에 `is_active` 없음)

## 2026-05-03 07:55:30
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/call-scheduler/shift-slots/[id]/route.ts:87` is_active (unprefixed) (table `cs_assignments` 에 `is_active` 없음)

## 2026-05-03 07:56:04
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 07:56:13
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-03 08:03:28
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 01:02:11
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 01:09:30
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 01:18:44
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 01:40:07
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:21:03
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:29:29
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:32:41
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:38:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:39:21
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:40:19
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:45:30
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:46:33
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 02:55:57
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 03:10:20
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 03:54:45
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 04:01:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 04:10:25
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 04:13:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 04:15:24
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 04:25:44
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 04:29:26
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 04:37:18
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 04:41:18
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 05:38:25
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 05:39:21
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 05:44:04
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 05:45:06
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 05:45:27
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 05:46:11
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 05:48:32
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 06:02:38
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 06:33:12
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 06:38:29
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 06:39:27
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 06:46:40
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 06:46:50
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 06:56:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 06:57:56
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 07:01:00
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 07:04:29
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 07:22:44
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 07:38:26
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 08:05:35
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 08:08:03
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 08:46:33
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 09:06:34
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 09:14:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 09:22:21
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 11:36:01
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 11:44:15
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 11:48:58
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 11:52:41
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/auto-match-fmi-rental/route.ts:348` car_number (unprefixed) (table `cars` 에 `car_number` 없음)

## 2026-05-04 11:54:04
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/auto-match-fmi-rental/route.ts:348` car_number (unprefixed) (table `cars` 에 `car_number` 없음)

## 2026-05-04 11:54:55
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 11:58:30
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:08:35
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:10:35
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:10:49
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:14:35
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:15:15
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:34:08
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:34:31
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:36:20
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 12:52:14
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:01:15
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:04:44
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:09:05
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:19:22
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:25:07
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:25:48
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:26:22
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:29:15
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 13:37:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-04 14:04:17
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 01:57:05
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 07:19:24
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 07:25:19
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 07:26:06
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 07:36:20
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 07:43:07
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 08:03:10
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 08:08:08
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 08:37:48
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 08:54:47
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 09:08:13
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=33, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 09:21:03
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=45

## 2026-05-05 09:22:09
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=45

## 2026-05-05 09:22:24
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 09:22:52
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 09:34:02
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-05 09:48:19
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 00:56:48
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 01:49:07
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 01:51:33
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 02:18:26
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 03:01:08
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 04:24:43
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 04:55:00
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 05:22:33
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 05:30:10
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 05:31:41
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 05:34:26
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 06:14:51
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 07:09:49
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 09:40:36
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 09:44:56
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 09:51:58
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 10:00:24
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-06 10:06:11
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=32, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 00:23:07
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 00:29:13
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 00:54:58
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 02:08:44
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 02:27:28
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 04:46:48
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 04:49:22
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 05:44:30
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 05:56:43
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 06:01:09
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 06:06:40
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 06:42:04
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 06:52:39
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 07:16:02
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 07:19:23
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 07:27:11
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 07:48:49
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-08 09:34:40
- sql-lint: total=54, new=0, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-09 03:00:15
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/processing-status/route.ts:39` source (unprefixed) (table `transactions` 에 `source` 없음)

## 2026-05-09 03:08:34
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/processing-status/route.ts:39` source (unprefixed) (table `transactions` 에 `source` 없음)

## 2026-05-09 03:09:00
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/processing-status/route.ts:39` source (unprefixed) (table `transactions` 에 `source` 없음)

## 2026-05-09 03:09:42
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/processing-status/route.ts:39` source (unprefixed) (table `transactions` 에 `source` 없음)

## 2026-05-09 03:10:17
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/processing-status/route.ts:39` source (unprefixed) (table `transactions` 에 `source` 없음)

## 2026-05-09 03:12:19
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/processing-status/route.ts:39` source (unprefixed) (table `transactions` 에 `source` 없음)

## 2026-05-09 07:41:32
- sql-lint: total=55, new=1, known=54
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33
  - **새 SQL 컬럼 위반**:
    - `app/api/finance/transactions/processing-status/route.ts:39` source (unprefixed) (table `transactions` 에 `source` 없음)

## 2026-05-09 07:53:22
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-09 07:58:51
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-09 07:59:41
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-09 08:05:03
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-09 08:05:10
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=33

## 2026-05-09 08:09:34
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:10:56
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:12:57
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:13:43
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:14:28
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:30:42
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:35:16
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:39:41
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:41:55
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:45:29
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:46:52
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:50:40
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 08:51:03
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 08:51:34
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 08:51:34
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 08:51:57
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 09:03:56
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:05:32
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:05:50
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:05:56
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:06:21
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:06:25
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:06:44
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:09:33
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:15:07
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:23:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:24:43
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:31:39
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:33:36
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:33:59
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:34:47
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:35:20
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:36:01
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=35

## 2026-05-09 09:37:45
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 09:44:05
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 09:44:13
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 09:46:38
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 09:57:56
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 10:02:38
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 10:04:04
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 10:04:11
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 10:04:33
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 23:45:45
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-09 23:57:43
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 00:16:34
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 00:17:19
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 00:29:15
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 00:43:22
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 00:44:54
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 00:46:07
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 00:46:48
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:20:42
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:35:24
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:45:59
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:47:46
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:48:40
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:49:17
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:57:01
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:57:16
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 04:58:26
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:25:29
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:25:52
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:26:14
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:26:38
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:32:42
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:34:26
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:39:19
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:52:00
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:52:26
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-10 05:52:49
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 00:42:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 00:43:03
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 00:50:45
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 01:12:52
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 03:53:51
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 04:28:01
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 04:49:01
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 05:08:08
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 10:50:29
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 10:51:45
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 11:22:42
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 11:36:17
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 12:08:43
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 12:15:40
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 12:16:23
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 12:18:28
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 12:19:20
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 13:42:41
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 13:45:29
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 13:54:22
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=36

## 2026-05-11 13:57:59
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-11 13:58:22
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-11 13:59:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-11 13:59:59
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-11 14:00:27
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-11 14:01:52
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-11 14:05:11
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-11 14:06:11
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-12 02:01:31
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-12 02:01:57
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-12 02:02:05
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-12 02:04:13
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-12 02:26:02
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-12 02:27:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-12 02:28:48
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 00:36:57
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 00:37:28
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 07:13:07
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 07:13:37
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 08:26:48
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 08:27:09
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 08:27:53
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 08:27:55
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 08:28:31
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 08:29:42
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 08:31:11
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 08:33:05
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-13 09:06:47
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:06:51
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:07:15
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:07:38
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:07:59
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:10:18
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:10:46
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:11:34
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:12:04
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:16:05
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:20:49
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:24:31
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:25:58
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 03:26:58
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:04:20
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:16:04
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:22:11
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:41:37
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:42:02
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:42:25
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:48:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:48:22
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:55:27
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:56:49
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 04:59:43
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 05:02:13
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 05:06:00
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 05:29:09
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 05:38:16
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 05:40:02
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 05:56:48
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:03:38
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:12:10
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:12:46
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:13:12
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:13:51
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:13:56
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:14:13
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:16:17
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:28:49
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:29:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:45:27
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:45:43
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 06:53:10
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 07:01:46
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 07:02:02
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 07:05:22
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=38

## 2026-05-16 07:14:00
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-16 07:29:49
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-16 07:30:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-16 07:31:26
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-16 07:48:54
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-16 07:56:29
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-16 07:56:54
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-16 07:59:52
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-16 08:00:08
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-17 05:42:41
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-17 05:44:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-17 05:44:23
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-17 06:11:52
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-17 06:12:08
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-17 07:01:24
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-17 07:10:05
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=41

## 2026-05-17 08:09:15
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 08:09:33
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 08:19:39
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 08:19:56
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 08:36:57
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 08:37:41
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 08:38:04
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 08:47:58
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 08:49:47
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:15:19
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:15:44
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:16:08
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:16:27
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:20:47
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:28:25
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:28:52
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:29:11
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:31:00
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:56:18
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 09:56:37
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 15:26:20
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 15:59:01
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 15:59:20
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:03:23
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:08:16
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:09:43
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:12:23
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:13:41
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:24:32
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:26:20
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:28:47
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:29:28
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:30:46
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:31:16
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:32:30
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:33:10
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:34:55
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:35:43
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:36:36
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:37:47
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:38:25
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=42

## 2026-05-17 16:58:08
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 16:58:32
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 16:58:51
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:00:04
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:16:19
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:16:45
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:17:04
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:18:40
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:33:29
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:36:58
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:39:07
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:58:09
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:59:02
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 17:59:21
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 18:02:42
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 18:29:02
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 18:29:27
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 18:29:46
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 18:39:12
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 18:39:31
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 18:40:53
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-17 22:22:07
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 00:45:46
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 01:06:37
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 03:06:12
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 03:06:31
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 03:22:39
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 05:37:21
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 05:37:45
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 05:38:04
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 05:39:55
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 06:05:22
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 06:05:47
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 06:06:06
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 07:17:21
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 07:33:34
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 07:33:53
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 08:56:12
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 08:56:50
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 08:57:12
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 09:04:17
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 09:05:35
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 09:42:18
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 09:42:42
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48

## 2026-05-18 09:43:01
- sql-lint: total=55, new=0, known=55
- sql-fn-lint: total=0
- api-trace: broken=29, newBroken=0
- ui-coverage: warnings=48
