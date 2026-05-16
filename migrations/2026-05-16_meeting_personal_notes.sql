-- ============================================================
-- 회의 개인 메모 — meeting_personal_notes (PR-MTG-V2-Note, 2026-05-16)
--
-- 사용자 요청:
--   「여기 회의록 안에 메모라던가 to do 같은것도 구성하면 좀 도움되지않을까?」
--   → 「개인 메모 사이드 아이템」 + 「내 TODO 대시보드」 둘 다 선택 (2, 4)
--
-- 본 마이그는 PR-V2-Note (개인 메모) 만 처리.
-- PR-V2-Me (내 TODO 대시보드) 는 DB 변경 없음 (기존 meeting_action_items 조회).
--
-- 구조:
--   · 회의-사용자 1:1 — UNIQUE (meeting_id, user_id)
--   · body JSON — TipTap JSON (간소화: paragraph + list + bold/italic 정도)
--   · body_text TEXT — 검색용 plain text fallback
--   · 모든 인증 사용자가 본인 메모 read/write (참석 여부 무관)
--   · 다른 사용자에게 안 보임
--
-- 권한 (API 측):
--   · GET: 본인 메모만 (where user_id = current_user)
--   · PUT: 본인 메모만 upsert
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- 멱등: CREATE TABLE IF NOT EXISTS + @col_exists 인덱스 패턴
-- 적용: mysql -h <host> -u <user> -p <db> < migrations/2026-05-16_meeting_personal_notes.sql
-- 롤백: 본 파일 하단 ROLLBACK 섹션
-- ============================================================

CREATE TABLE IF NOT EXISTS meeting_personal_notes (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  meeting_id      CHAR(36)     NOT NULL COMMENT 'meetings.id (논리 FK)',
  user_id         CHAR(36)     NOT NULL COMMENT 'profiles.id (논리 FK)',

  body            JSON         NULL COMMENT 'TipTap JSON 본문 (간소화)',
  body_text       TEXT         NULL COMMENT '검색용 plain text fallback',

  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_pn_meeting_user (meeting_id, user_id),
  KEY idx_pn_user_updated (user_id, updated_at),
  KEY idx_pn_meeting (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회의 개인 메모 — 본인만 read/write';

-- ============================================================
-- 검증 — 적용 후 다음 쿼리로 확인
-- ============================================================
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_COMMENT
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meeting_personal_notes';

SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meeting_personal_notes'
  ORDER BY ORDINAL_POSITION;

SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meeting_personal_notes'
  ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- 초기 row 수 (기대치: 0)
SELECT COUNT(*) AS row_count FROM meeting_personal_notes;

-- ============================================================
-- ROLLBACK (필요 시 수동 실행)
-- ============================================================
-- DROP TABLE IF EXISTS meeting_personal_notes;
