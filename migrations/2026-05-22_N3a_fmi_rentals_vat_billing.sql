-- ════════════════════════════════════════════════════════════════════
-- PR-N3a — fmi_rentals 부가세 추가청구 플래그 컬럼
-- 2026-05-22 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시 (2026-05-22):
--   「부가세는 대차 이용 후에 부가세를 별도 추가청구할 건이 있어서 필요」
--
-- 운영 엑셀 「대차 현황」 분석 결과:
--   부가세(캐피탈) 시트 = 빌려타 시트와 동일한 배차 건의 부분집합.
--   → 별도 행이 아니라, 해당 배차에 「부가세 추가청구 대상」 플래그로 처리.
--
-- 추가 컬럼:
--   vat_extra_billing  VARCHAR(1)   — 부가세 추가청구 대상 ('Y' / NULL)
--   capital_company    VARCHAR(30)  — 캐피탈사 (iM / 마음카 / 우리 등)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 가드 (information_schema 체크).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-22_N3a_fmi_rentals_vat_billing.sql
-- ════════════════════════════════════════════════════════════════════

-- ── vat_extra_billing (VARCHAR) ──
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND column_name = 'vat_extra_billing'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN vat_extra_billing VARCHAR(1) NULL DEFAULT NULL COMMENT ''부가세 추가청구 대상 Y/NULL''',
  'SELECT "fmi_rentals.vat_extra_billing already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── capital_company (VARCHAR) ──
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND column_name = 'capital_company'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN capital_company VARCHAR(30) NULL DEFAULT NULL COMMENT ''캐피탈사 iM/마음카/우리''',
  'SELECT "fmi_rentals.capital_company already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 검증 (단독 실행) ──
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = DATABASE() AND table_name = 'fmi_rentals'
--      AND column_name IN ('vat_extra_billing', 'capital_company');
--   -- 기대: 2 rows
