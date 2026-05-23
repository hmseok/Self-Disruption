-- ═══════════════════════════════════════════════════════════════════
-- CX KPI — cs_workers.cafe24_user_id (Cafe24 접수자 매핑 영속화)
--   2026-05-23 sukhomin87@gmail.com
--
-- Cafe24 사고접수(acrotpth.otptgnus) · 긴급출동접수(aceesosh.esosgnus) 의
-- 접수자 코드(picuserm.userpidn) ↔ 콜센터 워커(cs_workers) 연결.
-- 상담원별 Cafe24 접수 건수를 KPI·평가에 귀속하기 위한 3번째 매핑 키
-- (KT 매핑 cs_workers.kt_id 와 동급). 「KPI 설정 › 상담원 매칭」 에서 편집.
-- 호환: MySQL 8.0 / 멱등 (information_schema 체크)
-- ═══════════════════════════════════════════════════════════════════

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cs_workers'
               AND COLUMN_NAME = 'cafe24_user_id');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_workers ADD COLUMN cafe24_user_id VARCHAR(40) DEFAULT NULL COMMENT ''Cafe24 접수자 코드 (picuserm.userpidn — 사고·긴급출동 접수 귀속)''',
  'SELECT ''cs_workers.cafe24_user_id already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 인덱스 (cafe24_user_id 로 매칭 조회)
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cs_workers'
               AND INDEX_NAME = 'idx_cs_workers_cafe24_user');
SET @si := IF(@idx = 0,
  'ALTER TABLE cs_workers ADD KEY idx_cs_workers_cafe24_user (cafe24_user_id)',
  'SELECT ''idx_cs_workers_cafe24_user already exists''');
PREPARE sti FROM @si; EXECUTE sti; DEALLOCATE PREPARE sti;

-- 검증:
-- SELECT COLUMN_NAME FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_workers' AND COLUMN_NAME = 'cafe24_user_id';
