-- ═══════════════════════════════════════════════════════════════════
-- N-61 — 대체 내역 추적 (cs_assignments 에 substitution 메타)
--   2026-05-19 sukhomin87@gmail.com
--
-- 사용자 결정 (옵션 D):
--   "매트릭스도 어떤사유 휴가나,회피 기타이유등으로
--    변경대치 된사항도 보여야하지않나요"
--   → 셀 마커 + 하단 펼침 패널
--
-- 의미:
--   substitution_reason — 원래 우선순위 워커가 빠진 사유
--     'group_skip'      — 그룹 회피일 (글로벌 또는 그룹별)
--     'work_cycle_off'  — 비균등 cycle 휴무 phase
--     'leave'           — 연차/휴가
--     'max_days'        — 월 최대 일수 도달
--     'consec'          — 연속 한도 도달
--     'slot_blocked'    — 슬롯 거부
--     'cycle_external'  — 외부 cycle 근무 phase (당사 X)
--     NULL              — 대체 X (정상 배정)
--   substituted_for_worker_id — 원래 우선순위였던 워커 ID
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] cs_assignments.substitution_reason
SET @col1 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'cs_assignments'
                AND COLUMN_NAME = 'substitution_reason');
SET @s1 := IF(@col1 = 0,
  'ALTER TABLE cs_assignments ADD COLUMN substitution_reason VARCHAR(64) DEFAULT NULL COMMENT ''N-61 대체 사유 (group_skip/work_cycle_off/leave/max_days/consec/slot_blocked/cycle_external)''',
  'SELECT ''substitution_reason already exists''');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

-- [STEP 2] cs_assignments.substituted_for_worker_id
SET @col2 := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'cs_assignments'
                AND COLUMN_NAME = 'substituted_for_worker_id');
SET @s2 := IF(@col2 = 0,
  'ALTER TABLE cs_assignments ADD COLUMN substituted_for_worker_id CHAR(36) DEFAULT NULL COMMENT ''N-61 원래 우선순위였던 워커 ID''',
  'SELECT ''substituted_for_worker_id already exists''');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- 검증
-- SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'cs_assignments'
--   AND COLUMN_NAME IN ('substitution_reason', 'substituted_for_worker_id');
