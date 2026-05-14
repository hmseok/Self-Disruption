-- PR-OPS-2.1c-1 — operations_dispatch_orders 에 cafe24 acrotpth 키 3개 추가
-- 2026-05-13 (trusting-relaxed-keller / operations 세션)
--
-- 배경:
--   사용자가 사고접수 상세 (acrotpth idno+mddt+srno) 에서 「대차로 진행」 누르면
--   operations_dispatch_orders 가 만들어진다 (현재 ride_accident_id INT 만 저장).
--   그러나 mddt/srno 가 없어서 우리 dispatch 상세 페이지로 정확 link 불가.
--   3개 컬럼 추가로 매핑 보강.
--
-- Rule 23 멱등성: IF NOT EXISTS 가드.
-- Rule 24 시드: 본 마이그 시드 없음.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'operations_dispatch_orders'
     AND column_name = 'cafe24_otpt_idno'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE operations_dispatch_orders ADD COLUMN cafe24_otpt_idno VARCHAR(20) NULL DEFAULT NULL',
  'SELECT "cafe24_otpt_idno already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'operations_dispatch_orders'
     AND column_name = 'cafe24_otpt_mddt'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE operations_dispatch_orders ADD COLUMN cafe24_otpt_mddt VARCHAR(8) NULL DEFAULT NULL',
  'SELECT "cafe24_otpt_mddt already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'operations_dispatch_orders'
     AND column_name = 'cafe24_otpt_srno'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE operations_dispatch_orders ADD COLUMN cafe24_otpt_srno INT NULL DEFAULT NULL',
  'SELECT "cafe24_otpt_srno already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- INDEX (조회 최적화)
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'operations_dispatch_orders'
     AND index_name = 'idx_ops_dispatch_cafe24_keys'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE operations_dispatch_orders ADD INDEX idx_ops_dispatch_cafe24_keys (cafe24_otpt_idno, cafe24_otpt_mddt, cafe24_otpt_srno)',
  'SELECT "idx_ops_dispatch_cafe24_keys already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 검증 SELECT (Rule 23)
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema=DATABASE() AND table_name='operations_dispatch_orders'
--     AND column_name IN ('cafe24_otpt_idno','cafe24_otpt_mddt','cafe24_otpt_srno');
-- 기대치: 3 rows
