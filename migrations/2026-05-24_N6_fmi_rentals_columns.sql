-- ════════════════════════════════════════════════════════════════════
-- PR-N6 STEP 1 — fmi_rentals 컬럼 보강 (입고공장·생년월일·지급 추적)
-- 2026-05-24 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시: 엑셀 import 시 누락된 컬럼 보강.
--   · 입고공장 / 고객생년월일 — 엑셀 백필 + 향후 cafe24 사고접수 자동입력
--   · 배차주소 — 기존 dispatch_location 사용 (엑셀 백필 + 상담 시 검색)
--   · 청구금액 — 기존 final_claim_amount 사용 (신규 X)
--   · 입금(지급)금액 — 재무 통장/카드 자동매칭으로 입력
--   · 지급여부 / 메모 — 신규
--
-- 추가 컬럼 (5):
--   repair_factory  VARCHAR(191) — 입고공장 (사고차량 수리처)
--   customer_birth  VARCHAR(20)  — 고객 생년월일 (예: '830826')
--   paid_amount     DECIMAL(12,0)— 입금(지급)금액 (재무 매칭)
--   payment_status  VARCHAR(20)  — 지급여부 (지급완료 / 종결 등)
--   payment_memo    TEXT         — 청구·지급 메모 (import 원문 notes 와 별개)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 가드 (information_schema 체크 — 재실행 무해).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-24_N6_fmi_rentals_columns.sql
-- ════════════════════════════════════════════════════════════════════

-- ── repair_factory (입고공장) ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='fmi_rentals' AND column_name='repair_factory');
SET @sql := IF(@c=0,
  'ALTER TABLE fmi_rentals ADD COLUMN repair_factory VARCHAR(191) NULL DEFAULT NULL COMMENT ''입고공장 (사고차량 수리처)''',
  'SELECT "repair_factory exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── customer_birth (고객 생년월일) ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='fmi_rentals' AND column_name='customer_birth');
SET @sql := IF(@c=0,
  'ALTER TABLE fmi_rentals ADD COLUMN customer_birth VARCHAR(20) NULL DEFAULT NULL COMMENT ''고객 생년월일''',
  'SELECT "customer_birth exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── paid_amount (입금/지급 금액 — 재무 매칭) ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='fmi_rentals' AND column_name='paid_amount');
SET @sql := IF(@c=0,
  'ALTER TABLE fmi_rentals ADD COLUMN paid_amount DECIMAL(12,0) NULL DEFAULT NULL COMMENT ''입금(지급)금액 — 재무 통장/카드 자동매칭''',
  'SELECT "paid_amount exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── payment_status (지급여부) ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='fmi_rentals' AND column_name='payment_status');
SET @sql := IF(@c=0,
  'ALTER TABLE fmi_rentals ADD COLUMN payment_status VARCHAR(20) NULL DEFAULT NULL COMMENT ''지급여부: 지급완료 / 종결 등''',
  'SELECT "payment_status exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── payment_memo (청구·지급 메모) ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='fmi_rentals' AND column_name='payment_memo');
SET @sql := IF(@c=0,
  'ALTER TABLE fmi_rentals ADD COLUMN payment_memo TEXT NULL DEFAULT NULL COMMENT ''청구·지급 메모''',
  'SELECT "payment_memo exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 검증 (단독 실행) ──
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema=DATABASE() AND table_name='fmi_rentals'
--      AND column_name IN ('repair_factory','customer_birth','paid_amount','payment_status','payment_memo');
--   -- 기대: 5 rows
