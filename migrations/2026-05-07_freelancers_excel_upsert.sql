-- ============================================================
-- freelancers 일괄 UPSERT (PR-B12, 2026-05-07)
-- 사용자 엑셀 파일 dedup → 12명
-- 멱등 — 같은 이름 있으면 UPDATE, 없으면 INSERT
-- ============================================================

-- 강민우
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '강민우', '010-1234-0565', '1234@gmail.com', '국민은행', '373701-04-082598', '강민우', '951017-1042514', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '강민우');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('국민은행', ''), bank_name),
  account_number = COALESCE(NULLIF('373701-04-082598', ''), account_number),
  account_holder = COALESCE(NULLIF('강민우', ''), account_holder),
  reg_number = COALESCE(NULLIF('951017-1042514', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '강민우';

-- 김준수
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '김준수', '010-1234-0565', '1234@gmail.com', '우리은행', '1002-641-535739', '김준수', '830908-1466313', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '김준수');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('우리은행', ''), bank_name),
  account_number = COALESCE(NULLIF('1002-641-535739', ''), account_number),
  account_holder = COALESCE(NULLIF('김준수', ''), account_holder),
  reg_number = COALESCE(NULLIF('830908-1466313', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '김준수';

-- 박진숙
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '박진숙', '010-1234-0565', '1234@gmail.com', '기업은행', '3522259731913', '박진숙', '620210-2228511', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '박진숙');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('기업은행', ''), bank_name),
  account_number = COALESCE(NULLIF('3522259731913', ''), account_number),
  account_holder = COALESCE(NULLIF('박진숙', ''), account_holder),
  reg_number = COALESCE(NULLIF('620210-2228511', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '박진숙';

-- 석호민
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '석호민', '010-1234-0565', '1234@gmail.com', '국민은행', '290210138593', '석호민', '831019-1162411', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '석호민');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('국민은행', ''), bank_name),
  account_number = COALESCE(NULLIF('290210138593', ''), account_number),
  account_holder = COALESCE(NULLIF('석호민', ''), account_holder),
  reg_number = COALESCE(NULLIF('831019-1162411', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '석호민';

-- 성명호
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '성명호', '010-1234-0565', '1234@gmail.com', '국민은행', '45001301302010', '성명호', '630718-1669511', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '성명호');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('국민은행', ''), bank_name),
  account_number = COALESCE(NULLIF('45001301302010', ''), account_number),
  account_holder = COALESCE(NULLIF('성명호', ''), account_holder),
  reg_number = COALESCE(NULLIF('630718-1669511', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '성명호';

-- 안경희
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '안경희', '010-1234-0565', '1234@gmail.com', '국민', '5391-020121-3921', '안경희', '801229-2168613', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '안경희');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('국민', ''), bank_name),
  account_number = COALESCE(NULLIF('5391-020121-3921', ''), account_number),
  account_holder = COALESCE(NULLIF('안경희', ''), account_holder),
  reg_number = COALESCE(NULLIF('801229-2168613', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '안경희';

-- 윤민진
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '윤민진', '010-1234-0565', '1234@gmail.com', '기업', '4270-843920-1010', '윤민진', '870629-2409816', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '윤민진');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('기업', ''), bank_name),
  account_number = COALESCE(NULLIF('4270-843920-1010', ''), account_number),
  account_holder = COALESCE(NULLIF('윤민진', ''), account_holder),
  reg_number = COALESCE(NULLIF('870629-2409816', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '윤민진';

-- 임미자
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '임미자', '010-1234-0565', '1234@gmail.com', '농협', '127-02-244107', '임미자', '590624-2162917', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '임미자');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('농협', ''), bank_name),
  account_number = COALESCE(NULLIF('127-02-244107', ''), account_number),
  account_holder = COALESCE(NULLIF('임미자', ''), account_holder),
  reg_number = COALESCE(NULLIF('590624-2162917', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '임미자';

-- 임성민
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '임성민', '010-1234-0565', '1234@gmail.com', '국민은행', '87700101354046', '임성민', '800630-1058826', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '임성민');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('국민은행', ''), bank_name),
  account_number = COALESCE(NULLIF('87700101354046', ''), account_number),
  account_holder = COALESCE(NULLIF('임성민', ''), account_holder),
  reg_number = COALESCE(NULLIF('800630-1058826', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '임성민';

-- 전상호
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '전상호', '010-1234-0565', '1234@gmail.com', '카카오뱅크', '3333-28-5570892', '전상호', '881208-1520014', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '전상호');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('카카오뱅크', ''), bank_name),
  account_number = COALESCE(NULLIF('3333-28-5570892', ''), account_number),
  account_holder = COALESCE(NULLIF('전상호', ''), account_holder),
  reg_number = COALESCE(NULLIF('881208-1520014', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '전상호';

-- 전유하
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '전유하', '010-1234-0565', '1234@gmail.com', '케이뱅크', '1002-3111-5596', '전유하', '890101-2194321', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '전유하');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('케이뱅크', ''), bank_name),
  account_number = COALESCE(NULLIF('1002-3111-5596', ''), account_number),
  account_holder = COALESCE(NULLIF('전유하', ''), account_holder),
  reg_number = COALESCE(NULLIF('890101-2194321', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '전유하';

-- 정태영
INSERT INTO freelancers (id, name, phone, email, bank_name, account_number, account_holder, reg_number, tax_type, service_type, is_active, memo, created_at, updated_at)
  SELECT UUID(), '정태영', '010-1234-0565', '1234@gmail.com', '국민은행', '3522259731913', '정태영', '850812-1249413', '사업소득(3.3%)', '기타', 1, '엑셀 일괄 업로드 2026-05-07', NOW(), NOW()
  FROM dual WHERE NOT EXISTS (SELECT 1 FROM freelancers WHERE name = '정태영');

UPDATE freelancers SET
  phone = COALESCE(NULLIF('010-1234-0565', ''), phone),
  email = COALESCE(NULLIF('1234@gmail.com', ''), email),
  bank_name = COALESCE(NULLIF('국민은행', ''), bank_name),
  account_number = COALESCE(NULLIF('3522259731913', ''), account_number),
  account_holder = COALESCE(NULLIF('정태영', ''), account_holder),
  reg_number = COALESCE(NULLIF('850812-1249413', ''), reg_number),
  tax_type = COALESCE(NULLIF('사업소득(3.3%)', ''), tax_type),
  is_active = 1,
  updated_at = NOW()
  WHERE name = '정태영';

-- 검증
SELECT COUNT(*) AS 활성_프리랜서 FROM freelancers WHERE is_active = 1;
SELECT name, bank_name, account_number, reg_number FROM freelancers WHERE is_active = 1 ORDER BY name;
