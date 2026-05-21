-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — cs_workers.kt_id (KT 상담사 ID 매핑 영속화)
--   2026-05-21 sukhomin87@gmail.com
--
-- KT 두 파일의 상담사 = 이름(KT_ID) 형식. 한 사람당 KT ID 여러 개 중
-- 활성 ID 하나. 업로드 미리보기에서 매니저가 연결 → 여기에 저장.
-- 호환: MySQL 8.0 / 멱등 (information_schema 체크)
-- ═══════════════════════════════════════════════════════════════════

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'kt_id');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN kt_id VARCHAR(40) DEFAULT NULL COMMENT ''KT 상담사 ID (생산성·상담이력 매핑 키)''',
  'SELECT ''cs_workers.kt_id already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 인덱스 (kt_id 로 매칭 조회)
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cs_workers'
               AND INDEX_NAME = 'idx_cs_workers_kt_id');
SET @si := IF(@idx = 0,
  'ALTER TABLE cs_workers ADD KEY idx_cs_workers_kt_id (kt_id)',
  'SELECT ''idx_cs_workers_kt_id already exists''');
PREPARE sti FROM @si; EXECUTE sti; DEALLOCATE PREPARE sti;

-- 검증:
-- SELECT COLUMN_NAME FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers' AND COLUMN_NAME = 'kt_id';
