-- ═══════════════════════════════════════════════════════════════════
-- 협력공장 추천 (factory-search) — 그룹 구성·매핑 DB 테이블
-- ───────────────────────────────────────────────────────────────────
-- 작성: 2026-05-04
-- 사용 위치:
--   app/(employees)/factory-search/api/axes/...      (그룹 구성)
--   app/(employees)/factory-search/api/mappings/...  (공장 ↔ 분류 부여)
-- 규칙 23 (마이그레이션 SQL 적용 검증) + 규칙 24 (시드 멱등성) 준수
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. 분류 축 정의 (그룹 구성) ──────────────────────────
-- 13개 기본 축 + 사용자 정의 축. items_json 에 CodeItem[] 배열 저장.
CREATE TABLE IF NOT EXISTS factory_axis_definitions (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  axis_key        VARCHAR(64)  NOT NULL  COMMENT '''group'' / ''insurance'' / ''facttype'' / ''custom-axis-{ts}'' 등',
  title           VARCHAR(128) NOT NULL,
  emoji           VARCHAR(8)   DEFAULT NULL,
  description     TEXT         DEFAULT NULL,
  editable        VARCHAR(16)  NOT NULL DEFAULT 'all'    COMMENT '''all'' / ''label-only'' / ''readonly''',
  is_custom_items TINYINT(1)   NOT NULL DEFAULT 1        COMMENT '항목 단위 사용자 추가 가능 여부',
  axis_match      VARCHAR(32)  NOT NULL DEFAULT 'custom' COMMENT '''groups'' / ''insurance'' / ''facttype'' / ''tags'' / ''custom''',
  axis_hidden     TINYINT(1)   NOT NULL DEFAULT 0        COMMENT '페이지 탭에서 숨김',
  is_user_axis    TINYINT(1)   NOT NULL DEFAULT 0        COMMENT '사용자 정의 축 (true 면 삭제 자유)',
  sort_order      INT          NOT NULL DEFAULT 0,
  items_json      JSON         NOT NULL                  COMMENT 'CodeItem[] — { key,label,color,emoji,hidden,description }',
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_factory_axis_key (axis_key),
  INDEX idx_factory_axis_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='factory-search 그룹 구성 — 분류 축 정의';

-- ─── 2. 공장 ↔ 분류 매핑 ──────────────────────────
-- 한 공장이 여러 axis 의 여러 item 을 가질 수 있음 (다중-다중)
-- factcode 는 K* (즐겨찾기) / F* (시드) 모두 허용.
CREATE TABLE IF NOT EXISTS factory_classifications (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  factcode    VARCHAR(32)  NOT NULL  COMMENT '공장 코드 (K* 즐겨찾기 / F* 시드)',
  axis_key    VARCHAR(64)  NOT NULL  COMMENT 'factory_axis_definitions.axis_key 참조 (FK 안 걸음 — 격리)',
  item_key    VARCHAR(64)  NOT NULL  COMMENT 'items_json 내 CodeItem.key',
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_factory_axis_item (factcode, axis_key, item_key),
  INDEX idx_factory_classif_factory (factcode),
  INDEX idx_factory_classif_axis    (axis_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='factory-search 매핑 — 공장에 부여된 분류 항목';

-- ─── 검증 (적용 후 실행) ──────────────────────────
-- SELECT COUNT(*) FROM factory_axis_definitions;  -- 기대 0 (UI 첫 진입 시 13개 시드)
-- SELECT COUNT(*) FROM factory_classifications;   -- 기대 0
-- SHOW CREATE TABLE factory_axis_definitions;
-- SHOW CREATE TABLE factory_classifications;
