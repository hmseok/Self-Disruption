-- ═══════════════════════════════════════════════════════════════════
-- cs_leaves 신청/승인 흐름 — PR-2BB (2026-05-04)
--
-- 이전 결정 변경 (V2-RESTRUCTURE.md §8.1):
--   기존: 매니저 직접 입력 단일 단계
--   변경: 직원 신청 → 매니저 승인 (2단계) — 운영 부담 감소
--
-- 신규 컬럼:
--   status         pending | approved | rejected | canceled
--   requested_at, requested_by  (신청자 — 직원 또는 매니저)
--   approved_at, approved_by    (승인자)
--   resolution_note             (반려 사유 등)
--
-- quota 차감 정책:
--   - approved 만 cs_leave_quotas 잔여 차감
--   - pending / rejected / canceled 는 잔여 영향 X
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- (1) status 컬럼 (멱등 — 컬럼 존재 체크 후 ADD)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cs_leaves'
    AND COLUMN_NAME = 'status'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE cs_leaves
     ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT ''approved'' AFTER reason,
     ADD COLUMN requested_by CHAR(36) NULL AFTER applied_by,
     ADD COLUMN approved_at DATETIME NULL AFTER requested_by,
     ADD COLUMN approved_by CHAR(36) NULL AFTER approved_at,
     ADD COLUMN resolution_note VARCHAR(255) NULL AFTER approved_by,
     ADD KEY idx_cs_leave_status (status, start_date)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- (2) 기존 row 는 모두 'approved' 로 (이미 매니저가 직접 입력한 것이므로)
UPDATE cs_leaves
SET status = 'approved',
    approved_at = COALESCE(approved_at, applied_at, created_at),
    approved_by = COALESCE(approved_by, applied_by)
WHERE status IS NULL OR status = '';

-- ═══════════════════════════════════════════════════════════════════
-- 검증
--   SELECT status, COUNT(*) FROM cs_leaves GROUP BY status;
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_leaves
--   DROP INDEX idx_cs_leave_status,
--   DROP COLUMN resolution_note,
--   DROP COLUMN approved_by,
--   DROP COLUMN approved_at,
--   DROP COLUMN requested_by,
--   DROP COLUMN status;
