-- ============================================================
-- 개인 TODO 다중 해시태그 — personal_todos.tags (PR-MTG-V2-Todo-D, 2026-05-24)
--
-- 사용자 명령:
--   「해시태그나 카테고리로 구분이나 필터할수있을까?」 → 옵션 A 채택
--
-- category(단일 분류)는 그대로 두고, tags(다중 해시태그)를 추가.
-- 쉼표 구분 문자열로 저장 (예: '긴급,거래처,후속'). 태그 자체에는 쉼표 불가.
-- 필터는 /meetings/me 에서 client-side 처리 — 인덱스 불필요.
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- 멱등: information_schema 로 table + column 2중 체크
-- 선행: 2026-05-16_personal_todos.sql (personal_todos 테이블) 먼저 적용 필요
-- 적용: mysql -h <host> -u <user> -p <db> < migrations/2026-05-24_personal_todos_tags.sql
-- ROLLBACK: 파일 하단
-- ============================================================

SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'personal_todos');

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'personal_todos'
               AND COLUMN_NAME = 'tags');

SET @s := IF(@tbl = 0,
  'SELECT ''personal_todos 테이블이 없습니다 — 2026-05-16_personal_todos.sql 먼저 적용하세요'' AS notice',
  IF(@col = 0,
    'ALTER TABLE personal_todos ADD COLUMN tags VARCHAR(255) DEFAULT NULL COMMENT ''다중 해시태그 — 쉼표 구분 (예: 긴급,거래처,후속)'' AFTER memo',
    'SELECT ''personal_todos.tags already exists'' AS notice'));

PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ============================================================
-- 검증
-- ============================================================
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_COMMENT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_todos'
    AND COLUMN_NAME = 'tags';
-- 기대치: tags / varchar / 255 / YES

-- ============================================================
-- ROLLBACK (필요 시 수동 실행)
-- ============================================================
-- ALTER TABLE personal_todos DROP COLUMN tags;
