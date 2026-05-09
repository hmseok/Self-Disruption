-- 2026-05-08 PR-6.10.g: 라이드 모듈 변경 이력 (audit log)
-- 누가 / 언제 / 어느 테이블 / 어느 row / 어느 필드 / 무엇 → 무엇 으로 변경했는지 기록

CREATE TABLE IF NOT EXISTS ride_audit_logs (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  table_name   VARCHAR(64)  NOT NULL,
  record_id    VARCHAR(36)  NOT NULL,
  action       VARCHAR(20)  NOT NULL,
  field_name   VARCHAR(64)  NULL,
  old_value    TEXT         NULL,
  new_value    TEXT         NULL,
  changed_by   VARCHAR(36)  NULL,
  changed_by_name VARCHAR(100) NULL,
  changed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_record (table_name, record_id, changed_at),
  KEY idx_audit_user (changed_by, changed_at),
  KEY idx_audit_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 검증: SELECT COUNT(*) FROM ride_audit_logs;  -- 0
