-- ============================================================
-- 2026-04-23 : cost_standards 시드 (Phase 1.5)
--   1) 클래스 스코프 40개 (8 class × 5 fuel)
--   2) 모델 스코프 — vehicle_market_price 에서 상/하위권만 자동 선별
--   3) 빈 값 row 생성 (market/our 모두 NULL — UI/AI 에서 순차 채움)
-- ============================================================

-- ─── 1) 클래스 스코프 (중위권 기본 8 × 5 = 40 rows) ───
INSERT INTO cost_standards_scope
  (scope_type, vehicle_class, fuel_type, display_label, sort_order, is_active)
VALUES
  ('class','경형',      '가솔린',     '경형 / 가솔린',        10, 1),
  ('class','경형',      '전기',       '경형 / 전기',          11, 1),
  ('class','소형',      '가솔린',     '소형 / 가솔린',        20, 1),
  ('class','소형',      '디젤',       '소형 / 디젤',          21, 1),
  ('class','소형',      '하이브리드', '소형 / 하이브리드',    22, 1),
  ('class','소형',      '전기',       '소형 / 전기',          23, 1),
  ('class','소형',      'LPG',        '소형 / LPG',           24, 1),
  ('class','준중형',    '가솔린',     '준중형 / 가솔린',      30, 1),
  ('class','준중형',    '디젤',       '준중형 / 디젤',        31, 1),
  ('class','준중형',    '하이브리드', '준중형 / 하이브리드',  32, 1),
  ('class','준중형',    '전기',       '준중형 / 전기',        33, 1),
  ('class','준중형',    'LPG',        '준중형 / LPG',         34, 1),
  ('class','중형',      '가솔린',     '중형 / 가솔린',        40, 1),
  ('class','중형',      '디젤',       '중형 / 디젤',          41, 1),
  ('class','중형',      '하이브리드', '중형 / 하이브리드',    42, 1),
  ('class','중형',      '전기',       '중형 / 전기',          43, 1),
  ('class','중형',      'LPG',        '중형 / LPG',           44, 1),
  ('class','준대형',    '가솔린',     '준대형 / 가솔린',      50, 1),
  ('class','준대형',    '디젤',       '준대형 / 디젤',        51, 1),
  ('class','준대형',    '하이브리드', '준대형 / 하이브리드',  52, 1),
  ('class','준대형',    '전기',       '준대형 / 전기',        53, 1),
  ('class','대형',      '가솔린',     '대형 / 가솔린',        60, 1),
  ('class','대형',      '디젤',       '대형 / 디젤',          61, 1),
  ('class','대형',      '하이브리드', '대형 / 하이브리드',    62, 1),
  ('class','대형',      '전기',       '대형 / 전기',          63, 1),
  ('class','SUV',       '가솔린',     'SUV / 가솔린',         70, 1),
  ('class','SUV',       '디젤',       'SUV / 디젤',           71, 1),
  ('class','SUV',       '하이브리드', 'SUV / 하이브리드',     72, 1),
  ('class','SUV',       '전기',       'SUV / 전기',           73, 1),
  ('class','RV',        '가솔린',     'RV / 가솔린',          80, 1),
  ('class','RV',        '디젤',       'RV / 디젤',            81, 1),
  ('class','RV',        '하이브리드', 'RV / 하이브리드',      82, 1),
  ('class','RV',        '전기',       'RV / 전기',            83, 1)
ON DUPLICATE KEY UPDATE display_label = VALUES(display_label);


-- ─── 2) 모델 스코프 — 상/하위권 자동 선별 ───
--  기준: vehicle_market_price 기준가가 같은 class 평균 대비 ±25% 이상 벗어난 차량
--  (편차가 큰 프리미엄/특수 모델만 개별 관리)
INSERT INTO cost_standards_scope
  (scope_type, brand, model, fuel_type, display_label, sort_order, is_active)
SELECT
  'model',
  vmp.brand,
  vmp.model,
  COALESCE(vmp.fuel_type, '가솔린'),
  CONCAT(vmp.brand, ' ', vmp.model, ' / ', COALESCE(vmp.fuel_type, '가솔린')),
  200,
  1
FROM vehicle_market_price vmp
JOIN (
  SELECT vehicle_class, fuel_type, AVG(base_price) AS avg_price
    FROM vehicle_market_price
   WHERE is_active = 1
   GROUP BY vehicle_class, fuel_type
) avg_tbl
  ON avg_tbl.vehicle_class = vmp.vehicle_class
 AND avg_tbl.fuel_type     = vmp.fuel_type
WHERE vmp.is_active = 1
  AND (vmp.base_price > avg_tbl.avg_price * 1.25
    OR vmp.base_price < avg_tbl.avg_price * 0.75)
GROUP BY vmp.brand, vmp.model, vmp.fuel_type
ON DUPLICATE KEY UPDATE display_label = VALUES(display_label);


-- ─── 3) 값 row 생성 (스코프 × 6 컴포넌트 — 빈 값) ───
--  market_value/our_value 는 NULL 로 시작 → UI / AI 동기화에서 채움
INSERT INTO cost_standards_value
  (scope_id, component, unit, market_value, our_value, sample_count)
SELECT s.id, c.component, c.unit, NULL, NULL, 0
FROM cost_standards_scope s
CROSS JOIN (
  SELECT 'insurance'    AS component, 'annual'  AS unit UNION ALL
  SELECT 'maintenance',                'monthly'        UNION ALL
  SELECT 'tax',                        'annual'         UNION ALL
  SELECT 'inspection',                 'annual'         UNION ALL
  SELECT 'finance_rate',               'percent'        UNION ALL
  SELECT 'registration',               'fixed'
) c
WHERE s.is_active = 1
ON DUPLICATE KEY UPDATE unit = VALUES(unit);


-- ─── 4) 검증 ───
-- SELECT scope_type, COUNT(*) FROM cost_standards_scope GROUP BY scope_type;
-- SELECT component, COUNT(*) FROM cost_standards_value GROUP BY component;
