-- ═══════════════════════════════════════════════════════════════════
-- Phase W-1a — 날씨 기반 인력 예측 초기 스키마 + 시드
--   설계서: app/(employees)/CallScheduler/_docs/WEATHER-STAFFING-DESIGN.md
--   2026-05-24
--
-- 신설 3 테이블:
--   · cs_weather_regions  — 권역 마스터 (17 광역자치단체 시드, 인구비례 가중치)
--   · cs_weather_cache    — 날씨 캐시 (권역당 1행, 1h TTL, 매 fetch 시 덮어쓰기)
--   · cs_weather_factors  — 보정율 룰 (10행 시드, condition → λ 곱셈 factor)
--
-- 멱등 (Rule 24):
--   · CREATE TABLE IF NOT EXISTS — 재실행 안전
--   · 시드 INSERT — UNIQUE 키 + INSERT IGNORE → 추가 시드 없음
--   · 사용자가 수정한 값(weight_pct·factor)은 보존 (UPDATE 안 함)
--
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- ROLLBACK: 본 파일 하단 섹션
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- (1) cs_weather_regions — 권역 마스터
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_weather_regions (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  code         VARCHAR(16)  NOT NULL                COMMENT 'SEOUL/BUSAN/GYEONGGI... (시드 키)',
  label        VARCHAR(32)  NOT NULL                COMMENT '서울특별시/부산광역시...',
  lat          DECIMAL(8,5) NOT NULL                COMMENT '위도',
  lon          DECIMAL(8,5) NOT NULL                COMMENT '경도',
  weight_pct   DECIMAL(5,2) NOT NULL DEFAULT 0      COMMENT '가중치 % (합 100)',
  sort_order   INT          NOT NULL DEFAULT 0      COMMENT '표시 순서 (작을수록 위)',
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_weather_region_code (code),
  KEY idx_weather_region_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Phase W — 날씨 권역 마스터';

-- ───────────────────────────────────────────────────────────────────
-- (2) cs_weather_cache — 날씨 캐시 (권역당 1행, 1h TTL)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_weather_cache (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  region_id       CHAR(36)     NOT NULL,
  fetched_at      DATETIME     NOT NULL,
  valid_until     DATETIME     NOT NULL              COMMENT 'fetched_at + 1h',
  current_temp    DECIMAL(4,1) NULL                  COMMENT '현재 기온 °C',
  current_code    INT          NULL                  COMMENT 'OpenWeather condition.id',
  current_main    VARCHAR(16)  NULL                  COMMENT 'Rain/Snow/Clear/...',
  current_desc    VARCHAR(64)  NULL                  COMMENT '현지화 설명',
  today_min       DECIMAL(4,1) NULL,
  today_max       DECIMAL(4,1) NULL,
  today_pop       DECIMAL(4,2) NULL                  COMMENT '강수확률 0~1',
  raw_json        JSON         NULL                  COMMENT 'OpenWeather 원본 응답',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_weather_cache_region (region_id),
  KEY idx_weather_cache_valid (valid_until),
  CONSTRAINT fk_weather_cache_region FOREIGN KEY (region_id)
    REFERENCES cs_weather_regions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Phase W — 날씨 캐시 (1h TTL, 권역당 1행 덮어쓰기)';

-- ───────────────────────────────────────────────────────────────────
-- (3) cs_weather_factors — 보정율 룰 (condition → λ 곱셈 factor)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cs_weather_factors (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  condition_key      VARCHAR(32)  NOT NULL              COMMENT 'rain_light/snow_heavy/...',
  label              VARCHAR(32)  NOT NULL              COMMENT '약한 비/폭설/...',
  factor             DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT 'λ 곱셈 (1.00=무영향)',
  openweather_codes  VARCHAR(64)  NOT NULL              COMMENT 'CSV — OpenWeather condition.id 매핑',
  sort_order         INT          NOT NULL DEFAULT 0,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_weather_factor_key (condition_key),
  KEY idx_weather_factor_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Phase W — 날씨 condition → λ 보정율 룰';

-- ═══════════════════════════════════════════════════════════════════
-- 시드 — 17 광역자치단체 (인구비례 가중치, 도청/시청 소재지 좌표)
-- 멱등: UNIQUE(code) + INSERT IGNORE → 사용자 편집값 보존
-- ═══════════════════════════════════════════════════════════════════
INSERT IGNORE INTO cs_weather_regions
  (id, code, label, lat, lon, weight_pct, sort_order) VALUES
  (UUID(), 'GYEONGGI',  '경기도',         37.27500, 127.00900, 26.40,  1),
  (UUID(), 'SEOUL',     '서울특별시',     37.56650, 126.97800, 18.30,  2),
  (UUID(), 'BUSAN',     '부산광역시',     35.17960, 129.07560,  6.40,  3),
  (UUID(), 'GYEONGNAM', '경상남도',       35.23820, 128.69210,  6.30,  4),
  (UUID(), 'INCHEON',   '인천광역시',     37.45630, 126.70520,  5.80,  5),
  (UUID(), 'GYEONGBUK', '경상북도',       36.57600, 128.72740,  5.00,  6),
  (UUID(), 'DAEGU',     '대구광역시',     35.87140, 128.60140,  4.60,  7),
  (UUID(), 'CHUNGNAM',  '충청남도',       36.65880, 126.67080,  4.10,  8),
  (UUID(), 'JEONNAM',   '전라남도',       34.81610, 126.46300,  3.50,  9),
  (UUID(), 'JEONBUK',   '전북특별자치도', 35.82420, 127.14800,  3.40, 10),
  (UUID(), 'CHUNGBUK',  '충청북도',       36.63570, 127.49140,  3.10, 11),
  (UUID(), 'GANGWON',   '강원특별자치도', 37.88540, 127.72980,  3.00, 12),
  (UUID(), 'DAEJEON',   '대전광역시',     36.35040, 127.38450,  2.80, 13),
  (UUID(), 'GWANGJU',   '광주광역시',     35.15950, 126.85260,  2.80, 14),
  (UUID(), 'ULSAN',     '울산광역시',     35.53840, 129.31140,  2.10, 15),
  (UUID(), 'JEJU',      '제주특별자치도', 33.48900, 126.49830,  1.30, 16),
  (UUID(), 'SEJONG',    '세종특별자치시', 36.48000, 127.28900,  1.10, 17);
-- weight_pct 합 = 100.00

-- ═══════════════════════════════════════════════════════════════════
-- 시드 — 보정율 룰 (10행, OpenWeather condition.id → factor)
--   기준: KPI 운영 후 사용자가 「KPI 설정 › ⛅ 날씨 기준」에서 조정.
-- ═══════════════════════════════════════════════════════════════════
INSERT IGNORE INTO cs_weather_factors
  (id, condition_key, label, factor, openweather_codes, sort_order) VALUES
  (UUID(), 'thunder',       '천둥번개',   1.60, '200,201,202,210,211,212,221,230,231,232',   1),
  (UUID(), 'drizzle',       '이슬비',     1.20, '300,301,302,310,311,312,313,314,321',       2),
  (UUID(), 'rain_light',    '약한 비',    1.20, '500,520',                                    3),
  (UUID(), 'rain_moderate', '보통 비',    1.30, '501,521',                                    4),
  (UUID(), 'rain_heavy',    '폭우',       1.60, '502,503,504,522,531',                        5),
  (UUID(), 'snow_light',    '약한 눈',    1.40, '600,612,615,620',                            6),
  (UUID(), 'snow_heavy',    '폭설',       1.80, '601,602,613,616,621,622',                    7),
  (UUID(), 'fog',           '안개',       1.10, '701,711,721,731,741,751,761,762,771,781',   8),
  (UUID(), 'clear',         '맑음',       1.00, '800',                                         9),
  (UUID(), 'clouds',        '흐림',       1.00, '801,802,803,804',                            10);

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SELECT (적용 후 직접 실행)
-- ═══════════════════════════════════════════════════════════════════
-- (1) 권역 시드 — 17행 + 가중치 합 100.00 기대
-- SELECT COUNT(*) AS regions, ROUND(SUM(weight_pct), 2) AS sum_weight
-- FROM cs_weather_regions WHERE is_active = 1;
--
-- (2) 보정율 룰 시드 — 10행 기대
-- SELECT COUNT(*) AS factors FROM cs_weather_factors;
--
-- (3) 캐시 — 0행 기대 (W-1c 적용 후 첫 fetch 부터 채워짐)
-- SELECT COUNT(*) AS cache_rows FROM cs_weather_cache;
--
-- (4) 시드 미리보기 — 가중치 순
-- SELECT code, label, weight_pct, sort_order
-- FROM cs_weather_regions WHERE is_active=1 ORDER BY sort_order;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (역순 — 시드 + 테이블 모두 제거)
-- ═══════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS cs_weather_cache;
-- DROP TABLE IF EXISTS cs_weather_factors;
-- DROP TABLE IF EXISTS cs_weather_regions;
