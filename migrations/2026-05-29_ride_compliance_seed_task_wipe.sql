-- ─────────────────────────────────────────────────────────────────
-- migrations/2026-05-29_ride_compliance_seed_task_wipe.sql
-- ─────────────────────────────────────────────────────────────────
-- 사용자 결정 (2026-05-29):
--   「내규를 확정짓지 않고는 태스크도 생성이 안되야 합니다.」
--
-- 배경:
--   migrations/2026-05-18_ride_compliance_phase12.sql (라인 260~)
--   이 12개월 시드 task (TASK-2026-01 ~ TASK-2026-12) 를 자동 INSERT.
--   사용자 운영 흐름 (내규 등록 → 검수 → 확정 → generate-schedule)
--   과 어긋남 — 내규 확정 안 했는데 task 가 박혀있음.
--
-- 조치:
--   1) 내규 active 0건이면 phase12 시드 task 모두 wipe (멱등).
--   2) annual_plans 도 같이 wipe (annual_plan 시드도 phase12).
--   3) 사용자가 내규 등록·확정 후 generate-schedule 호출해야 task 생성.
--
-- 멱등 (Rule 23) — 정책 active 검사 후 조건부 DELETE.
-- 이미 wipe 된 환경에선 NoOp.
-- ─────────────────────────────────────────────────────────────────

-- 안전 가드: 내규 active 0건일 때만 시드 wipe.
--   내규가 active 면 사용자가 운영 중 — 함부로 wipe X.
SET @active_policy_count := (
  SELECT COUNT(*) FROM ride_compliance_policies WHERE status = 'active'
);

-- ── 1. tasks 시드 wipe (조건부) ──────────────────────────────
SET @sql := IF(@active_policy_count = 0,
  'DELETE FROM ride_compliance_tasks WHERE task_code LIKE ''TASK-2026-%''',
  'SELECT "ride_compliance_policies active >= 1 — task 보호" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. annual_plans 시드 wipe (조건부) ────────────────────────
SET @sql := IF(@active_policy_count = 0,
  'DELETE FROM ride_compliance_annual_plans WHERE plan_code IN (''RIDE-PLAN-2026'', ''RIDE-PLAN-2025'')',
  'SELECT "ride_compliance_policies active >= 1 — annual_plan 보호" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────
-- 검증 SQL (이 마이그 적용 후 수동 확인)
-- ─────────────────────────────────────────────────────────────────
--
-- 1) 내규 active 0건 환경:
--    SELECT 'tasks',        COUNT(*) FROM ride_compliance_tasks
--    UNION ALL SELECT 'annual_plans', COUNT(*) FROM ride_compliance_annual_plans;
--    기대치: 둘 다 0 (시드 wipe 완료)
--
-- 2) 내규 active 1+ 환경 (보호됨):
--    위 카운트 그대로 유지 — wipe 안 됨.
--
-- 3) 사용자가 내규 등록·확정 후 「스케줄 자동 생성」 액션 호출 →
--    /api/ride-compliance/policies/[id]/generate-schedule
--    → annual_plans 1건 + tasks N건 자동 INSERT.
