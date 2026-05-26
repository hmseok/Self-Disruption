-- ════════════════════════════════════════════════════════════════════
-- PR-L2 — long_term_rentals 계약 유형·라이프사이클 단계
-- 2026-05-24 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 명시: 「신차구입 / 기존차량」 두 타입 + 견적→계약→배차→완료 라이프사이클.
--   견적·계약 모듈(contracts/quotes)은 추후 별도 재정비 예정 — 지금은 독립.
--
-- 추가 컬럼:
--   contract_type   VARCHAR(20)  — '신차구입' / '기존차량' (default '기존차량')
--   vehicle_spec    VARCHAR(255) — 신차 예정 차종/스펙 (차량 미확정 시)
--
-- 기존 status 확장 (컬럼 변경 없음, 값 5단계 사용):
--   contracted         계약 체결 (차량 미배차)
--   pending_delivery   신차 출고 대기
--   active             배차 운영중 (사용가능 제외 트리거 — PR-L1d)
--   expired            만기
--   terminated         중도해지
--
--   기존차량: contracted → active (즉시 배차 가능)
--   신차구입: contracted → pending_delivery → (차량 도착) → active
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 (information_schema 가드).
-- ════════════════════════════════════════════════════════════════════

-- ── contract_type ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='long_term_rentals' AND column_name='contract_type');
SET @sql := IF(@c=0,
  'ALTER TABLE long_term_rentals ADD COLUMN contract_type VARCHAR(20) NULL DEFAULT ''기존차량'' COMMENT ''신차구입 / 기존차량''',
  'SELECT "contract_type exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── vehicle_spec (신차 예정 차종/스펙) ──
SET @c := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='long_term_rentals' AND column_name='vehicle_spec');
SET @sql := IF(@c=0,
  'ALTER TABLE long_term_rentals ADD COLUMN vehicle_spec VARCHAR(255) NULL DEFAULT NULL COMMENT ''신차 예정 차종/스펙 (차량 미확정 시)''',
  'SELECT "vehicle_spec exists" AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 검증 ──
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema=DATABASE() AND table_name='long_term_rentals'
--      AND column_name IN ('contract_type','vehicle_spec');
--   -- 기대: 2 rows
