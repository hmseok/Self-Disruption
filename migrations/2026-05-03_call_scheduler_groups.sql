-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler 그룹 마스터 — PR-2I (2026-05-03)
--
-- 신규 테이블:
--   1) cs_shift_groups      — 시프트 그룹 (예: "주간 09-18")
--   2) cs_group_members     — 그룹 ↔ 워커 M:N
--
-- 사용 흐름:
--   매니저가 그룹 만들고 → 워커 매핑 → 자동 생성 API → cs_assignments 한 번에 채움
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- (1) cs_shift_groups — 시프트 그룹 정의
CREATE TABLE IF NOT EXISTS cs_shift_groups (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,
  name                 VARCHAR(64)  NOT NULL COMMENT '예: 주간 09-18',
  shift_slot_id        CHAR(36)     NOT NULL COMMENT '시프트 슬롯 FK',
  pattern_type         VARCHAR(16)  NOT NULL DEFAULT 'all_weekdays'
                       COMMENT 'all_days|all_weekdays|weekends_only|custom',
  custom_days          VARCHAR(32)  NULL COMMENT 'custom 일 때 0,1,2,3,4,5,6 (일~토)',
  generation_strategy  VARCHAR(16)  NOT NULL DEFAULT 'all_members'
                       COMMENT 'all_members|rotation',
  rotation_size        TINYINT      NULL COMMENT 'rotation 일 때 하루 인원 수',
  rotation_period_days TINYINT      NOT NULL DEFAULT 1
                       COMMENT '몇 일마다 로테이션 (rotation 일 때)',
  color_tone           VARCHAR(16)  NOT NULL DEFAULT 'none'
                       COMMENT 'blue|gray|green|amber|violet|red|none — 그룹 식별 색상',
  description          VARCHAR(255) NULL,
  sort_order           INT          NOT NULL DEFAULT 0,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cs_grp_active (is_active, sort_order),
  KEY idx_cs_grp_slot (shift_slot_id),
  CONSTRAINT fk_cs_grp_slot
    FOREIGN KEY (shift_slot_id) REFERENCES cs_shift_slots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (2) cs_group_members — 그룹 ↔ 워커 M:N
CREATE TABLE IF NOT EXISTS cs_group_members (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  group_id    CHAR(36)     NOT NULL,
  worker_id   CHAR(36)     NOT NULL,
  priority    INT          NOT NULL DEFAULT 0 COMMENT '로테이션 순서 (낮을수록 먼저)',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_grp_member (group_id, worker_id),
  KEY idx_cs_grp_member_group (group_id, priority),
  KEY idx_cs_grp_member_worker (worker_id),
  CONSTRAINT fk_cs_grp_member_group
    FOREIGN KEY (group_id) REFERENCES cs_shift_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_grp_member_worker
    FOREIGN KEY (worker_id) REFERENCES cs_workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_group_members;
-- DROP TABLE IF EXISTS cs_shift_groups;
