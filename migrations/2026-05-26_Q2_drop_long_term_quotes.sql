-- ════════════════════════════════════════════════════════════════════
-- PR-Q2-3 — long_term_quotes (PR-Q1) 폐기
-- 2026-05-26 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 결정 (Q&A d-i): 「기존 quotes 데이터 거의 없음 — 폐기 가능」
-- PR-Q1 의 long_term_quotes 도 동일 — 마이그레이션 직후라 데이터 X.
--
-- 본 SQL 은 lt_quotes 마이그레이션 (2026-05-26_Q2_lt_quotes.sql) 실행 후 진행.
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행.
-- ⚠ Rule 24 — 멱등 (DROP TABLE IF EXISTS).
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-26_Q2_drop_long_term_quotes.sql
--
-- 롤백 (만약 데이터가 있었다면):
--   migrations/2026-05-26_Q1_long_term_quotes.sql 다시 실행하면 빈 테이블 복원
-- ════════════════════════════════════════════════════════════════════

-- ── 폐기 전 데이터 확인 (선택) ──────────────────────────
--   SELECT COUNT(*) FROM long_term_quotes;
--   -- 0 이면 안전, > 0 이면 사용자에게 마이그레이션 결정 요청 후 진행

DROP TABLE IF EXISTS long_term_quotes;

-- ── 검증 ──────────────────────────────────────────────────
--   SELECT COUNT(*) FROM information_schema.tables
--    WHERE table_schema=DATABASE() AND table_name='long_term_quotes';
--   -- 기대: 0
