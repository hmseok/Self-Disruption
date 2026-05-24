-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler — cs_workers.view_token (직원 근무표 공개 링크 토큰)
--   2026-05-23 sukhomin87@gmail.com
--
-- 직원이 로그인 없이 토큰 링크로 본인 월 근무표를 조회.
--   공개 페이지: /call-scheduler/{view_token}
-- 알리고 SMS 배포(CX-KPI-21) 가 이 링크를 직원별로 발송.
-- 호환: MySQL 8.0 / 멱등 (information_schema 체크)
-- ═══════════════════════════════════════════════════════════════════

-- (1) 컬럼 추가
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'view_token');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN view_token VARCHAR(40) DEFAULT NULL COMMENT ''직원 근무표 공개 링크 토큰''',
  'SELECT ''cs_workers.view_token already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- (2) 기존 워커 토큰 채우기 — NULL 인 행만 (멱등). UUID 32자 hex.
UPDATE cs_workers
   SET view_token = LOWER(REPLACE(UUID(), '-', ''))
 WHERE view_token IS NULL OR view_token = '';

-- (3) UNIQUE 인덱스 (토큰 = 단일 워커)
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cs_workers'
               AND INDEX_NAME = 'uq_cs_workers_view_token');
SET @si := IF(@idx = 0,
  'ALTER TABLE cs_workers ADD UNIQUE KEY uq_cs_workers_view_token (view_token)',
  'SELECT ''uq_cs_workers_view_token already exists''');
PREPARE sti FROM @si; EXECUTE sti; DEALLOCATE PREPARE sti;

-- 검증:
-- SELECT name, view_token FROM cs_workers;  -- 전 행 view_token 채워짐
