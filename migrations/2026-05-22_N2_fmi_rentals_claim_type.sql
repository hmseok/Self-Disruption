-- ════════════════════════════════════════════════════════════════════
-- PR-N2 — fmi_rentals 청구유형 컬럼 추가
-- 2026-05-22 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시 (2026-05-22):
--   「청구유형 추가」 — 입금여부·청구금액은 청구 모듈, 생년월일·과실율은 메모.
--
-- 운영 엑셀 「대차 현황」 빌려타 시트의 청구유형이 정산 방식을 좌우:
--   보험 / 라이드 / 고객유상 / 유상대차 / 정비대차
--
-- 추가 컬럼:
--   claim_type   VARCHAR(20)  — 청구유형 (NULL = 미지정)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 가드 (information_schema 체크).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-22_N2_fmi_rentals_claim_type.sql
-- ════════════════════════════════════════════════════════════════════

-- ── claim_type (VARCHAR) ──
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'fmi_rentals'
     AND column_name = 'claim_type'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fmi_rentals ADD COLUMN claim_type VARCHAR(20) NULL DEFAULT NULL COMMENT ''청구유형: 보험/라이드/고객유상/유상대차/정비대차''',
  'SELECT "fmi_rentals.claim_type already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 검증 (단독 실행) ──
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = DATABASE() AND table_name = 'fmi_rentals'
--      AND column_name = 'claim_type';
--   -- 기대: 1 row
