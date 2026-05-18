-- ═══════════════════════════════════════════════════════════════════
-- N-57 — Cross-group cover 명시 매핑 (그룹 페어)
--   2026-05-17 sukhomin87@gmail.com
--
-- 사용자 결정:
--   "서브던, 부엉이던 휴가면 서로 그룹근무자가 커버하는것으로 셋팅"
--   → source_group_id (휴가 발생 그룹) → cover_group_id (커버할 그룹)
--   - 그룹 간 명시 매핑 (양방향 가능)
--
-- 운영 예시:
--   서브 그룹 휴가 시 → 부엉이 그룹 멤버 cover
--   부엉이 그룹 휴가 시 → 서브 그룹 멤버 cover
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_group_cover_pairs 테이블 생성 (멱등)
CREATE TABLE IF NOT EXISTS cs_group_cover_pairs (
  id               VARCHAR(36) NOT NULL PRIMARY KEY,
  source_group_id  VARCHAR(36) NOT NULL COMMENT '휴가/결원 발생 그룹',
  cover_group_id   VARCHAR(36) NOT NULL COMMENT '커버할 멤버를 가진 그룹',
  priority         TINYINT      DEFAULT 1 COMMENT '1~3 우선순위 (1 = 최우선)',
  is_active        TINYINT(1)   DEFAULT 1,
  memo             VARCHAR(200) DEFAULT NULL,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_cover_pair (source_group_id, cover_group_id),
  KEY idx_cs_cover_source (source_group_id),
  KEY idx_cs_cover_target (cover_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='N-57 그룹간 커버 매핑 (휴가 시 다른 그룹 멤버 진입 허용)';

-- 검증
-- SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_cover_pairs';
