-- 성능 인덱스 (2026-08-02): 입금 탭 배차건 뷰의 건별 입금누계 서브쿼리가
-- related_type/related_id 풀스캔 (148k rows × 500건 = 41초) → 인덱스로 해소
CREATE INDEX idx_tx_related ON transactions (related_type, related_id);
