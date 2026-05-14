-- PR-ASSETS-1.0 — 라이드 자산 관리 (신규 모듈)
-- 2026-05-14 (assets 세션 신설)
--
-- 신설 테이블 4개:
--   ride_asset_categories  — 카테고리 마스터 (VH/OF/IT/CC/ET + 권한자 확장)
--   ride_assets            — 자산 본체 (QR 스티커 + 사용자 매칭)
--   ride_asset_admins      — 권한자(총무팀) 화이트리스트
--   ride_asset_logs        — 변경/매칭 이력
--
-- 상위 설계:
--   _docs/ASSETS-PERSONAS.md   (페르소나·시나리오)
--   _docs/ASSETS-DATA-MODEL.md (데이터 모델 + ER + API 매핑)
--
-- 사이드바: work-essentials > admin-ops (sortOrder 83, /RideAssets)
-- 메인 페이지: app/(employees)/RideAssets/page.tsx
-- API:        app/api/ride-assets/* + app/api/ride-asset-categories/* + app/api/ride-asset-admins/*
--
-- Rule 23 멱등성: 모든 CREATE TABLE IF NOT EXISTS. 시드는 INSERT IGNORE.
--                 여러 번 실행해도 row 중복/스키마 오류 없음.
-- Rule 24 시드:   ride_asset_categories 5개 초기 시드 (UNIQUE KEY code 기반 멱등).
-- FK 정책:        의도적 FK 미선언 (라이드 모듈 스타일). app 레벨 무결성 보장.

-- ─────────────────────────────────────────────────────────────────
-- 1. ride_asset_categories — 카테고리 마스터
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_asset_categories (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  code          VARCHAR(8)   NOT NULL,
  name          VARCHAR(40)  NOT NULL,
  emoji         VARCHAR(8)   DEFAULT NULL,
  sort_order    INT          NOT NULL DEFAULT 100,
  next_seq      INT          NOT NULL DEFAULT 1,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_asset_cat_code (code),
  INDEX idx_ride_asset_cat_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 2. ride_assets — 자산 본체
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_assets (
  id                  CHAR(36)      NOT NULL PRIMARY KEY,
  asset_code          VARCHAR(20)   NOT NULL,            -- 'IT-2026-0001'
  category_id         CHAR(36)      NOT NULL,            -- ride_asset_categories.id (soft FK)
  name                VARCHAR(120)  NOT NULL,
  acquired_at         DATE          DEFAULT NULL,
  acquired_cost       DECIMAL(15,2) DEFAULT NULL,
  status              VARCHAR(20)   NOT NULL DEFAULT 'active',  -- active/repair/disposed/lost
  assigned_user_id    VARCHAR(64)   DEFAULT NULL,        -- users.id (NULL=공통)
  location            VARCHAR(120)  DEFAULT NULL,
  notes               TEXT          DEFAULT NULL,
  qr_token            CHAR(36)      NOT NULL,            -- UUID — 스캔 라우트
  disposed_at         DATETIME      DEFAULT NULL,
  disposed_reason     VARCHAR(200)  DEFAULT NULL,
  created_by          VARCHAR(64)   DEFAULT NULL,        -- users.id
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_assets_code (asset_code),
  UNIQUE KEY uq_ride_assets_qr (qr_token),
  INDEX idx_ride_assets_category (category_id),
  INDEX idx_ride_assets_user (assigned_user_id),
  INDEX idx_ride_assets_status (status),
  INDEX idx_ride_assets_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 3. ride_asset_admins — 권한자(총무팀) 화이트리스트
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_asset_admins (
  user_id      VARCHAR(64)  NOT NULL PRIMARY KEY,
  granted_by   VARCHAR(64)  DEFAULT NULL,
  granted_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note         VARCHAR(200) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 4. ride_asset_logs — 변경/매칭 이력
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ride_asset_logs (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  asset_id        CHAR(36)      NOT NULL,
  action          VARCHAR(40)   NOT NULL,    -- created/assigned/unassigned/status_change/location_update/disposed/restored
  from_user_id    VARCHAR(64)   DEFAULT NULL,
  to_user_id      VARCHAR(64)   DEFAULT NULL,
  from_status     VARCHAR(20)   DEFAULT NULL,
  to_status       VARCHAR(20)   DEFAULT NULL,
  from_location   VARCHAR(120)  DEFAULT NULL,
  to_location     VARCHAR(120)  DEFAULT NULL,
  by_user_id      VARCHAR(64)   DEFAULT NULL,
  note            VARCHAR(400)  DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ride_asset_logs_asset (asset_id, created_at),
  INDEX idx_ride_asset_logs_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 5. 초기 카테고리 시드 (Rule 24 — INSERT IGNORE + UNIQUE KEY 멱등)
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO ride_asset_categories (id, code, name, emoji, sort_order, next_seq, is_active)
VALUES
  (UUID(), 'VH', '차량',     '🚗', 10, 1, 1),
  (UUID(), 'OF', '사무비품', '🪑', 20, 1, 1),
  (UUID(), 'IT', 'IT장비',  '💻', 30, 1, 1),
  (UUID(), 'CC', '법인카드', '💳', 40, 1, 1),
  (UUID(), 'ET', '기타',     '📦', 90, 1, 1);

-- ─────────────────────────────────────────────────────────────────
-- 6. 검증 SELECT (Rule 23 — DBeaver/CLI 에서 한 줄씩 실행)
-- ─────────────────────────────────────────────────────────────────
-- 검증 1: 4개 테이블 모두 생성 확인 (기대치 4)
-- SELECT COUNT(*) AS tbl_created FROM information_schema.tables
--   WHERE table_schema = DATABASE()
--     AND table_name IN ('ride_asset_categories','ride_assets','ride_asset_admins','ride_asset_logs');

-- 검증 2: 카테고리 시드 5개 확인 (기대치 5)
-- SELECT COUNT(*) AS seed_cnt FROM ride_asset_categories WHERE code IN ('VH','OF','IT','CC','ET');

-- 검증 3: 카테고리 code/순서/이모지 확인 (5 row)
-- SELECT code, name, emoji, sort_order, next_seq, is_active
--   FROM ride_asset_categories ORDER BY sort_order;

-- 검증 4: 인덱스 생성 확인 (ride_assets 6 unique+regular, ride_asset_logs 2)
-- SHOW INDEX FROM ride_assets;
-- SHOW INDEX FROM ride_asset_logs;

-- 검증 5: 권한자/자산 기본 빈 상태 (기대치 0/0)
-- SELECT (SELECT COUNT(*) FROM ride_asset_admins) AS admins,
--        (SELECT COUNT(*) FROM ride_assets)       AS assets;

-- ─────────────────────────────────────────────────────────────────
-- 7. 적용 절차 (사용자)
-- ─────────────────────────────────────────────────────────────────
-- mysql -h <HOST> -u <USER> -p <DB> < migrations/2026-05-14_ride_assets.sql
-- 또는 DBeaver 에서 본 파일 열어 전체 실행.
--
-- 적용 후 위 「6. 검증 SELECT」 5개 모두 통과 확인 → /RideAssets 페이지 접속 검증.
-- 미적용 상태에서도 페이지는 graceful fallback (빈 목록 + ⚠ 배너) 으로 동작.
