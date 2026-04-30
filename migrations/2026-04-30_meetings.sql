-- ═══════════════════════════════════════════════════════════════════
-- 회의록 시스템 — 4 테이블
-- 2026-04-30
--
-- 신규 테이블:
--   1) meetings — 회의 마스터 (정기/특정/1:1/부서)
--   2) meeting_attendees — 참석자
--   3) meeting_minutes — 회의록 본문 섹션 (안건/결정/메모)
--   4) meeting_action_items — 액션 아이템 (TODO 추적)
--
-- 권한:
--   · 생성: 모든 직원
--   · 편집: organizer 또는 admin
--   · 조회: 참석자 + 같은 부서원(부서회의) + admin
--   · API 측에서 verifyUser + 참석자 체크
--
-- 롤백: 본 파일 하단 ROLLBACK 섹션
-- ═══════════════════════════════════════════════════════════════════

-- (1) meetings — 회의 마스터
CREATE TABLE IF NOT EXISTS meetings (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  title           VARCHAR(255) NOT NULL,
  type            VARCHAR(32)  NOT NULL DEFAULT 'specific'
    COMMENT 'regular|specific|one_on_one|department',
  meeting_date    DATETIME     NULL,
  duration_min    INT          NULL,
  location        VARCHAR(255) NULL,
  organizer_id    CHAR(36)     NULL COMMENT 'profiles.id',
  department      VARCHAR(64)  NULL COMMENT 'department 회의 시 부서명',
  status          VARCHAR(16)  NOT NULL DEFAULT 'draft'
    COMMENT 'draft|published|archived',
  agenda          TEXT         NULL,
  summary         TEXT         NULL,
  created_by      CHAR(36)     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME     NULL,
  KEY idx_m_date (meeting_date),
  KEY idx_m_organizer (organizer_id),
  KEY idx_m_dept (department),
  KEY idx_m_status (status),
  KEY idx_m_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회의 마스터';

-- (2) meeting_attendees — 참석자 (직원별 분리 핵심)
CREATE TABLE IF NOT EXISTS meeting_attendees (
  id              CHAR(36)    NOT NULL PRIMARY KEY,
  meeting_id      CHAR(36)    NOT NULL,
  profile_id      CHAR(36)    NULL COMMENT 'profiles.id (외부인은 NULL)',
  external_name   VARCHAR(64) NULL COMMENT '외부 참석자 이름',
  role            VARCHAR(16) NOT NULL DEFAULT 'attendee'
    COMMENT 'organizer|attendee|observer',
  attendance      VARCHAR(16) NOT NULL DEFAULT 'present'
    COMMENT 'present|absent|excused',
  note            VARCHAR(255) NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ma_meeting (meeting_id),
  KEY idx_ma_profile (profile_id),
  UNIQUE KEY uniq_ma_meeting_profile (meeting_id, profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회의 참석자';

-- (3) meeting_minutes — 회의록 본문 섹션
CREATE TABLE IF NOT EXISTS meeting_minutes (
  id              CHAR(36)    NOT NULL PRIMARY KEY,
  meeting_id      CHAR(36)    NOT NULL,
  section_type    VARCHAR(16) NOT NULL DEFAULT 'note'
    COMMENT 'agenda|decision|note|attachment',
  order_no        INT         NOT NULL DEFAULT 1,
  title           VARCHAR(255) NULL,
  content         TEXT        NULL,
  attachment_url  VARCHAR(500) NULL,
  created_by      CHAR(36)    NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mm_meeting (meeting_id),
  KEY idx_mm_section (section_type),
  KEY idx_mm_order (meeting_id, order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회의록 본문 섹션';

-- (4) meeting_action_items — 액션 아이템 (TODO 추적)
CREATE TABLE IF NOT EXISTS meeting_action_items (
  id              CHAR(36)    NOT NULL PRIMARY KEY,
  meeting_id      CHAR(36)    NOT NULL,
  assignee_id     CHAR(36)    NULL COMMENT '담당자 profiles.id',
  external_assignee VARCHAR(64) NULL COMMENT '외부 담당자',
  content         TEXT        NOT NULL,
  due_date        DATE        NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'open'
    COMMENT 'open|done|dropped',
  done_at         DATETIME    NULL,
  done_note       VARCHAR(255) NULL,
  created_by      CHAR(36)    NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mai_meeting (meeting_id),
  KEY idx_mai_assignee (assignee_id),
  KEY idx_mai_status (status),
  KEY idx_mai_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회의 액션 아이템';

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (필요 시 수동 실행)
-- ═══════════════════════════════════════════════════════════════════
--
-- DROP TABLE IF EXISTS meeting_action_items;
-- DROP TABLE IF EXISTS meeting_minutes;
-- DROP TABLE IF EXISTS meeting_attendees;
-- DROP TABLE IF EXISTS meetings;
