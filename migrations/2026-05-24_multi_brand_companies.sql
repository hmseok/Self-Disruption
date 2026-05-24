-- ═══════════════════════════════════════════════════════════════
-- PR-MULTI-BRAND P1 — companies 멀티회사 + profiles.company_id
-- 설계서: _docs/MULTI-BRAND-DESIGN.md
-- ═══════════════════════════════════════════════════════════════
-- 멱등 (Rule 23/24) — 여러 번 실행해도 안전.
-- 적용: mysql -h 34.47.105.219 -u <user> -p fmi_op < 이 파일
--   ※ 'key' 는 MySQL 예약어 → 컬럼명 company_key 사용.
-- ═══════════════════════════════════════════════════════════════

SET @db := DATABASE();

-- ── 1. companies 컬럼 추가 (company_key / subdomain / logo_url / theme_json) ──
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='company_key')=0,
  'ALTER TABLE companies ADD COLUMN company_key VARCHAR(20) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='subdomain')=0,
  'ALTER TABLE companies ADD COLUMN subdomain VARCHAR(40) NOT NULL DEFAULT ''''', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='logo_url')=0,
  'ALTER TABLE companies ADD COLUMN logo_url VARCHAR(255) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='companies' AND column_name='theme_json')=0,
  'ALTER TABLE companies ADD COLUMN theme_json JSON NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- company_key UNIQUE 인덱스 (멱등)
SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=@db AND table_name='companies' AND index_name='uq_companies_key')=0,
  'ALTER TABLE companies ADD UNIQUE KEY uq_companies_key (company_key)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ── 2. profiles.company_id 컬럼 추가 ──
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=@db AND table_name='profiles' AND column_name='company_id')=0,
  'ALTER TABLE profiles ADD COLUMN company_id CHAR(36) NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=@db AND table_name='profiles' AND index_name='idx_profiles_company_id')=0,
  'ALTER TABLE profiles ADD INDEX idx_profiles_company_id (company_id)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ── 3. 시드 — FMI / RIDE 회사 2행 보장 (멱등) ──
-- 3a. 기존 무(無)key 회사 행 → FMI 로 표시
UPDATE companies SET company_key='FMI', subdomain=''
  WHERE company_key IS NULL OR company_key='';

-- 3b. FMI 행 없으면 생성
INSERT INTO companies (id, name, company_key, subdomain, created_at, updated_at)
SELECT UUID(), '주식회사 에프엠아이', 'FMI', '', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE company_key='FMI');

-- 3c. RIDE 행 없으면 생성
--   ※ 공식 표기 '라이드 주식회사' (띄어쓰기) — 라이드_표기규칙.xlsx 회사명 시트.
INSERT INTO companies (id, name, company_key, subdomain, created_at, updated_at)
SELECT UUID(), '라이드 주식회사', 'RIDE', 'ride', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE company_key='RIDE');

-- 3d. 회사명 공식 표기 보정 (멱등) — 기존 적용분 '라이드주식회사' → '라이드 주식회사'
UPDATE companies SET name='라이드 주식회사'
  WHERE company_key='RIDE' AND name<>'라이드 주식회사';

-- ── 4. profiles.company_id 백필 (org-brand 로직 — 부서/이메일) ──
-- 4a. 라이드 소속 (부서 '라이드'·'CX팀' 또는 rideoffice 도메인) → RIDE
UPDATE profiles p
  JOIN companies c ON c.company_key='RIDE'
SET p.company_id = c.id
WHERE p.company_id IS NULL
  AND ( p.department LIKE '%라이드%'
     OR p.department LIKE '%CX팀%'
     OR p.email LIKE '%@rideoffice.kr'
     OR p.email LIKE '%@rideoffice.com'
     OR p.email LIKE '%@ride.co.kr' );

-- 4b. 나머지 전부 → FMI
UPDATE profiles p
  JOIN companies c ON c.company_key='FMI'
SET p.company_id = c.id
WHERE p.company_id IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 검증 (적용 후 실행 — Rule 23):
--   SELECT company_key, name, subdomain FROM companies;
--     기대: FMI(subdomain='') + RIDE(subdomain='ride') 2행
--   SELECT c.company_key, COUNT(*) cnt FROM profiles p
--     JOIN companies c ON p.company_id=c.id GROUP BY c.company_key;
--   SELECT COUNT(*) FROM profiles WHERE company_id IS NULL;  -- 기대: 0
-- ═══════════════════════════════════════════════════════════════
