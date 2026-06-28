-- PR-V1 (2026-06-28) — fmi_rentals 부가세 + 영업지원(따봉) 건별 관리
-- 사용자 명령: 배차 건별 부가세(공급가 10%, 계산서발행/청구/지급 상태) + 영업지원(따봉) 옵션
-- 부가세 미청구(법인 등) = vat_billed_yn 미체크로 표현 (상대차량 법인 별도 플래그 불필요)
-- MySQL 8.x (fmi_op) — ADD COLUMN IF NOT EXISTS 미지원이므로 plain ALTER (신규 컬럼, 1회 실행)
--
-- ※ 2026-06-28 운영 DB(fmi_op)에 이미 수동 적용 완료. 본 파일은 기록/재현용.

ALTER TABLE fmi_rentals
  ADD COLUMN vat_amount            DECIMAL(12,0) NULL   COMMENT '부가세 금액(자동: 공급가10% / 포함÷1.1)',
  ADD COLUMN vat_incl_yn           TINYINT(1) DEFAULT 0 COMMENT '청구액 부가세포함(1=포함÷1.1, 0=별도+10%)',
  ADD COLUMN vat_invoice_issued_yn TINYINT(1) DEFAULT 0 COMMENT '세금계산서 발행',
  ADD COLUMN vat_invoice_date      DATE NULL            COMMENT '계산서 발행일',
  ADD COLUMN vat_billed_yn         TINYINT(1) DEFAULT 0 COMMENT '부가세 청구(미체크=미회수/법인 등)',
  ADD COLUMN vat_paid_yn           TINYINT(1) DEFAULT 0 COMMENT '부가세 지급(입금)',
  ADD COLUMN vat_paid_date         DATE NULL            COMMENT '부가세 입금일',
  ADD COLUMN sales_support_yn      TINYINT(1) DEFAULT 0 COMMENT '영업지원(따봉)',
  ADD COLUMN sales_order           VARCHAR(50) NULL     COMMENT '영업 오더',
  ADD COLUMN sales_deposit_date    DATE NULL            COMMENT '영업 입금일',
  ADD COLUMN sales_deposit_amount  DECIMAL(12,0) NULL   COMMENT '영업 입금액',
  ADD COLUMN sales_payout_rate     DECIMAL(5,2) NULL    COMMENT '영업 지급율(%)';

-- 검증: SELECT COUNT(*) FROM information_schema.columns
--        WHERE table_name='fmi_rentals' AND column_name LIKE 'vat_%'; -- 기대치 6
