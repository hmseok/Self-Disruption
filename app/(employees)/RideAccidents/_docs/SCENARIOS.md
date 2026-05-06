# SCENARIOS.md — 카페24 ERP 연동 페르소나 / 시나리오

> 규칙 26 (페르소나·시나리오 사전 워크-스루) 기반.
> 마지막 갱신: 2026-05-05 (PR-6.1 사용자 인터뷰 결과 반영)

---

## 페르소나 (확정 — Q5=D 권한별 화면 분리)

### Persona 1 — 사고차 대차 운영자 (acr_app 사용자)

```
역할: 사고 접수 → 대차 차량 배차 → 정산까지 풀 워크플로우 운영
사용 시간: 24/365 (당직 포함)
사용 패턴: 카페24 PB 데스크톱 + FMI ERP 병행

FMI 에서 보고 싶은 데이터 우선순위 (Q3=A):
  1. 오늘 접수된 사고 (aceesosh)              ← broken call 해소 #1
  2. 진행 중인 대차 주문 (ajaoderh + ajaopslh)
  3. 미정산 건 (ajrpinsh)

FMI 에서 입력 / 변경 (단계 2 이후):
  - 단계 1 (현재): read-only — FMI 측 입력 X
  - 단계 2: 사고 접수, 대차 매칭, 정산 일부 입력 → 카페24 sync
  - 단계 3: 카페24 OFF — FMI 만 사용
```

### Persona 2 — 관리자/임원 (Q3=D 통합 대시보드)

```
역할: 카페24 + FMI 통합 모니터링 / 리포트
사용 시간: 9-18 위주 (관리자도 야간 알림 가능)
사용 패턴: FMI 통합 대시보드 메인

관심 데이터:
  - 일별/월별 사고 건수 + 추이 (글래스 L3 blue tint)
  - 정산 상태 분포 (대기 / 진행 / 완료 / 보류)
  - 협력업체별 처리 현황 (oderfact 그룹)
  - 차량 가동률 / 회전율
  - 매출 / 미수 / 정산 금액 합계

FMI 에서 입력:
  - 단계 1: read-only
  - 단계 2: 일부 운영 코드/기준 변경
```

### Persona 3 — 보험 처리 담당 (ins_app 매핑)

```
역할: 보험사 청구 / 자기부담금 / 과실율 처리
사용 시간: 9-18 사무시간
사용 패턴: 카페24 PB 데스크톱 + FMI 보험 화면 (PR-6.5+ 신설)

관심 데이터:
  - ajcinsph (보험 헤더)
  - ajcipsbh / ipslh / ipsmh (보험 라인)
  - oderbogn/bomx/bomn/bofc/etcn (부담금 정책)

본 PR-6.X 시리즈 우선순위 낮음 — 안정화 후 별도 PR.
```

### Persona 4 — IT / 시스템 관리자 (사용자 본인)

```
역할: DB 접근 권한 / 외부 IP 화이트리스트 / 백업 정책
PR 별 사전 작업:
  - PR-6.2 전: 카페24 관리페이지 → DB → "외부 IP 접근 허용" 토글
  - PR-6.2 전: Cloud Run IP (35.x.x.x 대역) 화이트리스트 등록
  - PR-6.2 후: .env.local CAFE24_DB_HOST 가 외부 접근 가능 호스트인지 검증
```

---

## 권한 모델 (Q8=D 일단 관리자 전용)

```
PR-6.X 모든 페이지:
  - middleware.ts 의 admin 체크 또는 page.tsx 첫 줄
  - 또는 ClientLayout HIDDEN_PATHS 에 등록 (관리자만 사이드바 표시)
  - 권한 없는 사용자: Forbidden 페이지 리다이렉트

직군별 권한 분리 (운영자 / 보험 / 관리자) — 안정화 후 별도 PR.
```

---

## 시나리오 (확정 — Q3=A,D)

### Scenario A — 사고 접수 표출 (실시간 read) ★ PR-6.3 우선

```
사용자: Persona 1 또는 2
사전: PR-6.2 (lib/cafe24-db.ts) 완료

흐름:
  Step 1. 카페24 측 PB 에서 사고 접수 (aceesosh INSERT)
  Step 2. FMI ERP /RideAccidents 페이지 진입
  Step 3. /api/cafe24/accidents fetch (캐시 30~60초)
  Step 4. 접수 건 목록 표시 — 글래스 L4 NeuDataTable
            컬럼: 접수일/협력업체/고객명/차량/상태/등록자
            모든 컬럼 sortBy 의무 (규칙 18)
            기본 정렬: 접수일 desc
  Step 5. 행 클릭 → 상세 모달 (관련 ajaoderh + ajaopslh 조인)
  Step 6. /api/cafe24/accidents 가 operations/intake/page.tsx broken call 해소
            (현재 fetch 실패하는 곳도 함께 동작)

영향 받는 페이지:
  - app/operations/intake/page.tsx (broken call 해소)
  - app/(employees)/RideAccidents/accidents/page.tsx (신설)
```

### Scenario D — 통합 대시보드 (KPI 위젯) ★ PR-6.4 우선

```
사용자: Persona 2 (관리자)
사전: PR-6.3 (사고 접수 API) 완료

흐름:
  Step 1. FMI 진입 → 사이드바 "카페24 ERP" → "대시보드"
  Step 2. /RideAccidents/dashboard 진입
  Step 3. 동시 fetch:
            - /api/cafe24/accidents/today (오늘 접수)
            - /api/cafe24/orders/active (진행 중 대차)
            - /api/cafe24/settlements/pending (미정산)
            - /api/cafe24/stats/daily (일별 추이)

  Step 4. 위젯 5개 (Soft Ice 글래스):
            - L3 blue: 오늘 접수 N건  [드릴다운 → /accidents]
            - L3 green: 진행 대차 N건  [드릴다운 → /orders]
            - L3 red: 미정산 N건       [드릴다운 → /settlements]
            - L3 amber: 보류 N건       (oderhold='Y')
            - L4: 일별 추이 차트 (recharts)

  Step 5. 새로고침 버튼 우상단 — 마지막 갱신 시각 표시
            "🕒 N분 전 / [↻ 새로고침]"
```

### Scenario X — 향후 (단계 2 — 양방 동기화)

```
TBD: 카페24 단계적 폐기 타임라인 결정 (Q6=D 미정) 후 설계
```

---

## 충돌 해소 (Q4=B FMI 우선)

```
단계 1 (현재): 충돌 부재 — FMI read-only
단계 2 (TBD):
  - FMI 입력값 우선 — 동기화 시 카페24 INSERT/UPDATE
  - 카페24 측이 같은 row 동시 수정 시 conflict log → 관리자 알림
  - 충돌 해결 화면 별도 PR
```

---

## PR 우선순위 (Q3=A,D + Q5=D 종합)

```
PR-6.2: lib/cafe24-db.ts (mysql2 read-only pool + 단일 진입점)
PR-6.3: /api/cafe24/accidents + /RideAccidents 페이지 (Scenario A)
        ★ broken call (operations/intake) 해소 — 가장 가시적 결과
PR-6.4: /api/cafe24/dashboard/* + /RideAccidents/dashboard 페이지 (Scenario D)
PR-6.5+: 보험 / 정산 / 차량 마스터 등 점진 확장
```
