-- ═══════════════════════════════════════════════════════════════════
-- N-21-a — 그룹 설정 버전 timeline (Step 1 — 데이터 모델 + UI 기본)
--   2026-05-16 sukhomin87@gmail.com
--
-- 사용자 의도: 「로테이션이나 그룹설정 주기를 스케줄링」
--   = 그룹 설정 자체가 기간별로 다른 형태로 자동 적용
--   v1: 2026-06 ~ 2026-08 — sequence [L01, L02, L03], 워커 A·B·C
--   v2: 2026-09 ~ 2026-12 — sequence [L02, L03, L04], 워커 A·B·D
--
-- 모델:
--   · cs_shift_groups (헤더)        이름/카테고리/color_tone — 변하지 않는 메타
--   · cs_shift_group_versions       기간별 설정 (rotation/pattern/시프트 sequence 메타)
--   · cs_group_shift_versions       각 버전의 시프트 sequence (1:N)
--   · cs_group_member_versions      각 버전의 멤버 + cfg (priority/rotation_start 등)
--
-- 백워드 호환:
--   · 기존 cs_shift_groups + cs_group_shifts + cs_group_members 유지
--   · 버전이 0개인 그룹은 기존 path 그대로 동작 (자동 생성 영향 X)
--   · 버전 ≥ 1 인 그룹은 N-21-b 에서 알고리즘 변경 후 사용
--
-- 호환: MySQL 8.0
-- 멱등 적용 — 여러 번 실행 안전.
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] cs_shift_group_versions 신설
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_shift_group_versions (
  id                     CHAR(36)  NOT NULL PRIMARY KEY,
  group_id               CHAR(36)  NOT NULL,
  valid_from             DATE      NOT NULL  COMMENT '시작일',
  valid_to               DATE      NULL      COMMENT '종료일 (NULL = 무한)',
  -- 그룹 설정 snapshot
  rotation_enabled       TINYINT(1) NOT NULL DEFAULT 0,
  rotation_period_kind   VARCHAR(16) NOT NULL DEFAULT 'monthly'
                          COMMENT 'monthly | days',
  rotation_custom_days   INT       NOT NULL DEFAULT 30,
  pattern_type           VARCHAR(32) NOT NULL DEFAULT 'all_weekdays',
  custom_days            VARCHAR(16) NULL,
  generation_strategy    VARCHAR(32) NOT NULL DEFAULT 'all_members',
  rotation_size          INT       NULL,
  rotation_period_days   INT       NOT NULL DEFAULT 1,
  skip_on_holidays       TINYINT(1) NOT NULL DEFAULT 0,
  note                   VARCHAR(255) NULL  COMMENT '버전 설명 (예: 6~8월 여름 패턴)',
  created_at             DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cs_sgv_group_from (group_id, valid_from),
  KEY idx_cs_sgv_active (group_id, valid_from, valid_to),
  CONSTRAINT fk_cs_sgv_group FOREIGN KEY (group_id)
    REFERENCES cs_shift_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
-- [STEP 2] cs_group_shift_versions 신설 (각 버전의 시프트 sequence)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_group_shift_versions (
  id              CHAR(36)  NOT NULL PRIMARY KEY,
  version_id      CHAR(36)  NOT NULL,
  shift_slot_id   CHAR(36)  NOT NULL,
  sort_order      INT       NOT NULL DEFAULT 0,
  created_at      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_gsv_version_slot (version_id, shift_slot_id),
  KEY idx_cs_gsv_version (version_id, sort_order),
  CONSTRAINT fk_cs_gsv_version FOREIGN KEY (version_id)
    REFERENCES cs_shift_group_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_gsv_slot FOREIGN KEY (shift_slot_id)
    REFERENCES cs_shift_slots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
-- [STEP 3] cs_group_member_versions 신설 (각 버전의 멤버 + cfg)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_group_member_versions (
  id                          CHAR(36)  NOT NULL PRIMARY KEY,
  version_id                  CHAR(36)  NOT NULL,
  worker_id                   CHAR(36)  NOT NULL,
  priority                    INT       NOT NULL DEFAULT 0,
  -- Phase K 멤버 cfg snapshot
  priority_level              TINYINT   NOT NULL DEFAULT 2,
  preferred_dow_prefer        VARCHAR(32) NULL,
  preferred_dow_avoid         VARCHAR(32) NULL,
  max_consecutive_work_days   INT       NULL,
  required_days_per_month     INT       NULL,
  max_days_per_month          INT       NULL,
  blocked_slot_ids            TEXT      NULL  COMMENT 'JSON 배열',
  work_pattern_text           VARCHAR(255) NULL,
  -- N-19-a 시프트 로테이션 시작
  rotation_start_date         DATE      NULL,
  rotation_start_index        TINYINT   NOT NULL DEFAULT 0,
  rotation_end_date           DATE      NULL,
  created_at                  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_gmv_version_worker (version_id, worker_id),
  KEY idx_cs_gmv_version (version_id, priority),
  CONSTRAINT fk_cs_gmv_version FOREIGN KEY (version_id)
    REFERENCES cs_shift_group_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_gmv_worker FOREIGN KEY (worker_id)
    REFERENCES cs_workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- 1) 새 테이블 3개 생성 확인 (기대: 3 rows)
-- SELECT TABLE_NAME FROM information_schema.TABLES
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
--   ('cs_shift_group_versions','cs_group_shift_versions','cs_group_member_versions');
--
-- 2) FK 검증 (기대: 4 rows)
-- SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
-- FROM information_schema.REFERENTIAL_CONSTRAINTS
-- WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME LIKE 'fk_cs_gmv%' OR CONSTRAINT_NAME LIKE 'fk_cs_gsv%' OR CONSTRAINT_NAME LIKE 'fk_cs_sgv%';

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_group_member_versions;
-- DROP TABLE IF EXISTS cs_group_shift_versions;
-- DROP TABLE IF EXISTS cs_shift_group_versions;
