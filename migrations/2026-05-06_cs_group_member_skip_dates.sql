-- ═══════════════════════════════════════════════════════════════════
-- PR-2SS-h-1 — cs_group_member_skip_dates 신설 (그룹 차원 회피일)
--
-- 사용자 시나리오:
--   "정동민이 야간 그룹에서 5/15 빠지고 싶음"
--   "전정연이 5/10~5/12 야간 그룹 빠지고 싶음"
--   알고리즘은 ranking 으로 다른 멤버 (윤민진 등) 자동 채움.
--
-- cs_leaves 와 차이:
--   · 그룹 한정 — 다른 그룹엔 영향 X (멤버십 다중 시 향후 유효)
--   · 정식 휴가 아님 — 발급량 차감 X
--   · 단순 회피 — 종일만 (반차 X)
--   · 신청/승인 흐름 — 직원 본인 신청 (h-2) + 매니저 직접 추가
--
-- 멱등 적용 — 여러 번 실행해도 안전.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cs_group_member_skip_dates (
  id           CHAR(36) NOT NULL,
  group_id     CHAR(36) NOT NULL,
  worker_id    CHAR(36) NOT NULL,
  start_date   DATE     NOT NULL,
  end_date     DATE     NOT NULL,
  reason       VARCHAR(255) NULL  COMMENT '사유 메모 (선택)',
  status       ENUM('requested','approved','rejected','canceled')
                NOT NULL DEFAULT 'requested',
  requested_by CHAR(36) NULL  COMMENT '직원/매니저 profile_id (옵션)',
  requested_at DATETIME NULL,
  approved_by  CHAR(36) NULL,
  approved_at  DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_lookup_worker (worker_id, start_date, end_date),
  INDEX idx_group_status  (group_id, status, start_date),
  CONSTRAINT fk_skip_group  FOREIGN KEY (group_id)  REFERENCES cs_shift_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_skip_worker FOREIGN KEY (worker_id) REFERENCES cs_workers(id)      ON DELETE CASCADE
)
  ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='그룹 차원 회피일 (cs_leaves 와 별개 — 정식 휴가 X, 단순 회피)';

-- ─── 검증 SQL ────────────────────────────────────────────────────────
-- DESCRIBE cs_group_member_skip_dates;
-- SHOW INDEX FROM cs_group_member_skip_dates;

-- ─── 롤백 ────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS cs_group_member_skip_dates;
