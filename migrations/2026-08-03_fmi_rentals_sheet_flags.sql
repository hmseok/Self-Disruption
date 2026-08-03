-- 수금 탭 1단계 (2026-08-03 사용자 승인): 시트 빌려타 탭의 청구완료(17열)/입금여부(18열)
-- 플래그를 배차건에 보관 — 금액 없는 단계의 「청구완료·입금대기」 판정 재료
ALTER TABLE fmi_rentals
  ADD COLUMN sheet_billed VARCHAR(64) NULL COMMENT '시트 청구완료 플래그 (완료/공란 등 원문)',
  ADD COLUMN sheet_paid   VARCHAR(64) NULL COMMENT '시트 입금여부 플래그 (날짜 등 원문)';
