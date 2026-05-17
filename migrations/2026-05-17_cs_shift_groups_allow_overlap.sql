-- ═══════════════════════════════════════════════════════════════════
-- N-35 — cs_shift_groups.allow_same_day_other_group 컬럼 추가
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 의도: "둘 다 0.5로 두 그룹을 하니까 겹치는 날이 발생되는데"
--               같은 워커가 같은 날 여러 그룹에 동시 배정되는 것을
--               디폴트로 금지 + 24/365 운영 같은 특수 케이스만 허용
--
-- 효과:
--   · allow_same_day_other_group=0 (디폴트) → 같은 워커가 같은 날
--     이미 다른 그룹에 배정됐으면 이 그룹 candidates 에서 hard exclude
--   · =1 → 시간 충돌만 막고, 시간 안 겹치면 겹침 OK
--
-- 의미 매트릭스:
--   그룹A allow=0 + 그룹B allow=0 → 둘 다 금지 (한 사람 하루 1그룹)
--   그룹A allow=1 + 그룹B allow=0 → A 처리 시 B 배정 워커 제외 X,
--                                    B 처리 시 A 배정 워커 제외 → 헷갈림
--   그룹A allow=1 + 그룹B allow=1 → 둘 다 허용 (24/365 운영 케이스)
--
--   → 안전한 해석: 둘 다 allow=1 이어야 겹침 허용.
--      한쪽이라도 allow=0 이면 그 그룹은 「겹침 금지」 측면에서 hard exclude
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] allow_same_day_other_group 컬럼 추가 (멱등)
-- ──────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'allow_same_day_other_group');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN allow_same_day_other_group TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''같은 날 다른 그룹과 겹침 허용 — 0=금지 (디폴트), 1=허용''',
  'SELECT ''allow_same_day_other_group already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT id, name, allow_same_day_other_group FROM cs_shift_groups LIMIT 10;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_shift_groups DROP COLUMN allow_same_day_other_group;
