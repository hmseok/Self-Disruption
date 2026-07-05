-- V8 (2026-07-04) — operations_dispatch_orders 견적(상담 단계) 컬럼 7개 추가
-- PR-QUOTE: 청구액 변수(청구유형·접수번호·과실·청구율·차종군·일수·견적액)는 상담 단계에 확정되는데
--   저장할 자리가 없어 청구 단계에서 재입력하던 문제 해소. 배차 확정(confirm) 시 fmi_rentals 전파.
-- 멱등: @col_exists + PREPARE 패턴 (V5 동일 — 재실행 안전, Cloud SQL 스튜디오/DBeaver 모두 실행 가능).

-- 1/7 claim_type
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operations_dispatch_orders' AND COLUMN_NAME = 'claim_type');
SET @sql = IF(@c = 0, 'ALTER TABLE operations_dispatch_orders ADD COLUMN claim_type VARCHAR(32) NULL COMMENT ''청구유형 — 상담 단계 확정''', 'SELECT ''claim_type exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2/7 insurance_claim_no
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operations_dispatch_orders' AND COLUMN_NAME = 'insurance_claim_no');
SET @sql = IF(@c = 0, 'ALTER TABLE operations_dispatch_orders ADD COLUMN insurance_claim_no VARCHAR(64) NULL COMMENT ''보험 접수번호''', 'SELECT ''insurance_claim_no exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3/7 fault_rate
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operations_dispatch_orders' AND COLUMN_NAME = 'fault_rate');
SET @sql = IF(@c = 0, 'ALTER TABLE operations_dispatch_orders ADD COLUMN fault_rate DECIMAL(5,2) NULL COMMENT ''과실율(%) — 케이스바이케이스''', 'SELECT ''fault_rate exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4/7 claim_rate
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operations_dispatch_orders' AND COLUMN_NAME = 'claim_rate');
SET @sql = IF(@c = 0, 'ALTER TABLE operations_dispatch_orders ADD COLUMN claim_rate DECIMAL(5,2) NULL COMMENT ''청구율(%) — 보험사별 관행 요율''', 'SELECT ''claim_rate exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 5/7 quote_vehicle_category
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operations_dispatch_orders' AND COLUMN_NAME = 'quote_vehicle_category');
SET @sql = IF(@c = 0, 'ALTER TABLE operations_dispatch_orders ADD COLUMN quote_vehicle_category VARCHAR(80) NULL COMMENT ''견적 차종(롯데 요금표 행 라벨)''', 'SELECT ''quote_vehicle_category exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 6/7 quote_days
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operations_dispatch_orders' AND COLUMN_NAME = 'quote_days');
SET @sql = IF(@c = 0, 'ALTER TABLE operations_dispatch_orders ADD COLUMN quote_days INT NULL COMMENT ''견적 예상 일수''', 'SELECT ''quote_days exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 7/7 quote_amount
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operations_dispatch_orders' AND COLUMN_NAME = 'quote_amount');
SET @sql = IF(@c = 0, 'ALTER TABLE operations_dispatch_orders ADD COLUMN quote_amount DECIMAL(12,0) NULL COMMENT ''견적 예상 청구액(원, VAT 포함)''', 'SELECT ''quote_amount exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 검증: 아래가 7 이면 적용 완료
SELECT COUNT(*) AS v8_applied FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operations_dispatch_orders'
   AND COLUMN_NAME IN ('claim_type','insurance_claim_no','fault_rate','claim_rate','quote_vehicle_category','quote_days','quote_amount');
