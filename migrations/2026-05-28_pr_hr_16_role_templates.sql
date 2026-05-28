-- ═══════════════════════════════════════════════════════════════
-- PR-HR-16 — role_templates × company (페이지 권한 템플릿)
-- 설계: CLAUDE.md § PR-HR-15+16 통합 설계서 v2
-- ───────────────────────────────────────────────────────────────
-- 목적: 사용자 「실수할까봐 두려움」 직접 해결.
--   직원 추가 시 회사 + 역할 (예: 「라이드 일반 직원」) 선택 →
--   role_template_pages 의 페이지 권한 묶음 자동 적용 →
--   user_page_permissions 에 일괄 INSERT.
--   이후 개별 페이지 권한 토글 가능 (override).
-- ───────────────────────────────────────────────────────────────
-- 멱등 (Rule 23/24).
-- 적용: mysql -h 34.47.105.219 -u <user> -p fmi_op < 이 파일
-- ═══════════════════════════════════════════════════════════════

SET @db := DATABASE();

-- ── 1. role_templates (회사 × 역할 헤더) ──
CREATE TABLE IF NOT EXISTS role_templates (
  id          CHAR(36)      NOT NULL,
  company_id  CHAR(36)      NOT NULL,
  role_key    VARCHAR(40)   NOT NULL COMMENT '역할 키 (admin/manager/staff/viewer 등)',
  label       VARCHAR(80)   NOT NULL COMMENT 'UI 노출 라벨 (예: 「라이드 일반 직원」)',
  description VARCHAR(255)  NULL     COMMENT '역할 설명',
  sort_order  INT           NOT NULL DEFAULT 100,
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_template_company_role (company_id, role_key),
  INDEX idx_role_templates_company (company_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회사별 역할 템플릿 (페이지 권한 묶음)';

-- ── 2. role_template_pages (템플릿당 페이지 권한 묶음) ──
CREATE TABLE IF NOT EXISTS role_template_pages (
  id          CHAR(36)     NOT NULL,
  template_id CHAR(36)     NOT NULL,
  page_path   VARCHAR(255) NOT NULL,
  can_view    TINYINT(1)   NOT NULL DEFAULT 0,
  can_create  TINYINT(1)   NOT NULL DEFAULT 0,
  can_edit    TINYINT(1)   NOT NULL DEFAULT 0,
  can_delete  TINYINT(1)   NOT NULL DEFAULT 0,
  data_scope  VARCHAR(20)  NOT NULL DEFAULT 'all' COMMENT 'all / department / own',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_tpl_page (template_id, page_path),
  INDEX idx_role_tpl_pages_tpl (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='템플릿당 페이지 권한 묶음';

-- ── 3. user_page_permissions 에 source_template_id 추가 (추적용, 선택) ──
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='user_page_permissions' AND column_name='source_template_id')=0,
  'ALTER TABLE user_page_permissions ADD COLUMN source_template_id CHAR(36) NULL COMMENT ''원본 템플릿 (있으면 template apply 결과)''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=@db AND table_name='user_page_permissions' AND index_name='idx_upp_source_template')=0,
  'ALTER TABLE user_page_permissions ADD INDEX idx_upp_source_template (source_template_id)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ── 4. 기본 템플릿 시드 (FMI / RIDE × admin / manager / staff / viewer = 8개) ──
-- 멱등: 이미 존재하면 INSERT 무시 (uq_role_template_company_role UNIQUE 제약).
-- 페이지 권한은 별도 시드 X — 사용자가 UI 에서 채움 (또는 PR-HR-16 후속 작업).

-- 4a. FMI 4개
INSERT IGNORE INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
SELECT UUID(), c.id, 'admin',   'FMI 관리자',   '모든 페이지 / 모든 권한',  10, 1, NOW(), NOW()
  FROM companies c WHERE c.company_key='FMI';
INSERT IGNORE INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
SELECT UUID(), c.id, 'manager', 'FMI 매니저',   '대부분 페이지 / 편집 권한', 20, 1, NOW(), NOW()
  FROM companies c WHERE c.company_key='FMI';
INSERT IGNORE INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
SELECT UUID(), c.id, 'staff',   'FMI 일반 직원', '본인 영역 / 조회 위주',    30, 1, NOW(), NOW()
  FROM companies c WHERE c.company_key='FMI';
INSERT IGNORE INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
SELECT UUID(), c.id, 'viewer',  'FMI 조회 전용', '읽기 전용',                40, 1, NOW(), NOW()
  FROM companies c WHERE c.company_key='FMI';

-- 4b. RIDE 4개
INSERT IGNORE INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
SELECT UUID(), c.id, 'admin',   '라이드 관리자',   '라이드 모듈 / 모든 권한',   10, 1, NOW(), NOW()
  FROM companies c WHERE c.company_key='RIDE';
INSERT IGNORE INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
SELECT UUID(), c.id, 'manager', '라이드 매니저',   '라이드 모듈 / 편집 권한',  20, 1, NOW(), NOW()
  FROM companies c WHERE c.company_key='RIDE';
INSERT IGNORE INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
SELECT UUID(), c.id, 'staff',   '라이드 일반 직원', '본인 영역 / 조회 위주',    30, 1, NOW(), NOW()
  FROM companies c WHERE c.company_key='RIDE';
INSERT IGNORE INTO role_templates (id, company_id, role_key, label, description, sort_order, is_active, created_at, updated_at)
SELECT UUID(), c.id, 'viewer',  '라이드 조회 전용', '읽기 전용',                40, 1, NOW(), NOW()
  FROM companies c WHERE c.company_key='RIDE';

-- ═══════════════════════════════════════════════════════════════
-- 검증 (적용 후 실행 — Rule 23):
--   SELECT c.company_key, rt.role_key, rt.label, rt.sort_order
--     FROM role_templates rt JOIN companies c ON c.id=rt.company_id
--    ORDER BY c.sort_order, rt.sort_order;
--   -- 기대: FMI 4행 + RIDE 4행 = 8행
--
--   SHOW CREATE TABLE role_template_pages;
--   -- 기대: id / template_id / page_path / can_* / data_scope / 타임스탬프
--
--   DESC user_page_permissions;
--   -- 기대: source_template_id 컬럼 존재
-- ═══════════════════════════════════════════════════════════════
