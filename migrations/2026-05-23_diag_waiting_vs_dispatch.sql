-- ════════════════════════════════════════════════════════════════════
-- 2026-05-23 — 대기차량(cars.status) ↔ 실제 배차(fmi_rentals) 정합성 진단
-- 2026-05-23 (trusting-relaxed-keller / operations 세션)
--
-- 사용자 보고: 「엑셀 시트를 보면 대기 차량이랑 배차중 차량들이 안 맞는데」
--
-- 원인: 두 개의 별도 상태 컬럼이 동기화 안 됨.
--   · 대기차량 탭   → cars.status      (available / rented / returned)
--   · 대차업무 리스트 → fmi_rentals.status (pending / dispatched / ...)
--   빌려타 535건 import 가 fmi_rentals 만 채우고 cars.status 는 안 건드림.
--
-- ⚠ 본 파일은 전부 SELECT — 읽기 전용. DBeaver 에서 안전하게 실행 가능.
--   STEP 0~2 결과를 보고 어느 쪽을 정본으로 맞출지 결정한다.
-- ════════════════════════════════════════════════════════════════════

-- ── STEP 0 — 헤드라인 요약 (cars.status 분포 vs 실제 진행중 배차) ──
SELECT
  SUM(c.status = 'available') AS cars_사용가능,
  SUM(c.status = 'rented')    AS cars_배차중,
  SUM(c.status = 'returned')  AS cars_반납점검,
  SUM(c.status NOT IN ('available','rented','returned') OR c.status IS NULL) AS cars_기타,
  (SELECT COUNT(DISTINCT vehicle_id) FROM fmi_rentals
    WHERE status = 'dispatched' AND vehicle_id IS NOT NULL) AS 실제_배차중_차량수,
  (SELECT COUNT(DISTINCT vehicle_id) FROM fmi_rentals
    WHERE status = 'pending' AND vehicle_id IS NOT NULL)    AS 실제_배차예정_차량수
  FROM cars c;
--  cars_배차중 ≠ 실제_배차중_차량수 면 불일치 확정


-- ── STEP 1 — 차량별 불일치 상세 ──
--   cars.status 와 실제 fmi_rentals 진행 상태를 차량 단위로 대조
SELECT
  c.`number`                        AS 차량번호,
  c.ownership_type                  AS 플릿,
  c.status                          AS cars_상태,
  COALESCE(rs.live_status, '진행중배차없음') AS 실제_배차상태,
  CASE
    WHEN c.status = 'rented'    AND rs.live_status IS NULL
      THEN '① 앱=배차중 / 실제=배차없음'
    WHEN c.status = 'available' AND rs.live_status = 'dispatched'
      THEN '② 앱=사용가능 / 실제=배차중'
    WHEN c.status = 'available' AND rs.live_status = 'pending'
      THEN '③ 앱=사용가능 / 실제=배차예정'
    WHEN c.status = 'returned'  AND rs.live_status = 'dispatched'
      THEN '④ 앱=반납점검 / 실제=배차중'
    ELSE 'OK'
  END                               AS 진단
  FROM cars c
  LEFT JOIN (
    SELECT vehicle_id,
           CASE WHEN SUM(status = 'dispatched') > 0 THEN 'dispatched'
                WHEN SUM(status = 'pending')    > 0 THEN 'pending'
                ELSE NULL END AS live_status
      FROM fmi_rentals
     WHERE status IN ('pending','dispatched') AND vehicle_id IS NOT NULL
     GROUP BY vehicle_id
  ) rs ON rs.vehicle_id = c.id
 ORDER BY 진단 DESC, c.`number`;
--  '진단' 이 OK 가 아닌 행 = 불일치 차량


-- ── STEP 2 — 진단 분류별 건수 ──
SELECT 진단, COUNT(*) AS 건수 FROM (
  SELECT
    CASE
      WHEN c.status = 'rented'    AND rs.live_status IS NULL          THEN '① 앱=배차중 / 실제=배차없음'
      WHEN c.status = 'available' AND rs.live_status = 'dispatched'   THEN '② 앱=사용가능 / 실제=배차중'
      WHEN c.status = 'available' AND rs.live_status = 'pending'      THEN '③ 앱=사용가능 / 실제=배차예정'
      WHEN c.status = 'returned'  AND rs.live_status = 'dispatched'   THEN '④ 앱=반납점검 / 실제=배차중'
      ELSE 'OK'
    END AS 진단
    FROM cars c
    LEFT JOIN (
      SELECT vehicle_id,
             CASE WHEN SUM(status = 'dispatched') > 0 THEN 'dispatched'
                  WHEN SUM(status = 'pending')    > 0 THEN 'pending'
                  ELSE NULL END AS live_status
        FROM fmi_rentals
       WHERE status IN ('pending','dispatched') AND vehicle_id IS NOT NULL
       GROUP BY vehicle_id
    ) rs ON rs.vehicle_id = c.id
) t
 GROUP BY 진단 ORDER BY 건수 DESC;
