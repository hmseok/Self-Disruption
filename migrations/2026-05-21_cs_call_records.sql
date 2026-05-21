-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — cs_call_records (KT 상담이력조회 상세)
--   2026-05-21 sukhomin87@gmail.com
--
-- KT 상담이력조회 엑셀 1행 = 통화 1건.
-- 원본 컬럼: 번호/상담센터/채널정보/상담유형1~4/상담사/부서/직급/
--            콜키/호전환회수/상담일/시작시간/종료시간/발신자전화번호/세션키
-- call_key(콜키) UNIQUE → 같은 파일 재업로드 시 중복 차단 (규칙 24)
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_call_records (
  id              CHAR(36)    NOT NULL PRIMARY KEY,
  call_key        VARCHAR(64) NOT NULL                COMMENT '콜키 — 통화 고유 키',
  center          VARCHAR(40) DEFAULT NULL            COMMENT '상담센터',
  channel         VARCHAR(20) DEFAULT NULL            COMMENT '채널정보 (인바운드/아웃바운드)',
  type1           VARCHAR(40) DEFAULT NULL            COMMENT '상담유형1 (캐피탈사)',
  type2           VARCHAR(40) DEFAULT NULL            COMMENT '상담유형2 (사고/긴급출동/기타)',
  type3           VARCHAR(40) DEFAULT NULL            COMMENT '상담유형3',
  type4           VARCHAR(40) DEFAULT NULL            COMMENT '상담유형4',
  agent_name      VARCHAR(40) DEFAULT NULL            COMMENT '상담사 이름',
  agent_kt_id     VARCHAR(40) DEFAULT NULL            COMMENT 'KT 상담사 ID (괄호 안)',
  department      VARCHAR(40) DEFAULT NULL            COMMENT '부서',
  position        VARCHAR(20) DEFAULT NULL            COMMENT '직급',
  transfer_count  INT         DEFAULT 0               COMMENT '호전환회수',
  call_date       DATE        DEFAULT NULL            COMMENT '상담일',
  start_time      TIME        DEFAULT NULL            COMMENT '시작시간',
  end_time        TIME        DEFAULT NULL            COMMENT '종료시간',
  duration_sec    INT         DEFAULT 0               COMMENT '통화시간 초 (종료-시작, 자정넘김 보정)',
  caller_phone    VARCHAR(30) DEFAULT NULL            COMMENT '발신자전화번호',
  session_key     VARCHAR(64) DEFAULT NULL            COMMENT '세션키',
  worker_id       CHAR(36)    DEFAULT NULL            COMMENT 'cs_workers 매핑 (nullable)',
  created_at      DATETIME    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cs_call_key   (call_key),
  KEY idx_cs_call_date        (call_date),
  KEY idx_cs_call_agent       (agent_kt_id),
  KEY idx_cs_call_worker      (worker_id)
) ENGINE=InnoDB COMMENT='CX KPI — KT 상담이력 (통화 1건)';

-- 검증: SELECT COUNT(*) FROM cs_call_records;  -- 기대치 0 (신규)
