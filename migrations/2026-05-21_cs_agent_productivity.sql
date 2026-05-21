-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — cs_agent_productivity (KT 통계·보고서 / 생산성(상담사) 상세)
--   2026-05-21 sukhomin87@gmail.com
--
-- KT 생산성(상담사) 엑셀 1행 = 상담원 × 기간 종합 실적.
-- 원본 컬럼: 일자/부서명/상담사명(ID)/로그인·로그아웃/로그인시간/
--            IB·OB·Hold·후처리·대기·이석 (건/시간)/ATT/AHT/ACW/이석사유
-- (period_label, agent_kt_id) UNIQUE → 재업로드 시 ON DUPLICATE UPDATE (규칙 24)
-- 호환: MySQL 8.0 (JSON 컬럼)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_agent_productivity (
  id                  CHAR(36)    NOT NULL PRIMARY KEY,
  period_label        VARCHAR(10) NOT NULL          COMMENT '일자 (2026-05 월 또는 2026-05-21 일)',
  period_kind         VARCHAR(10) DEFAULT 'monthly' COMMENT 'daily / monthly (일자 형식 파생)',
  department          VARCHAR(40) DEFAULT NULL      COMMENT '부서명',
  agent_name          VARCHAR(40) DEFAULT NULL      COMMENT '상담사 이름',
  agent_kt_id         VARCHAR(40) NOT NULL          COMMENT 'KT 상담사 ID',
  worker_id           CHAR(36)    DEFAULT NULL      COMMENT 'cs_workers 매핑 (nullable)',
  login_first         TIME        DEFAULT NULL      COMMENT '최초 로그인시간',
  login_last          TIME        DEFAULT NULL      COMMENT '최종 로그아웃시간',
  login_sec           INT         DEFAULT 0         COMMENT '로그인시간 (초)',
  ib_count            INT         DEFAULT 0         COMMENT 'IB건',
  ib_talk_sec         INT         DEFAULT 0         COMMENT 'IB통화시간 (초)',
  direct_ib_count     INT         DEFAULT 0         COMMENT '직통IB',
  direct_ib_talk_sec  INT         DEFAULT 0         COMMENT '직통IB통화시간 (초)',
  ob_count            INT         DEFAULT 0         COMMENT 'OB건',
  ob_attempt_count    INT         DEFAULT 0         COMMENT 'OB시도건',
  ob_talk_sec         INT         DEFAULT 0         COMMENT 'OB통화시간 (초)',
  hold_count          INT         DEFAULT 0         COMMENT 'Hold건',
  hold_sec            INT         DEFAULT 0         COMMENT 'Hold시간 (초)',
  acw_count           INT         DEFAULT 0         COMMENT '후처리건',
  acw_sec             INT         DEFAULT 0         COMMENT '후처리시간 (초)',
  wait_count          INT         DEFAULT 0         COMMENT '대기건',
  wait_sec            INT         DEFAULT 0         COMMENT '대기시간 (초)',
  away_count          INT         DEFAULT 0         COMMENT '이석건',
  away_sec            INT         DEFAULT 0         COMMENT '이석시간 (초)',
  ib_att              DECIMAL(10,1) DEFAULT 0       COMMENT 'IB_ATT',
  direct_ib_att       DECIMAL(10,1) DEFAULT 0       COMMENT '직통IB_ATT',
  ob_att              DECIMAL(10,1) DEFAULT 0       COMMENT 'OB_ATT',
  avg_hold            DECIMAL(10,1) DEFAULT 0       COMMENT '평균 Hold',
  aht                 DECIMAL(10,1) DEFAULT 0       COMMENT 'AHT',
  acw                 DECIMAL(10,1) DEFAULT 0       COMMENT 'ACW',
  away_reasons        JSON          DEFAULT NULL    COMMENT '이석사유1~3 + 시간 [{reason,sec}]',
  is_active           TINYINT       DEFAULT 0       COMMENT '활성 계정 (login_sec > 0)',
  created_at          DATETIME      DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_prod        (period_label, agent_kt_id),
  KEY idx_cs_prod_worker       (worker_id),
  KEY idx_cs_prod_period       (period_label)
) ENGINE=InnoDB COMMENT='CX KPI — KT 생산성 (상담원×기간)';

-- 검증: SELECT COUNT(*) FROM cs_agent_productivity;  -- 기대치 0 (신규)
