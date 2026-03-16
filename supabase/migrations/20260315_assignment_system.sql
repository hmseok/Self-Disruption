-- ============================================
-- 사고 담당자 배정 시스템 테이블
-- ============================================
-- 실행: Supabase SQL Editor에서 직접 실행
-- ============================================

-- ── 1. 담당자 용량/가용성 테이블 ─────────────────
-- 사고팀 소속 담당자별 처리 가능 건수 및 근무 상태
CREATE TABLE IF NOT EXISTS handler_capacity (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  handler_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 용량
  max_cases     int DEFAULT 20,           -- 최대 동시 처리 건수
  is_available  boolean DEFAULT true,     -- 근무 가능 여부 (휴가/외근 시 false)

  -- 담당 역할
  team          text DEFAULT 'accident',  -- 'accident' | 'inspection' | 'maintenance'
  speciality    text[],                   -- 전문 분야 태그: ['보험청구', '현장조사', '전손처리']

  -- 담당 지역 (빠른 필터용)
  regions       text[],                   -- ['서울', '경기', '인천'] 등

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  UNIQUE(company_id, handler_id)
);

-- ── 2. 배정 룰 테이블 ───────────────────────────
-- 거래처별/공장별/지역별/과실유형별 자동 배정 규칙
CREATE TABLE IF NOT EXISTS assignment_rules (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- 룰 정의
  rule_type     text NOT NULL,            -- 'client' | 'repair_shop' | 'region' | 'region_detail' | 'fault_type' | 'insurance_type'
  rule_value    text NOT NULL,            -- 매칭값: '우리금융캐피탈', '서울', '태안군' 등
  handler_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 우선순위 (1이 최고)
  priority      int DEFAULT 10,

  -- 활성 여부
  is_active     boolean DEFAULT true,

  -- 메모
  description   text,                     -- '우리금융캐피탈 전담 - 김현장'

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 복합 인덱스: 회사+룰타입+활성 기준 빠른 조회
CREATE INDEX IF NOT EXISTS idx_assignment_rules_lookup
  ON assignment_rules(company_id, rule_type, is_active)
  WHERE is_active = true;

-- ── 3. 배정 이력 로그 ───────────────────────────
-- 누가 언제 어떤 기준으로 배정했는지 추적
CREATE TABLE IF NOT EXISTS assignment_log (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  accident_id     int NOT NULL,             -- accident_records.id
  handler_id      uuid NOT NULL,            -- 배정된 담당자

  -- 배정 방식
  assignment_type text NOT NULL,            -- 'auto' | 'manual' | 'reassign'
  match_type      text,                     -- 'rule_client' | 'rule_shop' | 'rule_region' | 'balance' 등
  matched_rule    text,                     -- 매칭된 룰 설명

  -- 수동 배정 시 관리자
  assigned_by     uuid,                     -- 배정한 관리자 user_id

  -- 이전 담당자 (재배정 시)
  previous_handler_id uuid,

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_log_accident
  ON assignment_log(accident_id);
CREATE INDEX IF NOT EXISTS idx_assignment_log_handler
  ON assignment_log(handler_id);

-- ── 4. accident_records 컬럼 추가 ────────────────
-- handler_id는 이미 존재하므로, 추가 필드만

-- 배정 관련 메타 컬럼
ALTER TABLE accident_records
  ADD COLUMN IF NOT EXISTS assigned_at       timestamptz,     -- 배정 시각
  ADD COLUMN IF NOT EXISTS assignment_type   text,            -- 'auto' | 'manual'
  ADD COLUMN IF NOT EXISTS assignment_rule   text,            -- 어떤 룰로 배정됐는지
  ADD COLUMN IF NOT EXISTS client_name       text,            -- 거래처명 (파싱해서 별도 저장)
  ADD COLUMN IF NOT EXISTS fault_type        text,            -- 과실구분 (가해/피해/자차/면책)
  ADD COLUMN IF NOT EXISTS insurance_type    text,            -- 보험종류 (자차/대물/대차)
  ADD COLUMN IF NOT EXISTS settlement_type   text,            -- 정산방식 (턴키/실비)
  ADD COLUMN IF NOT EXISTS region_sido       text,            -- 시/도 (파싱)
  ADD COLUMN IF NOT EXISTS region_sigungu    text;            -- 시/군/구 (파싱)

-- 배정 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_accident_handler
  ON accident_records(handler_id)
  WHERE handler_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accident_status_handler
  ON accident_records(status, handler_id);

CREATE INDEX IF NOT EXISTS idx_accident_client
  ON accident_records(client_name)
  WHERE client_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accident_region
  ON accident_records(region_sido)
  WHERE region_sido IS NOT NULL;

-- ── 5. RLS 정책 ─────────────────────────────────

-- handler_capacity
ALTER TABLE handler_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handler_capacity_company_access" ON handler_capacity
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- assignment_rules
ALTER TABLE assignment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignment_rules_company_access" ON assignment_rules
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- assignment_log
ALTER TABLE assignment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignment_log_company_access" ON assignment_log
  FOR ALL USING (
    accident_id IN (
      SELECT id FROM accident_records
      WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── 6. updated_at 자동 갱신 트리거 ──────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- handler_capacity
DROP TRIGGER IF EXISTS trg_handler_capacity_updated ON handler_capacity;
CREATE TRIGGER trg_handler_capacity_updated
  BEFORE UPDATE ON handler_capacity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- assignment_rules
DROP TRIGGER IF EXISTS trg_assignment_rules_updated ON assignment_rules;
CREATE TRIGGER trg_assignment_rules_updated
  BEFORE UPDATE ON assignment_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 7. 샘플 데이터 (참고용, 실제 handler_id로 교체 필요) ──
--
-- INSERT INTO assignment_rules (company_id, rule_type, rule_value, handler_id, priority, description)
-- VALUES
--   ('your-company-id', 'client', '우리금융캐피탈', 'handler-user-id-1', 1, '우리금융캐피탈 전담'),
--   ('your-company-id', 'client', 'KB캐피탈', 'handler-user-id-2', 1, 'KB캐피탈 전담'),
--   ('your-company-id', 'region', '서울', 'handler-user-id-1', 5, '서울 담당'),
--   ('your-company-id', 'region', '경기', 'handler-user-id-2', 5, '경기 담당'),
--   ('your-company-id', 'region', '충남', 'handler-user-id-3', 5, '충남 담당');
--
-- INSERT INTO handler_capacity (company_id, handler_id, max_cases, team, regions)
-- VALUES
--   ('your-company-id', 'handler-user-id-1', 15, 'accident', ARRAY['서울', '인천']),
--   ('your-company-id', 'handler-user-id-2', 20, 'accident', ARRAY['경기']),
--   ('your-company-id', 'handler-user-id-3', 15, 'accident', ARRAY['충남', '충북', '대전']);
