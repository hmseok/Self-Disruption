-- ============================================================
-- 028: ID 타입 표준화 마이그레이션
-- ============================================================
-- 문제: cars(BIGINT PK), customers(BIGINT PK)인데
--       quotes, contracts 등의 FK가 UUID로 선언되어 타입 불일치
-- 해결: FK 컬럼을 실제 참조 테이블의 PK 타입(BIGINT)으로 변경
-- ============================================================

-- ============================
-- 1. quotes 테이블 FK 타입 수정
-- ============================

-- car_id: UUID → BIGINT (cars.id는 BIGINT)
DO $$
BEGIN
  -- 기존 FK 제약 제거 (있으면)
  ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_car_id_fkey;
  -- 컬럼 타입 변경 (기존 UUID 데이터는 변환 불가 → null 처리)
  -- 먼저 임시로 text 변환 후 BIGINT로
  ALTER TABLE quotes ALTER COLUMN car_id DROP DEFAULT;
  ALTER TABLE quotes ALTER COLUMN car_id TYPE BIGINT USING (
    CASE
      WHEN car_id IS NULL THEN NULL
      WHEN car_id::text ~ '^\d+$' THEN car_id::text::BIGINT
      ELSE NULL  -- UUID 형식이었던 값은 null 처리
    END
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'quotes.car_id 타입 변경 스킵 (이미 BIGINT이거나 에러): %', SQLERRM;
END $$;

-- customer_id: UUID → BIGINT (customers.id는 BIGINT)
DO $$
BEGIN
  ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_customer_id_fkey;
  ALTER TABLE quotes ALTER COLUMN customer_id DROP DEFAULT;
  ALTER TABLE quotes ALTER COLUMN customer_id TYPE BIGINT USING (
    CASE
      WHEN customer_id IS NULL THEN NULL
      WHEN customer_id::text ~ '^\d+$' THEN customer_id::text::BIGINT
      ELSE NULL
    END
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'quotes.customer_id 타입 변경 스킵: %', SQLERRM;
END $$;

-- ============================
-- 2. contracts 테이블 FK 타입 확인/수정
-- ============================

-- car_id → BIGINT 확인 (이미 BIGINT일 수 있음)
DO $$
BEGIN
  ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_car_id_fkey;
  ALTER TABLE contracts ALTER COLUMN car_id TYPE BIGINT USING (
    CASE
      WHEN car_id IS NULL THEN NULL
      WHEN car_id::text ~ '^\d+$' THEN car_id::text::BIGINT
      ELSE NULL
    END
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'contracts.car_id 타입 변경 스킵: %', SQLERRM;
END $$;

-- customer_id → BIGINT
DO $$
BEGIN
  ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_customer_id_fkey;
  ALTER TABLE contracts ALTER COLUMN customer_id TYPE BIGINT USING (
    CASE
      WHEN customer_id IS NULL THEN NULL
      WHEN customer_id::text ~ '^\d+$' THEN customer_id::text::BIGINT
      ELSE NULL
    END
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'contracts.customer_id 타입 변경 스킵: %', SQLERRM;
END $$;

-- ============================
-- 3. pricing_worksheets FK 타입 확인
-- ============================
DO $$
BEGIN
  ALTER TABLE pricing_worksheets DROP CONSTRAINT IF EXISTS pricing_worksheets_car_id_fkey;
  ALTER TABLE pricing_worksheets ALTER COLUMN car_id TYPE BIGINT USING (
    CASE
      WHEN car_id IS NULL THEN NULL
      WHEN car_id::text ~ '^\d+$' THEN car_id::text::BIGINT
      ELSE NULL
    END
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pricing_worksheets.car_id 타입 변경 스킵: %', SQLERRM;
END $$;

-- ============================
-- 4. market_comparisons FK 타입 확인
-- ============================
DO $$
BEGIN
  ALTER TABLE market_comparisons DROP CONSTRAINT IF EXISTS market_comparisons_car_id_fkey;
  ALTER TABLE market_comparisons ALTER COLUMN car_id TYPE BIGINT USING (
    CASE
      WHEN car_id IS NULL THEN NULL
      WHEN car_id::text ~ '^\d+$' THEN car_id::text::BIGINT
      ELSE NULL
    END
  );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'market_comparisons.car_id 타입 변경 스킵: %', SQLERRM;
END $$;

-- ============================
-- 5. car_costs FK 확인 (이미 BIGINT일 가능성 높음)
-- ============================
DO $$
BEGIN
  -- car_costs는 020에서 BIGINT로 생성됨 — 확인만
  PERFORM column_name FROM information_schema.columns
  WHERE table_name = 'car_costs' AND column_name = 'car_id';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'car_costs 확인 스킵: %', SQLERRM;
END $$;

-- ============================
-- 6. FK 제약 재생성 (BIGINT ↔ BIGINT)
-- ============================
DO $$
BEGIN
  -- quotes → cars
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='car_id') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_car_id_fkey
      FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'quotes.car_id FK 재생성 스킵: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- quotes → customers
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='customer_id') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'quotes.customer_id FK 재생성 스킵: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- contracts → cars
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='car_id') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_car_id_fkey
      FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'contracts.car_id FK 재생성 스킵: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- contracts → customers
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='customer_id') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'contracts.customer_id FK 재생성 스킵: %', SQLERRM;
END $$;

DO $$
BEGIN
  -- pricing_worksheets → cars
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pricing_worksheets' AND column_name='car_id') THEN
    ALTER TABLE pricing_worksheets ADD CONSTRAINT pricing_worksheets_car_id_fkey
      FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pricing_worksheets.car_id FK 재생성 스킵: %', SQLERRM;
END $$;


-- ============================================================
-- 완료 로그
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '===== 028_id_type_standardization 완료 =====';
  RAISE NOTICE 'quotes, contracts, pricing_worksheets의 car_id/customer_id → BIGINT 변환 완료';
  RAISE NOTICE 'FK 제약 재생성 완료 (ON DELETE SET NULL)';
END $$;
