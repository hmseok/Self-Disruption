-- V9 (2026-07-05) — fmi_rentals.expected_payer 추가
-- PR-PAY-PAYER (사용자 명시): 「입금자명도 미리 입력해둘 거니 거의 자동매칭만 진행하면 될 것」
--   상담·배차 단계에 예상 입금자명을 미리 기록 → 매처가 정확 일치로 자동 연결 (4번째 축).
-- 멱등: @col_exists + PREPARE 패턴 (Cloud SQL 스튜디오/DBeaver 모두 실행 가능).

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fmi_rentals' AND COLUMN_NAME = 'expected_payer');
SET @sql = IF(@c = 0, 'ALTER TABLE fmi_rentals ADD COLUMN expected_payer VARCHAR(64) NULL COMMENT ''예상 입금자명 — 자동매칭 축''', 'SELECT ''expected_payer exists'' AS info');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 검증: 아래가 1 이면 적용 완료
SELECT COUNT(*) AS v9_applied FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fmi_rentals' AND COLUMN_NAME = 'expected_payer';
