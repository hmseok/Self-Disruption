    -- ═══════════════════════════════════════════════════════════════════
    -- ride_employee_assignments — 직원 ↔ 부서 다대다 (겸업)
    -- 2026-05-16 (hr 세션 PR-HR-1)
    --
    -- 목적:
    --   · 조직도 v2026.04.29 의 겸업 표시:
    --     · 석호민 — MT운영총괄(부장) + 영업기획(부장 겸업)
    --     · 전소현 — CX 차장팀장 + CX_주4 (겸업)
    --   · ride_employees.department_id 는 primary (주 소속), 본 테이블이 추가 소속
    --
    -- 동시 운영:
    --   · ride_employees.department_id 가 primary 부서
    --   · ride_employee_assignments 가 모든 소속 (primary 포함 또는 겸업만)
    --   · is_primary=1 row 가 1개만 있어야 (UNIQUE 제약 X — 애플리케이션 검증)
    --
    -- 호환: MySQL 8.0 (Cloud SQL r-care-db)
    -- ═══════════════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS ride_employee_assignments (
      id            CHAR(36) NOT NULL PRIMARY KEY,
      employee_id   CHAR(36) NOT NULL COMMENT 'ride_employees.id FK',
      department_id CHAR(36) NOT NULL COMMENT 'ride_departments.id FK',
      role_label    VARCHAR(32) NULL COMMENT '겸업|교육|파트장|책임 등 자유 라벨',
      is_primary    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '주 소속 여부 (참고용)',
      effective_from DATE NULL COMMENT '발효일 (옵션)',
      effective_to   DATE NULL COMMENT '종료일 (NULL=진행 중)',
      memo          VARCHAR(255) NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_emp_dept_active (employee_id, department_id, effective_from),
      KEY idx_emp (employee_id),
      KEY idx_dept (department_id),
      KEY idx_primary (employee_id, is_primary)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- ═══════════════════════════════════════════════════════════════════
    -- 시드는 별도 — ride_employees 49명 입력 후 사용자가 /hr UI 에서 직접 등록
    -- (이름 매칭 위험 회피)
    --
    -- 예시 (참고용 주석 — 실 실행 X):
    -- INSERT IGNORE INTO ride_employee_assignments (id, employee_id, department_id, role_label, is_primary)
    --   SELECT UUID(),
    --          (SELECT id FROM ride_employees WHERE name='석호민' LIMIT 1),
    --          (SELECT id FROM ride_departments WHERE name='영업기획' LIMIT 1),
    --          '부장 겸업', 0;
    -- ═══════════════════════════════════════════════════════════════════

    -- ═══════════════════════════════════════════════════════════════════
    -- 검증 SQL (적용 후 직접 실행)
    -- ═══════════════════════════════════════════════════════════════════
    -- 검증 1: 테이블 존재
    -- SHOW TABLES LIKE 'ride_employee_assignments';
    --
    -- 검증 2: 직원별 소속 부서 수
    -- SELECT re.name, COUNT(rea.id) AS assignment_count
    --   FROM ride_employees re
    --   LEFT JOIN ride_employee_assignments rea ON rea.employee_id = re.id
    --  WHERE re.is_active = 1
    --  GROUP BY re.id, re.name
    --  HAVING COUNT(rea.id) > 1
    --  ORDER BY assignment_count DESC;
    -- → 겸업 직원만 표시 (1보다 큰)

    -- ═══════════════════════════════════════════════════════════════════
    -- ROLLBACK (역순)
    -- ═══════════════════════════════════════════════════════════════════
    -- DROP TABLE IF EXISTS ride_employee_assignments;
