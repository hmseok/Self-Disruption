-- ═══════════════════════════════════════════════════════════════
-- PR-MULTI-BRAND P3+c-2 — member_invitations 멀티 회사 지원
-- 설계: _docs/HR-OPERATIONS.md § 9.5 (옵션 C — 회사 분리)
-- ═══════════════════════════════════════════════════════════════
-- 멱등 (Rule 23/24) — 여러 번 실행해도 안전.
-- 적용: mysql -h 34.47.105.219 -u <user> -p fmi_op < 이 파일
-- ═══════════════════════════════════════════════════════════════

SET @db := DATABASE();

-- ── 1. target_company: 초대 대상 회사 ('FMI' | 'RIDE') ──
--   NULL = legacy 호환 (= FMI 로 간주).
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='member_invitations' AND column_name='target_company')=0,
  'ALTER TABLE member_invitations ADD COLUMN target_company VARCHAR(10) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ── 2. ride_department_id: RIDE 초대 시 ride_departments.id ──
--   target_company='RIDE' 일 때만 채움. FK 안 검 (cross-schema 회피).
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='member_invitations' AND column_name='ride_department_id')=0,
  'ALTER TABLE member_invitations ADD COLUMN ride_department_id CHAR(36) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ── 3. 인덱스 (target_company 별 통계 조회용) ──
SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=@db AND table_name='member_invitations' AND index_name='idx_member_inv_target_company')=0,
  'ALTER TABLE member_invitations ADD INDEX idx_member_inv_target_company (target_company)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ═══════════════════════════════════════════════════════════════
-- 검증 (Rule 23):
--   DESCRIBE member_invitations;
--     기대: target_company VARCHAR(10) / ride_department_id CHAR(36) 존재
--   SELECT target_company, COUNT(*) FROM member_invitations GROUP BY target_company;
--     기대: 기존 행은 NULL (legacy = FMI 호환), 새 RIDE 초대는 'RIDE'
-- ═══════════════════════════════════════════════════════════════
