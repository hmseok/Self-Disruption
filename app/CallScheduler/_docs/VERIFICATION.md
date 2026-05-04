# CallScheduler — 검증 로그 (1차 PR)

> 일시: 2026-05-03
> 범위: 모듈 신설(스캐폴드 + Full MVP) 후 정적 검증
> 미실시: Cloud Build 풀빌드, 실제 DB 마이그레이션 적용, 사용자 시각 검수

## 1. TypeScript 타입체크

```
npx tsc --noEmit
```

- **CallScheduler 신규 파일 에러: 0건** ✅
- 기존 154 baseline (`app/quotes/...`, `scripts/...`) 그대로 — 본 PR 회귀 없음
- 변경 파일 13개, 모두 strict 통과

## 2. 하네스 lint (`npm run lint:harness`)

| Linter | 결과 | 신규 위반 |
|--------|------|----------|
| sql-lint ($queryRaw 컬럼 검증, 538 files) | total=54 (known) | **0** ✅ |
| sql-fn-lint (회색 함수 차단) | violations=0 | **0** ✅ |
| api-call-trace (UI ↔ API 매핑, routes=280) | broken=33 (known) | **0** ✅ |
| sql-reserved-alias-lint | total=0 | **0** ✅ |
| sql-group-by-lint | total=0 | **0** ✅ |
| helper-coverage-lint (JOIN 헬퍼) | total=0 | **0** ✅ |
| amount-sign-lint (+ 부호) | total=4 (known) | **0** ✅ |
| ui-data-coverage | warnings=33 (정보성) | n/a |

**결과: 새 critical 위반 0 — commit 통과 가능 상태** ✅

## 3. 신설 파일 인벤토리

### 마이그레이션 / Prisma
- `migrations/2026-05-03_call_scheduler_init.sql` — 5 테이블 + 슬롯 13개 + 워커 16명 시드
- `prisma/schema.prisma` — `CsShiftSlot / CsWorker / CsSchedule / CsAssignment / CsDistribution` 5 모델 추가 (라인 ~1248 이후)

### API 라우트 (5개)
- `app/api/call-scheduler/shift-slots/route.ts` — GET
- `app/api/call-scheduler/workers/route.ts` — GET, POST
- `app/api/call-scheduler/schedules/route.ts` — GET, POST (전월 복제 옵션 포함)
- `app/api/call-scheduler/schedules/[id]/route.ts` — GET (그리드+KPI), PATCH, DELETE
- `app/api/call-scheduler/assignments/route.ts` — PUT (셀 upsert), DELETE
- `app/api/call-scheduler/distributions/route.ts` — GET, POST

### UI 페이지 (3개)
- `app/CallScheduler/page.tsx` — 목록 + KPI tile 4개
- `app/CallScheduler/new/page.tsx` — 신규 월 생성 (빈 그리드 / 전월 복제)
- `app/CallScheduler/[id]/page.tsx` — 상세 (캘린더 + 분석 + 배포)

### 컴포넌트 (5개)
- `app/CallScheduler/components/KpiStrip.tsx`
- `app/CallScheduler/components/ScheduleGrid.tsx`
- `app/CallScheduler/components/AssignmentCell.tsx`
- `app/CallScheduler/components/WorkerPicker.tsx`
- `app/CallScheduler/components/AnalyticsPanel.tsx`
- `app/CallScheduler/components/DistributionDialog.tsx`

### Context / Utils (4개)
- `app/CallScheduler/CallSchedulerContext.tsx`
- `app/CallScheduler/utils/types.ts`
- `app/CallScheduler/utils/hours.ts`
- `app/CallScheduler/utils/palette.ts`

### 문서 (4개)
- `app/CallScheduler/_docs/CLAUDE-CallScheduler.md`
- `app/CallScheduler/_docs/DATA-MODEL.md`
- `app/CallScheduler/_docs/UI-SPEC.md`
- `app/CallScheduler/_docs/SOURCE-ANALYSIS.md`
- `app/CallScheduler/_docs/VERIFICATION.md` (본 파일)

## 4. CLAUDE.md 규칙 준수 체크

| 규칙 | 적용 | 비고 |
|------|------|------|
| §6 SQL 금지 패턴 | ✅ | tagged template + Unsafe 만, $1/RETURNING 미사용 |
| §10 Soft Ice 글래스 | ✅ | COLORS/GLASS/BTN/pillStyle 만 사용, hex 직접 X |
| 규칙 14 동형 패턴 | ✅ | `cs_` prefix 5 테이블 일괄, 헬퍼는 utils/ 단일 |
| 규칙 17 모듈 격리 | ✅ | app/CallScheduler/ + cs_ + utils/ 모두 모듈 내부 |
| 규칙 18 정렬 의무 | ✅ | 목록 5컬럼 + AnalyticsPanel 7컬럼 모두 sortBy 정의 |
| 규칙 19 줄바꿈 최소화 | ✅ | AssignmentCell whiteSpace nowrap, 셀 1줄 |
| 규칙 20 결과 메시지 UI | ✅ | DistributionDialog/상세 모두 글래스 패널, alert 미사용 |
| 규칙 4 영향 검증 | ⚠️ 부분 | 신규 모듈이라 영향 0, 빌드 풀체크는 사용자 측에서 진행 권장 |
| 규칙 6 시각 검수 | ⏸ 보류 | Chrome MCP/사용자 스크린샷 미실시 — DB 적용 후 권장 |

## 5. 사용자 직접 적용 필요 단계

### A. DB 마이그레이션 적용
```bash
mysql -h 34.47.105.219 -u root -p fmi_op < migrations/2026-05-03_call_scheduler_init.sql
# 또는 Cloud SQL Proxy 통해
```

### B. Prisma client 재생성 (스키마 동기화)
```bash
npx prisma generate
```

### C. (선택) 네비게이션 등록 — `Employee of Ride Inc.` 그룹 하위
1. `app/api/system_modules/route.ts` — DEFAULT_MODULES 에 추가
2. `app/components/auth/ClientLayout.tsx` — `PATH_TO_GROUP['/CallScheduler']` + (필요 시 `BUSINESS_GROUPS` 에 ride_inc 그룹 신설)
3. `app/components/PageTitle.tsx` — PAGE_NAMES + PATH_TO_GROUP

본 PR 에서는 **직진입 URL `/CallScheduler` 로만 동작**하도록 보류. 네비 등록 별도 커밋 권장.

### D. 운영 검증 체크리스트 (사용자가 직진입 후)
- [ ] `/CallScheduler` 빈 목록 + "첫 스케줄 만들기" CTA 노출
- [ ] `/CallScheduler/new` 에서 2026년 5월 생성 → 자동 리다이렉트
- [ ] 상세 페이지에서 셀 클릭 → 워커 배정 → 저장 → KPI 갱신
- [ ] 야간조 4명 컬러 토큰 적용 확인 (정동민=파랑/전정연=회색/윤민진=녹색/전유하=노랑)
- [ ] 배포 모달 → 채널=manual 로 기록 → 이력 표시

## 6. Phase 2 후보 (추후 별도 PR)

- Excel 업로드 파서 — 5월 스케줄 .xlsx 직접 import
- 잔디/이메일 실제 전송 (현재는 'queued' 상태로만 기록)
- 워커 마스터 관리 페이지 (UI 에서 추가/편집)
- 권한 가드 (PermissionGate) 적용
- 시각 검수 (Chrome MCP 또는 사용자 스크린샷)
- 네비 등록 (Employee of Ride Inc. 그룹 하위)
