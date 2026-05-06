-- ═══════════════════════════════════════════════════════════════════
-- PR-2SS-a — REVERTED (2026-05-05)
--
-- 사용자 통찰 (검토 결과):
--   현재 자동 생성 알고리즘이 이미 "ranking 으로 빈자리 자동 채움" 으로 동작.
--   · required_days_per_month 미달 우선 (정동민 10일 채우기)
--   · by_dow / total ASC + last_date 거리 DESC (오래되고 적게 한 사람 우선)
--   · cs_leaves 'off' 자동 제외 + ranking 백필
--   따라서 cycle_kind ENUM 추가가 over-engineering — internal_pattern 의 hard 패턴
--   강제는 ranking 으로 충분히 자연스럽게 표현됨.
--
-- 이 파일은 실행해도 무해 (noop). git 에 staging 하지 마세요.
-- ═══════════════════════════════════════════════════════════════════

SELECT 'PR-2SS-a reverted — noop migration' AS info;
