-- ═══════════════════════════════════════════════════════════════════
-- N-25 — cs_assignments 에 group_id 컬럼 추가
--   2026-05-16 sukhomin87@gmail.com
--
-- 사용자 의도: 「로테이션」 그룹 워커가 매트릭스의 다른 그룹 row 에도 표시되는 버그
--   원인: cs_assignments 에는 shift_slot_id 만 있고 group_id 없음 →
--         ScheduleGrid 가 (work_date, shift_slot_id) 셀의 모든 워커 표시 →
--         같은 시프트가 여러 그룹에 있으면 서로 섞임.
--
--   해결: cs_assignments.group_id 추가 → ScheduleGrid 가 group_id 로 필터.
--
-- 호환: MySQL 8.0
-- 멱등 적용 — 여러 번 실행 안전.
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- [STEP 1] group_id 컬럼 추가
-- ──────────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_assignments'
               AND COLUMN_NAME = 'group_id');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_assignments ADD COLUMN group_id CHAR(36) NULL COMMENT ''cs_shift_groups.id 참조 — 그룹별 매트릭스 필터용'' AFTER shift_slot_id',
  'SELECT ''group_id already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ──────────────────────────────────────────────────────────────
-- [STEP 2] 인덱스 추가 (그룹별 SELECT 빠르게)
-- ──────────────────────────────────────────────────────────────
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_assignments'
               AND INDEX_NAME = 'idx_cs_asn_group_date');
SET @s := IF(@idx = 0,
  'ALTER TABLE cs_assignments ADD KEY idx_cs_asn_group_date (group_id, work_date)',
  'SELECT ''idx_cs_asn_group_date already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ──────────────────────────────────────────────────────────────
-- [STEP 3] FK (cs_shift_groups) — 옵션 (ON DELETE SET NULL)
-- ──────────────────────────────────────────────────────────────
SET @fk := (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND CONSTRAINT_NAME = 'fk_cs_asn_group');
SET @s := IF(@fk = 0,
  'ALTER TABLE cs_assignments ADD CONSTRAINT fk_cs_asn_group FOREIGN KEY (group_id) REFERENCES cs_shift_groups(id) ON DELETE SET NULL',
  'SELECT ''fk_cs_asn_group already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후)
-- ═══════════════════════════════════════════════════════════════════
-- 1) 컬럼 확인 (기대: 1 row)
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_assignments'
--   AND COLUMN_NAME = 'group_id';
--
-- 2) 인덱스 확인 (기대: 1+ rows)
-- SELECT INDEX_NAME, COLUMN_NAME FROM information_schema.STATISTICS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_assignments'
--   AND INDEX_NAME = 'idx_cs_asn_group_date';
--
-- 3) FK 확인 (기대: 1 row)
-- SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
-- FROM information_schema.REFERENTIAL_CONSTRAINTS
-- WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_cs_asn_group';

-- ═══════════════════════════════════════════════════════════════════
-- 백필 (선택 — 기존 데이터 group_id 매핑)
-- ═══════════════════════════════════════════════════════════════════
-- 자동 생성을 다시 실행하면 group_id 가 채워짐. 기존 데이터는 NULL 유지.
-- 단, 기존 데이터를 보존하면서 group_id 만 채우고 싶으면:
-- (1:1 매핑 가능한 경우 — shift_slot_id 가 한 그룹에만 속할 때)
--
-- UPDATE cs_assignments a
-- JOIN cs_shift_groups g ON g.shift_slot_id = a.shift_slot_id
-- SET a.group_id = g.id
-- WHERE a.group_id IS NULL AND g.is_active = 1;
--
-- (rotation 그룹은 shift_slot_id 가 sequence[0] 만 매칭 — 정확하지 않음)
-- → 권장: 자동 생성 재실행 (clearFirst=true) 로 깔끔하게 group_id 채우기

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_assignments DROP FOREIGN KEY fk_cs_asn_group;
-- ALTER TABLE cs_assignments DROP INDEX idx_cs_asn_group_date;
-- ALTER TABLE cs_assignments DROP COLUMN group_id;
