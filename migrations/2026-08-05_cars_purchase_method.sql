-- 차량 원장 (2026-08-05 사용자 요청): 직영차 구입방식 (현금/할부/리스 등)
ALTER TABLE cars ADD COLUMN purchase_method VARCHAR(20) NULL COMMENT '구입방식: 현금/할부/리스/렌트승계 등';
