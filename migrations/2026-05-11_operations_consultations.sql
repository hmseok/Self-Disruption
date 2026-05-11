-- PR-OPS-1.4a — 차량운영 상담 누적 (상담원 기록 스타일)
-- 2026-05-11 (trusting-relaxed-keller / operations 세션)
--
-- 신설:
--   operations_consultations — 단일 dispatch_order 에 여러 상담 row 누적
--                              시간순 history (DESC), 상담원 기록 스타일.
--
-- 상위 설계: _docs/OPERATIONS-REDESIGN-V2.md § 9.5 v2.1
-- API:       app/api/operations/consultations/route.ts (GET/POST)
-- UI:        app/operations/intake/IntakeModalV2.tsx (Phase 1.4b)
--
-- Rule 23 멱등성: 모든 변경 IF NOT EXISTS 가드. 여러 번 실행 안전.
-- Rule 24 시드:   본 마이그는 시드 없음 (테이블 신설만, 백필은 § 2 주석).

-- ─────────────────────────────────────────────────────────────────
-- 1. operations_consultations — 신설
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operations_consultations (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  dispatch_order_id  CHAR(36)     NOT NULL,
  note               TEXT         NOT NULL,
  category           ENUM('intake','followup','status_change','dispatch','return','billing','other')
                     NOT NULL DEFAULT 'followup',
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by         VARCHAR(64)  NULL,
  INDEX idx_ops_consult_dispatch (dispatch_order_id),
  INDEX idx_ops_consult_created (created_at),
  INDEX idx_ops_consult_dispatch_created (dispatch_order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 의도적 FK 미선언:
--   operations_dispatch_orders 가 향후 분할/마이그레이션 시 유연성 유지.
--   app 레벨에서 POST 전 dispatch_order 존재 확인 (graceful 404).

-- ─────────────────────────────────────────────────────────────────
-- 2. (선택) 기존 dispatch_order.consultation_note 백필
-- ─────────────────────────────────────────────────────────────────
--   기존 consultation_note 가 채워져 있는 row 를 「인테이크 최초 노트」로
--   operations_consultations 1행 INSERT (멱등성: 이미 백필된 row 는 skip).
--
--   본 백필은 P1.4a 마이그 적용 후 1회 수동 실행 권장.
--   확인 후 아래 4 줄의 주석을 풀고 실행. 이미 백필됐어도 재실행 안전.

-- INSERT IGNORE INTO operations_consultations (id, dispatch_order_id, note, category, created_at, created_by)
-- SELECT UUID(), o.id, o.consultation_note, 'intake', o.created_at, o.created_by
--   FROM operations_dispatch_orders o
--  WHERE o.consultation_note IS NOT NULL
--    AND o.consultation_note <> ''
--    AND NOT EXISTS (
--          SELECT 1 FROM operations_consultations c
--           WHERE c.dispatch_order_id = o.id AND c.category = 'intake'
--        );

-- ─────────────────────────────────────────────────────────────────
-- 3. 검증 SELECT (Rule 23 의무 — DBeaver 에서 한 줄씩 실행)
-- ─────────────────────────────────────────────────────────────────
-- 검증 1: 테이블 생성 확인 (기대치 1)
-- SELECT COUNT(*) AS table_exists FROM information_schema.tables
--   WHERE table_schema = DATABASE() AND table_name = 'operations_consultations';

-- 검증 2: 컬럼 6개 확인 (id, dispatch_order_id, note, category, created_at, created_by)
-- SELECT COUNT(*) AS col_count FROM information_schema.columns
--   WHERE table_schema = DATABASE() AND table_name = 'operations_consultations';
-- 기대치: 6

-- 검증 3: 인덱스 확인 (PRIMARY + 3 보조 = 4)
-- SELECT DISTINCT index_name FROM information_schema.statistics
--   WHERE table_schema = DATABASE() AND table_name = 'operations_consultations';
-- 기대치: PRIMARY, idx_ops_consult_dispatch, idx_ops_consult_created, idx_ops_consult_dispatch_created

-- 검증 4: 빈 테이블 확인 (시드 없음)
-- SELECT COUNT(*) AS row_count FROM operations_consultations;
-- 기대치: 0  (백필 § 2 실행 시 dispatch_orders.consultation_note 채워진 N개)

-- 검증 5: ENUM 값 확인
-- SHOW COLUMNS FROM operations_consultations LIKE 'category';
-- 기대치: enum('intake','followup','status_change','dispatch','return','billing','other')
