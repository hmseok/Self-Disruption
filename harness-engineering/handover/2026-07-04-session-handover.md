# Cowork 세션 인수인계 — 사고대차 UX 단순화 + 견적 파이프라인 (2026-07-04~05)

> 새 세션: **이 파일 + CLAUDE.md + `app/operations/_docs/`(CHANGELOG·DATA-MODEL) 먼저 읽고** 이어서.
> 작업 영역: `app/operations/*` + `app/api/operations/dispatch-orders/*` (+ finance 매처 1건).

## 1. 완료 (커밋·적용 상태는 § 3)

- **[finance] codef_bank 동형 확장** — 인수인계 7-02 § 4-1. 매처 3곳(investor-jiip/freelancer/insurance-premium) + 표시 2곳(summary/pending-review). 커밋됨.
- **PR-UX-DRAWER** — 배차 탭 행 클릭 → 우측 드로어(상담 타임라인 즉시 저장·일정/담당·반납). `ConsultationTimeline`(consultation_note에 `[YYYY-MM-DD HH:mm]` append — DB 변경 없음). 상세페이지 ← 목록 복귀 버그(`?from=`) 수정.
- **PR-UX-CLAIM** — 청구 모달 자동 프리필(차종 매칭·일수 자동), 반납 정보 표시, 반납 확정 토스트 「→ 바로 청구 작성」(sessionStorage `operations_open_claim` + `operations:switch-tab` 이벤트).
- **PR-UX-SIMPLE** — 탭 접수/배차/청구 3개(사용가능 탭 제거 — 배차하기가 waiting-vehicles에서 선택, `?tab=available` 레거시 동작). 컬럼 다이어트 3탭. **청구 행 클릭 → 청구 카드 복원**(상세페이지로 새던 버그). 부가세·지급·영업지원 접기.
- **PR-QUOTE** — 업무 분석: 청구액 변수 4/5가 상담 단계 확정(과실=케바케, 청구율=보험사별 관행, 견적=상담 대략+청구 최종 — 사용자 확인). V8 마이그레이션(dispatch_orders 견적 7컬럼, **적용 완료**), `QuoteCalc` 공용(상담·드로어·청구), confirm 시 fmi_rentals COALESCE 전파, dispatch-orders SELECT `o.*` + PATCH 견적 필드(1054 graceful).

## 2. 인프라 (이 세션에서 구축 — 운영 지식)

- **cafe24 릴레이**: AWS EC2(ride-care-manager, 3.37.165.107 — cafe24 화이트리스트 IP)에 socat systemd 서비스 `cafe24-relay` — :3307 → skyautosvc.co.kr:3306. ufw 3307 allow + SG 3307 오픈. ERP는 `CAFE24_DB_HOST=3.37.165.107 / PORT=3307`. ⚠ Elastic IP 여부 미확인 — 재부팅 시 IP 바뀌면 화이트리스트 깨짐.
- **로컬 dev**: `.env.local`에 DATABASE_URL/JWT_SECRET 없었음(운영은 Dockerfile/Cloud Run 주입) → 사용자가 직접 추가해 로그인 정상. localhost:3000은 별개 프로젝트(RideCare ERP)가 점유 중일 수 있음 — FMI ERP는 3001로 뜨는 경우 있음.
- ⚠ **보안 부채**: Dockerfile에 JWT_SECRET·API 키 평문 커밋 상태 — Secret Manager 이전 권장 (로드맵 후보).

## 3. 커밋/적용 상태

- V8 마이그레이션: ✅ Cloud SQL 적용 완료 (v8_applied=7 확인)
- codef_bank / DRAWER+CLAIM / SIMPLE 커밋: 사용자가 Mac에서 safe-commit.sh로 진행 (flock 없어 cowork:commit 폴백 — `brew install flock` 하면 한 줄로 가능)
- PR-QUOTE 커밋: 마지막 안내분 — 미완이면 § 5 명령 참조

## 4. 다음 작업 후보

1. **PR-QUOTE 실물 검수 (GATE 7)** — 로컬: 접수 행 → 상담 견적 저장 → 배차 확정 → 청구 카드 프리필 확인. Chrome MCP는 localhost 접근 불가 → 사용자 스크린샷.
2. **보험사별 기본 청구율 마스터** — 청구율이 보험사별 관행이므로 insurance_company → 기본 % 자동 제안 (사용자 확인 답변 근거).
3. ClaimsTab 산출 UI도 QuoteCalc 컴포넌트로 교체 (현재 헬퍼만 공용, UI는 인라인 — 규칙 14 후속).
4. 반납 시 견적 일수 ≠ 실제 일수 재계산 알림 강화.
5. 7-02 인수인계 잔여: 청구액 요금표 연동(§ 4-3), 투자자 정산 완성(§ 4-4), auto-match-schedule 안전망(§ 4-2).

## 5. PR-QUOTE 커밋 (미완 시)

```bash
git add -- migrations/2026-07-04_V8_dispatch_order_quote.sql app/operations/QuoteCalc.tsx app/operations/RentalDrawer.tsx app/operations/_tabs/ClaimsTab.tsx 'app/operations/dispatch/[idno]/[mddt]/[srno]/page.tsx' 'app/api/operations/dispatch-orders/[id]/route.ts' 'app/api/operations/dispatch-orders/[id]/confirm/route.ts' app/api/operations/dispatch-orders/route.ts app/operations/_docs/ harness-engineering/handover/2026-07-04-session-handover.md
bash harness-engineering/scripts/safe-commit.sh '[operations] PR-QUOTE 상담 단계 견적 저장(V8) + 배차확정 전파 + 요금산출기 공용화'
```
