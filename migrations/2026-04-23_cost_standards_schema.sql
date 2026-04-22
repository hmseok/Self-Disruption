-- ============================================================
-- 2026-04-23 : 3-Layer 원가 통합 (Phase 1)
--   시장원가 → 우리원가(실적) → 영업가(프리셋)
-- ============================================================

-- 1) 스코프 : 하이브리드 (중위권=class+fuel / 상·하위권=brand+model)
CREATE TABLE IF NOT EXISTS cost_standards_scope (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope_type    ENUM('class','model') NOT NULL,
  vehicle_class VARCHAR(32)  NULL,
  fuel_type     VARCHAR(16)  NULL,
  brand         VARCHAR(64)  NULL,
  model         VARCHAR(128) NULL,
  display_label VARCHAR(160) NOT NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scope (scope_type, vehicle_class, fuel_type, brand, model),
  KEY idx_class (vehicle_class, fuel_type),
  KEY idx_model (brand, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) 값 : 스코프 × 컴포넌트 × (시장/우리)
CREATE TABLE IF NOT EXISTS cost_standards_value (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope_id         BIGINT UNSIGNED NOT NULL,
  component        ENUM('insurance','maintenance','tax','inspection',
                        'finance_rate','registration','fuel_cost','parking','extras') NOT NULL,
  unit             ENUM('monthly','annual','percent','fixed') NOT NULL,
  market_value     DECIMAL(14,2) NULL,
  our_value        DECIMAL(14,2) NULL,
  sample_count     INT           NOT NULL DEFAULT 0,
  market_source    VARCHAR(64)   NULL,
  market_synced_at DATETIME      NULL,
  our_updated_at   DATETIME      NULL,
  is_locked        TINYINT(1)    NOT NULL DEFAULT 0,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scope_component (scope_id, component),
  KEY idx_component (component),
  CONSTRAINT fk_csv_scope FOREIGN KEY (scope_id)
    REFERENCES cost_standards_scope (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) 알림 큐 : 자동반영 로그 + 롤백
CREATE TABLE IF NOT EXISTS cost_auto_updates (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope_id          BIGINT UNSIGNED NOT NULL,
  component         VARCHAR(32)   NOT NULL,
  value_kind        ENUM('market','our') NOT NULL,
  old_value         DECIMAL(14,2) NULL,
  new_value         DECIMAL(14,2) NULL,
  delta_pct         DECIMAL(8,3)  NULL,
  sample_count      INT           NULL,
  trigger_type      ENUM('actuals_rollup','market_sync','manual') NOT NULL,
  is_read           TINYINT(1)    NOT NULL DEFAULT 0,
  read_by_email     VARCHAR(160)  NULL,
  read_at           DATETIME      NULL,
  rollback_applied  TINYINT(1)    NOT NULL DEFAULT 0,
  rollback_at       DATETIME      NULL,
  rollback_by_email VARCHAR(160)  NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_unread (is_read, created_at),
  KEY idx_scope_comp (scope_id, component),
  CONSTRAINT fk_cau_scope FOREIGN KEY (scope_id)
    REFERENCES cost_standards_scope (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
