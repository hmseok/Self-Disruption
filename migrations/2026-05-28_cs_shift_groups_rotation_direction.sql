-- ═══════════════════════════════════════════════════════════════════
-- PR-2RR-b — 그룹 회전 방향 (forward / reverse)
--   2026-05-28 sukhomin87@gmail.com
--
-- 배경: 사용자 시퀀스 (정우진 6=L01,7=L07,8=L05,9=L01 + 박지훈 6=L07,7=L05) 가
--   현재 정방향 회전 ((baseIdx + elapsed) mod N) 으로 표현 불가. 역방향
--   ((baseIdx - elapsed) mod N) 이 의도.
--
-- 데이터 모델:
--   · cs_shift_groups.rotation_direction VARCHAR(8) NOT NULL DEFAULT 'forward'
--     ('forward' | 'reverse')
--
-- auto-generate 적용:
--   const stride = direction === 'reverse' ? -elapsed : elapsed
--   const shiftIndex = ((baseIdx + stride) % N + N) % N
--
-- 호환: MySQL 8.0  /  멱등 (information_schema 컬럼 체크)
-- ═══════════════════════════════════════════════════════════════════

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
               AND COLUMN_NAME = 'rotation_direction');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_groups ADD COLUMN rotation_direction VARCHAR(8) NOT NULL DEFAULT ''forward'' COMMENT ''회전 방향: forward = (baseIdx+elapsed) | reverse = (baseIdx-elapsed)''',
  'SELECT ''rotation_direction already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT
-- ═══════════════════════════════════════════════════════════════════
-- SELECT COLUMN_NAME, COLUMN_DEFAULT
-- FROM information_schema.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cs_shift_groups'
--   AND COLUMN_NAME = 'rotation_direction';
-- 기대: 1 row (VARCHAR(8) / 'forward')

-- ═══════════════════════════════════════════════════════════════════
-- 햇살 그룹 적용 (필요 시 — 사용자 의도 역순 회전)
-- ═══════════════════════════════════════════════════════════════════
-- UPDATE cs_shift_groups SET rotation_direction = 'reverse' WHERE name = '햇살';

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════
-- ALTER TABLE cs_shift_groups DROP COLUMN rotation_direction;
