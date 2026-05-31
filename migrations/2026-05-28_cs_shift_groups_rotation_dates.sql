-- ═══════════════════════════════════════════════════════════════════
-- PR-2RR — 그룹 단위 회전 시작/종료 일자
--   2026-05-28 sukhomin87@gmail.com
--
-- 배경: 사용자 「그룹이 시작종료로 가야되네」 — 멤버별 컬럼은 UI 노출 안 돼서
--   불편. 그룹 리스트 행에서 한 번에 시작·종료 월 입력하도록 단순화.
--
-- 데이터 모델:
--   · cs_shift_groups.rotation_start_date  DATE NULL   (그룹 회전 시작 — NULL = group.created_at)
--   · cs_shift_groups.rotation_end_date    DATE NULL   (그룹 회전 종료 — NULL = 무한)
--
-- auto-generate fallback chain:
--   1) cs_group_members.rotation_start_date   (멤버 override)
--   2) cs_shift_groups.rotation_start_date    (그룹 셋팅 — 본 PR 신설)
--   3) cs_shift_groups.created_at              (최종 fallback — ROT-FIX 2026-05-26)
--
-- 호환: MySQL 8.0  /  멱등 (information_schema 컬럼 체크)
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] rotation_start_date 추가
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'rotation_start_date');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN rotation_start_date DATE NULL COMMENT ''그룹 단위 회전 시작 일자 — NULL = group.created_at''',
  'SELECT ''rotation_start_date already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- [STEP 2] rotation_end_date 추가
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'rotation_end_date');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN rotation_end_date DATE NULL COMMENT ''그룹 단위 회전 종료 일자 — NULL = 무한''',
  'SELECT ''rotation_end_date already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT
-- ═══════════════════════════════════════════════════════════════════
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
--   AND COLUMN_NAME IN ('rotation_start_date','rotation_end_date');
-- 기대: 2 rows  (DATE / NULL / YES)

-- ═══════════════════════════════════════════════════════════════════
-- 기존 데이터 마이그레이션 (햇살 그룹 예시 — 사용자 의도 적용)
-- ═══════════════════════════════════════════════════════════════════
-- ① 햇살 그룹 회전 시프트 순서 swap (L05 ↔ L07)
-- UPDATE cs_group_shifts cgs
--   JOIN cs_shift_groups g ON g.id = cgs.group_id
--   JOIN cs_shift_slots sl ON sl.id = cgs.shift_slot_id
--    SET cgs.sort_order = CASE sl.code WHEN 'L05' THEN 2 WHEN 'L07' THEN 1 ELSE cgs.sort_order END
--  WHERE g.name = '햇살' AND sl.code IN ('L05','L07');
--
-- ② 햇살 그룹 회전 시작일 = 2026-06-01
-- UPDATE cs_shift_groups SET rotation_start_date = '2026-06-01' WHERE name = '햇살';

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_shift_groups DROP COLUMN rotation_start_date;
-- ALTER TABLE cs_shift_groups DROP COLUMN rotation_end_date;
