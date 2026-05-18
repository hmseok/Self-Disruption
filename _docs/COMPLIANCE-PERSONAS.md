# 정보보안 (RideCompliance) — 페르소나 & 시나리오 (1차 초안)

> **작성**: 2026-05-11 (sweet-amazing-galileo 메인 세션)
> **목적**: 신설 compliance 세션 인계 자료.
> **상태**: 1차 초안 — 사용자 인터뷰 후 compliance 세션이 보강 의무.
> **Rule**: Rule 25 (운영 사실 인터뷰) + Rule 26 (페르소나 의무).

---

## 0. 운영 사실 인터뷰 — compliance 세션 첫 작업 (Rule 25 의무)

사용자에게 다음 질문 후 본 문서 보강:

### [A] 범위 (사용자 명시: 5개 모두)
1. **개인정보 보호 (PIPA)** — 직원/고객 개인정보 처리 동의 / 파기 / 열람 요청
2. **정보 자산 관리** — 시스템 / DB / 문서 분류 / 접근 권한 / 감사 로그
3. **보안 사고 대응** — 침해 사고 보고 / 대응 매뉴얼 / 재발 방지
4. **규정 준수 (Compliance)** — ISMS / ISO27001 / GDPR 등 인증 관리
5. **직원 보안 교육** — 교육 이수 추적 / 정기 평가

### [B] 운영 현황
1. 현재 정보보안 담당자 1명/팀? 외부 자문?
2. 인증 (ISMS, ISO27001) 보유? 갱신 주기?
3. 침해 사고 발생 빈도?
4. 직원 보안 교육 어떻게 (대면 / 온라인 / 외부 위탁)?
5. 개인정보 처리방침 최신 갱신일?

### [C] 데이터 모델
1. 정보 자산 등록 — 시스템 / DB / 문서 / 장비?
2. 자산 분류 등급 (1급/2급/3급 또는 공개/내부/대외비/극비)?
3. 접근 권한 매트릭스 (자산 ↔ 직원/역할)?
4. 감사 로그 (audit_log) 어떻게 추적?

### [D] 권한 + 페르소나
1. CISO / 보안담당자 / 부서장 / 일반 직원 역할
2. 사고 보고는 누가 → 누구?
3. 자산 등록/처분 권한?

### [E] UI
1. /RideCompliance — 통합 대시보드 + NavTabs (5개 영역) ?
2. 또는 sub-route 분리 (/RideCompliance/assets, /RideCompliance/incidents, ...) ?
3. 사고 보고 폼 / 교육 이수 추적 / 자산 list 등 화면 우선순위

---

## 1. 페르소나 1 — 정보보안 담당자 (CISO 또는 보안팀, 주 페르소나)

### 1.1 프로필
- 직무: 회사 정보보안 정책 수립 + 운영 + 인증 관리
- 도구 (현재): 엑셀 + 사내 메모 (체계 없음)
- 도구 (목표): /RideCompliance 통합 관리
- 페인 포인트:
  1. 정보자산 list 분산 (어디에 무엇 있는지 불명)
  2. 침해사고 보고 / 추적 프로세스 부재
  3. 직원 교육 이수 추적 불가
  4. 인증 갱신 일정 관리 어려움

### 1.2 KPI
- 정보자산 등록률 100%
- 침해사고 대응 시간 (목표 1시간 이내)
- 직원 보안교육 이수율 (목표 100% / 분기)
- 인증 갱신 마감일 사전 알림

---

## 2. 시나리오 — End-to-End

### Step 1. 정보자산 등록
- /RideCompliance/assets → 시스템/DB/문서/장비 등록
- 분류 등급 + 접근 권한 + 담당자 지정

### Step 2. 침해사고 발생
- /RideCompliance/incidents → 사고 보고 폼
- 영향 자산 / 발견자 / 일시 / 영향도
- 대응 단계 (감지 → 봉쇄 → 복구 → 재발방지)

### Step 3. 직원 보안 교육
- /RideCompliance/training → 교육 과정 등록
- 직원별 이수 추적 + 정기 평가

### Step 4. 인증 관리
- /RideCompliance/audits → ISMS/ISO27001 인증 ID + 갱신일
- D-90 / D-30 알림 (스케줄 task 연계 가능)

### Step 5. 개인정보 처리
- /RideCompliance/privacy → 처리방침 / 동의 이력 / 파기 요청

---

## 3. 페르소나 2 — 부서장
- 본 부서 정보자산 조회 + 접근 권한 검수
- 보안 사고 발생 시 1차 보고자

## 4. 페르소나 3 — 일반 직원
- 본인 교육 이수 상태 조회
- 침해 의심 시 신고 (보고 폼 제출)

## 5. 페르소나 4 — admin
- 모든 권한 + audit_log 조회 + 권한 매트릭스 수정

---

## 6. compliance 세션 작업 우선순위

### Phase 1 — 데이터 모델 + 마이그
- [ ] 운영 사실 인터뷰 (위 [A]~[E]) 후 본 문서 보강
- [ ] _docs/COMPLIANCE-DATA-MODEL.md 보강 (테이블 도식)
- [ ] 마이그 SQL — ride_compliance_assets, ride_compliance_incidents,
                   ride_compliance_trainings, ride_compliance_audits 등
- [ ] 사용자 SQL 적용 검증

### Phase 2 — UI 5개 영역
- [ ] /RideCompliance 메인 대시보드 (DcStatStrip 5 stat)
- [ ] NavTabs 또는 sub-route 5개 영역
  - /RideCompliance/assets (정보자산)
  - /RideCompliance/incidents (침해사고)
  - /RideCompliance/trainings (직원교육)
  - /RideCompliance/audits (인증관리)
  - /RideCompliance/privacy (개인정보)
- [ ] 각 영역 list + 등록 모달 (디자인 표준 의무)

### Phase 3 — 자동화
- [ ] 인증 갱신 D-30 알림 스케줄
- [ ] 교육 미이수 직원 자동 안내
- [ ] 침해 사고 자동 분류

---

## 7. 디자인 표준

기준 페이지: `/loans`, `/finance/settlement`, `/RideVehicleRegistry` (라이드 통합)
- PageTitle 자동 헤더
- DcStatStrip (5 stat) — 자산 N / 사고 M / 교육 K / 인증 L / 갱신예정 P
- DcToolbar (검색 + 분류 필터)
- NeuDataTable (Rule 18 — 모든 컬럼 sortBy)
- Glass 5단계
- Rule 19 줄바꿈 최소화
- Rule 20 결과 글래스 패널 (alert 최소화)

---

본 문서는 compliance 세션이 인터뷰 후 보강.
