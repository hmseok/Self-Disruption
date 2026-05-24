-- ═══════════════════════════════════════════════════════════════════
-- CallScheduler — cs_shift_slots.color_tone (시프트 식별 색상)
--   2026-05-23 sukhomin87@gmail.com
--
-- 워커(cs_workers)·그룹(cs_shift_groups)은 color_tone 이 있으나 시프트는
-- 없어 추가. 근무표 그리드·대시보드에서 시프트 라인을 색으로 구분.
-- 기본색은 category(day/evening/overnight) 컨셉에 맞춰 자동 부여 —
-- 매니저가 「시프트」 설정 탭에서 14색 중 개별 변경 가능.
-- 호환: MySQL 8.0 / 멱등 (information_schema 체크)
-- ═══════════════════════════════════════════════════════════════════

-- (1) 컬럼 추가
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cs_shift_slots'
               AND COLUMN_NAME = 'color_tone');
SET @s := IF(@col = 0,
  'ALTER TABLE cs_shift_slots ADD COLUMN color_tone VARCHAR(16) NOT NULL DEFAULT ''none'' COMMENT ''시프트 식별 색상 (palette ColorTone — 14색)''',
  'SELECT ''cs_shift_slots.color_tone already exists''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- (2) 카테고리별 기본색 — 아직 'none' 인 슬롯만 (사용자 지정 보존, 멱등)
--     주간 day → sky(하늘) / 저녁 evening → orange(노을) / 야간 overnight → indigo(밤)
UPDATE cs_shift_slots SET color_tone = 'sky'
  WHERE color_tone = 'none' AND category = 'day';
UPDATE cs_shift_slots SET color_tone = 'orange'
  WHERE color_tone = 'none' AND category = 'evening';
UPDATE cs_shift_slots SET color_tone = 'indigo'
  WHERE color_tone = 'none' AND category = 'overnight';

-- 검증: SELECT code, label, category, color_tone FROM cs_shift_slots ORDER BY sort_order;
