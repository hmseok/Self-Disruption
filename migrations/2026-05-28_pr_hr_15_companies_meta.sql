-- ═══════════════════════════════════════════════════════════════
-- PR-HR-15 — companies 메타 컬럼 추가 (라벨/색상/활성/호스트/순서)
-- 설계: CLAUDE.md § PR-HR-15 통합 설계서 v2
-- ───────────────────────────────────────────────────────────────
-- 목적: 회사 추가 시 코드 + 마이그 둘 다 수정하지 않고
--       「+ 회사 추가」 UI 만으로 새 회사 row 가능.
--       라벨/색상은 lib/company-brand.ts 의 COMPANY_BRANDS 폴백,
--       DB 우선 (편집 시 DB 가 정본).
-- ───────────────────────────────────────────────────────────────
-- 멱등 (Rule 23/24) — 여러 번 실행해도 안전.
-- 적용: mysql -h 34.47.105.219 -u <user> -p fmi_op < 이 파일
-- ═══════════════════════════════════════════════════════════════

SET @db := DATABASE();

-- ── 1. companies 컬럼 추가 (label/primary_color/accent_color/short_name/is_active/is_internal_host/sort_order) ──

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='label')=0,
  'ALTER TABLE companies ADD COLUMN label VARCHAR(40) NULL COMMENT ''UI 노출 라벨''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='primary_color')=0,
  'ALTER TABLE companies ADD COLUMN primary_color CHAR(7) NULL COMMENT ''브랜드 primary hex''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='accent_color')=0,
  'ALTER TABLE companies ADD COLUMN accent_color CHAR(7) NULL COMMENT ''보조 강조색 hex''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='short_name')=0,
  'ALTER TABLE companies ADD COLUMN short_name VARCHAR(20) NULL COMMENT ''짧은 표기''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='is_active')=0,
  'ALTER TABLE companies ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''활성 여부''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='is_internal_host')=0,
  'ALTER TABLE companies ADD COLUMN is_internal_host TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''운영 위탁 호스트 여부 (FMI=1)''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='sort_order')=0,
  'ALTER TABLE companies ADD COLUMN sort_order INT NOT NULL DEFAULT 100 COMMENT ''정렬 순서''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- is_active 인덱스 (회사 목록 필터 자주 사용)
SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=@db AND table_name='companies' AND index_name='idx_companies_active_sort')=0,
  'ALTER TABLE companies ADD INDEX idx_companies_active_sort (is_active, sort_order)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ── 2. 시드 — FMI / RIDE 메타 기본값 (멱등 UPDATE) ──
-- 라벨/색상 = lib/company-brand.ts 의 COMPANY_BRANDS 미러.
-- 향후 사용자가 UI 에서 편집하면 DB 가 정본.

UPDATE companies
   SET label             = COALESCE(label, '주식회사 에프엠아이'),
       primary_color     = COALESCE(primary_color, '#3b6eb5'),
       accent_color      = COALESCE(accent_color, '#5b8def'),
       short_name        = COALESCE(short_name, 'FMI'),
       is_internal_host  = 1,
       sort_order        = 10
 WHERE company_key = 'FMI';

UPDATE companies
   SET label             = COALESCE(label, '라이드 주식회사'),
       primary_color     = COALESCE(primary_color, '#0C0C30'),
       accent_color      = COALESCE(accent_color, '#0A93FF'),
       short_name        = COALESCE(short_name, 'RIDE'),
       is_internal_host  = 0,
       sort_order        = 20
 WHERE company_key = 'RIDE';

-- ═══════════════════════════════════════════════════════════════
-- 검증 (적용 후 실행 — Rule 23):
--   SELECT company_key, label, short_name, primary_color, accent_color,
--          is_active, is_internal_host, sort_order
--     FROM companies ORDER BY sort_order;
--   -- 기대: FMI(internal=1, sort=10) + RIDE(internal=0, sort=20) 2행
--   SELECT COUNT(*) FROM companies WHERE label IS NULL;  -- 기대: 0
-- ═══════════════════════════════════════════════════════════════
