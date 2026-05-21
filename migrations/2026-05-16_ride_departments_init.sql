-- ═══════════════════════════════════════════════════════════════════
-- 라이드케어 부서 마스터 — ride_departments 신설 + 17 entry 시드
-- 2026-05-16 (hr 세션 PR-HR-1)
--
-- 목적:
--   · 라이드케어(외주 49명) 부서 마스터 — FMI 본사 departments 와 분리
--   · 4단계 계층 (본부 → 총괄 → 부서 → 파트)
--   · /hr 통합 페이지 「외부 인력」 탭 안 라이드 인력 부서 트리 / 부서장 UI
--
-- 도메인 사실 (사용자 명시 2026-05-16):
--   "현재는 메인은 에프엠아이 라이드는 외주로해서 셋팅되어있음"
--   → ride_departments 는 라이드케어 외주 전용. FMI 본사 부서 (departments) 는 별개.
--
-- 멱등성 (Rule 24):
--   · UNIQUE KEY uq_ride_dept_name — 동일 이름 차단
--   · INSERT IGNORE — 중복 시 skip
--   · IF NOT EXISTS — 테이블 멱등
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- 검증 SQL: 본 파일 하단
-- ROLLBACK: 본 파일 하단
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- (1) ride_departments 테이블 신설
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_departments (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  name               VARCHAR(64)  NOT NULL,
  parent_id          CHAR(36)     NULL COMMENT '부모 부서 (NULL=본부 루트)',
  leader_employee_id CHAR(36)     NULL COMMENT '부서장 ride_employees.id (시드 후 UPDATE) — meetings V2-Visibility-FK 와 컬럼명 통일',
  color_tone         VARCHAR(16)  NOT NULL DEFAULT 'slate'
                     COMMENT 'Glass 5색 자동 매핑: blue|green|red|amber|violet|slate',
  sort_order         INT          NOT NULL DEFAULT 0,
  description        VARCHAR(255) NULL,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_dept_name (name),
  KEY idx_ride_dept_parent (parent_id),
  KEY idx_ride_dept_leader (leader_employee_id),
  KEY idx_ride_dept_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────────────────────────────────────────────
-- (2) 시드 17 entry — 라이드케어 조직도 (v2026.04.29 기준)
--     · ID hardcoded UUID v4 형식 (deterministic — 재실행 안전 + parent_id 자기 참조 가능)
--     · UUID 형식: d0000000-0000-0000-0000-000000000000 (36자, prefix 'd' = department)
--     · INSERT IGNORE — 같은 name 또는 같은 id 있으면 skip
--     · 색상 Glass 5색 자동 매핑 (의미 기반):
--         red    = 사고/위험
--         green  = 정비/정상
--         amber  = 영업/주의/경고
--         blue   = 인프라/정보
--         violet = 총괄/핵심
-- ───────────────────────────────────────────────────────────────────

-- Level 1 — 본부 2개 (parent=NULL)
INSERT IGNORE INTO ride_departments (id, name, parent_id, color_tone, sort_order, description) VALUES
  ('d0000001-0000-0000-0000-000000000001', '케어',          NULL, 'violet', 1, '라이드케어 (외주) — 임성민 이사'),
  ('d0000001-0000-0000-0000-000000000002', '영업',          NULL, 'amber',  2, '라이드케어 (외주) — 정봉선 이사');

-- Level 2 — 총괄 1개 (parent=케어)
INSERT IGNORE INTO ride_departments (id, name, parent_id, color_tone, sort_order, description) VALUES
  ('d0000002-0000-0000-0000-000000000003', 'MT운영총괄',   'd0000001-0000-0000-0000-000000000001', 'violet', 1, '석호민 부장');

-- Level 3 — 부서 9개 (parent=MT운영총괄)
INSERT IGNORE INTO ride_departments (id, name, parent_id, color_tone, sort_order, description) VALUES
  ('d0000003-0000-0000-0000-000000000004', '사고',          'd0000002-0000-0000-0000-000000000003', 'red',    1, '8명 — 팀장 채용중'),
  ('d0000003-0000-0000-0000-000000000005', '충전기',        'd0000002-0000-0000-0000-000000000003', 'blue',   2, '3명 — 팀장 채용중'),
  ('d0000003-0000-0000-0000-000000000006', '법정검사',      'd0000002-0000-0000-0000-000000000003', 'amber',  3, '4명 — 이주희 차장'),
  ('d0000003-0000-0000-0000-000000000007', '순회정비',      'd0000002-0000-0000-0000-000000000003', 'green',  4, '12명 — 최지광 차장'),
  ('d0000003-0000-0000-0000-000000000008', '범칙금',        'd0000002-0000-0000-0000-000000000003', 'amber',  5, '2명'),
  ('d0000003-0000-0000-0000-000000000009', 'CX',           'd0000002-0000-0000-0000-000000000003', 'violet', 6, '22명 — 전소현 차장팀장'),
  ('d0000003-0000-0000-0000-000000000010', '부품',          'd0000002-0000-0000-0000-000000000003', 'blue',   7, '1명 — 이상준B 부장'),
  ('d0000003-0000-0000-0000-000000000011', 'IT인프라',      'd0000002-0000-0000-0000-000000000003', 'blue',   8, '4명 — 양재희 부장'),
  ('d0000003-0000-0000-0000-000000000012', '영업기획',      'd0000002-0000-0000-0000-000000000003', 'amber',  9, '3명 (가명) — 석호민 부장 겸업');

-- Level 4 — 파트 6개
INSERT IGNORE INTO ride_departments (id, name, parent_id, color_tone, sort_order, description) VALUES
  -- 사고 산하
  ('d0000004-0000-0000-0000-000000000013', '사고_현장',     'd0000003-0000-0000-0000-000000000004', 'red',    1, '3명'),
  ('d0000004-0000-0000-0000-000000000014', '사고_손사',     'd0000003-0000-0000-0000-000000000004', 'red',    2, '4명'),
  -- 충전기 산하
  ('d0000004-0000-0000-0000-000000000015', 'CX_충전기',     'd0000003-0000-0000-0000-000000000005', 'blue',   1, '1명 — 박민경 / 6월 콜 종료'),
  -- CX 산하
  ('d0000004-0000-0000-0000-000000000016', 'CX_주4',       'd0000003-0000-0000-0000-000000000009', 'blue',   1, '5명 — 안경희 파트장'),
  ('d0000004-0000-0000-0000-000000000017', 'CX_주5',       'd0000003-0000-0000-0000-000000000009', 'green',  2, '11명 — 정지은 파트장+교육'),
  ('d0000004-0000-0000-0000-000000000018', 'CX_야간',      'd0000003-0000-0000-0000-000000000009', 'amber',  3, '6명 — 윤민진 파트장');

-- ───────────────────────────────────────────────────────────────────
-- (3) 멱등 보정 — 이미 manager_id 로 생성된 경우 leader_employee_id 로 rename
--     (meetings V2-Visibility-FK 컬럼명 통일 — 2026-05-16 hr↔meetings 세션 합의)
--     · 본 마이그를 이전 버전(manager_id)으로 한 번 적용한 경우 자동 보정
--     · 신규 적용 시는 위 CREATE TABLE 이 이미 leader_employee_id → 본 블록 skip
-- ───────────────────────────────────────────────────────────────────
SET @has_old := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_departments' AND COLUMN_NAME = 'manager_id');
SET @has_new := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ride_departments' AND COLUMN_NAME = 'leader_employee_id');
SET @sql := IF(@has_old = 1 AND @has_new = 0,
  'ALTER TABLE ride_departments CHANGE COLUMN manager_id leader_employee_id CHAR(36) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SQL (적용 후 직접 실행)
-- ═══════════════════════════════════════════════════════════════════
-- 검증 1: 부서 수 = 17
-- SELECT COUNT(*) AS total FROM ride_departments;
--
-- 검증 2: ID 길이 = 36 (CHAR(36) 일치)
-- SELECT MIN(CHAR_LENGTH(id)) AS min_len, MAX(CHAR_LENGTH(id)) AS max_len FROM ride_departments;
--
-- 검증 3: 계층 구조 (재귀 — MySQL 8.0+)
-- WITH RECURSIVE t AS (
--   SELECT id, name, parent_id, 0 AS depth, name AS path
--     FROM ride_departments WHERE parent_id IS NULL
--   UNION ALL
--   SELECT d.id, d.name, d.parent_id, t.depth+1, CONCAT(t.path, ' > ', d.name)
--     FROM ride_departments d JOIN t ON d.parent_id = t.id
-- )
-- SELECT depth, path FROM t ORDER BY path;
--
-- 검증 4: 색상 분포
-- SELECT color_tone, COUNT(*) FROM ride_departments GROUP BY color_tone;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (역순)
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS ride_departments;
