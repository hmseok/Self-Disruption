-- ============================================================
-- Phase A-1: 기준값 변경 이력 테이블
-- /db/pricing-standards 의 모든 UPDATE 를 자동 로깅
-- ============================================================

CREATE TABLE IF NOT EXISTS pricing_standard_changes (
  id          VARCHAR(36)  NOT NULL,
  table_name  VARCHAR(64)  NOT NULL COMMENT 'ALLOWED_TABLES 중 하나',
  row_id      VARCHAR(64)  NOT NULL COMMENT '대상 row UUID 혹은 PK',
  field       VARCHAR(64)  NOT NULL COMMENT '변경된 컬럼명',
  old_value   TEXT         NULL COMMENT '이전 값 (JSON/문자열 직렬화)',
  new_value   TEXT         NULL COMMENT '새 값 (JSON/문자열 직렬화)',
  user_id     VARCHAR(36)  NULL COMMENT 'profiles.id',
  reason      TEXT         NULL COMMENT '변경 사유 (선택)',
  changed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_table_row_time (table_name, row_id, changed_at),
  KEY idx_changed_at (changed_at),
  KEY idx_user_time (user_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='기준값(pricing-standards) 변경 이력 — 자동 로깅';
