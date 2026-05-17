-- ============================================================
-- 회의록 권한 강화 — visibility + meeting_editors (PR-MTG-V2-Visibility, 2026-05-16)
--
-- 사용자 명령:
--   「외부매니저한테도 다공개되는것 보니 인사마스터 기준으로 그냥 다열리는것같아
--    추가적인 회의록 특성에 맞는 별도 권한관리가 있어야 되지않을까」
--   → B 메인 (회의록 안 통합) + C 일부 (admin/master 자동) 「추천대로 가시죠」
--
-- 변경:
--   1) meetings.visibility VARCHAR(16) DEFAULT 'attendees' — 회의별 공개 범위
--      · public      — 모든 인증 직원
--      · department  — 같은 부서원만 (ride_employees.department === meetings.department)
--      · attendees   — 참석자만 (meeting_attendees) — DEFAULT (가장 안전)
--      · private     — organizer/created_by/meeting_editors 만
--   2) meeting_editors 테이블 신설 — 공동 편집자 명시 부여
--      · role: editor (편집 가능) / viewer (조회만 — private 회의 명시 공유 시)
--   3) INDEX idx_m_visibility (visibility) — 목록 필터 최적화
--
-- 권한 매트릭스 (API 측 적용):
--   조회 가능:
--     · admin/master: 모두
--     · public: 모든 인증
--     · department: 같은 부서 (ride_employees.profile_id === user.id AND department === m.department)
--     · attendees: meeting_attendees + organizer + created_by
--     · private: organizer + created_by + meeting_editors
--   편집 가능:
--     · admin/master + organizer + created_by + meeting_editors.role='editor'
--     · (HR PR-HR-1 후속) ride_departments.leader_employee_id 자동
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- 멱등: @col_exists / CREATE TABLE IF NOT EXISTS
-- 적용: mysql -h <host> -u <user> -p <db> < migrations/2026-05-16_meetings_visibility.sql
-- ROLLBACK: 본 파일 하단
-- ============================================================

SET @col_exists := 0;

-- (1) meetings.visibility
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND COLUMN_NAME = 'visibility';
SET @sql := IF(@col_exists = 0,
  "ALTER TABLE meetings ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'attendees' COMMENT 'public|department|attendees|private — PR-V2-Visibility'",
  'SELECT "meetings.visibility exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (2) INDEX idx_m_visibility — 목록 필터 최적화
SELECT COUNT(*) INTO @col_exists
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND INDEX_NAME = 'idx_m_visibility';
SET @sql := IF(@col_exists = 0,
  'CREATE INDEX idx_m_visibility ON meetings (visibility)',
  'SELECT "idx_m_visibility exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- (3) meeting_editors — 공동 편집자
CREATE TABLE IF NOT EXISTS meeting_editors (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  meeting_id      CHAR(36)     NOT NULL COMMENT 'meetings.id (논리 FK)',
  profile_id      CHAR(36)     NOT NULL COMMENT 'profiles.id (논리 FK)',
  role            VARCHAR(16)  NOT NULL DEFAULT 'editor' COMMENT 'editor|viewer',
  added_by        CHAR(36)     NULL COMMENT '추가한 사용자 profiles.id',
  added_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_me_meeting_profile (meeting_id, profile_id),
  KEY idx_me_meeting (meeting_id),
  KEY idx_me_profile (profile_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회의 공동 편집자/조회자 명시 지정';

-- ============================================================
-- 검증
-- ============================================================
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings'
    AND COLUMN_NAME = 'visibility';

SELECT INDEX_NAME, COLUMN_NAME
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meetings' AND INDEX_NAME = 'idx_m_visibility';

SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meeting_editors';

SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meeting_editors'
  ORDER BY ORDINAL_POSITION;

-- 기존 회의의 visibility 분포 (기대치: 모두 'attendees' default)
SELECT visibility, COUNT(*) AS cnt FROM meetings WHERE deleted_at IS NULL GROUP BY visibility;

-- ============================================================
-- ROLLBACK (역순)
-- ============================================================
-- DROP TABLE IF EXISTS meeting_editors;
-- ALTER TABLE meetings DROP INDEX idx_m_visibility;
-- ALTER TABLE meetings DROP COLUMN visibility;
