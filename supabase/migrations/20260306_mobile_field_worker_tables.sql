-- ============================================================
-- 현장직원 모바일 앱용 테이블 마이그레이션
-- 2026-03-06
-- 테이블: vehicle_handovers, maintenance_requests, schedules
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. vehicle_handovers (차량 인수인계)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  car_id BIGINT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id),
  direction TEXT NOT NULL CHECK (direction IN ('delivery', 'return')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  handover_date DATE NOT NULL DEFAULT CURRENT_DATE,
  handler_id UUID NOT NULL REFERENCES auth.users(id),
  customer_name TEXT,
  customer_phone TEXT,

  -- 차량 상태
  mileage INTEGER NOT NULL,
  fuel_level INTEGER CHECK (fuel_level BETWEEN 0 AND 100),
  exterior_condition TEXT,
  interior_condition TEXT,

  -- 손상 점검
  damage_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  existing_damage_notes TEXT,

  -- 사진
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 서명
  customer_signature_url TEXT,
  handler_signature_url TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_vehicle_handovers_company ON vehicle_handovers(company_id);
CREATE INDEX idx_vehicle_handovers_car ON vehicle_handovers(car_id);
CREATE INDEX idx_vehicle_handovers_handler ON vehicle_handovers(handler_id);
CREATE INDEX idx_vehicle_handovers_date ON vehicle_handovers(handover_date DESC);
CREATE INDEX idx_vehicle_handovers_status ON vehicle_handovers(status);

-- RLS
ALTER TABLE vehicle_handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_handovers_company_access"
  ON vehicle_handovers FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_vehicle_handovers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicle_handovers_updated_at
  BEFORE UPDATE ON vehicle_handovers
  FOR EACH ROW EXECUTE FUNCTION update_vehicle_handovers_updated_at();


-- ──────────────────────────────────────────────
-- 2. maintenance_requests (정비 요청)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  car_id BIGINT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id),
  issue_type TEXT NOT NULL CHECK (issue_type IN (
    'engine', 'tire', 'brake', 'warning_light', 'electrical',
    'body_damage', 'oil_change', 'air_filter', 'other'
  )),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mileage INTEGER,

  -- 사진
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 정비소 정보
  repair_shop_name TEXT,
  repair_shop_phone TEXT,
  preferred_date DATE,

  -- 처리 결과
  assigned_to UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  actual_cost NUMERIC(12, 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_maintenance_requests_company ON maintenance_requests(company_id);
CREATE INDEX idx_maintenance_requests_car ON maintenance_requests(car_id);
CREATE INDEX idx_maintenance_requests_reporter ON maintenance_requests(reporter_id);
CREATE INDEX idx_maintenance_requests_status ON maintenance_requests(status);
CREATE INDEX idx_maintenance_requests_priority ON maintenance_requests(priority);
CREATE INDEX idx_maintenance_requests_created ON maintenance_requests(created_at DESC);

-- RLS
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_requests_company_access"
  ON maintenance_requests FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_maintenance_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maintenance_requests_updated_at
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION update_maintenance_requests_updated_at();


-- ──────────────────────────────────────────────
-- 3. schedules (배차/일정)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  task_type TEXT NOT NULL CHECK (task_type IN (
    'pickup', 'delivery', 'inspection', 'maintenance',
    'accident_check', 'return', 'other'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed', 'cancelled', 'rescheduled'
  )),
  title TEXT NOT NULL,
  description TEXT,

  -- 일정
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  estimated_duration INTEGER,  -- 분 단위

  -- 차량/고객
  car_id BIGINT REFERENCES cars(id),
  contract_id UUID REFERENCES contracts(id),
  customer_name TEXT,
  customer_phone TEXT,

  -- 위치
  location_name TEXT,
  location_address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  -- 실행 추적
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  arrival_latitude DOUBLE PRECISION,
  arrival_longitude DOUBLE PRECISION,
  proof_photos JSONB DEFAULT '[]'::jsonb,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_schedules_company ON schedules(company_id);
CREATE INDEX idx_schedules_user ON schedules(user_id);
CREATE INDEX idx_schedules_date ON schedules(scheduled_date);
CREATE INDEX idx_schedules_status ON schedules(status);
CREATE INDEX idx_schedules_user_date ON schedules(user_id, scheduled_date);
CREATE INDEX idx_schedules_car ON schedules(car_id) WHERE car_id IS NOT NULL;

-- RLS
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_company_access"
  ON schedules FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_schedules_updated_at();


-- ──────────────────────────────────────────────
-- 4. Supabase Storage 버킷 (사진 업로드용)
-- ──────────────────────────────────────────────
-- 주의: Supabase Dashboard > Storage에서 생성 필요
-- 아래 SQL은 참고용 (supabase CLI 또는 대시보드에서 실행)

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES
--   ('vehicle-photos', 'vehicle-photos', true),
--   ('maintenance-photos', 'maintenance-photos', true),
--   ('accident-photos', 'accident-photos', true),
--   ('handover-photos', 'handover-photos', true)
-- ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────
-- 5. device_tokens 테이블 확인/생성
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_company ON device_tokens(company_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_tokens_own_access"
  ON device_tokens FOR ALL
  USING (user_id = auth.uid());
