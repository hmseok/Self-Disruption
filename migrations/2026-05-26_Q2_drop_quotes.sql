-- ════════════════════════════════════════════════════════════════════
-- PR-Q2-5 — quotes / quote_share_tokens / quote_lifecycle_events 폐기
-- 2026-05-26 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 결정 (Q&A d-i): 「기존 quotes 데이터 거의 없음 — 폐기 가능」
-- 대체: lt_quotes (PR-Q2-3) + lt_quotes.share_token (inline)
--
-- 순서:
--   1) quote_share_tokens (외래키 quote_id 의존 → 먼저 DROP)
--   2) quote_lifecycle_events (외래키 quote_id 의존)
--   3) quotes (마지막)
--
-- ⚠ Rule 23 — 검토 후 사용자가 직접 실행 (DBeaver).
-- ⚠ Rule 24 — 멱등 (DROP TABLE IF EXISTS).
--
-- 롤백: schema.prisma 의 폐기 주석 영역 복구 + prisma db push
--      (다만 데이터 손실은 복구 불가)
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-26_Q2_drop_quotes.sql
-- ════════════════════════════════════════════════════════════════════

-- ── 폐기 전 데이터 확인 (선택) ──────────────────────────
--   SELECT COUNT(*) AS quotes_count FROM quotes;
--   SELECT COUNT(*) AS share_tokens_count FROM quote_share_tokens;
--   SELECT COUNT(*) AS events_count FROM quote_lifecycle_events;
--   -- 모두 0 이면 안전, > 0 이면 백업 검토

-- 1) quote_share_tokens (FK 의존)
DROP TABLE IF EXISTS quote_share_tokens;

-- 2) quote_lifecycle_events
DROP TABLE IF EXISTS quote_lifecycle_events;

-- 3) quotes (메인)
DROP TABLE IF EXISTS quotes;

-- ── 검증 ──────────────────────────────────────────────────
--   SELECT COUNT(*) FROM information_schema.tables
--    WHERE table_schema=DATABASE()
--      AND table_name IN ('quotes', 'quote_share_tokens', 'quote_lifecycle_events');
--   -- 기대: 0
