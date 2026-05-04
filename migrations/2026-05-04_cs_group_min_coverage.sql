-- ═══════════════════════════════════════════════════════════════════
-- PR-2QQ-d-2 — cs_group_min_coverage 신설 (그룹 × 요일 × 최소 인원)
--
-- 운영 사실 (Rule 25):
--   야간 그룹 매일 최소 2명 / 금요일 피크 3명 / 일요일 1명 같은
--   디폴트 + 복수 예외 모델. max 는 사용 안 함 (제거).
--
-- 모델:
--   (group_id, dow=NULL)  → 매일 디폴트
--   (group_id, dow=0~6)   → 특정 요일 override (복수)
--   조회 시 우선순위: 특정 dow > NULL
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_group_min_coverage (
  id           CHAR(36)  NOT NULL PRIMARY KEY,
  group_id     CHAR(36)  NOT NULL,
  dow          TINYINT   NULL  COMMENT '0=일, 1=월, ..., 6=토. NULL=매일 디폴트',
  min_workers  TINYINT   NOT NULL DEFAULT 1  COMMENT '최소 동시 근무자',
  created_at   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cs_gmc_group (group_id),
  CONSTRAINT fk_cs_gmc_group
    FOREIGN KEY (group_id) REFERENCES cs_shift_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (group_id, dow) UNIQUE — dow NULL 도 1개만 허용
-- MySQL 8 의 NULL = NULL 비교는 false 라서 UNIQUE 는 NULL 여러 개 허용됨
-- 따라서 (group_id, COALESCE(dow, 99)) 형태가 안전하지만 함수 인덱스 복잡.
-- 대신 API 레벨에서 (group_id, dow) 중복 체크 + DELETE 후 INSERT 패턴 사용.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cs_group_min_coverage'
    AND index_name = 'uq_cs_gmc_group_dow'
);
SET @add_sql := IF(@idx_exists = 0,
  'ALTER TABLE cs_group_min_coverage ADD UNIQUE KEY uq_cs_gmc_group_dow (group_id, dow)',
  'SELECT 1');
PREPARE stmt FROM @add_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- DESCRIBE cs_group_min_coverage;
--   기대치: id / group_id / dow (NULL) / min_workers / created_at / updated_at
-- SHOW INDEX FROM cs_group_min_coverage;
--   기대치: PRIMARY / idx_cs_gmc_group / uq_cs_gmc_group_dow / fk_cs_gmc_group
--
-- 운영 입력 예시:
-- SET @gid = '<야간콜그룹id>';
-- INSERT INTO cs_group_min_coverage (id, group_id, dow, min_workers)
--   VALUES (UUID(), @gid, NULL, 2);   -- 매일 디폴트 2명
-- INSERT INTO cs_group_min_coverage (id, group_id, dow, min_workers)
--   VALUES (UUID(), @gid, 5,    3);   -- 금요일 3명
-- INSERT INTO cs_group_min_coverage (id, group_id, dow, min_workers)
--   VALUES (UUID(), @gid, 0,    1);   -- 일요일 1명

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS cs_group_min_coverage;
