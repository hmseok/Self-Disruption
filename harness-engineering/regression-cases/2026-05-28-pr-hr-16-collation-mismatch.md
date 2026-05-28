# 2026-05-28 — PR-HR-16 collation mismatch (회귀 케이스)

> **CLAUDE.md Rule 9** — 사용자가 "안 돼요" 보고한 사고 기록.
> **CLAUDE.md Rule 15** — 같은 부류 누적 시 자동화 도구 신설 의무.

## Input (실제 사용자 SQL)

```sql
SELECT c.company_key, rt.role_key, rt.label, rt.sort_order
  FROM role_templates rt JOIN companies c ON c.id=rt.company_id
 ORDER BY c.sort_order, rt.sort_order;
```

## Expected

8행 (FMI/RIDE × admin/manager/staff/viewer) — 시드 기준.

## Actual (fix 전)

```
Error 1267 (HY000): Illegal mix of collations
(utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_0900_ai_ci,IMPLICIT) for operation '='
```

## Root Cause (3-Why)

- **Why 1**: `c.id = rt.company_id` 비교가 collation mismatch.
- **Why 2**: `companies.id` 는 기존 마이그가 `utf8mb4_unicode_ci` 로 생성. `role_templates.company_id` 는 PR-HR-16 마이그가 디폴트 collation (MySQL 8.x 의 `utf8mb4_0900_ai_ci`) 으로 생성.
- **Why 3**: CREATE TABLE 시 `COLLATE utf8mb4_unicode_ci` 명시 안 함. 기존 DB 의 default collation 가정 (틀린 가정).

## Fix

`migrations/2026-05-28_pr_hr_16_hotfix_collation.sql` —
`ALTER TABLE ... CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` +
개별 CHAR(36) 컬럼 `MODIFY ... COLLATE utf8mb4_unicode_ci` 명시.

사용자 검증: 8행 정상 반환 ✅

## Prevention

### 즉시 (마이그 작성 표준)

**모든 신규 CREATE TABLE 에 명시적 COLLATE 지정 의무**:

```sql
CREATE TABLE IF NOT EXISTS xxx (
  ...
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci  -- ★ 명시 (FMI ERP DB 전체 통일 표준)
  COMMENT='...';
```

특히 CHAR/VARCHAR 컬럼이 다른 테이블 (companies / profiles 등) 의 동종 컬럼과 JOIN 대상이면 **반드시** 같은 collation.

### 자동화 (CLAUDE.md § 15 — 누적 사고 자동 차단)

**누적 사고 카운터**:
- PR-HR-1 (2026-05-16) — meetings 마이그 collation 사고 (해당 회귀 케이스 있다면 연결)
- PR-HR-16 (2026-05-28) — role_templates collation 사고 ← 본 케이스

**2회 이상 같은 부류 사고 발생 → sql-collation-lint.js 자동화 도구 신설 의무**:

위치: `harness-engineering/scripts/sql-collation-lint.js`

검증 규칙:
1. `migrations/*.sql` 안 `CREATE TABLE` 패턴 추출.
2. 표준 `COLLATE utf8mb4_unicode_ci` 명시 안 됐으면 차단.
3. `CHAR(36)` 컬럼이 다른 테이블의 CHAR(36) 와 같이 사용된다면 추가 collation 강제 (정적 분석 한계 — 휴리스틱).
4. `INSERT IGNORE SELECT ... FROM other_table` 패턴도 collation 잠재 위험 → 경고.

`pre-commit` hook 으로 `npm run lint:harness` 안에서 자동 실행.

## 영향 받은 페이지

- `/hr` 「역할 템플릿」 탭 (PR-HR-16) — API `/api/role-templates` 가 1267 에러 → 빈 배열 fallback (Rule 23) → "템플릿 없음" 표시.
- hotfix 적용 후 정상 8 템플릿 노출.

## 관련 commit

- 사고 발생: `66a8373a [PR-HR-15+16]` (2026-05-28 — role_templates 마이그 collation 미명시)
- hotfix: (이번 commit — collation 통일)
- 회귀 케이스 등록: (이번 commit)
