-- ═══════════════════════════════════════════════════════════════
-- PR-HR-16 hotfix — role_templates / role_template_pages collation 통일
-- ───────────────────────────────────────────────────────────────
-- 사고 (2026-05-28): JOIN 실행 시
--   Error 1267 (HY000): Illegal mix of collations
--   (utf8mb4_unicode_ci, IMPLICIT) and (utf8mb4_0900_ai_ci, IMPLICIT) for operation '='
--
-- 원인: CREATE TABLE 시 디폴트 collation (MySQL 8.x = utf8mb4_0900_ai_ci) 사용 →
--       기존 companies.id (utf8mb4_unicode_ci) 와 mismatch.
-- 조치: 두 신규 테이블 + 컬럼을 utf8mb4_unicode_ci 로 통일.
--       CLAUDE.md § 15 의 collation lint 자동화 (TBD) 가 사후 차단할 영역.
-- ───────────────────────────────────────────────────────────────
-- 멱등 (Rule 23/24) — 여러 번 실행해도 안전.
-- 적용: mysql -h 34.47.105.219 -u <user> -p fmi_op < 이 파일
-- ═══════════════════════════════════════════════════════════════

SET @db := DATABASE();

-- ── 1. 테이블 레벨 collation 통일 ──
ALTER TABLE role_templates       CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE role_template_pages  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── 2. 개별 CHAR(36) 컬럼 collation 명시 (CONVERT 가 놓치는 경우 대비) ──
ALTER TABLE role_templates
  MODIFY id          CHAR(36)     NOT NULL                    COLLATE utf8mb4_unicode_ci,
  MODIFY company_id  CHAR(36)     NOT NULL                    COLLATE utf8mb4_unicode_ci,
  MODIFY role_key    VARCHAR(40)  NOT NULL                    COLLATE utf8mb4_unicode_ci,
  MODIFY label       VARCHAR(80)  NOT NULL                    COLLATE utf8mb4_unicode_ci,
  MODIFY description VARCHAR(255) NULL                        COLLATE utf8mb4_unicode_ci;

ALTER TABLE role_template_pages
  MODIFY id          CHAR(36)     NOT NULL                    COLLATE utf8mb4_unicode_ci,
  MODIFY template_id CHAR(36)     NOT NULL                    COLLATE utf8mb4_unicode_ci,
  MODIFY page_path   VARCHAR(255) NOT NULL                    COLLATE utf8mb4_unicode_ci,
  MODIFY data_scope  VARCHAR(20)  NOT NULL DEFAULT 'all'      COLLATE utf8mb4_unicode_ci;

-- ── 3. user_page_permissions.source_template_id 도 통일 (PR-HR-16 추가 컬럼) ──
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='user_page_permissions' AND column_name='source_template_id')>0,
  'ALTER TABLE user_page_permissions MODIFY source_template_id CHAR(36) NULL COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════
-- 검증 (적용 후 실행 — Rule 23):
--   SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME
--     FROM information_schema.columns
--    WHERE table_schema=DATABASE()
--      AND table_name IN ('role_templates','role_template_pages')
--      AND collation_name IS NOT NULL;
--   -- 기대: 모두 utf8mb4_unicode_ci
--
--   SELECT c.company_key, rt.role_key, rt.label
--     FROM role_templates rt JOIN companies c ON c.id=rt.company_id
--    ORDER BY c.sort_order, rt.sort_order;
--   -- 기대: 1267 에러 없이 8행 반환
-- ═══════════════════════════════════════════════════════════════
