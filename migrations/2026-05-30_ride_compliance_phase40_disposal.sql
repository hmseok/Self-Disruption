-- ─────────────────────────────────────────────────────────────────
-- migrations/2026-05-30_ride_compliance_phase40_disposal.sql
-- ─────────────────────────────────────────────────────────────────
-- RideCompliance Phase 4.0 — 데이터 폐기 결재 게이트웨이
--
-- 도메인:
--   외부 yangjaehee DB (카페24) 의 expired_approval + expired_data 를
--   본 시스템이 조회 → CPO 컨펌 → 외부 결재 시스템 연동 → 삭제 실행 → 파기확인서 자동 생성.
--
-- 핵심 테이블 2개:
--   1. ride_compliance_disposal_reviews — 본 시스템의 컨펌 결재 마스터
--      외부 expired_approval.id 를 mirror + 본 시스템 CPO 검수 흐름 추가
--   2. ride_compliance_disposal_items — 외부 expired_data 의 사람-친화 mirror
--      사용자 SQL 의 결과 (custname / 차량번호 / 파일명) 캐시 → 빠른 list 표시
--
-- 사용자 통찰 (2026-05-28):
--   PDF + SQL 제공. RideCompliance/deliverables 의 destruction_cert 와 자동 연계.
--
-- 멱등 (Rule 23) — IF NOT EXISTS 패턴.
-- ─────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════
-- 1. ride_compliance_disposal_reviews — 컨펌 결재 마스터
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ride_compliance_disposal_reviews (
  id                       CHAR(36)     NOT NULL PRIMARY KEY,

  -- 외부 yangjaehee.expired_approval mirror
  external_approval_id     BIGINT       DEFAULT NULL,  -- yangjaehee.expired_approval.id
  external_request_at      DATETIME     DEFAULT NULL,
  external_request_by      VARCHAR(100) DEFAULT NULL,
  external_expired_count   BIGINT       DEFAULT NULL,
  external_approval_doc_id VARCHAR(100) DEFAULT NULL,  -- approval_request_id
  external_approval_at     DATETIME     DEFAULT NULL,
  external_deleted_at      DATETIME     DEFAULT NULL,
  external_deleted_by      VARCHAR(100) DEFAULT NULL,
  external_confirmed_at    DATETIME     DEFAULT NULL,
  external_confirmed_by    VARCHAR(100) DEFAULT NULL,

  -- 본 시스템 측 CPO 컨펌·결재 게이트
  review_status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
    -- pending          : 외부 요청 도착 / CPO 검토 대기
    -- approved         : CPO 컨펌 완료 (외부 결재 상신 가능)
    -- rejected         : CPO 반려 (사유 필수)
    -- executed         : 외부 시스템에서 삭제 실행 완료 (deleted_at 도착)
    -- confirmed        : 본 시스템 최종 확인 + 파기확인서 발급 완료
  reviewer_id              CHAR(36)     DEFAULT NULL,  -- CPO profiles.id
  reviewed_at              DATETIME     DEFAULT NULL,
  review_note              TEXT         DEFAULT NULL,  -- CPO 검토 의견
  review_reason            VARCHAR(200) DEFAULT NULL,  -- 반려 시 사유

  -- 파기 확인서 자동 생성 연계 (deliverables.destruction_cert)
  deliverable_id           CHAR(36)     DEFAULT NULL,  -- ride_compliance_deliverables.id soft FK
  deliverable_issued_at    DATETIME     DEFAULT NULL,

  -- audit
  last_sync_at             DATETIME     DEFAULT NULL,  -- 외부 DB 마지막 조회 시각
  sync_source              VARCHAR(20)  DEFAULT NULL,  -- 'direct_db' / 'api' / 'etl' / 'manual'
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_ride_comp_disposal_ext (external_approval_id),
  KEY idx_ride_comp_disposal_status (review_status),
  KEY idx_ride_comp_disposal_reviewer (reviewer_id),
  KEY idx_ride_comp_disposal_ext_req (external_request_at),
  KEY idx_ride_comp_disposal_deliverable (deliverable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════════════════════════════════════════════════════════════════
-- 2. ride_compliance_disposal_items — 폐기 항목 mirror
-- ════════════════════════════════════════════════════════════════
-- 외부 expired_data + JOIN 결과 (사용자 SQL) 를 캐시 — 빠른 list 표시.
-- 사람-친화 컬럼 (custname / 차량번호 / 파일명) 포함.
CREATE TABLE IF NOT EXISTS ride_compliance_disposal_items (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,
  review_id            CHAR(36)     NOT NULL,  -- ride_compliance_disposal_reviews.id

  -- 외부 expired_data mirror
  external_item_id     BIGINT       DEFAULT NULL,  -- yangjaehee.expired_data.id
  data_type            VARCHAR(20)  NOT NULL,      -- 'CONTRACT' / 'FILE'
  data_id              VARCHAR(100) NOT NULL,      -- yangjaehee.expired_data.data_id

  -- 사람-친화 (사용자 SQL JOIN 결과 캐시)
  custname             VARCHAR(200) DEFAULT NULL,  -- pmccustm.custname
  carsnums             VARCHAR(50)  DEFAULT NULL,  -- pmccarsm.carsnums (차량번호) — CONTRACT
  carsodnm             VARCHAR(200) DEFAULT NULL,  -- pmccarsm.carsodnm (모델명) — CONTRACT
  imagkind_label       VARCHAR(100) DEFAULT NULL,  -- get_cbsddesc('IMAGKIND', ...) — FILE
  imagonam             VARCHAR(200) DEFAULT NULL,  -- imrimagh.imagonam (원본 파일명) — FILE

  -- 삭제 실행 추적
  external_deleted_at  DATETIME     DEFAULT NULL,

  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_ride_comp_disp_item_review (review_id),
  KEY idx_ride_comp_disp_item_type (data_type),
  KEY idx_ride_comp_disp_item_cust (custname),
  KEY idx_ride_comp_disp_item_ext (external_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════════════════════════════════════════════════════════════════
-- 3. audit log — 누가 언제 무엇을 컨펌/반려/실행했는지
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ride_compliance_disposal_audit (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  review_id         CHAR(36)     NOT NULL,
  action            VARCHAR(30)  NOT NULL,  -- 'sync' / 'review_pending' / 'approved' / 'rejected'
                                             -- 'executed' / 'confirmed' / 'deliverable_issued'
  actor_id          CHAR(36)     DEFAULT NULL,  -- profiles.id
  actor_name        VARCHAR(100) DEFAULT NULL,
  action_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json      JSON         DEFAULT NULL,  -- 액션별 상세 (예: 외부 응답 raw)
  note              TEXT         DEFAULT NULL,
  KEY idx_ride_comp_disp_audit_review (review_id),
  KEY idx_ride_comp_disp_audit_action (action),
  KEY idx_ride_comp_disp_audit_at (action_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 검증 SQL
-- ─────────────────────────────────────────────────────────────────
--
-- 1) 테이블 3개 생성 확인:
--    SHOW CREATE TABLE ride_compliance_disposal_reviews\G
--    SHOW CREATE TABLE ride_compliance_disposal_items\G
--    SHOW CREATE TABLE ride_compliance_disposal_audit\G
--
-- 2) 통합 검증:
--    SELECT 'reviews', COUNT(*) FROM ride_compliance_disposal_reviews
--    UNION ALL SELECT 'items',   COUNT(*) FROM ride_compliance_disposal_items
--    UNION ALL SELECT 'audit',   COUNT(*) FROM ride_compliance_disposal_audit;
--    기대치: 모두 0 (외부 DB sync 후 채워짐)
