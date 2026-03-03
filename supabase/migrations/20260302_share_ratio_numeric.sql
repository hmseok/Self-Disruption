-- share_ratio 컬럼을 integer → numeric(5,1)로 변경 (소수점 1자리 지원)
ALTER TABLE jiip_contracts
  ALTER COLUMN share_ratio TYPE numeric(5,1) USING share_ratio::numeric(5,1);

-- 일반투자도 동일 구조면 함께 변경
ALTER TABLE IF EXISTS invest_contracts
  ALTER COLUMN share_ratio TYPE numeric(5,1) USING share_ratio::numeric(5,1);
