-- ─────────────────────────────────────────────────────────────────
-- migrations/2026-06-01_ride_compliance_phase28_source_snapshot.sql
-- ─────────────────────────────────────────────────────────────────
-- RideCompliance Phase 28 — 출처 snapshot 컬럼 (감사 추적성)
--
-- 사용자 통찰:
--   「각 부분에는 어떤 내규의 어떤 원본의 명시가 있는 부분을 보여주고
--    그거에 의거해서 어떤 액션이 표출되었는데 데이터를 확정하겠느냐의 플로우」
--
-- → 등록 시점에 매뉴얼 출처 (article + excerpt) DB snapshot.
--   감사 시 「이 row 의 등록 근거」 추적 가능.
--
-- 적용 테이블 4개:
--   1. ride_compliance_officers       — 임명 (P25)
--   2. ride_compliance_assets         — 정보자산 (P26)
--   3. ride_compliance_incidents      — 침해사고 (P27)
--   4. ride_compliance_deliverables   — 산출물 (P28-B 예정)
--
-- 멱등 (Rule 23) — IF NOT EXISTS / @col_exists 패턴.
-- ─────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 1. ride_compliance_officers — 임명 출처
-- ════════════════════════════════════════════════════════════════
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_officers' AND COLUMN_NAME = 'source_article');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_officers
     ADD COLUMN source_article VARCHAR(60) DEFAULT NULL COMMENT "매뉴얼 출처 조항 (예: 제6조 + 임명장)",
     ADD COLUMN source_excerpt TEXT DEFAULT NULL COMMENT "매뉴얼 원본 인용 (감사용 snapshot)",
     ADD COLUMN source_policy_id CHAR(36) DEFAULT NULL COMMENT "당시 적용 내규 ID",
     ADD COLUMN source_policy_version VARCHAR(20) DEFAULT NULL COMMENT "당시 내규 버전",
     ADD KEY idx_ride_comp_off_src_policy (source_policy_id)',
  'SELECT "officers source_article exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ════════════════════════════════════════════════════════════════
-- 2. ride_compliance_assets — 정보자산 출처
-- ════════════════════════════════════════════════════════════════
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_assets' AND COLUMN_NAME = 'source_article');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_assets
     ADD COLUMN source_article VARCHAR(60) DEFAULT NULL COMMENT "매뉴얼 출처 조항 (예: 제10조)",
     ADD COLUMN source_excerpt TEXT DEFAULT NULL COMMENT "매뉴얼 원본 인용",
     ADD COLUMN source_policy_id CHAR(36) DEFAULT NULL,
     ADD COLUMN source_policy_version VARCHAR(20) DEFAULT NULL,
     ADD KEY idx_ride_comp_asset_src_policy (source_policy_id)',
  'SELECT "assets source_article exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ════════════════════════════════════════════════════════════════
-- 3. ride_compliance_incidents — 침해사고 출처
-- ════════════════════════════════════════════════════════════════
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_incidents' AND COLUMN_NAME = 'source_article');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_incidents
     ADD COLUMN source_article VARCHAR(60) DEFAULT NULL COMMENT "매뉴얼 출처 조항 (예: 제25조 + 제26조)",
     ADD COLUMN source_excerpt TEXT DEFAULT NULL,
     ADD COLUMN source_policy_id CHAR(36) DEFAULT NULL,
     ADD COLUMN source_policy_version VARCHAR(20) DEFAULT NULL,
     ADD KEY idx_ride_comp_inc_src_policy (source_policy_id)',
  'SELECT "incidents source_article exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ════════════════════════════════════════════════════════════════
-- 4. ride_compliance_deliverables — source_article (P19 의 source_policy_id 와 별개)
-- ════════════════════════════════════════════════════════════════
SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_compliance_deliverables' AND COLUMN_NAME = 'source_article');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ride_compliance_deliverables
     ADD COLUMN source_article VARCHAR(60) DEFAULT NULL COMMENT "매뉴얼 출처 조항 (예: 제6조 임명장 / 제11조 파기)",
     ADD COLUMN source_excerpt TEXT DEFAULT NULL COMMENT "매뉴얼 원본 인용"',
  'SELECT "deliverables source_article exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────
-- 검증 SQL
-- ─────────────────────────────────────────────────────────────────
--
-- 1) 4 테이블 모두 컬럼 추가 확인:
--    SELECT TABLE_NAME, COUNT(*) AS source_cols
--      FROM INFORMATION_SCHEMA.COLUMNS
--     WHERE TABLE_SCHEMA = DATABASE()
--       AND COLUMN_NAME IN ('source_article', 'source_excerpt', 'source_policy_id', 'source_policy_version')
--       AND TABLE_NAME IN ('ride_compliance_officers', 'ride_compliance_assets',
--                          'ride_compliance_incidents', 'ride_compliance_deliverables')
--     GROUP BY TABLE_NAME;
--    기대치: officers/assets/incidents = 4 / deliverables = 2 (이미 P19 에서 source_policy_id/version 있음)
--
-- 2) 향후 등록 시점 INSERT 패턴 (예 — officers):
--    INSERT INTO ride_compliance_officers
--      (id, user_id, role, display_title, business_unit, appointed_at, notes,
--       source_article, source_excerpt, source_policy_id, source_policy_version)
--    VALUES (UUID(), 'profile-cuid-xxx', 'cpo', '...',
--            '라이드케어', '2026-05-20', '...',
--            '제6조 + 임명장', '회사는 다음 각 호의 ... CPO 임성민',
--            'active-policy-id', 'v1.0');
