-- ═══════════════════════════════════════════════════════════════════
-- ride_employees 컨택 명단 — 연락처/이메일 보강 (UPSERT)
-- 2026-05-16 (hr 세션 PR-HR-5b)
--
-- 출처: 컨택_명단.xlsx (15명) + 사용자 추가 2명 (박혜정/유수정) = 17명
-- 사유: bulk-upload 는 신규 INSERT 전용 → 이미 등록된 직원은 중복 skip,
--       연락처/이메일이 반영 안 됨. 본 SQL 이 기존 직원에 보강.
--
-- 방식 (직원별 UPSERT):
--   1) UPDATE — 활성 직원 있으면 phone/email 보강
--   2) INSERT — 활성 직원 없으면 신규 (NOT EXISTS 가드)
--
-- 멱등: UPDATE + NOT EXISTS INSERT → 여러 번 실행 안전 (Rule 24)
-- 호환: MySQL 8.0 (Cloud SQL r-care-db)
-- ═══════════════════════════════════════════════════════════════════

-- ── 전소현 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-3170-3337', email='shjeon@rideoffice.kr', updated_at=NOW()
 WHERE name='전소현' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'전소현','010-3170-3337','shjeon@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='전소현' AND is_active=1);

-- ── 안경희 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-4653-4851', email='khan@rideoffice.kr', updated_at=NOW()
 WHERE name='안경희' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'안경희','010-4653-4851','khan@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='안경희' AND is_active=1);

-- ── 정지은 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-3270-9433', email='jejung@rideoffice.kr', updated_at=NOW()
 WHERE name='정지은' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'정지은','010-3270-9433','jejung@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='정지은' AND is_active=1);

-- ── 서민아 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-6660-1700', email='maseo@rideoffice.kr', updated_at=NOW()
 WHERE name='서민아' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'서민아','010-6660-1700','maseo@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='서민아' AND is_active=1);

-- ── 이혜경 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-8577-7529', email='hklee@rideoffice.kr', updated_at=NOW()
 WHERE name='이혜경' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'이혜경','010-8577-7529','hklee@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='이혜경' AND is_active=1);

-- ── 박지훈 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-6428-5524', email='jhpark@rideoffice.kr', updated_at=NOW()
 WHERE name='박지훈' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'박지훈','010-6428-5524','jhpark@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='박지훈' AND is_active=1);

-- ── 정우진 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-3038-3471', email='wjjung@rideoffice.kr', updated_at=NOW()
 WHERE name='정우진' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'정우진','010-3038-3471','wjjung@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='정우진' AND is_active=1);

-- ── 이경미 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-8616-6780', email='kmlee@rideoffice.kr', updated_at=NOW()
 WHERE name='이경미' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'이경미','010-8616-6780','kmlee@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='이경미' AND is_active=1);

-- ── 김현정 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-6406-1824', email='hjkim@rideoffice.kr', updated_at=NOW()
 WHERE name='김현정' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'김현정','010-6406-1824','hjkim@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='김현정' AND is_active=1);

-- ── 추경희 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-9336-9143', email='khchu@rideoffice.kr', updated_at=NOW()
 WHERE name='추경희' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'추경희','010-9336-9143','khchu@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='추경희' AND is_active=1);

-- ── 윤민진 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-5051-0785', email='mjyoun@rideoffice.kr', updated_at=NOW()
 WHERE name='윤민진' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'윤민진','010-5051-0785','mjyoun@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='윤민진' AND is_active=1);

-- ── 전유하 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-4044-5055', email='yhjeon@rideoffice.kr', updated_at=NOW()
 WHERE name='전유하' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'전유하','010-4044-5055','yhjeon@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='전유하' AND is_active=1);

-- ── 전정연 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-4736-7187', email='jyjeon@rideoffice.kr', updated_at=NOW()
 WHERE name='전정연' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'전정연','010-4736-7187','jyjeon@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='전정연' AND is_active=1);

-- ── 조수현 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-5501-5303', email='shjo@rideoffice.kr', updated_at=NOW()
 WHERE name='조수현' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'조수현','010-5501-5303','shjo@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='조수현' AND is_active=1);

-- ── 정동민 ──────────────────────────────────────────────────────────
UPDATE ride_employees SET phone='010-2387-9484', email='gonziya0502@gmail.com', updated_at=NOW()
 WHERE name='정동민' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'정동민','010-2387-9484','gonziya0502@gmail.com','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='정동민' AND is_active=1);

-- ── 박혜정 (사용자 추가) ────────────────────────────────────────────
UPDATE ride_employees SET phone='010-3003-2427', email='hjpark@rideoffice.kr', updated_at=NOW()
 WHERE name='박혜정' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'박혜정','010-3003-2427','hjpark@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='박혜정' AND is_active=1);

-- ── 유수정 (사용자 추가) ────────────────────────────────────────────
UPDATE ride_employees SET phone='010-7592-7237', email='sjyoo@rideoffice.kr', updated_at=NOW()
 WHERE name='유수정' AND is_active=1;
INSERT INTO ride_employees (id, name, phone, email, color_tone, is_active, created_at, updated_at)
SELECT UUID(),'유수정','010-7592-7237','sjyoo@rideoffice.kr','none',1,NOW(),NOW() FROM dual
 WHERE NOT EXISTS (SELECT 1 FROM ride_employees WHERE name='유수정' AND is_active=1);

-- ═══════════════════════════════════════════════════════════════════
-- 검증 SQL (적용 후 직접 실행)
-- ═══════════════════════════════════════════════════════════════════
-- 검증 1: 17명 연락처/이메일 채워졌는지 (17행, phone/email 모두 NOT NULL)
-- SELECT name, phone, email FROM ride_employees
--  WHERE is_active=1 AND name IN
--   ('전소현','안경희','정지은','서민아','이혜경','박지훈','정우진','이경미',
--    '김현정','추경희','윤민진','전유하','전정연','조수현','정동민','박혜정','유수정')
--  ORDER BY name;
--
-- 검증 2: 활성 직원 중 같은 이름 2개 이상 (중복 — 있으면 dedupe 필요)
-- SELECT name, COUNT(*) cnt FROM ride_employees WHERE is_active=1
--  GROUP BY name HAVING COUNT(*) > 1;
