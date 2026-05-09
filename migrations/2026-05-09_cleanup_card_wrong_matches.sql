-- ════════════════════════════════════════════════════════════════
-- 카드 거래에 잘못 매칭된 invest/jiip/freelancer/fmi_rental 정리 (PR-UX8)
-- 2026-05-09
-- ════════════════════════════════════════════════════════════════
--
-- 사용자 보고: 「15,000원 카드 사용인데 이걸 투자로 보는데 수입으로 체크」
-- 원인: 매처가 출처 무시하고 이름만 매칭 → 카드 사용을 투자/지입 으로 잘못 매칭
--
-- 정리:
--   1. transaction_assignments — 잘못된 자동 매칭 → status='rejected'
--   2. transactions.related_type / related_id → NULL (재매칭 가능)
--
-- 향후 PR-UX8 매처는 카드 거래 자체를 후보에서 제외 → 재발 X.

-- 검증 SQL (실행 전 확인 — 영향 받을 row 수)
SELECT
  '⚠ transaction_assignments 정리 대상' AS desc_,
  COUNT(*) AS cnt
  FROM transaction_assignments ta
  JOIN transactions t ON t.id = ta.transaction_id
 WHERE ta.assignment_type IN ('invest', 'jiip', 'freelancer', 'fmi_rental')
   AND (t.imported_from = 'sms' OR t.imported_from LIKE 'excel_card%' OR t.imported_from LIKE 'pdf_card%')
   AND ta.source = 'auto'
   AND ta.status IN ('pending', 'confirmed');

-- (1) transaction_assignments — 잘못된 매칭 → 'rejected' (이력 보존)
UPDATE transaction_assignments ta
JOIN transactions t ON t.id = ta.transaction_id
   SET ta.status = 'rejected',
       ta.note = COALESCE(ta.note, '') ||
                 ' [PR-UX8 자동 거부 — 카드 거래에 invest/jiip/freelancer/fmi_rental 잘못 매칭]',
       ta.updated_at = NOW()
 WHERE ta.assignment_type IN ('invest', 'jiip', 'freelancer', 'fmi_rental')
   AND (t.imported_from = 'sms' OR t.imported_from LIKE 'excel_card%' OR t.imported_from LIKE 'pdf_card%')
   AND ta.source = 'auto'
   AND ta.status IN ('pending', 'confirmed');

-- (2) transactions — related_type/id NULL 처리 (재매칭 가능)
UPDATE transactions t
   SET t.related_type = NULL,
       t.related_id = NULL,
       t.updated_at = NOW()
 WHERE t.related_type IN ('invest', 'jiip', 'freelancer', 'fmi_rental')
   AND (t.imported_from = 'sms' OR t.imported_from LIKE 'excel_card%' OR t.imported_from LIKE 'pdf_card%');

-- 검증 (정리 후)
SELECT
  '✅ 정리 후 — 카드 거래에 invest/jiip/freelancer/fmi_rental 매칭' AS desc_,
  COUNT(*) AS cnt
  FROM transaction_assignments ta
  JOIN transactions t ON t.id = ta.transaction_id
 WHERE ta.assignment_type IN ('invest', 'jiip', 'freelancer', 'fmi_rental')
   AND (t.imported_from = 'sms' OR t.imported_from LIKE 'excel_card%' OR t.imported_from LIKE 'pdf_card%')
   AND ta.source = 'auto'
   AND ta.status NOT IN ('rejected'); -- 0 이어야 정상

-- 추가 통계: 거부 처리된 assignment 합계
SELECT
  ta.assignment_type,
  COUNT(*) AS cnt,
  COALESCE(SUM(ABS(t.amount)), 0) AS total_amount
  FROM transaction_assignments ta
  JOIN transactions t ON t.id = ta.transaction_id
 WHERE ta.note LIKE '%PR-UX8%'
 GROUP BY ta.assignment_type;
