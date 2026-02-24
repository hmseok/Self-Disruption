-- ============================================
-- 041: accident_records.car_id NOT NULL 제약 해제
-- 잔디 웹훅으로 미등록 차량 사고접수 허용
-- ============================================

ALTER TABLE accident_records ALTER COLUMN car_id DROP NOT NULL;

COMMENT ON COLUMN accident_records.car_id IS '차량 ID (NULL = 미등록 차량, 추후 매칭 가능)';
