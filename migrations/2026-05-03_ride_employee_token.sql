-- ═══════════════════════════════════════════════════════════════════
-- ride_employees.public_token — 직원별 영구 토큰 링크
-- 2026-05-03 (PR-2B)
--
-- 목적:
--   · 직원이 매번 매니저로부터 공유링크 받지 않고 영구 북마크 가능
--   · /CallScheduler/e/[token] 비로그인 진입
--   · status='published' 스케줄만 노출
--
-- 토큰:
--   · 32자 hex (crypto.randomBytes(16).toString('hex'))
--   · NULL = 미발급
--   · 재발급 시 새 토큰 INSERT — 기존 URL 즉시 만료
-- ═══════════════════════════════════════════════════════════════════

-- public_token 컬럼 추가 (멱등)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ride_employees'
    AND COLUMN_NAME = 'public_token'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_employees
     ADD COLUMN public_token CHAR(32) NULL AFTER memo,
     ADD COLUMN public_token_issued_at DATETIME NULL AFTER public_token,
     ADD UNIQUE KEY uq_ride_emp_public_token (public_token)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE ride_employees
--   DROP INDEX uq_ride_emp_public_token,
--   DROP COLUMN public_token_issued_at,
--   DROP COLUMN public_token;
