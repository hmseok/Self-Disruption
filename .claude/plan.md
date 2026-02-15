# /db/codes 환경설정 페이지 리뉴얼 플랜

## 현재 문제
- `/db/codes/page.tsx`는 "환경설정/코드"라는 이름이지만, 실제로는 레거시 **차량 모델 DB + AI 견적 스캔** 페이지
- 해당 기능은 이미 `/quotes/pricing` (렌트가 산출 빌더)에서 더 정교하게 구현됨
- `car_code_models`, `car_code_trims`, `car_code_options`, `lotte_rentcar_db` 레거시 테이블 사용
- page2~5.tsx도 모두 레거시 백업 파일

## 리뉴얼 방향
기존 레거시 코드를 제거하고, **실제 "환경설정"** 기능을 하는 페이지로 완전 교체

## 새 /db/codes 페이지 구성 — 3개 탭

### 탭 1: 공통 코드 관리 (common_codes 테이블)
- `common_codes` 테이블 CRUD
- 그룹별 코드 관리 (group_code → code → name)
- 드롭다운, 상태값, 차량유형 등 시스템 전체 열거형 데이터 관리
- 그룹 추가/삭제, 코드 추가/편집/삭제, sort_order 조정
- 활성/비활성 토글

### 탭 2: 회사 설정 (companies 테이블)
- 현재 로그인 회사의 기본 정보 편집
- 회사명, 사업자번호, 대표자, 연락처, 주소
- 렌터카 관련 설정: 기본 계약기간, 기본 보증금, 기본 마진율
- 로고/브랜딩 (향후 확장)

### 탭 3: 시스템 모듈 관리 (god_admin 전용)
- `system_modules` 목록 조회
- `company_modules` 활성/비활성 토글
- 각 회사별 모듈 접근 권한 확인
- 일반 사용자에게는 "현재 활성화된 모듈" 목록만 표시

## 구현 파일

### 삭제할 파일
- `app/db/codes/page2.tsx` ~ `page5.tsx` (백업 파일 삭제)

### 생성/수정할 파일
1. **`app/db/codes/page.tsx`** — 새 환경설정 메인 (3탭 구조, 기존 파일 완전 교체)
2. **`app/db/codes/CommonCodesTab.tsx`** — 공통 코드 관리 탭
3. **`app/db/codes/CompanySettingsTab.tsx`** — 회사 설정 탭
4. **`app/db/codes/SystemModulesTab.tsx`** — 모듈 관리 탭 (god_admin 전용)

## UI/UX 가이드
- pricing-standards 페이지와 동일한 탭 UI 패턴 사용
- 최대 너비 1400px, 가이드 배너 포함
- 초보자도 이해할 수 있는 설명 텍스트 포함
- 인라인 편집 + 저장 버튼 패턴 (pricing-standards와 동일)

## 기술 스택
- `createClientComponentClient` from `@supabase/auth-helpers-nextjs`
- `useApp()` 훅으로 role, company 정보 접근
- Tailwind CSS (기존 스타일 패턴 유지)
- 'use client' 컴포넌트

## 영향 범위
- `/db/codes` 경로 유지 (네비게이션 변경 불필요)
- system_modules에 이미 등록됨 (012 SQL)
- 레거시 테이블(car_code_*, lotte_rentcar_db)은 이 페이지에서 참조하지 않음
