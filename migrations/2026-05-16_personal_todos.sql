-- ============================================================
-- 개인 TODO — personal_todos (PR-MTG-V2-Todo-A, 2026-05-16)
--
-- 사용자 명령:
--   「개인적으로 to do 를 회의 없이 사용할수도 있게 추가」
--   「회의가 아니여도 개인 스케줄관리나 별도 커스텀 건들」
--
-- meeting_action_items (회의 종속) 와 완전 분리 — 회의 없이 자유 생성.
-- /meetings/me (내 TODO) 에서 회의 액션 + 개인 TODO 통합 표시.
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- 멱등: CREATE TABLE IF NOT EXISTS
-- 적용: mysql -h <host> -u <user> -p <db> < migrations/2026-05-16_personal_todos.sql
-- ROLLBACK: 파일 하단
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_todos (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  user_id         CHAR(36)     NOT NULL COMMENT 'profiles.id (논리 FK) — 본인만 read/write',

  content         TEXT         NOT NULL COMMENT '할 일 내용',
  due_date        DATE         NULL COMMENT '마감일',
  status          VARCHAR(16)  NOT NULL DEFAULT 'open' COMMENT 'open|done|dropped',
  category        VARCHAR(32)  NULL COMMENT '분류 — 자유 입력 (개인/업무/스케줄/...)',
  priority        VARCHAR(8)   NULL COMMENT 'high|normal|low',
  memo            VARCHAR(500) NULL COMMENT '비고',

  done_at         DATETIME     NULL COMMENT '완료 시각',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_pt_user_status (user_id, status),
  KEY idx_pt_due (due_date),
  KEY idx_pt_user_category (user_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='개인 TODO — 회의 무관, 본인만 read/write';

-- ============================================================
-- 검증
-- ============================================================
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_COMMENT
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_todos';

SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_todos'
  ORDER BY ORDINAL_POSITION;

SELECT COUNT(*) AS row_count FROM personal_todos;  -- 기대치: 0

-- ============================================================
-- ROLLBACK (필요 시 수동 실행)
-- ============================================================
-- DROP TABLE IF EXISTS personal_todos;
