-- ════════════════════════════════════════════════════════════════════
-- PR-Q4-3 — new_car_prices 카탈로그 대표 7 차종 시드
-- 2026-05-26 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 결정 (l-ii): 「대표 5~10 차종 시드」
-- 카탈로그 빈 상태 시연/테스트용. 영업이 AI 캡쳐로 더 추가.
--
-- 가격은 2026년 기준 대표 출고가 추정 (영업이 실제 매입가는 견적 시 입력).
-- price_data JSON: variants[].fuel_type/engine_cc + trims[].name/base_price/colors/options
--
-- 멱등 (INSERT IGNORE — brand+model+year UNIQUE 가정. 미정의 시 그냥 추가).
-- ⚠ 동일 (brand,model,year) 재실행 시 중복 row 생길 수 있음 — 한 번만 실행 권장.
-- 실행 전 확인:
--   SELECT brand, model, year FROM new_car_prices
--    WHERE brand IN ('기아','현대','BMW','벤츠') ORDER BY brand, model, year;
--
-- 실행:
--   mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-26_Q4_new_car_prices_seed.sql
-- ════════════════════════════════════════════════════════════════════

-- ── 1. 기아 모닝 ──
INSERT INTO new_car_prices (id, brand, model, year, source, price_data, created_at, updated_at)
SELECT UUID(), '기아', '모닝', 2026, 'seed',
  JSON_OBJECT(
    'brand', '기아', 'model', '모닝', 'year', 2026, 'available', true, 'source', 'seed',
    'variants', JSON_ARRAY(
      JSON_OBJECT('variant_name', '기본', 'fuel_type', '가솔린', 'engine_cc', 998,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '트렌디', 'base_price', 13500000,
            'exterior_colors', JSON_ARRAY(JSON_OBJECT('name', '클리어 화이트', 'price', 0), JSON_OBJECT('name', '미드나잇 블랙', 'price', 0)),
            'interior_colors', JSON_ARRAY(JSON_OBJECT('name', '블랙', 'price', 0)),
            'options', JSON_ARRAY())),
          JSON_OBJECT('name', '프레스티지', 'base_price', 15800000,
            'exterior_colors', JSON_ARRAY(JSON_OBJECT('name', '클리어 화이트', 'price', 0), JSON_OBJECT('name', '미드나잇 블랙', 'price', 0), JSON_OBJECT('name', '실키 실버', 'price', 0)),
            'interior_colors', JSON_ARRAY(JSON_OBJECT('name', '블랙', 'price', 0)),
            'options', JSON_ARRAY(JSON_OBJECT('name', '후방카메라', 'price', 0), JSON_OBJECT('name', '내비게이션', 'price', 0)))
        ))
    )),
  NOW(), NOW()
FROM dual WHERE NOT EXISTS (
  SELECT 1 FROM new_car_prices WHERE brand='기아' AND model='모닝' AND year=2026
);

-- ── 2. 현대 아반떼 ──
INSERT INTO new_car_prices (id, brand, model, year, source, price_data, created_at, updated_at)
SELECT UUID(), '현대', '아반떼', 2026, 'seed',
  JSON_OBJECT(
    'brand', '현대', 'model', '아반떼', 'year', 2026, 'available', true, 'source', 'seed',
    'variants', JSON_ARRAY(
      JSON_OBJECT('variant_name', '가솔린', 'fuel_type', '가솔린', 'engine_cc', 1598,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '스마트', 'base_price', 20500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '모던', 'base_price', 22800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '인스퍼레이션', 'base_price', 25600000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()))),
      JSON_OBJECT('variant_name', '하이브리드', 'fuel_type', '하이브리드', 'engine_cc', 1580,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '모던 하이브리드', 'base_price', 26500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '인스퍼레이션 하이브리드', 'base_price', 29200000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY())))
    )),
  NOW(), NOW()
FROM dual WHERE NOT EXISTS (
  SELECT 1 FROM new_car_prices WHERE brand='현대' AND model='아반떼' AND year=2026
);

-- ── 3. 현대 쏘나타 ──
INSERT INTO new_car_prices (id, brand, model, year, source, price_data, created_at, updated_at)
SELECT UUID(), '현대', '쏘나타', 2026, 'seed',
  JSON_OBJECT(
    'brand', '현대', 'model', '쏘나타', 'year', 2026, 'available', true, 'source', 'seed',
    'variants', JSON_ARRAY(
      JSON_OBJECT('variant_name', '가솔린', 'fuel_type', '가솔린', 'engine_cc', 1999,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '프리미엄', 'base_price', 30500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '익스클루시브', 'base_price', 33800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '인스퍼레이션', 'base_price', 37200000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()))),
      JSON_OBJECT('variant_name', '하이브리드', 'fuel_type', '하이브리드', 'engine_cc', 1999,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '프리미엄 하이브리드', 'base_price', 33200000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '인스퍼레이션 하이브리드', 'base_price', 39800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY())))
    )),
  NOW(), NOW()
FROM dual WHERE NOT EXISTS (
  SELECT 1 FROM new_car_prices WHERE brand='현대' AND model='쏘나타' AND year=2026
);

-- ── 4. 현대 그랜저 ──
INSERT INTO new_car_prices (id, brand, model, year, source, price_data, created_at, updated_at)
SELECT UUID(), '현대', '그랜저', 2026, 'seed',
  JSON_OBJECT(
    'brand', '현대', 'model', '그랜저', 'year', 2026, 'available', true, 'source', 'seed',
    'variants', JSON_ARRAY(
      JSON_OBJECT('variant_name', '가솔린', 'fuel_type', '가솔린', 'engine_cc', 2497,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '프리미엄', 'base_price', 39800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '익스클루시브', 'base_price', 44500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '캘리그래피', 'base_price', 49800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()))),
      JSON_OBJECT('variant_name', '하이브리드', 'fuel_type', '하이브리드', 'engine_cc', 1598,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '프리미엄 하이브리드', 'base_price', 43500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '캘리그래피 하이브리드', 'base_price', 52800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY())))
    )),
  NOW(), NOW()
FROM dual WHERE NOT EXISTS (
  SELECT 1 FROM new_car_prices WHERE brand='현대' AND model='그랜저' AND year=2026
);

-- ── 5. 제네시스 G80 ──
INSERT INTO new_car_prices (id, brand, model, year, source, price_data, created_at, updated_at)
SELECT UUID(), '제네시스', 'G80', 2026, 'seed',
  JSON_OBJECT(
    'brand', '제네시스', 'model', 'G80', 'year', 2026, 'available', true, 'source', 'seed',
    'variants', JSON_ARRAY(
      JSON_OBJECT('variant_name', '가솔린 2.5', 'fuel_type', '가솔린', 'engine_cc', 2497,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '2.5 터보 RWD', 'base_price', 56500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '2.5 터보 AWD', 'base_price', 59800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()))),
      JSON_OBJECT('variant_name', '가솔린 3.5', 'fuel_type', '가솔린', 'engine_cc', 3470,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '3.5 터보 RWD', 'base_price', 68500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '3.5 터보 AWD', 'base_price', 72800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY())))
    )),
  NOW(), NOW()
FROM dual WHERE NOT EXISTS (
  SELECT 1 FROM new_car_prices WHERE brand='제네시스' AND model='G80' AND year=2026
);

-- ── 6. BMW 5시리즈 ──
INSERT INTO new_car_prices (id, brand, model, year, source, price_data, created_at, updated_at)
SELECT UUID(), 'BMW', '5시리즈', 2026, 'seed',
  JSON_OBJECT(
    'brand', 'BMW', 'model', '5시리즈', 'year', 2026, 'available', true, 'source', 'seed',
    'variants', JSON_ARRAY(
      JSON_OBJECT('variant_name', '520i', 'fuel_type', '가솔린', 'engine_cc', 1998,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '520i Luxury', 'base_price', 75500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', '520i M Sport', 'base_price', 80500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()))),
      JSON_OBJECT('variant_name', '530i', 'fuel_type', '가솔린', 'engine_cc', 1998,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', '530i M Sport', 'base_price', 88500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()))),
      JSON_OBJECT('variant_name', 'i5', 'fuel_type', '전기', 'engine_cc', 0,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', 'i5 eDrive40', 'base_price', 95800000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY())))
    )),
  NOW(), NOW()
FROM dual WHERE NOT EXISTS (
  SELECT 1 FROM new_car_prices WHERE brand='BMW' AND model='5시리즈' AND year=2026
);

-- ── 7. 벤츠 E클래스 ──
INSERT INTO new_car_prices (id, brand, model, year, source, price_data, created_at, updated_at)
SELECT UUID(), '벤츠', 'E클래스', 2026, 'seed',
  JSON_OBJECT(
    'brand', '벤츠', 'model', 'E클래스', 'year', 2026, 'available', true, 'source', 'seed',
    'variants', JSON_ARRAY(
      JSON_OBJECT('variant_name', 'E200', 'fuel_type', '가솔린', 'engine_cc', 1991,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', 'E200 Avantgarde', 'base_price', 78500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()))),
      JSON_OBJECT('variant_name', 'E300', 'fuel_type', '가솔린', 'engine_cc', 1991,
        'trims', JSON_ARRAY(
          JSON_OBJECT('name', 'E300 Avantgarde', 'base_price', 88500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY()),
          JSON_OBJECT('name', 'E300 4MATIC', 'base_price', 95500000, 'exterior_colors', JSON_ARRAY(), 'interior_colors', JSON_ARRAY(), 'options', JSON_ARRAY())))
    )),
  NOW(), NOW()
FROM dual WHERE NOT EXISTS (
  SELECT 1 FROM new_car_prices WHERE brand='벤츠' AND model='E클래스' AND year=2026
);

-- ── 검증 ──────────────────────────────────────────────────
--   SELECT brand, model, year, source FROM new_car_prices
--    WHERE source='seed' ORDER BY brand, model;
--   -- 기대: 7 row (모닝/아반떼/쏘나타/그랜저/G80/5시리즈/E클래스)
--
--   SELECT brand, model,
--          JSON_LENGTH(price_data, '$.variants') AS variants,
--          JSON_LENGTH(price_data, '$.variants[0].trims') AS first_variant_trims
--     FROM new_car_prices WHERE source='seed' ORDER BY brand, model;
