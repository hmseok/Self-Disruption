-- pricing_worksheets 테이블 업데이트: 주행거리 설정 + 신차 지원
-- Supabase SQL Editor에서 실행

-- 1. car_id를 nullable로 변경 (신차 분석 저장 시 NULL 허용)
ALTER TABLE pricing_worksheets ALTER COLUMN car_id DROP NOT NULL;

-- 2. 연간 주행거리 설정값 저장
ALTER TABLE pricing_worksheets ADD COLUMN IF NOT EXISTS annual_mileage NUMERIC DEFAULT 1.5;

-- 3. 주행거리 감가율 저장
ALTER TABLE pricing_worksheets ADD COLUMN IF NOT EXISTS dep_mileage_rate NUMERIC DEFAULT 2;

-- 4. 신차 정보 (car_id가 NULL일 때 사용)
ALTER TABLE pricing_worksheets ADD COLUMN IF NOT EXISTS newcar_info JSONB;

-- 5. 기존 unique constraint 업데이트 (car_id NULL 허용)
-- 기존 constraint 삭제 후 partial index로 재생성
ALTER TABLE pricing_worksheets DROP CONSTRAINT IF EXISTS pricing_worksheets_company_id_car_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_worksheets_registered
  ON pricing_worksheets(company_id, car_id)
  WHERE car_id IS NOT NULL;
