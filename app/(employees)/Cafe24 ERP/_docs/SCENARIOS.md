# SCENARIOS.md — 카페24 ERP 연동 페르소나 / 시나리오 (TBD)

> 규칙 26 (페르소나·시나리오 사전 워크-스루) 기반.
> 본 문서는 사용자 운영 현실을 반영한 시나리오 작성 자리. 추측 우선이 아니라 인터뷰 후 채움.
> 미확정 항목은 ❓로 표시.

---

## 페르소나 후보 (확인 필요)

### Persona 1 — 사고차 대차 운영자 (acr_app 사용)

```
역할 ❓: 사고 접수 → 대차 차량 배차 → 정산까지 풀 워크플로우 운영
도구 ❓: 카페24 PB 데스크톱 (acr_app.exe) + (이번 추가) FMI ERP 화면
1일 작업 빈도 ❓: 사고 N건/일?
FMI 에서 보고 싶은 카페24 데이터 ❓:
  - 오늘 접수된 사고 (aceesosh)
  - 진행 중인 대차 주문 (ajaoderh + ajaopslh)
  - 미정산 건 (ajrpinsh)
```

**시나리오 (TBD)**:
1. 사고 접수 알림 → FMI 대시보드에 즉시 표시?
2. 카페24 측에서 처리 → FMI 측 동기화 표시?

---

### Persona 2 — 관리자 (adm_app 사용 또는 FMI 통합 대시보드)

```
역할 ❓: 카페24 + FMI 통합 모니터링 / 리포트
관심 데이터 ❓:
  - 일별/월별 사고 건수
  - 정산 상태 분포 (ajrpinsh)
  - 협력업체별 처리 현황 (oderfact)
  - 차량 가동률 / 회전율
```

---

### Persona 3 — 보험 처리 담당 (ins_app + ajc 모듈)

```
역할 ❓: 보험사 청구 / 자기부담금 / 과실율 처리
관심 데이터 ❓:
  - ajcinsph (보험 헤더)
  - ajcipsbh / ipslh / ipsmh (보험 라인)
  - oderbogn/bomx/bomn/bofc/etcn (부담금 정책)
```

---

### Persona 4 — IT / 시스템 관리자

```
역할 ❓: DB 접근 권한 / 외부 IP 화이트리스트 / 백업 정책
이번 PR 준비 작업:
  - 카페24 관리페이지 → DB → "외부 IP 접근 허용" 토글
  - Cloud Run IP (35.x.x.x 대역) 화이트리스트 등록
  - .env.local CAFE24_DB_HOST 가 외부 접근 가능 호스트인지 검증
```

---

## 시나리오 후보 (TBD)

### Scenario A — 사고 접수 → FMI 표시 (실시간 read)

```
Step 1. 카페24 측 PB 에서 사고 접수 (aceesosh INSERT)
Step 2. FMI ERP /operations/intake 화면 → /api/cafe24/accidents fetch
Step 3. 접수 건이 FMI 에 표시 (현재는 broken — Phase 6-A 해소 대상)
Step 4. FMI 에서 후속 처리 (대차 매칭, 정산 연결 등)
```

**필요 데이터**: aceesosh + pmccustm (고객명) + pmccarsm (사고 차량)

### Scenario B — 정산 상태 모니터링 (대시보드)

```
Step 1. FMI 대시보드에서 "오늘의 정산 현황" 위젯 조회
Step 2. /api/cafe24/settlements fetch
Step 3. ajrpinsh 상태별 카운트 (대기 / 진행 / 완료 / 보류)
Step 4. 클릭 시 상세 (드릴다운)
```

**필요 데이터**: ajrpinsh + ajaoderh (조인) + 상태 코드 (bscddesc)

### Scenario C — 충돌 상황 (PB 데스크톱과 FMI 동시 사용)

```
Cafe24 PB 가 ajrpinsh status='B' 로 변경 중
FMI 가 같은 row 를 막 read 한 상태
→ FMI 캐시가 stale → 사용자 혼란

대응:
  [A] FMI 는 매 read 마다 fresh fetch (캐시 X)
  [B] 짧은 캐시 (10초) + "방금 갱신" 표시
  [C] 카페24 측 변경 webhook 받기 (불가 — 카페24 측 코드 변경 X)
```

→ Phase 6-A 에서 결정.

---

## 인터뷰 진행 가이드

```
사용자에게 묻고 본 문서를 채울 때:

1. 본인이 가장 자주 사용할 페르소나는 누구인가?
2. 그 페르소나가 FMI 에서 보고 싶은 카페24 데이터 우선순위 3개?
3. 매일 / 주 / 월 어느 빈도로 봐야 하는가?
4. 카페24 측 변경 빈도는? (실시간 동기화 필요 vs 일배치로 충분?)
5. 충돌 시 어느 쪽이 source of truth?
```
