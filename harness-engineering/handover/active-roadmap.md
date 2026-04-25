# 활성 로드맵 (Active Roadmap)

> **이 파일은 세션 시작 시 반드시 읽는다.**
> 세션이 바뀌어도 "지금 뭘 하고 있고, 다음에 뭘 해야 하는지"를 잃지 않기 위한 파일.
> 작업 완료 시마다 이 파일을 업데이트한다.

---

## 현재 대목표: FMI 재무 자동화 파이프라인

### 전체 비전

운영 중인 차량에 계약된 고객(투자자)에게 차량의 수입/지출을 보여주고,
계약 내용대로 금액을 정산해주는 과정에서 통장/카드 사용내역이 **증빙자료**가 되고 **자동화**되어 운영.

```
PHASE 1 (수집) → PHASE 2 (1차 분류) → PHASE 3 (2·3차 분류) → PHASE 4 (손익+정산) → PHASE 5 (투명성)
```

---

## PHASE 1 — 수집 ✅

| 항목 | 상태 | 설명 |
|------|------|------|
| SMS 수신 (SMS Forwarder → 웹훅) | ✅ 구현됨 | POST /api/finance/sms-webhook |
| 파싱 + 분류 (카드승인 / 은행입출금 / 일반문자→ignored) | ✅ 구현됨 | sms-parsers.ts v3 |
| 엑셀 업로드 (검증용) | ✅ 기존 존재 | 수동 검증/보정용으로 유지 |

### 지원 카드사/은행

| 발급사 | 타입 | 파서 상태 |
|--------|------|----------|
| KB국민카드 | 카드 | ✅ 3가지 포맷 |
| 우리카드 | 카드 | ✅ 3가지 포맷 |
| 현대카드 | 카드 | ✅ 2가지 포맷 |
| MY COMPANY | 법인카드 | ✅ 2가지 포맷 |
| 우리은행 | 은행 | ✅ 출금/입금 |
| KB은행(국민은행) | 은행 | ⚠️ 기본 준비 (실제 데이터 도착 시 보정) |

---

## PHASE 2 — 1차 자동분류 (카드/통장 → 차량·업무) ✅

| 항목 | 상태 | 설명 |
|------|------|------|
| **카드별 매�� (백엔드)** | ✅ 구현됨 | corporate_cards.card_alias + assigned_car_id |
| **통장별 매핑 (백엔드)** | ✅ 구현됨 | bank_account_mappings 테이블 |
| **SMS→카드 자동 매칭** | ✅ 구현됨 | 웹훅에서 파싱 성공 시 즉시 매칭 |
| **SMS→거래 자동 생성** | ✅ 구현됨 | 매�� 시 transactions 테이블에 자동 적재 |
| **카드/통장 매핑 UI** | ✅ 구현됨 | /finance/bank-card 매핑 탭 |
| **마이그레이션 실행** | ✅ 완료 | bank_account_mappings + card_issuer 컬럼 |

---

## PHASE 3 — 2·3차 분류 (공용카드·통장 세부 분류) ✅

| 항목 | 상태 | 설명 |
|------|------|------|
| **규칙 기반 분류** | ✅ 구현됨 | lib/transaction-classifier.ts (가맹점 키워드 매칭) |
| **SMS 웹훅 자동분류** | ✅ 구현됨 | 거래 생성 즉시 규칙 1차 분류 (auto≥80 자동확정) |
| **AI 배치 분류** | ✅ 구현됨 | /api/finance/classify-sms (Gemini AI) |
| **수동 확인** | ✅ 구현됨 | /finance/classify (승인/수정/거부 + 일괄승인) |
| **classification_queue 확장** | ✅ 구현됨 | POST(개별 ���인), PATCH(일괄 승인) |

### 3-tier 신뢰도 체계
- **auto** (≥80): 자동 확정 → transactions.category 바로 적용
- **review** (60-79): 관리자 검토 → classification_queue에 저장
- **manual** (<60): 수동 분류 → classification_queue에 저장

---

## PHASE 4 — 차량별 손익 + 정산 ✅

| 항목 | 상태 | 설명 |
|------|------|------|
| **차량별 손익 API** | ✅ 구현됨 | /api/finance/vehicle-pnl (월별 전체 차량 P&L) |
| **투자자 정산 API** | ✅ 구현됨 | /api/finance/investor-settlement (지입 수익배분 + 투자 이자) |
| **정산 대시보드** | ✅ 구현됨 | /finance/investor (투자자 그룹, 차량 손익, 리포트 탭) |
| **기존 차량별 정산** | ✅ 기존 존재 | /cars/[id] CarSettlementTab (월별 상세 정산) |
| **기존 차량 수익** | ✅ 기존 존재 | /finance/fleet (전체 차량 P&L) |

---

## PHASE 5 — 투명성 ✅

| 항목 | 상태 | 설명 |
|------|------|------|
| **투자자 리포트 생성** | ✅ 구현됨 | /api/finance/investor-report (일괄 자동생성) |
| **토큰 공유 링크** | ✅ 구현됨 | settlement_shares + /settlement/view/[token] |
| **���포트 관리** | ✅ 구현됨 | /finance/investor 리포트 탭 (생성/보기/링크복사) |
| **증��� 포함** | ✅ 구현됨 | 차량 ��래내역(카테고리별) 리포트에 포함 |

---

## 사용자 결정 사항

- 오픈뱅킹 ��� 비용 이슈로 보류, SMS로 진행
- 엑셀 업로드 → 검증/보정용으로 유지
- SMS Forwarder → 모든 문자 수신 (필터 없음, 시스템에서 분류)
- 은��� SMS도 같은 앱으로 같은 폰에서 수신 중
- 불가 건 외에는 전부 자동화

---

## 보조 인프라 이슈

| 항목 | 상태 | 설명 |
|------|------|------|
| Finance 모듈 통�� (탭 허브) | 📋 설계 완료 | `docs/finance-consolidation.md` — 미구현 |
| Cloud Build 이중 트리거 | ⚠️ 정리 필요 | global + asia-northeast3 중복 빌드 |
| 미사용 Cloud Run 서비스 정리 | ⚠️ 정리 가능 | asset-management, rcare 등 0 요청 서비스 |

---

## 구현 완료 파이프라인 전체 흐름

```
SMS 수신 (SMS Forwarder → /api/finance/sms-webhook)
    ↓
파싱 (sms-parsers.ts v3: 카드 4사 + 은행 2사)
    ↓
card_sms_transactions 저장 (raw + parsed)
    ↓
카드/은행 매핑 (corporate_cards / bank_account_mappings → 차량 연결)
    ↓
transactions 자동 생성 (related_type='car', related_id=차량ID)
    ↓
규칙 기반 1차 분류 (auto≥80 → category 즉시 적용)
    ↓
AI 배치 2차 분류 (Gemini → classification_queue)
    ↓
수동 3차 확인 (/finance/classify 검토 UI)
    ↓
차량별 P&L 집계 (/api/finance/vehicle-pnl)
    ↓
투자자 정산 계산 (/api/finance/investor-settlement)
    ↓
투자자 리포트 생성 (/api/finance/investor-report)
    ↓
토큰 공유 링크 → 투자자 확인 (/settlement/view/[token])
```

---

## 사이드바 메뉴 (재무 그룹)

| 메뉴 | 경로 | 설명 |
|------|------|------|
| 통장/카드 관리 | /finance/bank-card | 카드/은행 매핑 + SMS 거래 내역 |
| 거래 분류 | /finance/classify | PHASE 3 분류 ���토 |
| 투자자 정산 | /finance/investor | PHASE 4-5 정산 + 리포트 |
| SMS 수집 | /finance/sms | SMS 수신 로그 관리 |
| 차량 수익 | /finance/fleet | 차량별 P&L (기존) |
| 대출 관리 | /loans | 대출 관리 (기존) |

---

## 직전 완료 작업

- PHASE 1 전체 완료 (2026-04-25)
- PHASE 2 완료 (2026-04-25) — 백엔드 + UI
- PHASE 3 완료 (2026-04-25) — 규칙 + AI + 수동 분류
- PHASE 4 완료 (2026-04-25) — 차량 P&L + 투자자 정산 API + 대시보드
- PHASE 5 완료 (2026-04-25) — 투자자 리포트 자동생성 + 공유

## 다��� 작업 (우선순위 순)

1. **배포 (push)**: 전체 PHASE 1-5 코드 배포
2. **실제 데이터 검���**: SMS 수신 → 파싱 → 분류 → 정산 E2E 테스트
3. **카드/은행 실제 등록**: 매핑 UI에서 실제 카드 alias 등록
4. **AI 분류 실행**: /finance/classify에서 AI 배치 분류 실행
5. **리포트 생성 테스트**: /finance/investor에서 리포트 생성 후 투자자 확인

### 추가 개선 사항 (우선순위 낮음)

- Finance 모듈 탭 허브 통합
- Cloud Build 이중 트��거 정리
- 미사용 Cloud Run 서비스 정리
- 분류 학습 피드백 루프 (수동 확인 결과 → 규칙 자동 추가)

---

_마지막 업데이트: 2026-04-25_
