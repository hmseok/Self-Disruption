-- ═══════════════════════════════════════════════════════════════════
-- PR-2OO — cs_assignments 동시 근무 허용
--   기존: UNIQUE (schedule_id, work_date, shift_slot_id) — 1셀 1워커
--   변경: UNIQUE (schedule_id, work_date, shift_slot_id, worker_id) — 1셀 N워커
--
-- 운영 사실: 콜센터 24/365, 같은 그룹 안 멤버가 같은 시간 슬롯에
--           동시 출근 가능 (예: 야간콜 그룹 4명 모두 22-08 같이)
--
-- 멱등 적용 — 여러 번 실행해도 안전.
--
-- ⚠️ 순서 중요:
--   uq_cs_asn_cell 의 leftmost 컬럼 schedule_id 가 FK fk_cs_asn_sched 의
--   supporting index 로 사용 중 → 먼저 DROP 시도하면 1553 에러 발생.
--   해결: 새 인덱스 먼저 추가 → MySQL 자동 전환 → 옛 인덱스 안전 DROP.
-- ═══════════════════════════════════════════════════════════════════

-- 1) 새 unique key 먼저 추가 (worker_id 포함, schedule_id leftmost 동일)
--    NULL worker_id 도 허용 (공석 빈 셀) — InnoDB 의 NULL 은 unique 무시
SET @new_idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_assignments'
    AND index_name = 'uq_cs_asn_cell_worker'
);

SET @add_sql := IF(@new_idx_exists = 0,
  'ALTER TABLE cs_assignments
    ADD UNIQUE KEY uq_cs_asn_cell_worker
    (schedule_id, work_date, shift_slot_id, worker_id)',
  'SELECT 1');
PREPARE stmt FROM @add_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) 기존 unique key 안전하게 DROP
--    (이제 새 인덱스가 schedule_id leftmost 로 FK supporting 가능)
SET @old_idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_assignments'
    AND index_name = 'uq_cs_asn_cell'
);

SET @drop_sql := IF(@old_idx_exists > 0,
  'ALTER TABLE cs_assignments DROP INDEX uq_cs_asn_cell',
  'SELECT 1');
PREPARE stmt2 FROM @drop_sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ─── 검증 SQL (수동 실행) ──────────────────────────────────────────
-- 1) 인덱스 확인
-- SHOW INDEX FROM cs_assignments WHERE Key_name LIKE 'uq_cs_asn_cell%';
-- 기대치: uq_cs_asn_cell_worker (4 컬럼 — schedule_id, work_date, shift_slot_id, worker_id)
--         + uq_cs_asn_cell 은 사라져야 함
--
-- 2) FK 정상 확인
-- SHOW CREATE TABLE cs_assignments;
-- 기대치: FK fk_cs_asn_sched 그대로 유지
--
-- 3) 동시 근무 가능 검증
-- INSERT INTO cs_assignments (id, schedule_id, work_date, shift_slot_id, worker_id, special_code)
--   VALUES (UUID(), '<schedule>', '2026-05-01', '<slot>', '<worker_A>', 'none');
-- INSERT INTO cs_assignments (id, schedule_id, work_date, shift_slot_id, worker_id, special_code)
--   VALUES (UUID(), '<schedule>', '2026-05-01', '<slot>', '<worker_B>', 'none');
-- 기대치: 두 INSERT 모두 성공
--
-- 4) 같은 워커 중복은 여전히 차단
-- INSERT INTO cs_assignments (id, schedule_id, work_date, shift_slot_id, worker_id, special_code)
--   VALUES (UUID(), '<schedule>', '2026-05-01', '<slot>', '<worker_A>', 'none');
-- 기대치: 1062 Duplicate entry — uq_cs_asn_cell_worker

-- ─── 롤백 (필요 시) ─────────────────────────────────────────────────
-- ALTER TABLE cs_assignments ADD UNIQUE KEY uq_cs_asn_cell (schedule_id, work_date, shift_slot_id);
-- ALTER TABLE cs_assignments DROP INDEX uq_cs_asn_cell_worker;
-- (롤백 시 같은 (date, slot) 에 N 워커 row 가 이미 있다면 1062 발생 → 먼저 정리 필요)
