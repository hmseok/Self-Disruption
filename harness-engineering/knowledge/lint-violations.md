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
