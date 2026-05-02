-- ═══════════════════════════════════════════════════════════════════
-- classification_rules — 거래 자동 분류 룰
-- 2026-05-02
--
-- 목적:
--   거래 description 패턴 → 카테고리 자동 매핑 룰 저장.
--   시스템 시드 50개 + 사용자가 분류 검수 중 「룰로 저장」 으로 추가.
--
-- 흐름:
--   거래 description ↔ rules.pattern (LIKE) → 매칭 시 자동 분류
--   confidence 가 HIGH 면 일괄 확정 후보, MEDIUM 은 검수, LOW 는 의심
--
-- 운영:
--   사용자가 직접 추가/수정/삭제 가능 (is_system=0 인 행만 삭제)
--   시드 룰 (is_system=1) 은 보호됨 (수정만 가능, 삭제 X)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS classification_rules (
  id            CHAR(36)     NOT NULL,
  pattern       VARCHAR(255) NOT NULL    COMMENT 'description LIKE 패턴 (예: GS칼텍스, 주유)',
  category      VARCHAR(64)  NOT NULL    COMMENT '대분류 (차량비/운영비/식대/...)',
  subcategory   VARCHAR(64)  NULL        COMMENT '소분류 (유류비/통행료/...)',
  match_car     TINYINT(1)   DEFAULT 0   COMMENT '1=카드 holder의 assigned_car_id 자동 매칭',
  confidence    VARCHAR(8)   DEFAULT 'medium' COMMENT 'high/medium/low',
  amount_max    DECIMAL(15,0) NULL       COMMENT '금액 상한 (예: 개인사용 추정 5만원 미만)',
  amount_min    DECIMAL(15,0) NULL       COMMENT '금액 하한',
  tx_type       VARCHAR(16)  NULL        COMMENT 'income/expense/null=양쪽',
  is_system     TINYINT(1)   DEFAULT 0   COMMENT '1=시드 룰 (삭제 보호)',
  is_active     TINYINT(1)   DEFAULT 1,
  notes         TEXT         NULL,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cr_pattern (pattern),
  KEY idx_cr_category (category),
  KEY idx_cr_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════
-- 시드 — 50개 룰 (한국 ERP 회계/사업 운영 기준)
-- ═══════════════════════════════════════════════════════════════════

-- 🚗 차량비
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, tx_type, is_system) VALUES
(UUID(), 'GS칼텍스',       '차량비', '유류비',     1, 'high',   'expense', 1),
(UUID(), 'SK에너지',       '차량비', '유류비',     1, 'high',   'expense', 1),
(UUID(), 'S-OIL',          '차량비', '유류비',     1, 'high',   'expense', 1),
(UUID(), '현대오일',       '차량비', '유류비',     1, 'high',   'expense', 1),
(UUID(), '알뜰주유',       '차량비', '유류비',     1, 'high',   'expense', 1),
(UUID(), '주유',            '차량비', '유류비',     1, 'high',   'expense', 1),
(UUID(), '셀프',            '차량비', '유류비',     1, 'medium', 'expense', 1),
(UUID(), '한국도로공사',   '차량비', '통행료',     1, 'high',   'expense', 1),
(UUID(), '하이패스',       '차량비', '통행료',     1, 'high',   'expense', 1),
(UUID(), '도로공사',       '차량비', '통행료',     1, 'high',   'expense', 1),
(UUID(), '톨게이트',       '차량비', '통행료',     1, 'high',   'expense', 1),
(UUID(), '카센터',         '차량비', '정비/수리', 1, 'high',   'expense', 1),
(UUID(), '자동차서비스',  '차량비', '정비/수리', 1, 'high',   'expense', 1),
(UUID(), '정비',            '차량비', '정비/수리', 1, 'high',   'expense', 1),
(UUID(), '엔진오일',       '차량비', '정비/수리', 1, 'high',   'expense', 1),
(UUID(), '오일교환',       '차량비', '정비/수리', 1, 'high',   'expense', 1),
(UUID(), '타이어',         '차량비', '타이어',     1, 'high',   'expense', 1),
(UUID(), '휠얼라인먼트',  '차량비', '타이어',     1, 'high',   'expense', 1),
(UUID(), '세차',            '차량비', '세차',       1, 'high',   'expense', 1),
(UUID(), '디테일링',       '차량비', '세차',       1, 'high',   'expense', 1),
(UUID(), '주차장',         '차량비', '주차료',     1, 'high',   'expense', 1),
(UUID(), '파킹',            '차량비', '주차료',     1, 'high',   'expense', 1),
(UUID(), '공영주차',       '차량비', '주차료',     1, 'high',   'expense', 1),
(UUID(), 'DB손해',          '차량비', '차량보험', 0, 'medium', 'expense', 1),
(UUID(), '삼성화재',       '차량비', '차량보험', 0, 'medium', 'expense', 1),
(UUID(), '현대해상',       '차량비', '차량보험', 0, 'medium', 'expense', 1),
(UUID(), 'KB손해',          '차량비', '차량보험', 0, 'medium', 'expense', 1),
(UUID(), '메리츠',         '차량비', '차량보험', 0, 'medium', 'expense', 1),
(UUID(), '자동차검사',     '차량비', '검사',       1, 'high',   'expense', 1),
(UUID(), '교통안전공단',  '차량비', '검사',       1, 'high',   'expense', 1),
(UUID(), '자동차세',       '차량비', '차량세금', 1, 'high',   'expense', 1),
(UUID(), '캐피탈',         '차량비', '차량할부', 1, 'high',   'expense', 1),
(UUID(), '할부금',         '차량비', '차량할부', 1, 'high',   'expense', 1);

-- 🏢 운영비
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, tx_type, is_system) VALUES
(UUID(), 'KT',               '운영비', '통신비',     0, 'high',   'expense', 1),
(UUID(), 'SK텔레콤',         '운영비', '통신비',     0, 'high',   'expense', 1),
(UUID(), 'LG U+',            '운영비', '통신비',     0, 'high',   'expense', 1),
(UUID(), 'U+모바일',         '운영비', '통신비',     0, 'high',   'expense', 1),
(UUID(), '알뜰모바일',       '운영비', '통신비',     0, 'high',   'expense', 1),
(UUID(), '한국전력',         '운영비', '전기료',     0, 'high',   'expense', 1),
(UUID(), '한전',              '운영비', '전기료',     0, 'high',   'expense', 1),
(UUID(), '도시가스',         '운영비', '가스료',     0, 'high',   'expense', 1),
(UUID(), '상수도',            '운영비', '수도료',     0, 'high',   'expense', 1),
(UUID(), '월세',              '운영비', '임대료',     0, 'high',   'expense', 1),
(UUID(), '임대료',            '운영비', '임대료',     0, 'high',   'expense', 1),
(UUID(), '다이소',            '운영비', '사무용품', 0, 'medium', 'expense', 1),
(UUID(), '문구',               '운영비', '사무용품', 0, 'medium', 'expense', 1),
(UUID(), '오피스디포',       '운영비', '사무용품', 0, 'medium', 'expense', 1),
(UUID(), '구글',               '운영비', 'SW/구독료', 0, 'high',   'expense', 1),
(UUID(), 'AWS',                '운영비', 'SW/구독료', 0, 'high',   'expense', 1),
(UUID(), 'Google',             '운영비', 'SW/구독료', 0, 'high',   'expense', 1),
(UUID(), 'Microsoft',          '운영비', 'SW/구독료', 0, 'high',   'expense', 1),
(UUID(), 'Adobe',              '운영비', 'SW/구독료', 0, 'high',   'expense', 1),
(UUID(), 'CU',                  '운영비', '편의점',     0, 'low',    'expense', 1),
(UUID(), 'GS25',                '운영비', '편의점',     0, 'low',    'expense', 1),
(UUID(), '세븐일레븐',        '운영비', '편의점',     0, 'low',    'expense', 1),
(UUID(), '우체국',            '운영비', '우편/택배', 0, 'high',   'expense', 1),
(UUID(), 'CJ대한통운',        '운영비', '우편/택배', 0, 'high',   'expense', 1),
(UUID(), '한진택배',          '운영비', '우편/택배', 0, 'high',   'expense', 1),
(UUID(), '인쇄',                '운영비', '인쇄/복사', 0, 'high',   'expense', 1);

-- 🍽 식대
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, amount_max, tx_type, is_system) VALUES
(UUID(), '스타벅스',          '식대', '카페',         0, 'low', 30000, 'expense', 1),
(UUID(), '투썸',                '식대', '카페',         0, 'low', 30000, 'expense', 1),
(UUID(), '이디야',              '식대', '카페',         0, 'low', 30000, 'expense', 1),
(UUID(), '메가커피',          '식대', '카페',         0, 'low', 30000, 'expense', 1),
(UUID(), '컴포즈',              '식대', '카페',         0, 'low', 30000, 'expense', 1),
(UUID(), '빽다방',              '식대', '카페',         0, 'low', 30000, 'expense', 1),
(UUID(), '배달의민족',        '식대', '배달',         0, 'low', 50000, 'expense', 1),
(UUID(), '요기요',              '식대', '배달',         0, 'low', 50000, 'expense', 1),
(UUID(), '쿠팡이츠',          '식대', '배달',         0, 'low', 50000, 'expense', 1);

-- 💰 금융 / 세금
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, tx_type, is_system) VALUES
(UUID(), '카드대금결제',     '금융비', '카드결제',  0, 'high',   'expense', 1),
(UUID(), '신용카드결제',     '금융비', '카드결제',  0, 'high',   'expense', 1),
(UUID(), '이자',                '금융비', '이자',         0, 'high',   'expense', 1),
(UUID(), '수수료',              '금융비', '수수료',     0, 'high',   'expense', 1),
(UUID(), '부가가치세',        '세금',   '세금납부',  0, 'high',   'expense', 1),
(UUID(), '부가세',              '세금',   '세금납부',  0, 'high',   'expense', 1),
(UUID(), '법인세',              '세금',   '세금납부',  0, 'high',   'expense', 1),
(UUID(), '4대보험',             '인건비', '4대보험',  0, 'high',   'expense', 1),
(UUID(), '국민연금',           '인건비', '4대보험',  0, 'high',   'expense', 1),
(UUID(), '건강보험',           '인건비', '4대보험',  0, 'high',   'expense', 1);

-- 💼 매출 (입금)
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, tx_type, is_system) VALUES
(UUID(), '렌트',                '매출',   '렌트수입',  0, 'high',   'income',  1),
(UUID(), '보험금',              '매출',   '보험금수령', 0, 'medium', 'income',  1),
(UUID(), '손해사정',           '매출',   '보험금수령', 0, 'medium', 'income',  1),
(UUID(), '환급',                '매출',   '환급금',     0, 'low',    'income',  1);

-- 👥 인건비
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, tx_type, is_system) VALUES
(UUID(), '급여',                '인건비', '급여',         0, 'high',   'expense', 1),
(UUID(), '월급',                '인건비', '급여',         0, 'high',   'expense', 1),
(UUID(), '퇴직금',              '인건비', '퇴직금',     0, 'high',   'expense', 1),
(UUID(), '경조사',              '인건비', '복리후생',  0, 'high',   'expense', 1),
(UUID(), '명절',                '인건비', '복리후생',  0, 'medium', 'expense', 1);

-- 🤝 투자 / 정산
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, tx_type, is_system) VALUES
(UUID(), '투자금',              '투자',   '투자금수령', 0, 'medium', 'income',  1),
(UUID(), '출자금',              '투자',   '투자금수령', 0, 'medium', 'income',  1),
(UUID(), '투자수익',           '투자',   '투자수익지급', 0, 'medium', 'expense', 1),
(UUID(), '배당',                '투자',   '투자수익지급', 0, 'medium', 'expense', 1),
(UUID(), '지입',                '정산',   '지입정산',  0, 'medium', NULL,      1),
(UUID(), '지입료',              '정산',   '지입료지급', 0, 'medium', 'expense', 1),
(UUID(), '위탁',                '정산',   '위탁정산',  0, 'medium', NULL,      1),
(UUID(), '자가렌탈',           '차량비', '외부렌탈',  0, 'medium', 'expense', 1),
(UUID(), '외부렌탈',           '차량비', '외부렌탈',  0, 'medium', 'expense', 1);

-- 🚨 사고 / 보상
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, tx_type, is_system) VALUES
(UUID(), '견인',                '사고비용', '견인비',  0, 'high',   'expense', 1),
(UUID(), '사고처리',           '사고비용', '사고수리', 0, 'high',   'expense', 1),
(UUID(), '사고수리',           '사고비용', '사고수리', 0, 'high',   'expense', 1);

-- 📋 기타
INSERT IGNORE INTO classification_rules (id, pattern, category, subcategory, match_car, confidence, tx_type, is_system) VALUES
(UUID(), '광고',                '운영비', '광고/마케팅', 0, 'high',   'expense', 1),
(UUID(), '마케팅',              '운영비', '광고/마케팅', 0, 'high',   'expense', 1),
(UUID(), '네이버광고',         '운영비', '광고/마케팅', 0, 'high',   'expense', 1),
(UUID(), '카카오광고',         '운영비', '광고/마케팅', 0, 'high',   'expense', 1),
(UUID(), '운전면허',           '운영비', '자격/면허', 0, 'high',   'expense', 1),
(UUID(), '도로교통공단',     '운영비', '자격/면허', 0, 'high',   'expense', 1),
(UUID(), '자격증',              '운영비', '자격/면허', 0, 'medium', 'expense', 1);

-- ═══════════════════════════════════════════════════════════════════
-- 검증
-- ═══════════════════════════════════════════════════════════════════
SELECT
  CONCAT('✅ classification_rules 테이블 + 시드 ', COUNT(*), '건 적용 완료') AS msg
FROM classification_rules WHERE is_system = 1;
