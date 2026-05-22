-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — 응대현황 (KT 응대현황 IVR + 큐)
--   2026-05-22 sukhomin87@gmail.com
--
-- cs_response_ivr   — KT 응대현황(IVR): 시나리오/착신번호별 인입·응대·포기
-- cs_response_queue — KT 응대현황(큐): 스킬별 응대율·서비스레벨·고객대기시간
-- 엑셀 1행 = 일자 × (시나리오 또는 스킬). 재업로드 시 ON DUPLICATE UPDATE.
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_response_ivr ← KT 응대현황(IVR)
--   원본 컬럼: 일자/착신전화번호/시나리오명/총인입/응대/포기호/
--             상담사연결요청건/서비스완료
CREATE TABLE IF NOT EXISTS cs_response_ivr (
  id                 CHAR(36)    NOT NULL PRIMARY KEY,
  stat_date          DATE        NOT NULL          COMMENT '일자',
  callee_number      VARCHAR(30) NOT NULL          COMMENT '착신전화번호',
  scenario           VARCHAR(80) DEFAULT NULL      COMMENT '시나리오명',
  total_inbound      INT         DEFAULT 0         COMMENT '총인입',
  answered           INT         DEFAULT 0         COMMENT '응대',
  abandoned          INT         DEFAULT 0         COMMENT '포기호',
  agent_connect_req  INT         DEFAULT 0         COMMENT '상담사연결요청건',
  service_completed  INT         DEFAULT 0         COMMENT '서비스완료(IVR 자동처리)',
  created_at         DATETIME    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_resp_ivr (stat_date, callee_number),
  KEY idx_cs_resp_ivr_date  (stat_date)
) ENGINE=InnoDB COMMENT='CX KPI — KT 응대현황(IVR)';

-- [STEP 2] cs_response_queue ← KT 응대현황(큐)
--   원본 컬럼: 일자/스킬/인입/인입호 대기시간/응대/응대율(%)/총포기호/
--             서비스레벨(%)/20초내 응대호/20초내 포기호/평균고객대기시간
CREATE TABLE IF NOT EXISTS cs_response_queue (
  id                 CHAR(36)      NOT NULL PRIMARY KEY,
  stat_date          DATE          NOT NULL        COMMENT '일자',
  skill              VARCHAR(60)   NOT NULL        COMMENT '스킬 (사고접수/긴급출동/법정검사 등)',
  inbound            INT           DEFAULT 0       COMMENT '인입',
  wait_time_sec      INT           DEFAULT 0       COMMENT '인입호 대기시간 (초)',
  answered           INT           DEFAULT 0       COMMENT '응대',
  answer_rate        DECIMAL(5,1)  DEFAULT 0       COMMENT '응대율(%)',
  abandoned          INT           DEFAULT 0       COMMENT '총포기호',
  service_level      DECIMAL(5,1)  DEFAULT 0       COMMENT '서비스레벨(%) — 20초내 응대 비율',
  answered_in_20s    INT           DEFAULT 0       COMMENT '20초내 응대호',
  abandoned_in_20s   INT           DEFAULT 0       COMMENT '20초내 포기호',
  avg_wait_sec       INT           DEFAULT 0       COMMENT '평균고객대기시간 (초)',
  created_at         DATETIME      DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_resp_queue (stat_date, skill),
  KEY idx_cs_resp_queue_date (stat_date)
) ENGINE=InnoDB COMMENT='CX KPI — KT 응대현황(큐)';

-- 검증:
-- SELECT COUNT(*) FROM cs_response_ivr;    -- 기대치 0 (신규)
-- SELECT COUNT(*) FROM cs_response_queue;  -- 기대치 0 (신규)
