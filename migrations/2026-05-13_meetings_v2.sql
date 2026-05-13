-- ============================================================
-- 회의록 V2 — 노션형 풀페이지 에디터 본문 (PR-MTG-V2-A, 2026-05-13)
--
-- 사용자: 「회의록처럼 화면이 열리고 본문을 넓게 작성하는 페이지 —
--          노션의 업그레이드 버전을 만들고 싶다」
--
-- 변경:
--   · meetings.body              JSON NULL — TipTap JSON 본문 (블록 트리)
--   · meetings.body_version      INT  DEFAULT 1 — 낙관적 락 / 버전 추적
--   · meetings.body_updated_at   DATETIME NULL — 본문 마지막 변경 시각
--   · meetings.body_updated_by   CHAR(36) NULL — 본문 마지막 변경자 (profiles.id)
--   · INDEX idx_m_body_updated   (body_updated_at) — sidebar 정렬용
--
-- 호환:
--   · body = NULL → V1 모달 fallback (기존 데이터 보존)
--   · meeting_minutes / meeting_attendees / meeting_action_items 4 테이블 그대로 유지
--
-- 멱등 (IF NOT EXISTS 패턴 — @col_exists 체크)
--
-- 적용:
--   mysql -h <host> -u <user> -p <db> < migrations/2026-05-13_meetings_v2.sql
--
-- 검증 (파일 하단):
--   SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings'
--      AND COLUMN_NAME IN ('body', 'body_version', 'body_updated_at', 'body_updated_by');
-- ============================================================

SET @col_exists := 0;

-- (1) body — TipTap JSON (ProseMirror 형식)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND COLUMN_NAME = 'body';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE meetings ADD COLUMN body JSON NULL COMMENT "TipTap JSON 본문 (V2 — Hybrid)"',
  'SELECT "meetings.body exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (2) body_version — 낙관적 락 (PATCH 시 WHERE body_version = ? 체크)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND COLUMN_NAME = 'body_version';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE meetings ADD COLUMN body_version INT NOT NULL DEFAULT 1 COMMENT "낙관적 락 / 버전 추적"',
  'SELECT "meetings.body_version exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (3) body_updated_at — 본문 마지막 변경 시각 (sidebar 정렬 / 자동저장 표시)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND COLUMN_NAME = 'body_updated_at';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE meetings ADD COLUMN body_updated_at DATETIME NULL COMMENT "본문 마지막 변경 시각"',
  'SELECT "meetings.body_updated_at exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (4) body_updated_by — 본문 마지막 변경자 (profiles.id 논리 FK)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND COLUMN_NAME = 'body_updated_by';
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE meetings ADD COLUMN body_updated_by CHAR(36) NULL COMMENT "본문 마지막 변경자 profiles.id"',
  'SELECT "meetings.body_updated_by exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (5) 인덱스 — body_updated_at (sidebar 「최근 작업」 정렬)
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND INDEX_NAME = 'idx_m_body_updated';
SET @sql := IF(@col_exists = 0,
  'CREATE INDEX idx_m_body_updated ON meetings (body_updated_at)',
  'SELECT "idx_m_body_updated exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 검증 — 적용 후 다음 쿼리로 확인 (기대치: 4 row, 모두 IS_NULLABLE='YES' 또는 body_version만 'NO')
-- ============================================================
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings'
    AND COLUMN_NAME IN ('body', 'body_version', 'body_updated_at', 'body_updated_by')
  ORDER BY ORDINAL_POSITION;

-- 인덱스 검증
SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND INDEX_NAME = 'idx_m_body_updated';

-- 기존 row 영향 확인 (body 모두 NULL이어야 — V1 모달 fallback)
SELECT
  COUNT(*) AS total_meetings,
  SUM(CASE WHEN body IS NULL THEN 1 ELSE 0 END) AS body_null,
  SUM(CASE WHEN body IS NOT NULL THEN 1 ELSE 0 END) AS body_filled,
  AVG(body_version) AS avg_version
  FROM meetings;

-- ============================================================
-- ROLLBACK (필요 시 수동 실행)
-- ============================================================
-- ALTER TABLE meetings DROP INDEX idx_m_body_updated;
-- ALTER TABLE meetings DROP COLUMN body_updated_by;
-- ALTER TABLE meetings DROP COLUMN body_updated_at;
-- ALTER TABLE meetings DROP COLUMN body_version;
-- ALTER TABLE meetings DROP COLUMN body;
