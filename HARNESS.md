# FMI ERP — 기능 현황 (HARNESS.md)

> 마지막 업데이트: 2026-04-05

---

## 모듈 상태

| 모듈 | 페이지 | API | DB | 상태 |
|------|--------|-----|-----|------|
| **대시보드** | 1 | ✅ | ✅ | 🟢 운영 중 |
| **차량 관리** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **운영/정비** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **영업/견적** | 12 | ✅ | ⚠️ 테이블 확인 필요 | 🟡 코드 완성, DB 검증 필요 |
| **계약** | 4 | ✅ | ✅ | 🟢 운영 중 |
| **고객** | 1 | ✅ | ✅ | 🟢 운영 중 |
| **재무/정산** | 16 | ✅ | ✅ | 🟢 운영 중 |
| **관리자/HR** | 13 | ✅ | ⚠️ 일부 테이블 확인 | 🟡 직원초대 수정 완료 |
| **데이터관리** | 6 | ✅ | ✅ | 🟢 운영 중 |
| **보험/사고** | 7 | ✅ | ✅ | 🔵 구현 완료, 네비 숨김 |
| **투자** | 5 | ✅ | ⚠️ | 🟡 정산 로직 검증 필요 |
| **Codef 연동** | 1 | ✅ | ⚠️ | 🟡 API 키 + 테이블 확인 |

---

## 진행 중 작업 (2026-04-05)

### Task 1: 직원초대 → 페이지권한 → 견적 접근
- [x] 비밀번호 해싱/저장 버그 수정 (accept/route.ts)
- [ ] DB 테이블 확인/생성 (member_invitations, user_page_permissions)
- [ ] 직원초대 → 가입 → 로그인 → 견적 페이지 접근 플로우 검증

### Task 2: 견적 고객 전달
- [ ] DB 테이블 확인 (quotes, quote_share_tokens, quote_lifecycle_events)
- [ ] 공유 링크 생성 → 고객 접근 → 서명 플로우 검증

### Task 3: 통장/카드 API (Codef)
- [ ] Codef API 키 환경변수 확인
- [ ] 은행/카드 계정 연결 테스트
- [ ] 거래내역 동기화 검증

### Task 4: 투자자 지급금액 확정
- [ ] /finance/settlement 현재 기능 확인
- [ ] 투자자별 정산 계산 로직 검증
- [ ] 지급금액 확정 UI/API

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

### 재무
- `GET /api/transactions` — 거래내역
- `GET /api/codef/bank` — 은행 거래내역 (Codef)
- `GET /api/codef/card` — 카드 승인내역 (Codef)
- `GET /api/settlement` — 정산 데이터

---

## DB 스키마 현황

- **Prisma 모델**: 42개
- **Raw SQL 전용 테이블**: 50+개
- **마이그레이션**: Prisma 마이그레이션 히스토리 없음 (수동 관리)
- **주의**: `prisma db push` 사용 시 기존 데이터 영향 확인 필요
