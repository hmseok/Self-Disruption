-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler — 근무시간표 분석 & 체크 배포 (5 테이블 + 시드)
-- 2026-05-03
--
-- 모듈 격리: 모든 테이블 prefix `cs_`
--
-- 신규 테이블:
--   1) cs_shift_slots       — 시프트 라인 정의 (마스터, 13행)
--   2) cs_workers           — 근무자 (16명 시드)
--   3) cs_schedules         — 월별 스케줄 헤더
--   4) cs_assignments       — 일자×슬롯×근무자 배정 (그리드 1셀)
--   5) cs_distributions     — 배포(공지) 이력
--
-- 권한:
--   · 조회: verifyUser 통과 모두
--   · 편집/배포: 동일 (Phase 2에서 role 가드 추가)
--
-- 호환:
--   · MySQL 8.0 (Cloud SQL r-care-db)
--   · timezone Asia/Seoul (서버 default)
--
-- 롤백: 본 파일 하단 ROLLBACK 섹션
-- ═══════════════════════════════════════════════════════════════════

-- (1) cs_shift_slots — 시프트 라인 마스터
CREATE TABLE IF NOT EXISTS cs_shift_slots (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  code            VARCHAR(16)  NOT NULL COMMENT 'L01..L13 라인 코드',
  label           VARCHAR(64)  NOT NULL COMMENT '07:30~16:30 표시명',
  start_time      TIME         NOT NULL,
  end_time        TIME         NOT NULL,
  is_overnight    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=익일 종료(20:30~08:30)',
  category        VARCHAR(16)  NOT NULL DEFAULT 'day' COMMENT 'day|evening|overnight',
  sort_order      INT          NOT NULL DEFAULT 0 COMMENT '캘린더 행 순서',
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_slot_code (code),
  KEY idx_cs_slot_sort (sort_order, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (2) cs_workers — 근무자
CREATE TABLE IF NOT EXISTS cs_workers (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  name            VARCHAR(32)  NOT NULL,
  profile_id      CHAR(36)     NULL COMMENT 'profiles.id 옵션 FK',
  color_tone      VARCHAR(16)  NOT NULL DEFAULT 'none'
                  COMMENT 'blue|gray|green|amber|violet|red|none',
  group_label     VARCHAR(16)  NULL COMMENT '주간|야간|저녁',
  phone           VARCHAR(32)  NULL,
  email           VARCHAR(128) NULL,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cs_worker_active (is_active, group_label),
  KEY idx_cs_worker_profile (profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (3) cs_schedules — 월별 스케줄 헤더
CREATE TABLE IF NOT EXISTS cs_schedules (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  year            SMALLINT     NOT NULL,
  month           TINYINT      NOT NULL,
  title           VARCHAR(128) NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'draft'
                  COMMENT 'draft|published|archived',
  source          VARCHAR(16)  NOT NULL DEFAULT 'manual' COMMENT 'manual|excel',
  published_at    DATETIME     NULL,
  published_by    CHAR(36)     NULL COMMENT 'profiles.id',
  note            TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_sched_ym (year, month),
  KEY idx_cs_sched_status (status, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (4) cs_assignments — 일자×슬롯 배정 (캘린더 1셀)
CREATE TABLE IF NOT EXISTS cs_assignments (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  schedule_id     CHAR(36)     NOT NULL,
  work_date       DATE         NOT NULL,
  shift_slot_id   CHAR(36)     NOT NULL,
  worker_id       CHAR(36)     NULL COMMENT 'NULL=공석/F-only',
  special_code    VARCHAR(16)  NOT NULL DEFAULT 'none'
                  COMMENT 'none|am_free|pm_free|am_half|pm_half|off',
  computed_hours  DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  note            VARCHAR(255) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_asn_cell (schedule_id, work_date, shift_slot_id),
  KEY idx_cs_asn_date (work_date),
  KEY idx_cs_asn_worker (worker_id, work_date),
  KEY idx_cs_asn_slot (shift_slot_id),
  CONSTRAINT fk_cs_asn_sched
    FOREIGN KEY (schedule_id) REFERENCES cs_schedules(id) ON DELETE CASCADE,
  CONSTRAINT fk_cs_asn_slot
    FOREIGN KEY (shift_slot_id) REFERENCES cs_shift_slots(id),
  CONSTRAINT fk_cs_asn_worker
    FOREIGN KEY (worker_id) REFERENCES cs_workers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (5) cs_distributions — 배포(공지) 이력
CREATE TABLE IF NOT EXISTS cs_distributions (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  schedule_id         CHAR(36)     NOT NULL,
  channel             VARCHAR(16)  NOT NULL DEFAULT 'manual'
                      COMMENT 'jandi|email|link|manual',
  recipient_count     INT          NOT NULL DEFAULT 0,
  recipients_snapshot JSON         NULL,
  status              VARCHAR(16)  NOT NULL DEFAULT 'queued'
                      COMMENT 'queued|sent|partial|failed',
  response_meta       JSON         NULL,
  sent_at             DATETIME     NULL,
  sent_by             CHAR(36)     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cs_dist_sched (schedule_id, sent_at),
  CONSTRAINT fk_cs_dist_sched
    FOREIGN KEY (schedule_id) REFERENCES cs_schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- SEED — cs_shift_slots (13행)
-- 5월 스케줄 분석(_docs/SOURCE-ANALYSIS.md §1) 기준
-- ═══════════════════════════════════════════════════════════════════
INSERT IGNORE INTO cs_shift_slots
  (id, code, label, start_time, end_time, is_overnight, category, sort_order)
VALUES
  (UUID(), 'L01', '07:30~16:30', '07:30:00', '16:30:00', 0, 'day',        10),
  (UUID(), 'L02', '08:00~17:00', '08:00:00', '17:00:00', 0, 'day',        20),
  (UUID(), 'L03', '08:30~17:30', '08:30:00', '17:30:00', 0, 'day',        30),
  (UUID(), 'L04', '09:00~18:00 (1)', '09:00:00', '18:00:00', 0, 'day',    40),
  (UUID(), 'L05', '09:00~18:00 (2)', '09:00:00', '18:00:00', 0, 'day',    50),
  (UUID(), 'L06', '09:00~18:00 (3)', '09:00:00', '18:00:00', 0, 'day',    60),
  (UUID(), 'L07', '10:00~19:00 (1)', '10:00:00', '19:00:00', 0, 'day',    70),
  (UUID(), 'L08', '10:00~19:00 (2)', '10:00:00', '19:00:00', 0, 'day',    80),
  (UUID(), 'L09', '11:00~20:00',     '11:00:00', '20:00:00', 0, 'day',    90),
  (UUID(), 'L10', '13:00~21:00 (1)', '13:00:00', '21:00:00', 0, 'day',   100),
  (UUID(), 'L11', '13:00~21:00 (2)', '13:00:00', '21:00:00', 0, 'day',   110),
  (UUID(), 'L12', '19:00~23:00',     '19:00:00', '23:00:00', 0, 'evening', 120),
  (UUID(), 'L13', '20:30~08:30',     '20:30:00', '08:30:00', 1, 'overnight', 130);

-- ═══════════════════════════════════════════════════════════════════
-- SEED — cs_workers (16명, 5월 스케줄 분석 기준)
-- 야간/저녁조 4명만 color_tone 지정, 주간 12명은 'none'
-- ═══════════════════════════════════════════════════════════════════
INSERT IGNORE INTO cs_workers (id, name, color_tone, group_label) VALUES
  -- 주간 그룹 (12명)
  (UUID(), '박지훈', 'none',  '주간'),
  (UUID(), '이혜경', 'none',  '주간'),
  (UUID(), '김현정', 'none',  '주간'),
  (UUID(), '정지은', 'none',  '주간'),
  (UUID(), '추경희', 'none',  '주간'),
  (UUID(), '정우진', 'none',  '주간'),
  (UUID(), '서민아', 'none',  '주간'),
  (UUID(), '이경미', 'none',  '주간'),
  (UUID(), '전소현', 'none',  '주간'),
  (UUID(), '안경희', 'none',  '주간'),
  (UUID(), '박혜정', 'none',  '주간'),
  (UUID(), '유수정', 'none',  '주간'),
  -- 야간/저녁 그룹 (4명) — 셀 컬러 토큰 지정
  (UUID(), '정동민', 'blue',  '야간'),
  (UUID(), '전정연', 'gray',  '야간'),
  (UUID(), '윤민진', 'green', '야간'),
  (UUID(), '전유하', 'amber', '저녁');

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (역순)
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_distributions;
-- DROP TABLE IF EXISTS cs_assignments;
-- DROP TABLE IF EXISTS cs_schedules;
-- DROP TABLE IF EXISTS cs_workers;
-- DROP TABLE IF EXISTS cs_shift_slots;
