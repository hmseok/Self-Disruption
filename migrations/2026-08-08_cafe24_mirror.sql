-- ═══════════════════════════════════════════════════════════════
-- 카페24 접수 미러 (2026-08-08) — 사용자 확정: "받아서 우리쪽 DB로"
-- 목적: 카페24(skyautosvc MariaDB) 단일 장애점 제거 + 이력 보존 + 조회 가속
-- 구조: 검색용 키 컬럼 + payload(JSON 전체 행). 30분 크론 증분 + 1회 전체 백필.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cafe24_accidents_mirror (
  otptidno      VARCHAR(30) NOT NULL,
  otptmddt      VARCHAR(8)  NOT NULL,
  otptsrno      INT         NOT NULL,
  -- 검색·필터용 발췌 컬럼
  otptrgst      CHAR(1)     NULL,
  otptdcyn      CHAR(1)     NULL,
  otptcanm      VARCHAR(100) NULL,
  otptcahp      VARCHAR(30)  NULL,
  otptdsnm      VARCHAR(100) NULL,
  cars_no       VARCHAR(30)  NULL,
  cars_user     VARCHAR(100) NULL,
  factory_names VARCHAR(300) NULL,
  otpttobm      VARCHAR(100) NULL,
  otpttobn      VARCHAR(100) NULL,
  -- 전체 행 (조회 화면이 쓰는 모든 필드)
  payload       LONGTEXT    NOT NULL,
  synced_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (otptidno, otptmddt, otptsrno),
  KEY idx_c24m_mddt (otptmddt),
  KEY idx_c24m_cars (cars_no),
  KEY idx_c24m_canm (otptcanm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 범용 앱 설정 KV (2026-08-08) — 메뉴 트리 레이아웃 등
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key   VARCHAR(60) NOT NULL PRIMARY KEY,
  setting_value LONGTEXT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
