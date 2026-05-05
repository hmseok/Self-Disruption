# /admin 모듈 CHANGELOG

## 2026-05-05 — HR 통합 작업 시작 (PR-1 ~ PR-6)

### HR-PR1 (긴급 — 토큰 키 fix)
- `app/admin/payroll/page.tsx` — `sb-auth-token` (Supabase 옛날) → `auth-client.ts` 의 `fmi_token` 패턴 통일
- `app/admin/page.tsx` — 동형 패턴 적용 (Rule 14)
- `app/admin/contract-terms/page.tsx` — 동형 패턴 적용
- `app/admin/message-templates/page.tsx` — 동형 패턴 적용
- 효과: payroll 페이지 「직원 선택」 dropdown 빈 상태 → 정상화

### HR-PR2+3 통합 (모달 § 기본정보 + § 급여설정 + § 페이지권한)
- `app/admin/employees/page.tsx` — 직원 행 클릭 모달 확장:
  - 폭 520 → 880 + 섹션 탭 (기본정보 / 급여설정 / 페이지권한)
  - § 기본정보 — 기존 폼 유지 (이름/연락처/역할/상태/직급/부서/탈퇴)
  - § 급여 설정 — base_salary + 식대 + 지급일 + 계좌정보 (관리용 단순 버전)
  - § 페이지 권한 — role='user' 직원만 노출, 기존 권한 매트릭스 모달 안 흡수
- `app/api/employee_salaries/route.ts` — POST UPSERT 패턴 (ON DUPLICATE KEY UPDATE)
  + `?employee_id=X` 필터
- `app/api/employee_salaries/[id]/route.ts` — PATCH 화이트리스트 기반 부분 갱신
- 효과: 직원 1명 → 한 모달에서 기본정보 + 급여 + 권한 모두 관리 (분산 해소)

### HR-PR4 ~ PR-6 (예정)
- PR-4 `/admin/freelancers` → Tab 4 흡수
- PR-5 `/admin/payroll` 단순화 (세무사 외부 — 4대보험 자동계산 제거)
- PR-6 `/admin/permissions` 정식 deprecation
