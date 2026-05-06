# UI-SPEC.md — Cafe24 ERP 모듈 UI 사양

> 마지막 갱신: 2026-05-05 (PR-6.1 인터뷰 결과 반영)

---

## 현재 상태 (2026-05-05)

```
app/(employees)/RideAccidents/
└── _docs/                          ← PR-6.0a + 6.1 산출물 (8 파일)
```

UI 페이지는 PR-6.3 부터 신설.

---

## 사이드바 등록 (PR-6.3 적용 예정)

```
사이드바 그룹: "외부 연동" (또는 신설 "카페24 ERP")
HIDDEN_PATHS: 일단 관리자 전용 (Q8=D)
   → ClientLayout 또는 system_modules 에서 admin role 체크
권한 분리 (직군별) 안정화 후 별도 PR
```

---

## 디자인 시스템 (Soft Ice 글래스 — CLAUDE.md § 10 적용)

### 데이터 출처 표시 (의무)

```
카페24 측에서 read 한 데이터는 항상 시각적 구분:
✓ Source 배지: '구전산' 또는 'C24' (보라색 — code-master 와 일치)
✓ 카드/테이블 좌측 보라 stripe (4px) — 선택
✓ FMI 자체 데이터와 시각 구분 — 사용자 혼동 방지
```

### Stale data 인디케이터 (의무 — Q7=A 분당 변동)

```
카페24 read 결과는 fetch 시각 + 갱신 버튼 항상 표시:
✓ 우상단: "🕒 N분 전 / [↻ 새로고침]"
✓ 60초 초과: 노란 dot
✓ 5분 초과: 빨간 dot + auto refresh 권유
✓ PB 측 동시 작업 가능성 안내 (작은 텍스트)
```

### 부호 / 색상 규칙 (CLAUDE.md 규칙 18)

```
🔴 + 부호 절대 사용 금지
🔴 - 부호 카드 취소만 사용
🔴 색상으로 의미 표현 (type/status 컬럼 자체로)
```

### 정렬 의무 (규칙 18)

```
NeuDataTable 의 모든 컬럼 sortBy 정의 의무
기본 정렬: 시간 컬럼 desc 권장
'액션' 같은 의미 없는 컬럼만 예외
```

### 줄바꿈 최소화 (규칙 19)

```
셀 안 <div> 2개 이상 금지
white-space: nowrap 우선
```

---

## PR-6.3 — 사고 접수 목록 화면 명세 (Scenario A)

### 페이지: `/RideAccidents`

```
파일: app/(employees)/RideAccidents/accidents/page.tsx
권한: 관리자 (Q8=D)

레이아웃:
  ┌─────────────────────────────────────────────┐
  │ 카페24 ERP > 사고 접수             [↻ 30s]│  ← Glass L5 헤더
  ├─────────────────────────────────────────────┤
  │ [필터: 날짜] [협력업체] [상태] [고객명검색] │  ← Glass L2 필터바
  ├─────────────────────────────────────────────┤
  │ ┌──────────────────────────────────────────┐│
  │ │ 접수일 | 협력업체 | 차량 | 고객 | 상태 ▼ ││  ← Glass L4 테이블
  │ │ 2026… | (주)스카이 | 47하… | 김… | R   ││
  │ │ ...                                       ││
  │ └──────────────────────────────────────────┘│
  └─────────────────────────────────────────────┘

컬럼:
  접수일   esosmddt + esosrgst 표시 (sortBy: 날짜 timestamp)
  협력업체 esosfact → pmcfactm 조인 (sortBy: 협력업체명)
  차량     esoscars → pmccarsm 조인 (sortBy: 차량번호)
  고객     esoscust → pmccustm 조인 (sortBy: 고객명)
  상태     esossttu (코드 마스터 변환) (sortBy: 코드값)
  등록자   esosrgst (sortBy: 사용자명)

기본 정렬: 접수일 desc
페이지네이션: 50건 단위
검색: 고객명 LIKE / 차량번호 LIKE / 협력업체 LIKE
빈 상태: "오늘 접수된 사고가 없습니다" (Glass L4 친절 안내)
```

### API: `GET /api/cafe24/accidents`

```
파일: app/api/cafe24/accidents/route.ts
권한: admin role 체크
캐시: Cache-Control: max-age=30, stale-while-revalidate=60

Query:
  ?limit=50              기본 50, 최대 200
  ?offset=0              pagination
  ?from=YYYY-MM-DD       기간 필터
  ?to=YYYY-MM-DD
  ?fact=string           협력업체 필터
  ?status=string         상태 필터
  ?q=string              검색 (고객명/차량번호 LIKE)

Response:
{
  success: true,
  data: [
    {
      // 카페24 측 RAW
      esosidno: string,
      esosmddt: string,    // YYYYMMDD
      esossrno: string,
      esosrgst: string,
      esoscars: string,
      esoscust: string,
      esosfact: string,
      esossttu: string,
      // 조인된 표시값
      cars_no: string,     // pmccarsm.carsno
      cars_model: string,  // pmccarsm.carsmod
      cust_name: string,   // pmccustm.custname
      fact_name: string,   // pmcfactm.factname
      status_label: string // bscddesc.cdvalue
    }
  ],
  meta: {
    total: 1234,
    fetched_at: "2026-05-05T08:30:00Z",
    cache: 30
  }
}

영향 받는 페이지 (broken call 해소):
  - app/operations/intake/page.tsx:170 fetch('/api/cafe24/accidents?limit=200')
```

---

## PR-6.4 — 통합 대시보드 화면 명세 (Scenario D)

### 페이지: `/RideAccidents/dashboard`

```
파일: app/(employees)/RideAccidents/dashboard/page.tsx
권한: 관리자 (Q8=D)

레이아웃:
  ┌─────────────────────────────────────────────┐
  │ 카페24 ERP > 대시보드               [↻]    │  ← Glass L5 헤더
  ├─────────────────────────────────────────────┤
  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
  │ │ 오늘 │ │ 진행 │ │ 미정산│ │ 보류 │        │  ← Glass L3 KPI 카드 4개
  │ │ N건  │ │ N건  │ │ N건  │ │ N건  │        │     (blue/green/red/amber)
  │ │ blue │ │green │ │ red  │ │amber │        │
  │ └──────┘ └──────┘ └──────┘ └──────┘        │
  ├─────────────────────────────────────────────┤
  │ ┌─────────────────────────────────────────┐ │
  │ │ 일별 추이 (recharts LineChart)          │ │  ← Glass L4
  │ │ 최근 30일 — 접수/완료/미정산            │ │
  │ └─────────────────────────────────────────┘ │
  ├─────────────────────────────────────────────┤
  │ ┌──────────────────┐ ┌──────────────────┐  │
  │ │ 협력업체 TOP10   │ │ 차종 분포        │  │  ← Glass L4
  │ └──────────────────┘ └──────────────────┘  │
  └─────────────────────────────────────────────┘

각 KPI 카드 클릭 → 드릴다운:
  오늘 접수    → /RideAccidents?date=today
  진행 대차    → /RideAccidents/orders?status=active
  미정산       → /RideAccidents/settlements?status=pending
  보류         → /RideAccidents/orders?hold=Y
```

### API: `GET /api/cafe24/dashboard`

```
파일: app/api/cafe24/dashboard/route.ts
권한: admin role 체크
캐시: 60초 (대시보드는 분당 갱신 충분)

Response:
{
  success: true,
  data: {
    today_accidents: { count: 12, change_pct: +5 },
    active_orders: { count: 87, change_pct: -2 },
    pending_settlements: { count: 23, change_pct: 0 },
    hold_orders: { count: 4, change_pct: 0 },
    daily_trend: [
      { date: "2026-04-06", accident: 8, complete: 6, pending: 2 },
      ...
    ],
    top_factories: [
      { fact_code: "F001", fact_name: "(주)스카이", count: 35 },
      ...
    ],
    car_distribution: [
      { car_type: "준중형", count: 142 },
      ...
    ]
  },
  meta: {
    fetched_at: "...",
    cache: 60
  }
}
```

---

## TBD — Phase 6.5+ 후속 화면

```
PR-6.5: 대차 주문 목록 (/RideAccidents/orders) — 헤더+라인 expandable + 청구액 계산
PR-6.6: 정산 워크플로우 (/RideAccidents/settlements) — Kanban 식 또는 status tab
PR-6.7: 차량/고객/협력업체 마스터 (/RideAccidents/masters/*)
PR-6.8: 보험 처리 (Persona 3) — ajc 모듈
```
