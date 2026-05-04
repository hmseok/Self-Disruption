-- ═══════════════════════════════════════════════════════════════════
-- PR-2QQ-b — 외부 직원 + manual_lock
--   (1) cs_workers.is_external — 외부 직원 표식 (1순위 우선 배정)
--   (2) cs_workers.external_pattern — 외부 직원 패턴 메타 (자유 텍스트)
--   (3) cs_assignments.manual_lock — 자동 생성이 보존하는 수동 셀
--
-- 운영 사실 (Rule 25):
--   야간 슬롯 L13 (20:30-08:30) 에 외부 직원 정동민(1명, 2-on-2-off 패턴) 1순위.
--   매니저가 매월 엑셀로 외부 일정 업로드 → manual_lock=1 로 INSERT.
--   자동 생성은 lock 셀 절대 덮어쓰지 않음.
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

-- 1) cs_workers.is_external
SET @col1 := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_workers'
    AND column_name = 'is_external'
);
SET @sql1 := IF(@col1 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN is_external TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=외부 직원 (1순위 우선 배정)'
    AFTER is_active",
  'SELECT 1');
PREPARE st1 FROM @sql1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- 2) cs_workers.external_pattern (자유 메타 — '2일근무 2일휴무' 등)
SET @col2 := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_workers'
    AND column_name = 'external_pattern'
);
SET @sql2 := IF(@col2 = 0,
  "ALTER TABLE cs_workers
    ADD COLUMN external_pattern VARCHAR(128) NULL
    COMMENT '외부 직원 패턴 설명 (예: 2일근무 2일휴무)'
    AFTER is_external",
  'SELECT 1');
PREPARE st2 FROM @sql2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- 3) cs_assignments.manual_lock
SET @col3 := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_assignments'
    AND column_name = 'manual_lock'
);
SET @sql3 := IF(@col3 = 0,
  "ALTER TABLE cs_assignments
    ADD COLUMN manual_lock TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=수동 lock (자동 생성이 보존, 외부 직원 일정 등)'
    AFTER worker_id",
  'SELECT 1');
PREPARE st3 FROM @sql3; EXECUTE st3; DEALLOCATE PREPARE st3;

-- 4) 인덱스 — manual_lock 으로 빠른 필터
SET @idx1 := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_assignments'
    AND index_name = 'idx_cs_asn_lock'
);
SET @sql4 := IF(@idx1 = 0,
  'ALTER TABLE cs_assignments ADD INDEX idx_cs_asn_lock (schedule_id, manual_lock)',
  'SELECT 1');
PREPARE st4 FROM @sql4; EXECUTE st4; DEALLOCATE PREPARE st4;

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- 1) 컬럼 확인
-- DESCRIBE cs_workers;
--   기대치: is_external TINYINT(1) DEFAULT 0 / external_pattern VARCHAR(128) NULL
-- DESCRIBE cs_assignments;
--   기대치: manual_lock TINYINT(1) DEFAULT 0
--
-- 2) 외부 직원 등록 (예 — 정동민)
-- UPDATE cs_workers SET is_external = 1, external_pattern = '2일근무 2일휴무'
--   WHERE name = '정동민';
--
-- 3) 외부 일정 INSERT (manual_lock=1)
-- INSERT INTO cs_assignments
--   (id, schedule_id, work_date, shift_slot_id, worker_id, manual_lock, special_code, ...)
--   VALUES (UUID(), '<schedule>', '2026-05-04', '<L13_slot>', '<정동민_id>', 1, 'none', ...);

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- ALTER TABLE cs_assignments DROP INDEX idx_cs_asn_lock;
-- ALTER TABLE cs_assignments DROP COLUMN manual_lock;
-- ALTER TABLE cs_workers DROP COLUMN external_pattern;
-- ALTER TABLE cs_workers DROP COLUMN is_external;
