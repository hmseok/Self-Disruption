# /admin 모듈 CHANGELOG

## 2026-05-05 — HR 통합 작업 시작 (PR-1 ~ PR-6)

### HR-PR1 (긴급 — 토큰 키 fix)
- `app/admin/payroll/page.tsx` — `sb-auth-token` (Supabase 옛날) → `auth-client.ts` 의 `fmi_token` 패턴 통일
- `app/admin/page.tsx` — 동형 패턴 적용 (Rule 14)
- `app/admin/contract-terms/page.tsx` — 동형 패턴 적용
- `app/admin/message-templates/page.tsx` — 동형 패턴 적용
- 효과: payroll 페이지 「직원 선택」 dropdown 빈 상태 → 정상화

### HR-PR2 ~ PR-6 (예정)
- PR-2 `/admin/employees` 슬라이드 패널 — 기본정보 + 급여설정 통합
- PR-3 § 페이지 권한 슬라이드 흡수 (직원별)
- PR-4 `/admin/freelancers` → Tab 4 흡수
- PR-5 `/admin/payroll` 단순화 (세무사 외부 — 4대보험 자동계산 제거)
- PR-6 `/admin/permissions` 정식 deprecation
