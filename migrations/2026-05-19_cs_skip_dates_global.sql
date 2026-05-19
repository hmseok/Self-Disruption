-- ═══════════════════════════════════════════════════════════════════
-- N-60 — 회피일 전역 적용 (group_id NULL = 글로벌)
--   2026-05-19 sukhomin87@gmail.com
--
-- 사용자 정책:
--   "그룹별을 없애고 직원요청으로 통합했으니
--    전역셋팅으로 휴가,회피일 모두 적용되어야합니다."
--
-- 결정:
--   · group_id = NULL → 모든 활성 그룹 적용 (글로벌)
--   · group_id = 특정 ID → 기존 그룹별 동작 (호환 유지)
--   · 새 등록은 모두 NULL (글로벌)
--
-- 호환: MySQL 8.0
-- ═══════════════════════════════════════════════════════════════════

-- [STEP 1] group_id NULL 허용
SET @col_nullable := (SELECT IS_NULLABLE FROM information_schema.COLUMNS
                      WHERE TABLE_SCHEMA = DATABASE()
                        AND TABLE_NAME = 'cs_group_member_skip_dates'
                        AND COLUMN_NAME = 'group_id');
SET @s := IF(@col_nullable = 'NO',
  'ALTER TABLE cs_group_member_skip_dates MODIFY COLUMN group_id CHAR(36) NULL COMMENT ''NULL = 글로벌 (모든 활성 그룹 적용)''',
  'SELECT ''group_id already nullable''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- [STEP 2] 기존 회피일을 글로벌로 전환 (group_id → NULL)
--   사용자 정책 — 모두 글로벌이어야 함
--   호환성: 그룹별이 의도된 옛 데이터가 있으면 이 마이그 적용 전 백업 권장
UPDATE cs_group_member_skip_dates SET group_id = NULL;

-- 검증
-- SELECT id, group_id, worker_id,
--        DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
--        DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
--        status
-- FROM cs_group_member_skip_dates;
-- 기대치: group_id 모두 NULL
