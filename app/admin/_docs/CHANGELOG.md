# /admin 모듈 CHANGELOG

## 2026-05-06 — PR-B6 급여 운영 5탭 통합 (사이드바 1메뉴)

사용자 명시:
> "설정/급여운영이 분리되어있는건 별로 / 통합해야 오류나 중복이 없는데"
> "지금 중복 되어있는거 아닌가?"

중복 제거:
- /hr/payroll 프리랜서 탭 — 프리랜서 마스터 list / 필터 / 일괄등록 모두 제거
  · 등록은 /hr 외부 인력 탭에서 (PR-B5 에서 이전 완료)
  · 본 화면은 「용역비 지급 내역」 (flPayments) 만 표시

5탭 통합 (사이드바 1메뉴):
- /hr — 5번째 탭 「💼 급여 운영」 추가 → 클릭 시 /hr/payroll 으로 router.push
- /hr/payroll — 동일 5탭 nav 상단 추가 (active='payroll')
  · 다른 탭 클릭 시 /hr?tab={key} 으로 이동
- /hr — querystring ?tab= 파싱하여 초기 탭 동기화

menu-registry:
- mod-payroll-ops: sidebarHidden=true (사이드바에서 숨김, 권한 페이지에는 노출)
- 사이드바 「설정」 그룹 안 「💼 급여 운영」 메뉴 사라짐
- 옛 URL `/hr/payroll` 직접 접근 가능 (북마크 유지)



## 2026-05-06 — PR-B5 식대 라벨 + 프리랜서 분리 + 수당 동적 추가

사용자 결정: Q1 ㄱㄱ / Q2 a / Q3 γ

Q1 — 식대 라벨 명확화:
- /hr 모달 § 급여 「식대 (월)」 → 「식대 수당 (월 마스터)」 + 「비과세 한도 20만원」 hint
- 「매월 동일 수당」 부연 표시

Q2 — 프리랜서 등록/지급 분리:
- /hr 외부 인력 탭에 프리랜서 등록/수정 폼 신설 (이름/연락처/세금/계좌/메모)
- 행 클릭 → 편집 모달, 활성 토글 버튼
- /hr/payroll 프리랜서 탭은 「지급 운영만」:
  · 「+ 프리랜서 등록」 버튼 → /hr?tab=external 로 redirect
  · 드래그앤드롭 일괄 등록 / 양식 다운로드 영역 제거
  · 안내 배너 「등록은 인사 마스터에서」

Q3 — 수당 동적 추가:
- /hr 모달 § 급여에 「+ 수당 추가」 버튼
- 9개 수당 옵션 (식대 default + 교통비/직책/자가운전/가족/야간/연장/연차/상여)
- 동적 추가/삭제 가능 (필요한 항목만)
- 추가된 수당 row 표시 (라벨 + 힌트 + 금액 input + × 삭제)
- legacy 한글 키 (식대/교통비/직책수당...) → 영문 키 자동 매핑
- 저장 시 allowances JSON 에 통합



## 2026-05-06 — PR-B4 급여 운영 인사 영역 통합

사용자 명시:
> "관리에 분산된 급여를 인사 영역에 통합 / 추천대로 (B 옵션)
>  설정연계되는 부분도 체크"

이동:
- /finance/payroll-ops → /hr/payroll
- 사이드바: 「관리」 그룹 → 「설정」 그룹 (인사 마스터 옆)
- 옛 URL redirect 유지

menu-registry:
- mod-payroll-ops: group 'admin' → 'settings', path 변경, sortOrder 72
- mod-contract-terms / mod-message-templates: sortOrder 72→73, 73→74
- HIDDEN_PATHS: /finance/payroll-ops 추가
- 「관리」 그룹은 대시보드 (별도 ClientLayout 렌더) + 카페24 사고접수만 남음

대시보드:
- ClientLayout 별도 코드로 사이드바 최상단 렌더 — 그룹 무관 (이미 동작)
- mod-dashboard 의 group 'admin' 은 권한 페이지용 entry — 그대로 유지

내부 link 정리:
- /hr/payroll 안 redirect 안내 텍스트: /admin/employees → /hr 로 변경
- 「조직/권한 관리」 → 「인사 마스터」 라벨 변경



## 2026-05-06 — PR-B3 인사 정보 (입사일/퇴사일/재직상태)

사용자 요청:
> "입사,퇴사 이런 ㅎㅎ 뭔가 인사적인 내용도 있으면 좋을것같은데 퇴사직원도 있고 해서"

마이그레이션:
- migrations/2026-05-06_profiles_hr_fields.sql — 멱등 (IF NOT EXISTS)
  · hire_date DATE NULL — 입사일
  · resign_date DATE NULL — 퇴사일
  · resign_reason VARCHAR(200) — 퇴사 사유
  · emp_status VARCHAR(16) DEFAULT 'active' — active/on_leave/resigned
  · INDEX idx_profiles_emp_status

API:
- /api/profiles/[id]/route.ts — PATCH 화이트리스트에 4개 컬럼 추가

UI (/hr 페이지):
- Stats: 「전체 / 재직 / 휴직 / 퇴사」 (4개)
- 재직상태 필터: [전체] [재직] [휴직] [퇴사]
- 「재직상태」 컬럼 (재직/휴직/퇴사 — 색상 구분)
- 「입사/퇴사」 컬럼 (날짜 표시)
- 모달 § 기본정보 안 「📅 인사 정보」 섹션 신설:
  · 입사일 + 재직 상태 (active/on_leave/resigned)
  · 퇴사 선택 시 퇴사일 + 사유 입력 (빨간 박스)
  · 퇴사 처리 시 자동 is_active=false 동기화
- 「상태」 → 「계정 활성」 으로 명칭 변경 (재직상태와 분리)

폴백: emp_status 미적용 환경 → resign_date / is_active 로 추정



## 2026-05-05 — PR-B1 통합 페이지 (옵션 A 재해석)

### 사용자 명시 의도
> "사이드 바 메뉴만 분리되고 정리도 안되고 / 한페이지를 해서 직원관리,
>  초대관리,조직,권한,부서,직급,직원 프리랜서 급여설정 기타 등등
>  한곳에서 기본설정값들은 이루어질수있게"

→ PR-A 의 「페이지 분리」 해석 잘못. 진짜 의도는 「ONE 페이지 통합」.

### 구조 변경 (재정리)
- `/hr` 신규 통합 페이지 (PR-B1) — 4 탭:
  · 👥 직원 관리 — 직원 + 모달 (§ 기본 / § 급여 / § 권한)
  · 🏢 부서 · 직급 — 부서 + 직급 마스터 (한 화면 좌우)
  · ✉️ 초대 관리 — 신규 직원 초대
  · 👤 외부 인력 — 프리랜서 + 라이드 직원 (조회)

- 사이드바 변경:
  · GROUPS: 「인사 (HR)」 그룹 폐기
  · 「설정」 그룹 안 「👥 인사 마스터」 (path: /hr) 1 메뉴
  · /hr/people, /hr/org → /hr redirect + HIDDEN_PATHS

- /finance/payroll-ops (급여 운영) 는 그대로 유지 (월별 운영 — 명세/식대/프리랜서지급/분석)

### menu-registry 변경
- GROUPS: 'hr' 그룹 제거, 'admin' sortOrder 6 → 5 복귀
- MENUS: mod-hr-people / mod-hr-org 제거 / mod-hr-master 신설 (settings 그룹)
- HIDDEN_PATHS: /hr/people, /hr/org 추가
- isRequirePermission, PATH_TO_GROUP 화이트리스트 'hr' 제거 (그룹 폐기 반영)



## 2026-05-05 — 옵션 A 풀 마이그레이션 (PR-A1 ~ PR-A4)

### 사용자 결정
> "사이드 바 별룬데는 신경안써도돼요 A로 갑니다."

### 구조 변경
- 신규 사이드바 그룹 「인사 (HR)」 (sortOrder 5)
- 신규 페이지:
  - `/hr/people` (PR-A1) — 인력 마스터 (직원 + 모달 통합)
  - `/hr/org` (PR-A2) — 조직 마스터 (직급/부서/초대)
  - `/finance/payroll-ops` (PR-A3) — 급여 운영 (4탭: 대장/식대/프리랜서/분석)
- 옛날 URL 처리 (PR-A4):
  - `/admin/employees` → `/hr/people` redirect + HIDDEN_PATHS
  - `/admin/payroll` → `/finance/payroll-ops` redirect + HIDDEN_PATHS

### 모달 § 급여설정 노출 조건 (사용자 「구린데」 해결)
- admin (GOD) → 「기본정보」 만 노출 (급여/권한 안 보임)
- master → 「기본정보」 + 「💼 급여 설정」
- user → 「기본정보」 + 「💼 급여 설정」 + 「🔐 페이지 권한」

### menu-registry 변경
- GROUPS: 'hr' 신설, 'admin' label 「관리/HR」 → 「관리」
- MENUS: mod-hr-people, mod-hr-org 신설 / mod-payroll → mod-payroll-ops 명칭 + path 변경 / mod-employees 제거
- HIDDEN_PATHS: /admin/employees, /admin/payroll 추가



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
