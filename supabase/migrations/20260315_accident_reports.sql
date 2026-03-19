-- ============================================
-- 사고 보고서 테이블
-- ============================================
-- 9개 보고서 타입을 하나의 테이블에서 관리
-- form_data에 보고서 타입별 동적 필드를 JSONB로 저장

CREATE TABLE IF NOT EXISTS accident_reports (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  accident_id   int NOT NULL,                 -- accident_records.id
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- 보고서 정보
  report_type   text NOT NULL,                -- 'accident_confirm' | 'damage_inspection' | ... 8개 타입
  report_title  text NOT NULL,                -- '사고확인서', '파손확인보고서' 등
  form_data     jsonb DEFAULT '{}',           -- 보고서 타입별 동적 필드 데이터
  photos        text[] DEFAULT '{}',          -- 사진 URL 배열
  status        text DEFAULT 'draft',         -- 'draft' | 'submitted' | 'approved' | 'rejected'

  -- 작성/승인
  created_by    uuid,                         -- 작성자 user_id
  handler_id    uuid,                         -- 담당자 user_id
  approved_by   uuid,                         -- 승인자 user_id
  approved_at   timestamptz,
  rejection_reason text,

  -- 메타
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_accident_reports_accident ON accident_reports(accident_id);
CREATE INDEX IF NOT EXISTS idx_accident_reports_type ON accident_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_accident_reports_handler ON accident_reports(handler_id);
CREATE INDEX IF NOT EXISTS idx_accident_reports_status ON accident_reports(status);

-- RLS
ALTER TABLE accident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accident_reports_company_access" ON accident_reports
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- updated_at 트리거
DROP TRIGGER IF EXISTS trg_accident_reports_updated ON accident_reports;
CREATE TRIGGER trg_accident_reports_updated
  BEFORE UPDATE ON accident_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
