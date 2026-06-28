-- PR-V4 (2026-06-28) — 탁송/외부오더 "배차 지시" 구조화 (추가만)
-- 출발지·도착지·경유지[]·업체·연락처·비용·요청메모 → delivery_json
-- 기존 customer_request([탁송]/[외부오더] 메모)는 그대로 (backward-compat), 신규는 delivery_json 우선
-- MySQL 8.x (fmi_op)

ALTER TABLE operations_dispatch_orders
  ADD COLUMN delivery_json JSON NULL COMMENT '탁송 지시 {type,vendor,phone,origin,dest,waypoints:[{addr,memo}],cost,note}';

-- 검증: SHOW COLUMNS FROM operations_dispatch_orders LIKE 'delivery_json';
