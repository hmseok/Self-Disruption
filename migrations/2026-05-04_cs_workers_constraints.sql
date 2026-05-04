-- ═══════════════════════════════════════════════════════════════════
-- PR-2QQ-d-1 — cs_workers 제약 모델 (priority + 비선호 + 필수/최대)
--
-- 운영 사실 (Rule 25):
--   - 외부/내부 모두 같은 워커 모델 사용 (priority_level 로 구분)
--   - 워커별 비선호 요일 (예: 일·금 회피)
--   - 월 필수 근무일 / 최대 근무일 제약
--   - 자유 패턴 메모 (예: '2-on-2-off')
--
-- 외부 직원 엑셀 업로드 폐기 — 패턴/제약 셋팅으로 자동 채움
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

-- 1) priority_level (1=최우선, 2=일반, 3=백업)
SET @c1 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'priority_level');
SET @s1 := IF(@c1 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN priority_level TINYINT NOT NULL DEFAULT 2
    COMMENT '1=최우선 / 2=일반 / 3=백업'
    AFTER is_external",
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- 2) preferred_dow_avoid ('0,5' 형식 = 일·금)
SET @c2 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'preferred_dow_avoid');
SET @s2 := IF(@c2 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN preferred_dow_avoid VARCHAR(16) NULL
    COMMENT '비선호 요일 (0=일,1=월...6=토 콤마 구분)'
    AFTER priority_level",
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- 3) required_days_per_month
SET @c3 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'required_days_per_month');
SET @s3 := IF(@c3 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN required_days_per_month TINYINT NULL
    COMMENT '월 필수 근무일 (NULL=제약 없음)'
    AFTER preferred_dow_avoid",
  'SELECT 1');
PREPARE st3 FROM @s3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- 4) max_days_per_month
SET @c4 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'max_days_per_month');
SET @s4 := IF(@c4 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN max_days_per_month TINYINT NULL
    COMMENT '월 최대 근무일 (NULL=제약 없음)'
    AFTER required_days_per_month",
  'SELECT 1');
PREPARE st4 FROM @s4; EXECUTE st4; DEALLOCATE PREPARE st4;

-- 5) work_pattern_text (외부 직원 + 일반 모두 사용)
SET @c5 := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'work_pattern_text');
SET @s5 := IF(@c5 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN work_pattern_text VARCHAR(64) NULL
    COMMENT '자유 패턴 메모 (예: 2-on-2-off)'
    AFTER max_days_per_month",
  'SELECT 1');
PREPARE st5 FROM @s5; EXECUTE st5; DEALLOCATE PREPARE st5;

-- 6) priority 인덱스 (자동 생성에서 자주 정렬)
SET @i1 := (SELECT COUNT(*) FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND index_name = 'idx_cs_w_priority');
SET @s6 := IF(@i1 = 0,
  'ALTER TABLE cs_workers ADD INDEX idx_cs_w_priority (priority_level, is_active)',
  'SELECT 1');
PREPARE st6 FROM @s6; EXECUTE st6; DEALLOCATE PREPARE st6;

-- 7) external_pattern → work_pattern_text 마이그레이션 (기존 외부 직원 패턴 메타 이전)
SET @s7 := IF(@c5 = 0 AND EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'cs_workers' AND column_name = 'external_pattern'
),
  "UPDATE cs_workers
    SET work_pattern_text = external_pattern
    WHERE external_pattern IS NOT NULL AND work_pattern_text IS NULL",
  'SELECT 1');
PREPARE st7 FROM @s7; EXECUTE st7; DEALLOCATE PREPARE st7;

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- DESCRIBE cs_workers;
--   기대치: priority_level / preferred_dow_avoid / required_days_per_month
--           / max_days_per_month / work_pattern_text 추가
-- SHOW INDEX FROM cs_workers WHERE Key_name = 'idx_cs_w_priority';
--   기대치: 1 row (priority_level + is_active)

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_workers DROP INDEX idx_cs_w_priority;
-- ALTER TABLE cs_workers DROP COLUMN work_pattern_text;
-- ALTER TABLE cs_workers DROP COLUMN max_days_per_month;
-- ALTER TABLE cs_workers DROP COLUMN required_days_per_month;
-- ALTER TABLE cs_workers DROP COLUMN preferred_dow_avoid;
-- ALTER TABLE cs_workers DROP COLUMN priority_level;
