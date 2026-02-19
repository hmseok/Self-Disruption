-- 025: 롯데 기준 요금 테이블에 시간 요금 컬럼 추가
ALTER TABLE lotte_reference_rates ADD COLUMN IF NOT EXISTS rate_6hrs numeric DEFAULT 0;
ALTER TABLE lotte_reference_rates ADD COLUMN IF NOT EXISTS rate_10hrs numeric DEFAULT 0;
