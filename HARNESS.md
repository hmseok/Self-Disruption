# FMI ERP — 기능 현황 (HARNESS.md)

> 마지막 업데이트: 2026-04-18

---

## 모듈 상태

| 모듈 | 페이지 | API | DB | 상태 |
|------|--------|-----|-----|------|
| **대시보드** | 1 | ✅ | ✅ | 🟢 운영 중 |
| **차량 관리** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **운영/정비** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **영업/견적** | 12 | ✅ | ✅ | 🟢 **v2.0 엔진 + 모듈 분리 완료** |
| **계약** | 4 | ✅ | ✅ | 🟢 운영 중 |
| **고객** | 1 | ✅ | ✅ | 🟢 운영 중 |
| **재무/정산** | 16 | ✅ | ✅ | 🟢 운영 중 |
| **관리자/HR** | 13 | ✅ | ⚠️ 일부 테이블 확인 | 🟡 직원초대 수정 완료 |
| **데이터관리** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **기준표설정** | 1 | ✅ | ✅ | 🟢 **통합 대시보드 + 시뮬레이션** |
| **보험/사고** | 7 | ✅ | ✅ | 🔵 구현 완료, 네비 숨김 |
| **투자** | 5 | ✅ | ⚠️ | 🟡 정산 로직 검증 필요 |
| **Codef 연동** | 1 | ✅ | ⚠️ | 🟡 API 키 + 테이블 확인 |

---

## 최근 완료 작업

### Phase 1: 렌트 원가 계산엔진 v2.0 (2026-04-17)
- [x] DB 기준 데이터 17종 정합성 검수
- [x] BusinessRules 20개 키 연동 (미연동 7개 → 전체 연결)
- [x] 하드코딩 값 → BusinessRules 설정값 전환
- [x] 설정 변경 → 견적 즉시 반영 검증
- [x] 순수함수 기반 v2.0 엔진 구현 (7대 원가, 감사추적, DB 우선 폴백)
- [x] 시장분석 모듈 (IRR, 경쟁력 지수, 손익분기)
- [x] 운영학습 모듈 (analyzeActualVsPredicted, suggestBusinessRules)
- [x] 평가: 9.50/10 (3회 반복 개선)
- **커밋**: 891fb26 → 8b86d2d (pushed)

### Phase 2: 기준표 통합 대시보드 + 모듈 분리 (2026-04-18)
- [x] SimulationPanel 실시간 시뮬레이션 (13개 기준표 → 엔진 호출 → 즉시 렌트료)
- [x] page.tsx 레이아웃 변경 (8탭 + 우측 시뮬레이션 사이드바)
- [x] RentPricingBuilder 모듈 분리 (5,853줄 → 5개 파일)
  - RentPricingBuilder.tsx (2,438줄 — 상태+핸들러+오케스트레이터)
  - PricingContext.tsx (24줄 — React Context)
  - VehicleStep.tsx (1,337줄 — 차량선택+옵션)
  - AnalysisStep.tsx (1,791줄 — 원가분석)
  - CustomerPreviewStep.tsx (642줄 — 고객+미리보기)
- [x] 코드 리뷰: 핸들러 매핑 오류 5건 발견 → 수정 완료
- [x] 평가: 8.9/10
- **⚠️ 미커밋 상태** — 커밋 + 푸시 필요

---

## 진행 중 / 대기 작업

### 즉시 필요
- [ ] Phase 2 변경사항 커밋 + 푸시 (사용자 요청 대기)

### 다음 우선순위 (사용자 확인 후)
- [ ] 운영학습 모듈 UI 연동 (analyzeActualVsPredicted, suggestBusinessRules 호출 UI)
- [ ] 견적 심플 작성 UI (사용자: "원가분석 먼저, 견적작성은 뒤에")
- [ ] PricingContext 타입 정의 (any → PricingState 인터페이스)

### 기존 대기 작업
- [ ] payment_schedules API 구현 (Phase 4+)
- [ ] SQL Injection 보안 패치 (9개 라우트, CLAUDE.md 이슈 #5)
- [ ] 직원초대 → 페이지권한 → 견적 접근 플로우 검증
- [ ] 견적 고객 전달 (공유 링크 → 서명 플로우)
- [ ] Codef API 연동 테스트
- [ ] 투자자 정산 로직 검증

---

## 핵심 API 엔드포인트

### 인증
- `POST /api/auth/login` — 로그인 (JWT 발급)
- `POST /api/auth/signup` — 회원가입
- `POST /api/member-invite` — 직원 초대
- `POST /api/member-invite/accept` — 초대 수락 + 프로필 생성
- `GET /api/member-invite/validate` — 초대 토큰 검증

### 견적
- `GET/POST /api/quotes` — 견적 목록/생성
- `GET/PATCH/DELETE /api/quotes/[id]` — 견적 상세
- `POST /api/quotes/[id]/share` — 공유 링크 생성
- `GET /api/public/quote/[token]` — 고객용 공개 견적
- `POST /api/public/quote/[token]/sign` — 고객 서명
- `GET /api/pricing-standards?table=...` — 기준표 17종 CRUD
- `GET /api/business-rules` — BusinessRules 20개 키

### 재무
- `GET /api/transactions` — 거래내역
- `GET /api/codef/bank` — 은행 거래내역 (Codef)
- `GET /api/codef/card` — 카드 승인내역 (Codef)
- `GET /api/settlement` — 정산 데이터

---

## DB 스키마 현황

- **Prisma 모델**: 42개
- **Raw SQL 전용 테이블**: 50+개 (기준표 17종 포함)
- **마이그레이션**: Prisma 마이그레이션 히스토리 없음 (수동 관리)
- **주의**: `prisma db push` 사용 시 기존 데이터 영향 확인 필요

---

## 견적 시스템 아키텍처 (v2.0)

```
사용자 입력
    ↓
RentPricingBuilder.tsx (오케스트레이터)
  ├─ 122개 상태 관리
  ├─ 13개 기준표 DB 로딩
  ├─ PricingContext.Provider
  │   ├─ VehicleStep (차량선택+옵션)
  │   ├─ AnalysisStep (원가분석)
  │   ├─ CustomerStep (고객정보)
  │   └─ PreviewStep (견적서)
  └─ calculations (useMemo)
       ↓
  calculateRentCost(CalcInput)  ← lib/rent-calc-engine.ts
       ↓
  CalcResult (7대 원가 + 감사추적 + 시장분석 + IRR)
```

기준표 설정:
```
app/db/pricing-standards/page.tsx
  ├─ 8탭 (감가/보험/정비/검사/세금/금리/등록/설정)
  └─ SimulationPanel (우측 사이드바)
       ↓
  calculateRentCost() 엔진 직접 호출 → 실시간 렌트료 산출
```
