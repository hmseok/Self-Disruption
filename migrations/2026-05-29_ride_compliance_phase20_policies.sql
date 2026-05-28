-- ─────────────────────────────────────────────────────────────────
-- migrations/2026-05-29_ride_compliance_phase20_policies.sql
-- ─────────────────────────────────────────────────────────────────
-- RideCompliance Phase 2.0 — 내규 마스터 (1차 데이터)
--
-- 도메인:
--   회사 내부 규정/정책 (개인정보보호 내부관리계획서, 매뉴얼, 운영규정 등)
--   사용자가 UI 에서 PPTX/PDF 업로드 → AI 추출 → 검수 → 확정.
--   확정된 내규에서 Playbook·연간운영·별첨목차 등 2차 데이터 파생 (Phase 2.1+).
--
-- 사용자 통찰 (2026-05-28):
--   「내규 정책도 등록이 안되었는데 연간 운영이라던가 운영가이드가
--    이미 정해져있다는게 이상함」
--   → 내규를 1차 데이터로 등록 가능하게.
--   → 「ui로 전부 구성되면 좋쵸」 — 코드 시드 X, UI 등록 흐름.
--
-- 운영 원칙:
--   1. policies — 내규 마스터 (PPTX/PDF GCS 업로드 + AI 추출 raw)
--   2. policy_sections — AI 가 추출한 4 섹션 (조항/별첨/Playbook/연간)
--                         사용자 검수 가능 (status='ai_draft' → 'user_confirmed')
--   3. policies.status='active' 가 되면 후속 PR 에서 파생 데이터 자동 채움
--
-- 멱등 (Rule 23) — IF NOT EXISTS / @col_exists 패턴.
-- 시드 (Rule 24) — 없음 (운영 중 등록).
-- ─────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 1. ride_compliance_policies — 내규 마스터
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ride_compliance_policies (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  policy_code           VARCHAR(60)  NOT NULL,
    -- 예: RIDE-PMP-2026-001, RIDE-MANUAL-2026, RIDE-OP-2026
  title                 VARCHAR(300) NOT NULL,
  version               VARCHAR(20)  NOT NULL DEFAULT 'v1.0',
  effective_date        DATE         DEFAULT NULL,
  superseded_by_id      CHAR(36)     DEFAULT NULL,  -- 이후 버전 (옵션)
  source_file_name      VARCHAR(300) DEFAULT NULL,
  source_file_type      VARCHAR(20)  DEFAULT NULL,  -- pdf / pptx / docx / txt
  gcs_object_path       VARCHAR(500) DEFAULT NULL,
  file_size_bytes       BIGINT       DEFAULT NULL,
  uploaded_at           DATETIME     DEFAULT NULL,
  uploaded_by           CHAR(36)     DEFAULT NULL,  -- profiles.id
  ai_extracted_at       DATETIME     DEFAULT NULL,
  ai_model              VARCHAR(60)  DEFAULT NULL,  -- 'gemini-2.5-flash' 등
  ai_confidence         DECIMAL(3,2) DEFAULT NULL,  -- 0.00~1.00
  ai_raw_response       MEDIUMTEXT   DEFAULT NULL,  -- raw JSON (디버깅 + 재추출)
  ai_summary_md         TEXT         DEFAULT NULL,  -- AI 생성 요약 (사용자 편집 가능)
  status                VARCHAR(20)  NOT NULL DEFAULT 'uploaded',
    -- uploaded → ai_extracted → user_reviewing → active → superseded
  notes                 TEXT         DEFAULT NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_policy_code_version (policy_code, version),
  KEY idx_ride_comp_policy_status (status),
  KEY idx_ride_comp_policy_effective (effective_date),
  KEY idx_ride_comp_policy_uploaded (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════════════════════════════════════════════════════════════════
-- 2. ride_compliance_policy_sections — AI 추출 섹션 (검수 가능)
-- ════════════════════════════════════════════════════════════════
-- AI 가 내규 1개에서 추출하는 4 종류 섹션:
--   · article         — 조항 (제1조, 제2조, ...)
--   · attachment      — 별첨 (별첨 1, 별첨 2, ... 또는 F-01, F-02, ...)
--   · playbook_step   — 운영 가이드 단계 (9단계 또는 N단계)
--   · annual_event    — 연간 운영 일정 (월별)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ride_compliance_policy_sections (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  policy_id             CHAR(36)     NOT NULL,
  section_kind          VARCHAR(20)  NOT NULL,
    -- article / attachment / playbook_step / annual_event
  section_code          VARCHAR(60)  DEFAULT NULL,
    -- 예: 제6조 / 별첨1 / step-3 / 2026-03
  title                 VARCHAR(300) NOT NULL,
  body_md               MEDIUMTEXT   DEFAULT NULL,
  ai_confidence         DECIMAL(3,2) DEFAULT NULL,
  ai_raw_excerpt        TEXT         DEFAULT NULL,
    -- AI 가 인용한 원본 텍스트 발췌 (재추출 / 검증)
  parent_section_id     CHAR(36)     DEFAULT NULL,
    -- 별첨이 어느 조항에 속하는지 등 계층 표현 (옵션)
  sort_order            INT          NOT NULL DEFAULT 0,
  user_status           VARCHAR(20)  NOT NULL DEFAULT 'ai_draft',
    -- ai_draft (AI 추출 초안) → user_edited (사용자 수정)
    -- → user_confirmed (검수 확정) / rejected (반려)
  user_edited_title     VARCHAR(300) DEFAULT NULL,
  user_edited_body_md   MEDIUMTEXT   DEFAULT NULL,
  user_review_note      TEXT         DEFAULT NULL,
  reviewed_by           CHAR(36)     DEFAULT NULL,
  reviewed_at           DATETIME     DEFAULT NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ride_comp_polsec_policy (policy_id),
  KEY idx_ride_comp_polsec_kind (section_kind),
  KEY idx_ride_comp_polsec_status (user_status),
  KEY idx_ride_comp_polsec_parent (parent_section_id),
  KEY idx_ride_comp_polsec_sort (policy_id, section_kind, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 검증 SQL (DBeaver 에서 실행 후 확인)
-- ─────────────────────────────────────────────────────────────────
--
-- 1) 테이블 생성 확인:
--    SHOW CREATE TABLE ride_compliance_policies\G
--    SHOW CREATE TABLE ride_compliance_policy_sections\G
--
-- 2) Phase 2.0 통합 검증:
--    SELECT 'policies',          COUNT(*) FROM ride_compliance_policies
--    UNION ALL SELECT 'policy_sections',   COUNT(*) FROM ride_compliance_policy_sections;
--    기대치: 둘 다 0 (시드 없음 — UI 업로드로 시작)
--
-- 3) FK 의도:
--    policies.id              ← policy_sections.policy_id (soft FK)
--    policy_sections.id       ← policy_sections.parent_section_id (self-ref)
--    policies.superseded_by_id ← policies.id (self-ref)
--    실제 FK 제약은 미설정 — soft ref (마이그 멱등성 + cascade 제어 위해)
