-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler — 그룹·워커 기본 색상 베이스 (N-74)
--   2026-05-24 sukhomin87@gmail.com
--
-- 시프트(cs_shift_slots)는 N-73 에서 색상을 가졌으나 워커·그룹은
-- color_tone 기본값이 'none'(회색)이라 기본 색이 없음.
-- 'none' 인 행에 14색 팔레트를 이름순 순환 배정 — 기본색 베이스.
--   · 멱등: 'none' 행만 대상 → 사용자가 지정한 색·기존 색 보존, 재실행 안전.
--   · 각 설정 탭(WorkersTab·GroupEditor)에서 개별 변경 가능.
-- 호환: MySQL 8.0 (ROW_NUMBER / ELT)
-- ═══════════════════════════════════════════════════════════════════

-- (1) 워커 — 'none' 워커에 distinct 색 순환 배정 (이름순)
UPDATE cs_workers w
JOIN (
  SELECT id, MOD(ROW_NUMBER() OVER (ORDER BY name, id) - 1, 13) AS rn
  FROM cs_workers
  WHERE color_tone = 'none' OR color_tone IS NULL OR color_tone = ''
) t ON t.id = w.id
SET w.color_tone = ELT(t.rn + 1,
  'blue','green','amber','violet','red','indigo','sky',
  'teal','lime','orange','pink','slate','gray')
WHERE w.color_tone = 'none' OR w.color_tone IS NULL OR w.color_tone = '';

-- (2) 그룹 — 'none' 그룹에 distinct 색 순환 배정 (워커와 다른 시작점)
UPDATE cs_shift_groups g
JOIN (
  SELECT id, MOD(ROW_NUMBER() OVER (ORDER BY name, id) - 1, 13) AS rn
  FROM cs_shift_groups
  WHERE color_tone = 'none' OR color_tone IS NULL OR color_tone = ''
) t ON t.id = g.id
SET g.color_tone = ELT(t.rn + 1,
  'violet','teal','orange','sky','lime','pink','blue',
  'green','amber','red','indigo','slate','gray')
WHERE g.color_tone = 'none' OR g.color_tone IS NULL OR g.color_tone = '';

-- 검증:
--   SELECT name, color_tone FROM cs_workers ORDER BY name;
--   SELECT name, color_tone FROM cs_shift_groups ORDER BY name;
--   기대: color_tone = 'none' 인 행 없음
