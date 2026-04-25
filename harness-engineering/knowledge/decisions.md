# 기술 결정 기록 (Documenter → 자동 기록)

> 주요 기술 결정과 그 근거를 기록합니다. "왜 이렇게 했는지" 추적용.

---

## 2026-03-30: ignoreBuildErrors: true 적용

### 결정
next.config.js에 `typescript.ignoreBuildErrors: true` 추가

### 근거
- 30+ 파일에서 Prisma enum vs string 타입 불일치
- 하나씩 수정하면 빌드-수정 사이클이 너무 길어짐
- 배포 우선, 타입 정리는 후속 작업으로

### 후속 작업
- [ ] 전체 enum 타입 정리 후 ignoreBuildErrors 제거

---

## 2026-03-30: Cloud SQL 소켓 연결 방식 채택

### 결정
직접 IP 대신 Cloud SQL Auth Proxy 소켓 방식 사용

### 근거
- 같은 GCP 프로젝트의 다른 서비스(asset-management, charger-ride, rcare 등)가 모두 소켓 방식
- Cloud Run에서 직접 IP 연결은 Authorized Networks 설정 필요
- 소켓 방식이 보안상 더 안전

---

## 2026-03-30: Docker devDependencies 포함 설치

### 결정
Dockerfile에서 `npm ci` (전체 설치) 사용, `--omit=dev` 제거

### 근거
- prisma CLI가 devDependency로 등록됨
- `npx prisma generate`가 빌드 단계에서 필요
- 최종 이미지는 standalone output만 포함하므로 용량 영향 없음

---

## 2026-04-04: CompanyRelationship M:N 모델 도입

### 결정
회사 간 관계를 M:N 중간 테이블(company_relationships)로 관리

### 근거
- 소유주→계약사 관계가 다대다 (삼성화재서비스가 삼성카드+우리금융캐피탈의 계약사)
- 단순 FK(1:N)로는 다중 소유주 표현 불가
- Ride Platform 기존 구조와 호환

---

## 2026-04-04: is_direct_contract 기반 UI 분기

### 결정
`is_direct_contract` 필드로 소유주(thin bar) vs 계약사(big card) UI 분기

### 근거
- Ride Platform 기존 패턴: 소유주는 위에 얇은 바, 계약사는 큰 카드
- 3-Case 렌더링: A(직접→직접), B(비직접→직접), C(독립)

---

## 2026-04-04: CAT_THEME 카테고리별 색상 시스템

### 결정
contractCategory별 고유 색상 테마 적용

### 근거
- 전체 UI가 모노톤(white/gray/blue)이어서 시각적 구분 부족
- 사용자 피드백: "전체톤이 너무 일정하지 않나요?"

### 색상 매핑
- CAPITAL=blue, CARD=violet, INSURANCE=teal
- LEASE=amber, RENTAL=emerald, MT=orange

---

## 2026-04-04: 하네스 엔지니어링 v2.1 커스터마이징

### 결정
영상 "프롬프트 엔지니어링은 끝났습니다" 기반으로 4기둥 체계 적용

### 4기둥
1. 컨텍스트 파일 (CLAUDE.md, agents/*.md, knowledge/*.md)
2. CI/CD 게이트 (Reviewer/Designer/Evaluator 자동 검증)
3. 도구 경계 (에이전트별 최소 권한)
4. 피드백 루프 (knowledge/ 자가 학습)

### 확인 포인트
- 설계서 확인(수동) — 유일한 수동 승인 포인트
- 나머지는 자동 검증 게이트

---

## 2026-04-04: GitHub Actions CI/CD 도입

### 결정
Cloud Build 트리거 대신 GitHub Actions 워크플로우 사용

### 근거
- Sandbox에서 git push 불가 (DNS 제한)
- CI/CD 게이트를 워크플로우에 통합 관리 가능
- 하네스 2기둥(결정론적 CI/CD 게이트)과 직접 연결

### 워크플로우
main push → 빌드 → 배포 → 헬스체크

---

## 2026-04-17: 렌트 원가 계산엔진 v2.0 (순수함수 기반)

### 결정
기존 RentPricingBuilder 내장 계산 로직을 `lib/rent-calc-engine.ts`로 분리, 순수함수 기반 v2.0 엔진 구현

### 근거
- 기존: UI 컴포넌트 안에 계산 로직 혼재 → 테스트 불가, 재사용 불가
- v2.0: CalcInput → calculateRentCost() → CalcResult 순수함수
- 7대 원가 구조 (감가/금융/보험/정비/세금·검사/리스크/간접비)
- DB 우선 폴백 체인 (DB → BusinessRules → 하드코딩)
- 모든 CostItem에 source + formula 감사추적

### 핵심 파일
- `lib/rent-calc-engine.ts` (~1,253줄) — 핵심 엔진
- `lib/rent-calc.ts` (541줄) — 유틸리티
- `lib/rent-calc-types.ts` (128줄) — 타입 정의

---

## 2026-04-18: RentPricingBuilder 모듈 분리 (PricingContext 패턴)

### 결정
5,853줄 단일 파일을 React Context 기반 5개 모듈로 분리

### 근거
- 5,853줄 단일 파일은 유지보수 불가
- 122개 useState가 모든 스텝에서 공유 → props 전달 비현실적
- React Context (PricingContext.Provider) 패턴으로 상태 공유

### 분리 구조
- RentPricingBuilder.tsx (2,438줄) — 상태+핸들러+오케스트레이터
- PricingContext.tsx (24줄) — Context + usePricing 훅
- VehicleStep.tsx (1,337줄) — 차량선택+옵션
- AnalysisStep.tsx (1,791줄) — 원가분석
- CustomerPreviewStep.tsx (642줄) — 고객+미리보기

### 주의사항
- PricingContext는 현재 `any` 타입 → 후속으로 PricingState 인터페이스 정의 필요
- 핸들러 이름 매핑 필요 (handleSaveNewCarPrice → handleSaveCarPrice 등)

---

## 2026-04-18: SimulationPanel 사이드바 패턴

### 결정
기준표 설정 페이지에 실시간 시뮬레이션 사이드 패널 추가

### 근거
- 기준표 값 수정 시 즉시 렌트료 영향을 확인할 수 없었음
- SimulationPanel이 calculateRentCost() 엔진을 직접 호출하여 실시간 산출
- xl(1280px) 이상에서 우측 340px 고정, 미만에서 숨김

### 레이아웃
- page.tsx: max-w-[1800px], flex 레이아웃 (좌: 탭 / 우: SimulationPanel sticky)
- 토글 버튼으로 시뮬레이션 패널 표시/숨기기

---

---

## 2026-04-25: 하네스 자가 학습 자동화 원칙

### 결정
에이전트가 작업 중 발견한 비효율, 에러 패턴, 프로세스 개선점을 사용자 요청 없이도 knowledge/에 자동 기록

### 근거
- SMS 연동 작업에서 "이론적 포맷 추측 → 실패 → 수정" 반복으로 불필요한 시간 소모
- 사용자가 지적하기 전에 에이전트가 스스로 학습하여 재발 방지
- knowledge/ 파일이 세션 간 지식 전달 역할 → 기록하지 않으면 다음 세션에서 같은 실수 반복

### 자동 기록 트리거
- 같은 기능에 대해 수정 커밋이 2회 이상 발생한 경우
- 환경/연동 문제로 30분 이상 삽질한 경우
- 사용자가 비효율을 지적한 경우
- 새로운 외부 시스템 연동 패턴을 확립한 경우

---

## 2026-04-25: 복잡도 기반 파이프라인 축소

### 결정
모든 작업에 9인 풀 파이프라인을 적용하지 않고, 복잡도에 따라 축소 적용

### 근거
- 단순 기능(SMS 탭 추가)에 풀 파이프라인 → 과잉 프로세스
- 사용자 피드백: "간단한 구조인데 개발이 왜 이렇게 오래 걸리나"
- 빌드 확인 + 커밋은 항상 수행하되, 조사/설계/평가 단계는 복잡도에 비례

### 적용 기준
| 복잡도 | 예시 | 적용 GATE |
|--------|------|-----------|
| 단순 | 버그 수정, UI 미세 조정 | GATE 5→9 (구현→커밋) |
| 중간 | 새 탭, API, 필터 | GATE 2→9 (간단 조사→커밋) |
| 대규모 | 엔진 재설계, 신규 도메인 | GATE 1→9 (풀) |

_마지막 업데이트: 2026-04-25_
