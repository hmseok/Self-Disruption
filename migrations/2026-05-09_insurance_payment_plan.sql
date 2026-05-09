-- ════════════════════════════════════════════════════════════════
-- insurance_payment_plan — 차량별 보험금 분납계획서 (PR-UX9)
-- 2026-05-09
-- ════════════════════════════════════════════════════════════════
--
-- 사용자 제안:
--   「차량별 보험금 분납계획서가 있는데 그 서류를 넣어 보험 파트쪽에
--    셋팅하면 그것도 해당 분담금 나갈 때 매칭이 될 것 같습니다」
--
-- 운영:
--   1. 사용자가 차량별로 보험사 + 기간 + 월 분담금 입력
--   2. 보험사로 통장 출금 발생 시 매처가:
--      - 출금일 기준 활성 분납계획 차량 모두 조회
--      - 보험사 키워드 일치 차량만 필터
--      - 차량별 monthly_premium 비율로 transaction_assignments 다중 INSERT
--   3. 정산 시 차량별 보험료 비용 정확

CREATE TABLE IF NOT EXISTS insurance_payment_plan (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  vehicle_id        CHAR(36)     NOT NULL,
  insurance_company VARCHAR(64)  NOT NULL,            -- 'DB', '메리츠', '한화' 등
  policy_no         VARCHAR(64)  NULL,                -- 증권번호
  period_start      DATE         NOT NULL,            -- 보험기간 시작
  period_end        DATE         NOT NULL,            -- 보험기간 종료
  monthly_premium   DECIMAL(15, 0) NOT NULL,          -- 월 분담금 (이 차량)
  total_premium     DECIMAL(15, 0) NOT NULL,          -- 총 보험료 (이 차량)
  installment_count INT          NOT NULL DEFAULT 12, -- 분납 횟수 (12 / 6 / 1 일시납)
  payment_day       TINYINT      NULL,                -- 매월 출금일 (1~31)
  status            VARCHAR(16)  NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'cancelled'
  note              TEXT         NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ipp_vehicle (vehicle_id),
  INDEX idx_ipp_period (period_start, period_end),
  INDEX idx_ipp_company (insurance_company),
  INDEX idx_ipp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 검증 SQL (주석)
-- SELECT * FROM insurance_payment_plan WHERE status = 'active' LIMIT 10;
-- SELECT insurance_company, COUNT(*), SUM(monthly_premium) FROM insurance_payment_plan
--   WHERE status='active' GROUP BY insurance_company;
