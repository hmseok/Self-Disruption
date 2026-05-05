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

---

## 2026-05-05 — HR-PR5 (사용자 직접 요청 — 보류 → 진행)

### HR-PR5 — `/admin/payroll` 급여설정 탭 단순화

트리거: 사용자 화면 (단계 5/5, 200K 오차)
> "조직/권한에 급여가 같이 있는게 어떤가 / 불필요한 UI는 좀 줄여도"

화면 버그 분석:
- 역계산: 식대 200,000 포함 → base 4,513,892
- 미리보기: 식대 0 (사용자가 「수당설정」 단계에서 식대 비움)
- 결과: 4,513,892 - 713,940 = 3,799,952 (목표 4,000,000 대비 -200,048)
- 200,048원 ≈ 식대 비과세 한도 200,000 — bug 일관성 확인

수정 (5단계 마법사 폐기):
- `app/admin/payroll/page.tsx` — `openSettingModal()` 을 `router.push('/admin/employees')` 로 변환
- 「급여설정」 탭 상단 안내 배너 신설 — 「조직/권한 관리로 이동」 버튼
- 행의 「편집」 버튼 → 「→ 조직/권한에서 편집」 redirect
- 빈 상태 안내 메시지 추가
- 5단계 모달 JSX 는 dead code 로 유지 (showModal 항상 false → 렌더 안 됨)
- 사이드바 「💼 급여 관리」 메뉴는 유지 (운영 탭 — 급여대장 / 식대 / 프리랜서 / 분석)

효과:
- 역계산 200K 오차 같은 복잡도 사라짐
- 직원 1명 → /admin/employees 모달 한 곳에서 관리 (Rule 14 동형 패턴 일관성)
- 4대보험 자동계산 모듈 (calculatePayroll) 사용 X — 세무사 외부 반영

## 2026-05-05 — 매칭 작업 재개 (M-EMP)

### M-EMP — 직원 자동 매칭 도구 신설
- 트리거: 「김준수 직원인데 직원 사전 없음 → 매칭 실패」 발견 (이전 세션)
- 신설: `app/api/finance/transactions/auto-match-employee/route.ts`
  - 사전: `profiles` (계정 직원) + `ride_employees` (라이드 인력)
  - 양방향: 입금 (회수/정산) + 지급 (급여/식대/경비/대여)
  - 동명 다수: profile 우선 (ride 는 보통 profile 의 직원 mapping 가능성)
  - NON_PERSON_PREFIXES 보험사 / 카드사 / 페이 skip
- UI: `app/finance/bank-card/page.tsx` 에 「🔍 직원 dry-run」 + 「👥 직원 매칭 적용」 버튼
  - 결과 글래스 패널 (Rule 20) — cyan 색상 (#0891b2)
  - 등록 명단 표시 + 매칭 성공/동명 다수/실패 분류
  - 사람별 분산 정렬 (라운드 로빈) — 한 직원 100건 외 다른 사람도 보이도록
