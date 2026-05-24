-- ════════════════════════════════════════════════════════════════════
-- PR-N7.1 — fmi_rentals 과실율·청구율 컬럼
-- 2026-05-24 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시: 롯데 단기 청구금액 산출에 과실율·청구율 별도 반영.
--   배차 단계에서 체크 → 청구 모달에 동기화 + 추가 수정 가능.
--
-- 청구금액 = 롯데 구간일요금 × 일수 × (과실율/100) × (청구율/100)
--   · fault_rate  과실율(%)  — 상대 과실 비율 등 (미입력 시 100 취급)
--   · claim_rate  청구율(%)  — 롯데정가 대비 실청구 비율 (미입력 시 100 취급)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 가드 (information_schema 체크).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-24_N7_fmi_rentals_rates.sql
-- ════════════════════════════════════════════════════════════════════

-- ── fault_rate (과실율 %) ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='fmi_rentals' AND column_name='fault_rate');
SET @sql := IF(@c=0,
  'ALTER TABLE fmi_rentals ADD COLUMN fault_rate DECIMAL(5,2) NULL DEFAULT NULL COMMENT ''과실율(%) — 미입력 시 100 취급''',
  'SELECT "fault_rate exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── claim_rate (청구율 %) ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='fmi_rentals' AND column_name='claim_rate');
SET @sql := IF(@c=0,
  'ALTER TABLE fmi_rentals ADD COLUMN claim_rate DECIMAL(5,2) NULL DEFAULT NULL COMMENT ''청구율(%) — 롯데정가 대비, 미입력 시 100 취급''',
  'SELECT "claim_rate exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 검증 (단독 실행) ──
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema=DATABASE() AND table_name='fmi_rentals'
--      AND column_name IN ('fault_rate','claim_rate');
--   -- 기대: 2 rows
