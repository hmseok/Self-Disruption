-- 2026-05-09 PR-6.12.a: 협력공장 자체 DB (카페24 snapshot + 정제 운영)
-- 사용자 의도:
--   1) 카페24 pmcfactm 데이터를 별도 테이블에 raw 보존 (snapshot)
--   2) 정제된 실제 운영 공장 목록은 별도 테이블 (운영용)
--   3) 동기화 X — 한 번 정제 후 카페24 변동에 영향 안 받음
--   4) 기존 factories.json 폐기

-- ─────────────────────────────────────────────────────────────────────────
-- 1. 카페24 snapshot (raw — 카페24에서 가져온 그대로 보존)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factory_cafe24_snapshots (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  fetch_batch     VARCHAR(36)  NOT NULL,                 -- 같은 가져오기 batch group
  factcode        VARCHAR(20)  NOT NULL,                 -- 카페24 factcode (PK)
  factname        VARCHAR(200) NULL,
  factaddr        TEXT         NULL,
  facthpno        VARCHAR(50)  NULL,
  facttel         VARCHAR(50)  NULL,
  factbsno        VARCHAR(20)  NULL,                     -- 사업자번호
  factconm        VARCHAR(100) NULL,                     -- 담당자
  facttype        VARCHAR(10)  NULL,                     -- 종류 (A/Z 등)
  factmemo        TEXT         NULL,
  factfrdt        VARCHAR(20)  NULL,                     -- 효력 시작
  facttodt        VARCHAR(20)  NULL,                     -- 효력 종료
  raw_extra       JSON         NULL,                     -- 가변 컬럼 모두 (SELECT * 응답 보존)
  fetched_by      VARCHAR(36)  NULL,
  fetched_by_name VARCHAR(100) NULL,
  fetched_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fcs_batch (fetch_batch),
  KEY idx_fcs_factcode (factcode),
  KEY idx_fcs_fetched_at (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. 정제된 실제 운영 공장 목록 (운영용)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_factories (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  cafe24_factcode VARCHAR(20)  NULL,                     -- 카페24 factcode 매칭 (선택)
  snapshot_id     VARCHAR(36)  NULL,                     -- factory_cafe24_snapshots.id 출처
  -- 기본 정보
  name            VARCHAR(200) NOT NULL,                 -- 표시명 (정제된)
  raw_name        VARCHAR(200) NULL,                     -- 카페24 원본명 (참고)
  address         TEXT         NULL,
  phone           VARCHAR(50)  NULL,
  business_no     VARCHAR(20)  NULL,
  contact_person  VARCHAR(100) NULL,
  factory_type    VARCHAR(20)  NULL,
  -- 운영 분류
  group_label     VARCHAR(100) NULL,                     -- 운영 그룹 (예: 강남권 / 강북권)
  insurance_tags  JSON         NULL,                     -- ["mg", "turnkey", "meritz"] 등
  service_tags    JSON         NULL,                     -- ["사고", "긴출", "정비"]
  -- 위치
  lat             DECIMAL(11,8) NULL,
  lng             DECIMAL(11,8) NULL,
  region          VARCHAR(100) NULL,                     -- 시/도
  district        VARCHAR(100) NULL,                     -- 시/군/구
  -- 운영 상태
  status          VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active/paused/terminated
  is_terminated   TINYINT(1)   NOT NULL DEFAULT 0,
  note            TEXT         NULL,
  -- 메타
  created_by      VARCHAR(36)  NULL,
  created_by_name VARCHAR(100) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pf_factcode (cafe24_factcode),
  KEY idx_pf_name (name),
  KEY idx_pf_status (status),
  KEY idx_pf_region (region),
  KEY idx_pf_business_no (business_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- 검증 SQL
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM factory_cafe24_snapshots;  -- 0
-- SELECT COUNT(*) FROM partner_factories;          -- 0
-- SHOW CREATE TABLE partner_factories \G
