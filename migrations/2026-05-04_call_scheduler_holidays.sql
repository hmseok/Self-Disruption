-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler 휴일·패밀리데이 — PR-2O (2026-05-04)
--
-- 목적:
--   · 공휴일 / 회사 휴무 / 패밀리데이 등록
--   · 자동 생성 시 해당 일자 자동 제외
--   · 캘린더 표출에 휴일 강조 표시
--
-- 신규 테이블:
--   cs_holidays — 휴일 마스터 (날짜 + 이름 + 종류)
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_holidays (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  holiday_date  DATE         NOT NULL COMMENT '휴일 날짜 (YYYY-MM-DD)',
  name          VARCHAR(64)  NOT NULL COMMENT '예: 어린이날, 패밀리데이, 창립기념일',
  type          VARCHAR(16)  NOT NULL DEFAULT 'national'
                COMMENT 'national(공휴일)|company(회사휴무)|family(패밀리데이)|custom',
  is_paid       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '유급 여부',
  exclude_auto  TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '자동 생성 시 제외할지',
  color_tone    VARCHAR(16)  NOT NULL DEFAULT 'red'
                COMMENT 'blue|gray|green|amber|violet|red|none — 캘린더 강조 색',
  memo          VARCHAR(255) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_holiday_date_name (holiday_date, name),
  KEY idx_cs_holiday_date (holiday_date),
  KEY idx_cs_holiday_type (type, holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- SEED — 2026 한국 공휴일 (참고용 — 사용자가 UI에서 추가/편집 가능)
-- ═══════════════════════════════════════════════════════════════════
INSERT IGNORE INTO cs_holidays (id, holiday_date, name, type, is_paid, exclude_auto, color_tone) VALUES
  (UUID(), '2026-01-01', '신정',         'national', 1, 1, 'red'),
  (UUID(), '2026-02-16', '설날 연휴',     'national', 1, 1, 'red'),
  (UUID(), '2026-02-17', '설날',         'national', 1, 1, 'red'),
  (UUID(), '2026-02-18', '설날 연휴',     'national', 1, 1, 'red'),
  (UUID(), '2026-03-01', '삼일절',        'national', 1, 1, 'red'),
  (UUID(), '2026-05-05', '어린이날',      'national', 1, 1, 'red'),
  (UUID(), '2026-05-24', '부처님오신날',   'national', 1, 1, 'red'),
  (UUID(), '2026-06-06', '현충일',        'national', 1, 1, 'red'),
  (UUID(), '2026-08-15', '광복절',        'national', 1, 1, 'red'),
  (UUID(), '2026-09-24', '추석 연휴',     'national', 1, 1, 'red'),
  (UUID(), '2026-09-25', '추석',          'national', 1, 1, 'red'),
  (UUID(), '2026-09-26', '추석 연휴',     'national', 1, 1, 'red'),
  (UUID(), '2026-10-03', '개천절',        'national', 1, 1, 'red'),
  (UUID(), '2026-10-09', '한글날',        'national', 1, 1, 'red'),
  (UUID(), '2026-12-25', '크리스마스',     'national', 1, 1, 'red');

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_holidays;
