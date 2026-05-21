# CHANGELOG — RideMTOps (MT팀 운영)

> 매 PR 종료 시 한 줄 이상 기록 (CLAUDE.md 규칙 22).

---

## 2026-05-21 | PR-6.14.b-1 | 충전기 자산 + 유지보수 골격

### 사용자 요청
> "/RideMTOps/chargers 에 충전기 설비 유지보수 기능 추가 — 자산 등록 / 유지보수 일정 / 고장 수리 이력"
> "충전기 자산은 완전 자체 등록 (카페24 무관)"

### 의도
충전기 유지보수 풀 워크플로우 (구글시트 불러오기 → 일정 → 작업 → 사진 → 보고서 → 정산 → 종료)
의 1단계. 자산 마스터 테이블 + 유지보수 이력 테이블 + chargers 페이지 sub-tab 재구성.

### 변경
- **NEW** `migrations/2026-05-21_ride_chargers.sql`
  - `ride_chargers` — 충전기 자산 마스터 (charger_code UNIQUE, 상태 정상/점검중/고장/폐기)
  - `ride_charger_maintenance` — 유지보수 이력 (유형 정기점검/고장수리, 상태 예정/진행중/완료)
- **NEW** `app/api/ride-chargers/route.ts` — GET list + POST create (migration graceful fallback)
- **NEW** `app/api/ride-chargers/[id]/route.ts` — PATCH 인라인 편집 + DELETE (유지보수 이력 있으면 차단)
- **NEW** `app/api/ride-charger-maintenance/route.ts` — GET list (b-1 골격, POST 는 b-3)
- **수정** `app/(employees)/RideMTOps/chargers/page.tsx` — 전면 재구성
  - sub-tab 3개: 「🔧 자산」 / 「🛠 유지보수」 / 「📡 카페24 참고」
  - DcStatStrip + DcToolbar + NeuDataTable (UI 표준 준수)
  - 충전기 등록/편집 모달 (ChargerFormModal)
  - 기존 카페24 read 는 「카페24 참고」 탭으로 보존

### PR-6.14.b 시리즈 로드맵
- **b-1** ✅ 자산 테이블 + 페이지 재구성 (본 PR)
- b-2 구글시트 실시간 API 연동 (대상 불러오기)
- b-3 일정 배정 + 현장 작업 + 사진 등록
- b-4 보고서 템플릿 관리 (UI 업로드) + 치환 자동 생성 + 다운로드 (xlsx)
- b-5 정산 + 종료

### 마이그레이션 적용 (Rule 23)
```
mysql -h 34.47.105.219 -u <user> -p fmi_op < migrations/2026-05-21_ride_chargers.sql
```
검증: `SELECT COUNT(*) FROM ride_chargers;` (기대 0)

### Verification
- tsc --noEmit: 본 PR 영역 0 에러
- lint:harness: 새 critical 위반 0건
