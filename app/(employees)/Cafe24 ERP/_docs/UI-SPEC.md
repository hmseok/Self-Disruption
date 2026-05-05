# UI-SPEC.md — Cafe24 ERP 모듈 UI 사양 (TBD)

> 본 모듈은 현재 **빈 폴더 + _docs 만 작성된 상태**.
> UI 페이지/탭/컴포넌트는 다음 PR (Phase 6-A) 에서 결정.

---

## 현재 상태 (2026-05-05)

```
app/(employees)/Cafe24 ERP/
└── _docs/
    ├── CLAUDE-Cafe24.md       모듈 한정 보조 규칙
    ├── SOURCE-ANALYSIS.md     카페24 시스템 분석 보고서
    ├── DATA-MODEL.md          카페24 측 데이터 모델
    ├── OPERATIONS.md          운영 사실 (인터뷰 자리)
    ├── SCENARIOS.md           페르소나/시나리오 (인터뷰 자리)
    ├── UI-SPEC.md             ← 본 문서
    ├── CHANGELOG.md           PR 별 한 줄 기록
    └── VERIFICATION.md        lint / 빌드 검증 로그
```

UI 페이지는 아직 신설되지 않음.

---

## 향후 UI 후보 (Phase 6-A 이후)

### 후보 페이지 1 — `/Cafe24 ERP/dashboard` (사고 대시보드)

```
용도: 카페24 ERP 측 사고/대차/정산 통합 대시보드
글래스 디자인: Soft Ice (CLAUDE.md § 10)
주요 위젯:
  - Glass L3 blue tint: 오늘 접수 사고 N건
  - Glass L3 green tint: 진행 중 대차 N건
  - Glass L3 red tint: 정산 보류 N건
  - Glass L3 amber tint: 미처리 N건
  - Glass L4: 최근 접수 표 (NeuDataTable, 모든 컬럼 sortBy 의무 — 규칙 18)
```

### 후보 페이지 2 — `/Cafe24 ERP/accidents` (사고 접수 목록)

```
용도: aceesosh 직접 read + 검색 / 필터
필터: 날짜 / 협력업체 / 상태 / 고객명
정렬: 모든 컬럼 sortBy (규칙 18)
페이지네이션: 50건 단위
```

### 후보 페이지 3 — `/Cafe24 ERP/orders` (대차 주문 목록)

```
용도: ajaoderh + ajaopslh 조인 read
헤더 + 라인 펼치기 (Expandable Row)
계산 컬럼: 청구액 = ajaopslh 라인 합계 (fpm_ajaoder_calc 로직 재현)
```

### 후보 페이지 4 — `/Cafe24 ERP/settlements` (정산 워크플로우)

```
용도: ajrpinsh 메인 워크플로우 모니터
상태별 칼럼 (Kanban 식 또는 Tab 식)
각 카드: oderfact / oderidno / 청구액 / 상태 / 진행시각
```

---

## 디자인 규칙 (CLAUDE.md § 10 + 본 모듈 추가)

### 데이터 출처 표시 의무

```
카페24 측에서 read 한 데이터는 항상 시각적 구분:
✓ Source 배지: '구전산' / 'C24' (보라색 — code-master 와 일치)
✓ 카드/테이블 좌측 보라 stripe (4px)
✓ FMI 자체 데이터와 시각 구분 — 사용자 혼동 방지

이유: PB 데스크톱과 동시 사용 환경 — "어느 시스템 데이터인지" 즉시 인지 필요
```

### Stale data 인디케이터

```
카페24 read 결과는 fetch 시각 + 갱신 버튼 항상 표시:
✓ 우상단: "🕒 N분 전 갱신 / [↻ 새로고침]"
✓ 5분 초과 시 노란 dot
✓ PB 측 동시 작업 가능성 안내
```

### 부호/색상 (규칙 18 적용)

```
🔴 + 부호: 절대 사용 금지
🔴 - 부호: 카드 취소만 사용
🔴 색상: type/transaction_type 으로 의미 표현

(카페24 측 ERP 데이터에도 동일 적용)
```

---

## 현재 영향받는 외부 페이지

```
app/operations/intake/page.tsx
  └─ fetch('/api/cafe24/accidents?limit=200')  ← broken call (라우트 없음)
       Phase 6-A 에서 해소 우선순위 #1
```

---

## TBD — Phase 6-A 진입 전 결정 필요

```
[ ] 사이드바 네비 위치 (어느 그룹? — 운영? 외부 연동? 별도 그룹?)
[ ] 페이지 갯수 (4개 모두 만들지? 우선 1~2개?)
[ ] 사용자 권한 (모든 직원? 일부만?)
[ ] 페르소나 우선순위 (Persona 1 vs 2 vs 3) — SCENARIOS.md 인터뷰 결과 기반
```
