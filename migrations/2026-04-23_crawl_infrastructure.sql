-- ============================================================
-- 2026-04-23 : 크롤러 Phase A — 인프라 테이블
-- ============================================================

-- ─── 1) 크롤링 이력 로그 ───
CREATE TABLE IF NOT EXISTS crawl_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_site VARCHAR(50) NOT NULL COMMENT 'kb_chacha | encar | manufacturer',
  total_targets INT DEFAULT 0 COMMENT '대상 차종 수',
  success_count INT DEFAULT 0 COMMENT '성공 UPSERT 건수',
  fail_count INT DEFAULT 0 COMMENT '실패 건수',
  duration_ms INT DEFAULT 0 COMMENT '소요 시간 (ms)',
  error_summary TEXT COMMENT '에러 요약',
  triggered_by VARCHAR(20) DEFAULT 'manual' COMMENT 'manual | cron',
  created_at DATETIME DEFAULT NOW(),
  INDEX idx_crawl_log_source (source_site),
  INDEX idx_crawl_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─── 2) 크롤링 대상 차종 마스터 ───
CREATE TABLE IF NOT EXISTS crawl_targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(50) NOT NULL COMMENT '브랜드 (현대, 기아, BMW 등)',
  model VARCHAR(100) NOT NULL COMMENT '모델명',
  year_from INT DEFAULT 2020 COMMENT '수집 시작 연식',
  year_to INT DEFAULT 2026 COMMENT '수집 종료 연식',
  fuel_type VARCHAR(20) COMMENT '연료 (가솔린, 디젤 등)',
  origin VARCHAR(10) DEFAULT '국산' COMMENT '국산 | 수입',
  manufacturer_url VARCHAR(500) COMMENT '제조사 공식 가격 URL',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  UNIQUE KEY uq_crawl_target (brand, model),
  INDEX idx_crawl_target_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─── 3) 인기 차종 시드 (26종) ───
INSERT INTO crawl_targets (brand, model, year_from, year_to, origin, manufacturer_url) VALUES
  -- 현대
  ('현대', '아반떼',    2020, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/avante/price'),
  ('현대', '쏘나타',    2020, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/sonata/price'),
  ('현대', '그랜저',    2020, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/grandeur/price'),
  ('현대', '투싼',      2020, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/tucson/price'),
  ('현대', '싼타페',    2020, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/santa-fe/price'),
  ('현대', '코나',      2020, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/kona/price'),
  ('현대', '셀토스',    2020, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/celtos/price'),
  ('현대', '스타리아',  2021, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/staria/price'),
  ('현대', '아이오닉5', 2021, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/ioniq5/price'),
  ('현대', '아이오닉6', 2023, 2026, '국산', 'https://www.hyundai.com/kr/ko/vehicles/ioniq6/price'),
  -- 기아
  ('기아', 'K3',        2020, 2026, '국산', 'https://www.kia.com/kr/vehicles/k3/price'),
  ('기아', 'K5',        2020, 2026, '국산', 'https://www.kia.com/kr/vehicles/k5/price'),
  ('기아', 'K8',        2021, 2026, '국산', 'https://www.kia.com/kr/vehicles/k8/price'),
  ('기아', '스포티지',  2020, 2026, '국산', 'https://www.kia.com/kr/vehicles/sportage/price'),
  ('기아', '쏘렌토',    2020, 2026, '국산', 'https://www.kia.com/kr/vehicles/sorento/price'),
  ('기아', '카니발',    2020, 2026, '국산', 'https://www.kia.com/kr/vehicles/carnival/price'),
  ('기아', 'EV6',       2022, 2026, '국산', 'https://www.kia.com/kr/vehicles/ev6/price'),
  ('기아', 'EV9',       2023, 2026, '국산', 'https://www.kia.com/kr/vehicles/ev9/price'),
  ('기아', '모닝',      2020, 2026, '국산', 'https://www.kia.com/kr/vehicles/morning/price'),
  ('기아', '레이',      2020, 2026, '국산', 'https://www.kia.com/kr/vehicles/ray/price'),
  -- 수입
  ('BMW',  '3시리즈',   2020, 2026, '수입', NULL),
  ('BMW',  '5시리즈',   2020, 2026, '수입', NULL),
  ('벤츠', 'C클래스',   2020, 2026, '수입', NULL),
  ('벤츠', 'E클래스',   2020, 2026, '수입', NULL),
  ('테슬라', '모델3',   2020, 2026, '수입', NULL),
  ('테슬라', '모델Y',   2021, 2026, '수입', NULL)
ON DUPLICATE KEY UPDATE
  year_from = VALUES(year_from),
  year_to = VALUES(year_to),
  manufacturer_url = VALUES(manufacturer_url);


-- ─── 4) vehicle_market_price에 source_site 인덱스 추가 (없으면) ───
-- 크롤러가 source_site별 UPSERT를 빈번히 하므로 인덱스 필수
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehicle_market_price'
    AND INDEX_NAME = 'idx_vmp_source_lookup'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE vehicle_market_price ADD INDEX idx_vmp_source_lookup (brand, model, year, source_site)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
