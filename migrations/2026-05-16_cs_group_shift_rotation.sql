-- ═══════════════════════════════════════════════════════════════════
-- N-19-a — 그룹 multi-shift 로테이션 (그룹 하나에 시프트 여러 개)
--   2026-05-16 sukhomin87@gmail.com
--
-- 사용자 의도: 「주중 통합」 그룹 1개 안에 L01 07-16 / L02 08-17 / L03 09-18
--   시프트 여러 개를 넣고, 워커마다 매월(또는 N일) 자동 순환.
--
-- 데이터 모델:
--   · cs_group_shifts (신설)            그룹 ↔ 시프트 1:N 매핑 (순서 보존)
--   · cs_shift_groups (ALTER)           rotation_enabled / period_kind / period_days
--   · cs_group_members (ALTER)          rotation_start_date / start_index / end_date
--
-- 호환: MySQL 8.0
-- 백워드 호환: rotation_enabled = 0 (default) — 기존 단일 shift_slot_id 그룹 그대로 동작
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] cs_group_shifts 신설 (멱등 — IF NOT EXISTS)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_group_shifts (
  id            CHAR(36)  NOT NULL PRIMARY KEY,
  group_id      CHAR(36)  NOT NULL,
  shift_slot_id CHAR(36)  NOT NULL,
  sort_order    INT       NOT NULL DEFAULT 0  COMMENT '시프트 sequence 순서 (0부터)',
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_gs_group_slot (group_id, shift_slot_id),
  KEY idx_cs_gs_group (group_id, sort_order),
  CONSTRAINT fk_cs_gs_group FOREIGN KEY (group_id)
    REFERENCES cs_shift_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_gs_slot FOREIGN KEY (shift_slot_id)
    REFERENCES cs_shift_slots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
-- [STEP 2] cs_shift_groups 에 rotation 컬럼 추가 (멱등)
-- ──────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'rotation_enabled');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN rotation_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''시프트 로테이션 사용 여부 (1=cs_group_shifts 참조, 0=shift_slot_id 단일)''',
  'SELECT ''rotation_enabled already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'rotation_period_kind');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN rotation_period_kind VARCHAR(16) NOT NULL DEFAULT ''monthly'' COMMENT ''monthly | days''',
  'SELECT ''rotation_period_kind already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'rotation_custom_days');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN rotation_custom_days INT NOT NULL DEFAULT 30 COMMENT ''period_kind=days 일 때만 사용''',
  'SELECT ''rotation_custom_days already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ──────────────────────────────────────────────────────────────
-- [STEP 3] cs_group_members 에 rotation 컬럼 추가 (멱등)
-- ──────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'rotation_start_date');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN rotation_start_date DATE NULL COMMENT ''로테이션 시작 일자 — NULL 이면 group.created_at 기준''',
  'SELECT ''rotation_start_date already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'rotation_start_index');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN rotation_start_index TINYINT NOT NULL DEFAULT 0 COMMENT ''sequence 어느 시프트부터 시작 (0=첫 번째)''',
  'SELECT ''rotation_start_index already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
               AND COLUMN_NAME = 'rotation_end_date');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_group_members ADD COLUMN rotation_end_date DATE NULL COMMENT ''로테이션 종료 일자 — NULL = 무한''',
  'SELECT ''rotation_end_date already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- 1) 새 테이블 생성 확인 (기대: 1 row)
-- SELECT TABLE_NAME FROM information_schema.TABLES
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_shifts';
--
-- 2) cs_shift_groups 신규 컬럼 3개 (기대: 3 rows)
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
--   AND COLUMN_NAME IN ('rotation_enabled','rotation_period_kind','rotation_custom_days');
--
-- 3) cs_group_members 신규 컬럼 3개 (기대: 3 rows)
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_group_members'
--   AND COLUMN_NAME IN ('rotation_start_date','rotation_start_index','rotation_end_date');

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_group_shifts;
-- ALTER TABLE cs_shift_groups DROP COLUMN rotation_enabled;
-- ALTER TABLE cs_shift_groups DROP COLUMN rotation_period_kind;
-- ALTER TABLE cs_shift_groups DROP COLUMN rotation_custom_days;
-- ALTER TABLE cs_group_members DROP COLUMN rotation_start_date;
-- ALTER TABLE cs_group_members DROP COLUMN rotation_start_index;
-- ALTER TABLE cs_group_members DROP COLUMN rotation_end_date;
