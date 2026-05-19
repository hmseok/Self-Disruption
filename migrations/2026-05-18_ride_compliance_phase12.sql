-- PR-COMPLIANCE-1.2 — 라이드 정보보안 Phase 1.2
--                     자료·서식 카탈로그 + 버전 + 주기적 운영 Task + 작성 트래커
-- 2026-05-18 (compliance 세션, determined-charming-newton)
--
-- 신설 테이블 5개:
--   ride_compliance_documents         — 매뉴얼·서식 카탈로그 (원본 검수 단계)
--   ride_compliance_document_versions — 버전 이력 (시행일·개정사항)
--   ride_compliance_annual_plans      — 연간 관리계획 마스터 (RIDE-PLAN-2026-001)
--   ride_compliance_tasks             — 월별 task carousel + D-7/D-3/D-day 알림 추적
--   ride_compliance_form_submissions  — 서식 작성 인스턴스 (3년 보존)
--
-- 사용자 통찰 (2026-05-18) 반영:
--   추가-A: 운영자 진행률 대시보드 (12개월 task 의 status 통계)
--   추가-B: D-7/D-3/D-day 임박 알림 (reminder_d7_sent/d3_sent/dday_sent 컬럼)
--   추가-C: 원본 검수 단계 분리 (is_master_verified + verified_by_cpo_at 컬럼)
--
-- 상위 설계:
--   _docs/COMPLIANCE-PERSONAS.md       (페르소나 + 시나리오 + 추가-A/B/C 흐름)
--   _docs/COMPLIANCE-DATA-MODEL.md § 3 (Phase 1.2 5 테이블 상세)
--
-- 단일 진실 원본:
--   통합본 5.17 「파생서류 목차」 별첨 1~6 (6 매뉴얼 + 18 서식)
--   통합본 5.17 별첨 7 「RIDE-PLAN-2026-001」 (12개월 운영 일람표)
--
-- Rule 23 멱등성: 모든 CREATE TABLE IF NOT EXISTS. 시드는 INSERT IGNORE.
-- Rule 24 시드:   25 documents + 6 versions + 1 plan + 12 tasks = 44 row 자동 생성.
--                  UNIQUE KEY (doc_code, plan_code, task_code) 기반 멱등 보장.
-- FK 정책:        의도적 FK 미선언 (라이드 모듈 스타일, RideAssets/Phase 1.1 동형).
--
-- 적용:
--   mysql -h <host> -u <user> -p <db> < migrations/2026-05-18_ride_compliance_phase12.sql
--
-- 검증 (파일 하단):
--   SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'ride_compliance_%';
-- ============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. ride_compliance_documents — 매뉴얼·서식 카탈로그
-- ─────────────────────────────────────────────────────────────────
-- 사용자 추가-C: 원본 검수 단계 분리 (is_master_verified=0 → CPO 검수 → 1)
-- doc_type:
--   'manual' — 매뉴얼 본문 (RIDE-PMP, RIDE-M01~06)
--   'form'   — 서식 양식 (F-M01-01~06 등 18개 + F-06 + F-07)
--   'policy' — 개인정보 처리방침 (Phase 1.4 확장)
-- status: 'pending' (시드 직후) → 'active' (검수 완료) → 'superseded' (대체) → 'retired'
CREATE TABLE IF NOT EXISTS ride_compliance_documents (
  id                       CHAR(36)     NOT NULL PRIMARY KEY,
  doc_code                 VARCHAR(30)  NOT NULL,
  doc_type                 VARCHAR(20)  NOT NULL,
  title                    VARCHAR(200) NOT NULL,
  parent_manual_code       VARCHAR(30)  DEFAULT NULL,
  description              TEXT         DEFAULT NULL,
  current_version_id       CHAR(36)     DEFAULT NULL,
  current_version_no       VARCHAR(20)  DEFAULT NULL,
  effective_date           DATE         DEFAULT NULL,
  retention_years          INT          NOT NULL DEFAULT 3,
  classification           VARCHAR(20)  NOT NULL DEFAULT 'internal',
  is_master_verified       TINYINT(1)   NOT NULL DEFAULT 0,
  verified_by_user_id      CHAR(36)     DEFAULT NULL,
  verified_by_cpo_at       DATETIME     DEFAULT NULL,
  verification_note        VARCHAR(500) DEFAULT NULL,
  file_url                 VARCHAR(500) DEFAULT NULL,
  status                   VARCHAR(20)  NOT NULL DEFAULT 'pending',
  sort_order               INT          NOT NULL DEFAULT 100,
  notes                    TEXT         DEFAULT NULL,
  created_by               CHAR(36)     DEFAULT NULL,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_doc_code (doc_code),
  KEY idx_ride_comp_doc_type (doc_type),
  KEY idx_ride_comp_doc_parent (parent_manual_code),
  KEY idx_ride_comp_doc_verified (is_master_verified, status),
  KEY idx_ride_comp_doc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 2. ride_compliance_document_versions — 버전 이력
-- ─────────────────────────────────────────────────────────────────
-- 매뉴얼 통합본 5.17 「제·개정 이력」 (2019.07.01 제정 → 2026.05.15 통합본 — 9차례 수정).
-- 향후 V1.1 개정 시 새 row 추가, 기존 row status='superseded'.
CREATE TABLE IF NOT EXISTS ride_compliance_document_versions (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  document_id         CHAR(36)     NOT NULL,
  version_no          VARCHAR(20)  NOT NULL,
  effective_date      DATE         NOT NULL,
  superseded_date     DATE         DEFAULT NULL,
  change_summary      TEXT         DEFAULT NULL,
  approved_by         VARCHAR(40)  DEFAULT NULL,
  approved_at         DATETIME     DEFAULT NULL,
  file_url            VARCHAR(500) DEFAULT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'draft',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ride_comp_dv_doc (document_id),
  KEY idx_ride_comp_dv_status (status),
  KEY idx_ride_comp_dv_effective (effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 3. ride_compliance_annual_plans — 연간 관리계획 마스터
-- ─────────────────────────────────────────────────────────────────
-- 매뉴얼 별첨 7 RIDE-PLAN-2026-001 (시행 2026.05.20).
CREATE TABLE IF NOT EXISTS ride_compliance_annual_plans (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  plan_year           INT          NOT NULL,
  plan_code           VARCHAR(30)  NOT NULL,
  title               VARCHAR(200) NOT NULL,
  prepared_by_user_id CHAR(36)     DEFAULT NULL,
  approved_by_user_id CHAR(36)     DEFAULT NULL,
  approved_at         DATETIME     DEFAULT NULL,
  effective_date      DATE         NOT NULL,
  scope               VARCHAR(255) DEFAULT NULL,
  legal_basis         VARCHAR(500) DEFAULT NULL,
  notes               TEXT         DEFAULT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_plan_year (plan_year),
  UNIQUE KEY uq_ride_comp_plan_code (plan_code),
  KEY idx_ride_comp_plan_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 4. ride_compliance_tasks — 월별 운영 task carousel + 임박 알림
-- ─────────────────────────────────────────────────────────────────
-- 사용자 추가-B: D-7/D-3/D-day 알림 발송 추적 (reminder_*_sent).
-- category: plan/education/inspection/destruction/audit/processor/drill/access_review/backup_test/closing
-- status:   pending → in_progress → done | overdue | skipped
CREATE TABLE IF NOT EXISTS ride_compliance_tasks (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  annual_plan_id      CHAR(36)     NOT NULL,
  task_code           VARCHAR(30)  NOT NULL,
  scheduled_month     INT          NOT NULL,
  category            VARCHAR(30)  NOT NULL,
  title               VARCHAR(200) NOT NULL,
  description         TEXT         DEFAULT NULL,
  legal_reference     VARCHAR(200) DEFAULT NULL,
  related_form_codes  TEXT         DEFAULT NULL,
  assignee_user_id    CHAR(36)     DEFAULT NULL,
  due_date            DATE         NOT NULL,
  reminder_d7_sent    TINYINT(1)   NOT NULL DEFAULT 0,
  reminder_d3_sent    TINYINT(1)   NOT NULL DEFAULT 0,
  reminder_dday_sent  TINYINT(1)   NOT NULL DEFAULT 0,
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
  completed_at        DATETIME     DEFAULT NULL,
  completed_by_user_id CHAR(36)    DEFAULT NULL,
  evidence_notes      TEXT         DEFAULT NULL,
  cpo_reviewed_at     DATETIME     DEFAULT NULL,
  cpo_review_note     TEXT         DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_task_code (task_code),
  KEY idx_ride_comp_task_plan (annual_plan_id),
  KEY idx_ride_comp_task_month (scheduled_month),
  KEY idx_ride_comp_task_category (category),
  KEY idx_ride_comp_task_status (status),
  KEY idx_ride_comp_task_due (due_date),
  KEY idx_ride_comp_task_assignee (assignee_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────
-- 5. ride_compliance_form_submissions — 서식 작성 인스턴스 (3년 보존)
-- ─────────────────────────────────────────────────────────────────
-- form_data JSON 으로 구조화 + file_url 첨부 (PDF/DOCX).
-- retention_until = submitted_at + documents.retention_years.
CREATE TABLE IF NOT EXISTS ride_compliance_form_submissions (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  submission_code     VARCHAR(30)  NOT NULL,
  document_id         CHAR(36)     NOT NULL,
  document_code       VARCHAR(30)  NOT NULL,
  task_id             CHAR(36)     DEFAULT NULL,
  title               VARCHAR(200) DEFAULT NULL,
  submitted_by_user_id CHAR(36)    NOT NULL,
  submitted_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  form_data           JSON         DEFAULT NULL,
  file_url            VARCHAR(500) DEFAULT NULL,
  retention_until     DATE         NOT NULL,
  reviewed_by_user_id CHAR(36)     DEFAULT NULL,
  reviewed_at         DATETIME     DEFAULT NULL,
  review_status       VARCHAR(20)  NOT NULL DEFAULT 'submitted',
  review_note         TEXT         DEFAULT NULL,
  notes               TEXT         DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_comp_sub_code (submission_code),
  KEY idx_ride_comp_sub_doc (document_id),
  KEY idx_ride_comp_sub_task (task_id),
  KEY idx_ride_comp_sub_submitted_at (submitted_at),
  KEY idx_ride_comp_sub_retention (retention_until),
  KEY idx_ride_comp_sub_status (review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 시드 데이터 (Rule 24 멱등 — INSERT IGNORE + UNIQUE KEY)
-- ============================================================

-- ─── 5.1. documents 시드 25행 (6 매뉴얼 + 18 서식 + 1 PHM-policy 자리) ───
-- 매뉴얼 통합본 5.17 「파생서류 목차」 별첨 1~6 + 별첨 7 (F-06/F-07).
-- 초기 status='pending', is_master_verified=0 — 관리자가 file_url 입력 후 CPO 검수해야 'active'.

INSERT IGNORE INTO ride_compliance_documents (id, doc_code, doc_type, title, parent_manual_code, retention_years, classification, sort_order, notes) VALUES
  (UUID(), 'RIDE-PMP',  'manual', '개인정보보호 내부관리계획서 (통합본)', NULL,         5, 'confidential', 10, 'RIDE-PMP-2026-001 / V1.0 / 시행 2026.05.20'),
  (UUID(), 'RIDE-M01',  'manual', '개인정보 유출 대응 매뉴얼',            'RIDE-PMP',   5, 'confidential', 20, '별첨 1'),
  (UUID(), 'RIDE-M02',  'manual', '라이드케어 비상대응 매뉴얼 (BCP)',     'RIDE-PMP',   5, 'confidential', 30, '별첨 2'),
  (UUID(), 'RIDE-M03',  'manual', '정보보호 교육관리 매뉴얼',             'RIDE-PMP',   5, 'confidential', 40, '별첨 3 (서식 없음)'),
  (UUID(), 'RIDE-M04',  'manual', '정보보호 점검관리 매뉴얼',             'RIDE-PMP',   5, 'confidential', 50, '별첨 4 (서식 없음)'),
  (UUID(), 'RIDE-M05',  'manual', '개인정보 파기 절차/확인 매뉴얼',       'RIDE-PMP',   5, 'confidential', 60, '별첨 5'),
  (UUID(), 'RIDE-M06',  'manual', '개인정보 취급 단말기 반출관리 매뉴얼', 'RIDE-PMP',   5, 'confidential', 70, '별첨 6'),
  -- RIDE-M01 서식 6종
  (UUID(), 'F-M01-01',  'form',   '침해사고 접수·보고서',                 'RIDE-M01',   3, 'internal',    101, NULL),
  (UUID(), 'F-M01-02',  'form',   '긴급 보고서',                          'RIDE-M01',   3, 'internal',    102, NULL),
  (UUID(), 'F-M01-03',  'form',   '유출 통지서',                          'RIDE-M01',   3, 'internal',    103, '정보주체 통지 의무 — 제25조 24h'),
  (UUID(), 'F-M01-04',  'form',   '사고 대응 일지',                       'RIDE-M01',   3, 'internal',    104, NULL),
  (UUID(), 'F-M01-05',  'form',   '결과보고서',                           'RIDE-M01',   3, 'internal',    105, '사고 종결 후 작성'),
  (UUID(), 'F-M01-06',  'form',   '고객 응대 스크립트',                   'RIDE-M01',   3, 'internal',    106, NULL),
  -- RIDE-M02 서식 4종
  (UUID(), 'F-M02-01',  'form',   '비상대응 일지',                        'RIDE-M02',   3, 'internal',    201, NULL),
  (UUID(), 'F-M02-02',  'form',   '비상상황 보고서',                      'RIDE-M02',   3, 'internal',    202, NULL),
  (UUID(), 'F-M02-03',  'form',   '시스템 장애 대응 기록지',              'RIDE-M02',   3, 'internal',    203, NULL),
  (UUID(), 'F-M02-04',  'form',   '백업 복구 확인서',                     'RIDE-M02',   3, 'internal',    204, '분기 1회'),
  -- RIDE-M05 서식 4종
  (UUID(), 'F-M05-01',  'form',   '파기 신청서',                          'RIDE-M05',   3, 'internal',    501, NULL),
  (UUID(), 'F-M05-02',  'form',   '파기 대장',                            'RIDE-M05',   3, 'internal',    502, '제33조 3년 보존'),
  (UUID(), 'F-M05-03',  'form',   '파기 완료 확인서',                     'RIDE-M05',   3, 'internal',    503, NULL),
  (UUID(), 'F-M05-04',  'form',   '고객사 파기 결과 보고서',              'RIDE-M05',   3, 'internal',    504, NULL),
  -- RIDE-M06 서식 2종
  (UUID(), 'F-14-1',    'form',   '단말기 지급확인서',                    'RIDE-M06',   3, 'internal',    601, NULL),
  (UUID(), 'F-14-2',    'form',   '단말기 반납확인서',                    'RIDE-M06',   3, 'internal',    602, NULL),
  -- 별첨 7 서식 2종
  (UUID(), 'F-06',      'form',   '연간 교육계획서',                      NULL,         3, 'internal',    701, '별첨 7 — 1월 작성'),
  (UUID(), 'F-07',      'form',   '교육 이수 확인서',                     NULL,         3, 'internal',    702, '별첨 7 — 2월·7월 작성, 3년 보존'),
  -- 처리방침 1행 (Phase 1.4 확장 자리)
  (UUID(), 'RIDE-POL-PRIVACY', 'policy', '개인정보 처리방침',             NULL,         5, 'public',      900, '제13조 — Phase 1.4 동의 이력 연계');

-- ─── 5.2. document_versions 시드 6행 (각 매뉴얼 V1.0) ───
-- 통합본 5.17 「제·개정 이력」 의 2026.05.15 통합본 시점.
-- 효력: 2026.05.20.

INSERT IGNORE INTO ride_compliance_document_versions (id, document_id, version_no, effective_date, change_summary, approved_by, approved_at, status)
SELECT UUID(), d.id, 'V1.0', '2026-05-20',
       '2026.05.15 통합본 제정 — 2019년 제정 후 9차례 수정 사항 통합 + KISA 기반 매뉴얼 4종 추가',
       'CPO 임성민 이사', '2026-05-20 00:00:00', 'active'
  FROM ride_compliance_documents d
 WHERE d.doc_code IN ('RIDE-PMP','RIDE-M01','RIDE-M02','RIDE-M03','RIDE-M04','RIDE-M05','RIDE-M06');

-- ─── 5.3. annual_plans 시드 1행 (RIDE-PLAN-2026-001) ───

INSERT IGNORE INTO ride_compliance_annual_plans
  (id, plan_year, plan_code, title, effective_date, scope, legal_basis, status, notes)
VALUES
  (UUID(), 2026, 'RIDE-PLAN-2026-001', '2026년 연간 개인정보보호 관리계획',
   '2026-05-20',
   '라이드케어 주식회사 전 임직원 및 개인정보취급자',
   '개인정보보호법 제29조, 동법 시행령 제30조, 개인정보의 안전성 확보조치 기준',
   'active',
   '별첨 7 RIDE-PLAN-2026 — 수립일 2026.05.15, 시행 2026.05.20. prepared_by/approved_by 는 officers 등록 후 갱신');

-- ─── 5.4. tasks 시드 12행 (2026년 1~12월 — 별첨 7 일람표) ───

INSERT IGNORE INTO ride_compliance_tasks
  (id, annual_plan_id, task_code, scheduled_month, category, title, description, legal_reference, related_form_codes, due_date, status)
SELECT UUID(), p.id, t.task_code, t.scheduled_month, t.category, t.title, t.description, t.legal_reference, t.related_form_codes, t.due_date, 'pending'
  FROM ride_compliance_annual_plans p
  CROSS JOIN (
    SELECT 'TASK-2026-01' AS task_code, 1 AS scheduled_month, 'plan' AS category,
           '연간 관리계획 수립 + 1월 작업' AS title,
           '연간 개인정보보호 관리계획 수립 및 CPO 승인 / 연간 교육계획서(F-06) 작성 / 내부관리계획 검토 및 개정 여부 확인 / 개인정보 처리방침 연간 검토 / 1분기 파기 대상 사전 식별' AS description,
           '제29조 + 시행령 제30조' AS legal_reference,
           '["F-06"]' AS related_form_codes,
           DATE('2026-01-31') AS due_date
    UNION ALL SELECT 'TASK-2026-02', 2, 'education',
           '1차 정기교육 실시',
           '전 임직원 개인정보보호 정기교육 실시(1차) / 개인정보취급자 전문교육 실시 / 신규 입사자 입사 교육 실시 / 교육 이수 확인서(F-07) 작성 및 보관',
           '제22~23조',
           '["F-07"]',
           DATE('2026-02-28')
    UNION ALL SELECT 'TASK-2026-03', 3, 'inspection',
           '1분기 점검·파기',
           '분기 정보보안 점검 실시(체크리스트 활용) / 1분기 개인정보 파기 실행 및 CPO 승인 / 파기 이력 기록 및 증빙 보관 / 접근권한 적정성 1차 검토 / 백업 복구 테스트 실시(1차)',
           '제20조 + 제28~33조 + 안전성기준 제5조',
           '["F-M05-01","F-M05-02","F-M05-03","F-M02-04"]',
           DATE('2026-03-31')
    UNION ALL SELECT 'TASK-2026-04', 4, 'processor',
           '수탁사 관리 1차',
           '수탁업체 현황 점검(1차) / 수탁 계약서 검토 및 갱신 여부 확인 / 수탁업체 교육 이수 여부 확인 / 개인정보 처리 위탁 현황 업데이트',
           '제24조',
           NULL,
           DATE('2026-04-30')
    UNION ALL SELECT 'TASK-2026-05', 5, 'audit',
           '상반기 자체감사',
           '상반기 자체감사 실시 / 개인정보 처리 실태 점검 / 감사 결과보고서 작성 및 CPO 보고 / 개선사항 도출 및 조치계획 수립',
           '제20~21조 + 개인정보보호법 제31조',
           NULL,
           DATE('2026-05-31')
    UNION ALL SELECT 'TASK-2026-06', 6, 'inspection',
           '2분기 점검·파기',
           '2분기 정보보안 점검 실시 / 2분기 개인정보 파기 실행 및 CPO 승인 / 접근권한 적정성 2차 검토(반기) / 상반기 교육 결과 종합 보고 / 백업 복구 테스트 실시(2차)',
           '제20조 + 제28~33조 + 안전성기준 제5조',
           '["F-M05-01","F-M05-02","F-M05-03","F-M02-04"]',
           DATE('2026-06-30')
    UNION ALL SELECT 'TASK-2026-07', 7, 'education',
           '2차 정기교육 실시',
           '전 임직원 개인정보보호 정기교육 실시(2차) / 개인정보취급자 전문교육 실시(2차) / 교육 이수 확인서(F-07) 작성 및 보관 / 미이수자 보충 교육 실시',
           '제22~23조',
           '["F-07"]',
           DATE('2026-07-31')
    UNION ALL SELECT 'TASK-2026-08', 8, 'drill',
           '모의훈련·취약점 점검',
           '개인정보 유출 대응 모의훈련 실시(연 1회) / 비상대응 시나리오 훈련 / 연간 취약점 점검 실시 / 점검 결과 보고 및 개선 조치 수립 / 백업 복구 테스트 실시(3차)',
           '별첨 7 + RIDE-M02 BCP',
           '["F-M02-01","F-M02-02","F-M02-03","F-M02-04"]',
           DATE('2026-08-31')
    UNION ALL SELECT 'TASK-2026-09', 9, 'inspection',
           '3분기 점검·파기 + 수탁사 2차',
           '3분기 정보보안 점검 실시 / 3분기 개인정보 파기 실행 및 CPO 승인 / 파기 이력 기록 및 증빙 보관 / 수탁업체 현황 점검(2차) / 수탁업체 교육 이수 여부 확인',
           '제20조 + 제24조 + 제28~33조',
           '["F-M05-01","F-M05-02","F-M05-03"]',
           DATE('2026-09-30')
    UNION ALL SELECT 'TASK-2026-10', 10, 'audit',
           '하반기 자체감사',
           '하반기 자체감사 실시 / 개인정보 처리 실태 점검 / 접근권한 적정성 3차 검토(반기) / 감사 결과보고서 작성 및 CPO 보고 / 개선사항 도출 및 조치계획 수립',
           '제20~21조 + 개인정보보호법 제31조',
           NULL,
           DATE('2026-10-31')
    UNION ALL SELECT 'TASK-2026-11', 11, 'plan',
           '차년도 계획 준비',
           '2027년 연간 관리계획 초안 작성 / 법령 개정 모니터링 및 반영 / 매뉴얼 갱신 검토',
           '제29조',
           NULL,
           DATE('2026-11-30')
    UNION ALL SELECT 'TASK-2026-12', 12, 'closing',
           '연간 결산·마감',
           '4분기 정보보안 점검 실시 / 4분기 개인정보 파기 실행 및 CPO 승인 / 연간 개인정보보호 활동 결과보고서 작성 / 2027년 연간 관리계획 최종 검토 및 마무리',
           '제20조 + 제28~33조',
           '["F-M05-01","F-M05-02","F-M05-03"]',
           DATE('2026-12-31')
  ) t
 WHERE p.plan_code = 'RIDE-PLAN-2026-001';

-- ============================================================
-- 검증 쿼리 (수동 실행)
-- ============================================================
-- 1) 5 테이블 생성 확인:
--   SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
--     FROM information_schema.TABLES
--    WHERE TABLE_SCHEMA = DATABASE()
--      AND TABLE_NAME LIKE 'ride_compliance_%'
--    ORDER BY TABLE_NAME;
--   기대치: 5 + 기존 3 = 8 테이블
--
-- 2) 시드 row 수 (44행 = 25 doc + 6 version + 1 plan + 12 task):
--   SELECT 'documents' AS t, COUNT(*) FROM ride_compliance_documents
--   UNION ALL SELECT 'document_versions', COUNT(*) FROM ride_compliance_document_versions
--   UNION ALL SELECT 'annual_plans',      COUNT(*) FROM ride_compliance_annual_plans
--   UNION ALL SELECT 'tasks',             COUNT(*) FROM ride_compliance_tasks
--   UNION ALL SELECT 'form_submissions',  COUNT(*) FROM ride_compliance_form_submissions;
--   기대치: 25 / 6 / 1 / 12 / 0
--
-- 3) Phase 1.2 시드 + 1.1 검증 통합:
--   SELECT 'p1.1 officers',  COUNT(*) FROM ride_compliance_officers
--   UNION ALL SELECT 'p1.1 assets', COUNT(*) FROM ride_compliance_assets
--   UNION ALL SELECT 'p1.1 incidents', COUNT(*) FROM ride_compliance_incidents
--   UNION ALL SELECT 'p1.2 documents', COUNT(*) FROM ride_compliance_documents
--   UNION ALL SELECT 'p1.2 versions',  COUNT(*) FROM ride_compliance_document_versions
--   UNION ALL SELECT 'p1.2 plans',     COUNT(*) FROM ride_compliance_annual_plans
--   UNION ALL SELECT 'p1.2 tasks',     COUNT(*) FROM ride_compliance_tasks
--   UNION ALL SELECT 'p1.2 submissions', COUNT(*) FROM ride_compliance_form_submissions;
--
-- 4) 다가오는 일정 확인 (D-30 이내 + status 'pending'):
--   SELECT task_code, scheduled_month, category, title, due_date,
--          DATEDIFF(due_date, CURDATE()) AS days_remaining
--     FROM ride_compliance_tasks
--    WHERE status = 'pending'
--      AND due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
--    ORDER BY due_date;
--
-- 5) 매뉴얼·서식 검수 대기 확인:
--   SELECT doc_code, doc_type, title, parent_manual_code, is_master_verified, status
--     FROM ride_compliance_documents
--    WHERE is_master_verified = 0
--    ORDER BY sort_order;
--   기대치: 25 (모든 시드가 pending 시작)
