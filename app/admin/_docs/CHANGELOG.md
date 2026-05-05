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

### HR-PR6 — `/admin/permissions` 정식 deprecation
- 검수 결과: `/admin/permissions` 는 이미 `lib/menu-registry.ts` 의
  `HIDDEN_PATHS` Set 에 등록 → 사이드바 / 권한 페이지 모두에서 자동 숨김
- `app/admin/permissions/page.tsx` 는 redirect-only (→ `/admin/employees`)
- 추가 코드 변경 불필요 (이미 deprecated 상태)

### HR-PR4 / PR-5 (보류 — 가성비 평가 결과)

| PR | 가치 | 결정 |
|----|------|-----|
| PR-4 freelancers Tab 흡수 | 🟡 — 프리랜서는 직원과 별개 (외부 인력) | 유지 — 사이드바 분리가 더 명확 |
| PR-5 payroll 4대보험 모듈 제거 | 🟢 — 모듈 안 쓰면 무해 | 보류 — 미사용 코드 정리는 추후 |

사용자 요구의 핵심 (직원 dropdown 정상화 + 통합 1화면) 은 PR-1 ~ PR-3 으로 달성.
PR-4 / PR-5 는 매칭 검수 작업 진행 후 필요 시 별도 진행.
