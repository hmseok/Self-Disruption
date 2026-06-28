-- PR-V2 (2026-06-28) — 배차 정제 import: 둘 곳 없던 필드용 컬럼 추가 (추가만, 손실 0)
-- dispatch_seq = 차량별 순번 (엑셀 "(N)" 접두), self_vehicle_yn = 자차여부 ("/우리")
-- MySQL 8.x (fmi_op) — plain ALTER (신규 컬럼, 1회 실행)

ALTER TABLE fmi_rentals
  ADD COLUMN dispatch_seq     INT NULL          COMMENT '차량별 순번(엑셀 (N) 접두)',
  ADD COLUMN self_vehicle_yn  TINYINT(1) DEFAULT 0 COMMENT '자차여부(엑셀 사고차량번호 /우리)';

-- 검증: SHOW COLUMNS FROM fmi_rentals LIKE 'dispatch_seq';
