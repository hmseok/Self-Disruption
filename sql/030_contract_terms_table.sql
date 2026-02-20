-- ================================================================
-- Self-Disruption ERP: 계약 약관 관리 시스템
-- 030_contract_terms_table.sql
-- ================================================================
-- 약관을 DB에서 관리 → 버전 이력 추적 + 계약서 PDF 자동 연동
-- 메리츠캐피탈 자동차 장기대여 표준약관(25년 11월) 구조 참고
-- ================================================================


-- ================================================================
-- [1] contract_terms — 약관 세트 (버전 관리 단위)
-- ================================================================
CREATE TABLE IF NOT EXISTS contract_terms (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL,                 -- 회사별 약관

  version TEXT NOT NULL,                     -- 버전명 (예: 'v1.0', '2025-11 개정')
  title TEXT NOT NULL DEFAULT '자동차 장기대여 약관',
  description TEXT,                          -- 개정 사유/설명

  -- 상태 관리
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  -- draft: 작성 중, active: 현재 적용 중 (회사당 1개만), archived: 이전 버전

  effective_from DATE,                       -- 시행일
  effective_to DATE,                         -- 폐지일 (null = 현행)

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  -- 회사당 version 유니크
  UNIQUE (company_id, version)
);

COMMENT ON TABLE contract_terms IS '계약 약관 세트 — 버전별 관리 (회사별)';

-- 회사당 active 약관 1개만 허용하는 partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_terms_active
  ON contract_terms (company_id) WHERE status = 'active';


-- ================================================================
-- [2] contract_term_articles — 약관 개별 조항
-- ================================================================
CREATE TABLE IF NOT EXISTS contract_term_articles (
  id BIGSERIAL PRIMARY KEY,
  terms_id BIGINT NOT NULL REFERENCES contract_terms(id) ON DELETE CASCADE,

  article_number INT NOT NULL,               -- 조항 번호 (1, 2, 3...)
  title TEXT NOT NULL,                       -- 조항 제목 (예: '계약의 내용')
  content TEXT NOT NULL,                     -- 조항 본문 (마크다운/줄바꿈 허용)

  -- 분류 (검색/필터용)
  category TEXT DEFAULT 'general' CHECK (category IN (
    'general',        -- 일반 (계약 성립, 기간 등)
    'payment',        -- 렌탈료, 보증금, 선납금
    'insurance',      -- 보험, 사고처리
    'vehicle',        -- 차량 관리, 사용 제한
    'maintenance',    -- 정비 서비스
    'mileage',        -- 주행거리 약정
    'termination',    -- 중도해지, 반납, 인수
    'penalty',        -- 위약금, 지연배상
    'privacy',        -- 개인정보
    'other'           -- 기타
  )),

  sort_order INT DEFAULT 0,                  -- 정렬 순서 (article_number와 별도)
  is_required BOOLEAN DEFAULT true,          -- 필수 조항 여부 (false면 선택적 포함)

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (terms_id, article_number)
);

COMMENT ON TABLE contract_term_articles IS '약관 개별 조항 — 조항번호 순 정렬';


-- ================================================================
-- [3] contract_term_history — 약관 변경 이력
-- ================================================================
CREATE TABLE IF NOT EXISTS contract_term_history (
  id BIGSERIAL PRIMARY KEY,

  terms_id BIGINT NOT NULL REFERENCES contract_terms(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES contract_term_articles(id) ON DELETE SET NULL,

  action TEXT NOT NULL CHECK (action IN (
    'created',          -- 약관 세트 생성
    'activated',        -- active 전환
    'archived',         -- archived 전환
    'article_added',    -- 조항 추가
    'article_updated',  -- 조항 수정
    'article_deleted'   -- 조항 삭제
  )),

  old_value TEXT,       -- 변경 전 (JSON or text)
  new_value TEXT,       -- 변경 후 (JSON or text)

  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT           -- 변경 사유
);

COMMENT ON TABLE contract_term_history IS '약관 변경 이력 — 감사 추적용';


-- ================================================================
-- [4] contract_special_terms — 특약사항 템플릿
-- ================================================================
CREATE TABLE IF NOT EXISTS contract_special_terms (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL,

  label TEXT NOT NULL,                       -- 표시명 (예: '인수형 기본 특약')
  content TEXT NOT NULL,                     -- 특약 내용
  contract_type TEXT CHECK (contract_type IN ('return', 'buyout', 'all')),
  is_default BOOLEAN DEFAULT false,          -- 기본 적용 여부
  is_active BOOLEAN DEFAULT true,

  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE contract_special_terms IS '특약사항 템플릿 — 계약 유형별 기본 특약';


-- ================================================================
-- [5] quotes / contracts 테이블에 약관 버전 연결 컬럼 추가
-- ================================================================
DO $$ BEGIN
  -- quotes 테이블에 terms_version_id 추가
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'terms_version_id'
  ) THEN
    ALTER TABLE quotes ADD COLUMN terms_version_id BIGINT REFERENCES contract_terms(id);
    COMMENT ON COLUMN quotes.terms_version_id IS '견적 시 적용된 약관 버전';
  END IF;

  -- contracts 테이블에 terms_version_id 추가
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'terms_version_id'
  ) THEN
    ALTER TABLE contracts ADD COLUMN terms_version_id BIGINT REFERENCES contract_terms(id);
    COMMENT ON COLUMN contracts.terms_version_id IS '계약 체결 시 적용된 약관 버전';
  END IF;

  -- contracts 테이블에 special_terms 추가 (특약사항 텍스트)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'special_terms'
  ) THEN
    ALTER TABLE contracts ADD COLUMN special_terms TEXT;
    COMMENT ON COLUMN contracts.special_terms IS '계약서 특약사항 (텍스트)';
  END IF;

  -- contracts 테이블에 contract_pdf_url 추가
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'contract_pdf_url'
  ) THEN
    ALTER TABLE contracts ADD COLUMN contract_pdf_url TEXT;
    COMMENT ON COLUMN contracts.contract_pdf_url IS '생성된 계약서 PDF URL (Supabase Storage)';
  END IF;
END $$;


-- ================================================================
-- [6] RLS 정책
-- ================================================================
ALTER TABLE contract_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_term_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_term_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_special_terms ENABLE ROW LEVEL SECURITY;

-- contract_terms
DROP POLICY IF EXISTS "contract_terms_company" ON contract_terms;
CREATE POLICY "contract_terms_company" ON contract_terms
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- contract_term_articles (terms_id 기반 접근)
DROP POLICY IF EXISTS "contract_term_articles_access" ON contract_term_articles;
CREATE POLICY "contract_term_articles_access" ON contract_term_articles
  FOR ALL USING (
    terms_id IN (
      SELECT id FROM contract_terms
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- contract_term_history
DROP POLICY IF EXISTS "contract_term_history_access" ON contract_term_history;
CREATE POLICY "contract_term_history_access" ON contract_term_history
  FOR ALL USING (
    terms_id IN (
      SELECT id FROM contract_terms
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- contract_special_terms
DROP POLICY IF EXISTS "contract_special_terms_company" ON contract_special_terms;
CREATE POLICY "contract_special_terms_company" ON contract_special_terms
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );


-- ================================================================
-- [7] 트리거: updated_at 자동 갱신
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS contract_terms_updated_at ON contract_terms;
CREATE TRIGGER contract_terms_updated_at
  BEFORE UPDATE ON contract_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS contract_term_articles_updated_at ON contract_term_articles;
CREATE TRIGGER contract_term_articles_updated_at
  BEFORE UPDATE ON contract_term_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS contract_special_terms_updated_at ON contract_special_terms;
CREATE TRIGGER contract_special_terms_updated_at
  BEFORE UPDATE ON contract_special_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ================================================================
-- [8] 인덱스
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_contract_terms_company ON contract_terms(company_id, status);
CREATE INDEX IF NOT EXISTS idx_contract_term_articles_terms ON contract_term_articles(terms_id, article_number);
CREATE INDEX IF NOT EXISTS idx_contract_term_history_terms ON contract_term_history(terms_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_special_terms_company ON contract_special_terms(company_id, is_active);
