# CallScheduler — CHANGELOG

> 매 PR 종료 시 한 줄 이상 기록 의무 (CLAUDE.md 규칙 22)
> 본 세션 (2026-05-03 ~ 05-04) 의 PR 누적

## 2026-05-28 (PR-2RR-d) — GroupEditor 본격 정리 (중복 통합 · 공간 절약)

> 사용자 명령: 「비슷한내용이면 정리하고 하나로 하고 공간도 활용좀 잘하고 스크롤도 많이 줄일수있을것같은데」.

- **공휴일 처리 통합** — 「🎌 공휴일 처리」 + 「🎉 공휴일에도 출근」 (상호배반) 두 Field → 단일 3-way segmented control 「평소대로 / 🎌 제외 / 🎉 추가 출근」.
  - 한 Field 의 grid 3 컬럼. 클릭 시 skip/include state 자동 정합.
- **협업 옵션 묶음** — 「🤝 다른 그룹 추가 근무 허용」 + 「🔗 휴가 커버 그룹」 → 단일 「🤝 협업 옵션」 Field 안에 통합.
  - 같은 날 겹침 체크박스: 6px·10px padding 컴팩트 inline.
  - 휴가 커버 pairs: 36 col 박스 → inline chip + dropdown (한 줄에 추가/제거/priority 모두).
- **시프트 로테이션 toggle** — Field wrapper 제거 + 직접 inline label (padding 10→6, gap 10→8, font 12→11).
- **시프트 선택 (OFF 모드)** — sub 안내 제거, 칩 padding 4→3, gap 4→3.
- **시프트 선택 (ON 모드)** — 큰 안내 박스 (로테이션 모드 설명) 제거 — 매트릭스 자체가 안내 역할.
- **2-column grid 도입**:
  - 이름 + 카테고리 한 행.
  - 색상 + 설명 한 행 (라벨 「색상: <현재값>」 → 별도 하단 표시 라인 제거).
- **카테고리 칩 컴팩트** — padding 4·12 → 3·10, sub 텍스트 제거.
- **색상 동그라미** — 28 → 22px, 3px border → 2px.
- 알고리즘/스키마 변경 없음. tsc CallScheduler 영역 에러 0.

## 2026-05-28 (PR-2RR-c) — 매트릭스 시간대 표시 + GroupEditor 1차 컴팩트화

> 사용자 명령: 「코드만 주지말고 시간대도 같이 넣어야 보기 좋지」 + 「설정이 너무 ui가 너무 방대하게 많네 이제 정리좀 하자」 + 「심플하고 공간도 좀 줄이고」.

- **수정** `RotationPreviewMatrix.tsx` —
  - 셀: `<div>{slot_code}</div>` 1줄 → 2줄 (코드 + `start_time~end_time` 9px opacity 78%).
  - 시프트 footer: 코드 옆에 시간대 inline 표시 + `onShiftRemove` callback (×) 버튼 추가.
- **수정** `GroupEditor.tsx` (1차 정리) —
  - `Field` 컴포넌트 컴팩트화: label 11→10px / sub 10→9px / marginBottom 4→2 / label 빈 값 시 div 미렌더.
  - 그룹 GLASS L4 카드 padding 18→12 / gap 14→8 (전체 적용 — replace_all).
  - 외곽 그룹 컨테이너 gap 14→10.
  - **「시프트 sequence」 Field 영역 제거** (~100 라인) — 매트릭스 footer 가 흡수 (◀▶ reorder + × remove).
  - **「로테이션 주기」 Field 영역 제거** (~30 라인) — 매월 기본 (N일 토글은 향후 매트릭스 안으로).
  - 매트릭스 진입 전 시프트 0개 시 amber 안내 + 시프트 추가 버튼 칩.
  - 시프트 1+개 시 매트릭스 위에 작은 dashed 칩으로 「+ 추가」 가능.
- 알고리즘/스키마 변경 없음 — UI 컴팩트화만.
- 검증: tsc CallScheduler 영역 에러 0.
- 다음 (PR-2RR-d): 「공휴일 처리」 + 「공휴일에도 출근」 통합 / 「다른 그룹 추가 근무」 + 「휴가 커버」 묶음 / 2-column grid / 우선순위 정책 안내 기본 접힘 등.

## 2026-05-28 (PR-2RR-b) — 회전 미리보기 매트릭스 통합 + 회전 방향 (forward/reverse) 컬럼

> 사용자 명령:
>   ① 「로테이션이랑 선택된 워커가 좀 같이 구성되었어야 ui도 편하고 했을건데」
>   ② 「위에 회전미리보기랑 통합구성하면되겠네요 기존 설정안에 것들 없애고」
>   ③ 매트릭스 표시 범위 = 12개월
> 진단: 박지훈 (6=L07,7=L05 기대) + 정우진 (6=L01,7=L07,8=L05,9=L01 기대) 시퀀스 모두 만족시키려면
>   회전 방향이 역순 (`baseIdx - elapsed`) 이어야 함 — 기존 정방향 (`baseIdx + elapsed`) 로는 표현 불가.

- **마이그레이션 신규** `2026-05-28_cs_shift_groups_rotation_direction.sql` —
  - `cs_shift_groups.rotation_direction VARCHAR(8) NOT NULL DEFAULT 'forward'` 추가 (멱등).
  - 'forward' (baseIdx+elapsed) | 'reverse' (baseIdx-elapsed).
  - 햇살 그룹 적용 SQL (`UPDATE ... SET rotation_direction='reverse'`) 주석 동봉.
- **수정** `auto-generate/route.ts` —
  - `GroupRow` 에 `rotation_direction?: 'forward'|'reverse'` 추가.
  - `hasGroupRotationDirection` graceful 가드 + 별도 fetch attach (기존 PR-2RR 패턴 재사용).
  - N-19-b shiftIndex 계산: `const stride = direction==='reverse' ? -elapsed : elapsed` → `((baseIdx+stride) % N + N) % N`.
- **수정** API `/shift-groups/route.ts` + `[id]/route.ts` —
  - GET list/single 응답에 `rotation_direction` 포함 (graceful).
  - ALLOWED_COLS 에 `rotation_direction` 추가 + PATCH normalize ('reverse' 외 전부 'forward').
- **신규** `_components/RotationPreviewMatrix.tsx` (290+ lines) —
  - 12개월 × N 멤버 매트릭스 셀 (cell = 시프트 코드 + 색상 배지).
  - 헤더: 시작/종료 월 input · 방향 토글 (↻ 정방향 / ↺ 역방향).
  - 워커 column header ◀▶ 버튼 (priority swap), 시프트 footer ◀▶ 버튼 (sort_order swap).
  - 시프트 색상: `cs_shift_slots.color` 가 있으면 사용 / fallback 6 색 cycle.
  - 시작 전 / 종료 후 셀은 「—」 회색 표시.
  - 모든 변경 시 즉시 매트릭스 재계산 (클라이언트 — auto-generate 공식 그대로).
- **수정** `settings/GroupEditor.tsx` —
  - `groupRotationStartMonth` / `groupRotationEndMonth` / `rotationDirection` state 신설.
  - 그룹 load 시 새 컬럼 set, save 시 payload 에 추가.
  - **멤버별 rotation_start_date / rotation_end_date input 제거** (그룹 단위 일원화).
  - 「시프트 sequence」 영역 하단 「✅ 자동 분산 안내」 박스 → **`<RotationPreviewMatrix />`** 로 교체.
  - 멤버 PATCH 의 `rotation_start_date / rotation_end_date` 강제 null (그룹 fallback 우선).
- **수정** `settings/GroupsTab.tsx` —
  - `ShiftGroup` 인터페이스에 `rotation_direction?: 'forward'|'reverse'` 추가.
  - 행의 시작~종료 input 옆에 방향 배지 (↻ / ↺) 표시 (편집은 모달 매트릭스).
- 알고리즘 변경: forward/reverse 분기 1줄만. 기존 forward 동작 무변 (default).
- 검증: tsc CallScheduler/GroupEditor/GroupsTab/RotationPreviewMatrix/auto-generate 영역 에러 0.
- 사용자 적용 순서:
  1. 마이그 SQL 실행 (rotation_direction 컬럼 추가).
  2. 그룹 편집 모달 진입 → 매트릭스로 정우진/박지훈 12개월 시퀀스 확인.
  3. 의도와 다르면 매트릭스 안: 방향 토글 / 시프트 ◀▶ reorder / 워커 ◀▶ reorder / 시작월 변경 — 즉시 미리보기 update.
  4. 저장 → 7/8/9월 schedule 재생성 → 매트릭스가 보여준 값과 실제 값 일치 확인.

## 2026-05-28 (PR-2RR) — 그룹 단위 회전 시작/종료 월 + GroupsTab 카드 → 컴팩트 리스트

> 사용자 보고: 「정우진 8월 L05·9월 L01 이 되어야 하는데 실제 8월 L01·9월 L05」.
> 진단: 멤버 `cs_group_members.rotation_start_date` 가 UI에 표출 없어 사용자 설정 못 함 → fallback `group.created_at = 2026-05-16` 으로 elapsed 계산 → 사용자 의도와 다름.
> 사용자 명령: 「그룹이 시작종료로 가야되네」, 「그룹 카드도 좀 작게해서 리스트 형식으로」, 「컬럼에 시작 종료월」, 「기존 중복되는 내용은 삭제」.

- **마이그레이션 신규** `2026-05-28_cs_shift_groups_rotation_dates.sql` —
  - `cs_shift_groups` 에 `rotation_start_date DATE NULL`, `rotation_end_date DATE NULL` 추가 (멱등).
  - 주석: NULL = group.created_at fallback / NULL = 무한.
  - 햇살 그룹 데이터 이전 SQL (시프트 sort_order swap + start_date='2026-06-01') 주석으로 동봉.
- **수정** `auto-generate/route.ts` —
  - `GroupRow` 에 `rotation_start_iso?: string|null`, `rotation_end_iso?: string|null` 추가.
  - `hasGroupRotationDates` graceful 가드 + 그룹 list 후 별도 fetch 로 attach (3개 SELECT 변형 안 건드림).
  - N-19-b fallback chain 강화: `mrot?.start_date || g.rotation_start_iso || g.created_iso || null` (3단계 우선순위).
  - endDate: `mrot?.end_date || g.rotation_end_iso || null`.
- **수정** API GET·PATCH 라우트 (`/shift-groups/route.ts`, `/shift-groups/[id]/route.ts`) —
  - GET list / GET single: `rotation_start_date` / `rotation_end_date` graceful 읽기 + 응답 포함.
  - ALLOWED_COLS 에 두 컬럼 추가 (PATCH 화이트리스트).
  - PATCH 입력 normalize: YYYY-MM (월 단위 input) → YYYY-MM-01 / YYYY-MM-DD 직접 / 빈 문자열 → NULL.
- **수정** `settings/GroupsTab.tsx` (카드 → 리스트 대대적 리팩토링) —
  - `GroupCard` → `GroupRow` (가로 컴팩트 행). `GroupGrid` (auto-fill 380px) → 단일 컬럼 테이블 + 헤더 row.
  - 컬럼: 순서(▲▼) / 그룹(이름·카테고리) / 시간·시프트 / 패턴·전략 / 멤버 / **🔄 회전 시작 ~ 종료** / 편집.
  - 회전 ON 그룹만 `<input type="month">` 시작·종료 입력 (onBlur 시 즉시 PATCH).
  - 회전 OFF 그룹은 「회전 비활성」 라벨 (자리 보존).
  - 좌측 색상 강조 바 (3px) 유지. zebra 줄무늬. 멤버 chip 영역·description 영역 제거 (편집 들어가서 확인).
  - 제거된 import: `TONE_BG`, `TONE_BORDER` (행 모드에서 chip 미사용).
  - ShiftGroup 인터페이스에 `rotation_enabled / rotation_period_kind / rotation_custom_days / rotation_start_date / rotation_end_date` 추가.
- 알고리즘 변경 없음 — fallback chain 1단계 추가만. 기존 멤버 단위 설정 (`cs_group_members.rotation_start_date`) 은 deprecate 하지 않고 override 용으로 유지.
- 검증: tsc CallScheduler 영역 에러 0. 시각 검수 — 사용자 직접 셋팅 화면 스크린샷 (배포 후 예정).
- 사용자 적용 순서:
  1. 마이그레이션 SQL 실행 (cs_shift_groups 컬럼 2개 추가).
  2. 햇살 그룹 시프트 순서 swap (L05 ↔ L07) — 마이그 파일 하단 주석 SQL.
  3. 햇살 그룹 「회전 시작」 = 2026-06 입력 (UI 또는 SQL).
  4. 7월/8월/9월 schedule 재생성.

## 2026-05-28 (MONTH-NAV + AUG-FIX) — 상세 페이지 월 이동 화살표 + 「비어있음 -28」 음수 표시 보정

> 사용자 보고:
>   ① 「8월이 좀 잘못된것같은데 그리고 의도된 생성이에요」 — 헤더 카운트 박스 「전체 279 셀 · 채움 307 · 비어있음 -28」 음수 표시.
>   ② 「몇월 근무표에서 도 이동할수있게 좌우 화살표나 월선택으로 이동할수있게 — 리스트 나가고 다시 누르고 불편하네요」.

- **AUG-FIX** — `components/ScheduleGrid.tsx:601` totalCells 계산 baseline 교체.
  - 기존: `days.length × slots.length` (= 31×9 = 279). 같은 (날짜, 시프트) 에 여러 워커 (야간 L12 부엉+달빛, 3 햇살 그룹 동일 시프트 분담 등) 시 filled > totalCells → 음수 「비어있음 -28」 사고.
  - 신: `assignments.length` — 자동 생성이 만든 실제 예상 칸 수 = KPI strip 충원율 (307/307) 과 동일.
  - 라벨: 「전체 N 셀」 → 「전체 N 칸」 (의미 명확화 — (날짜×시프트) 매트릭스 셀이 아닌 "워커 배정 칸").
- **MONTH-NAV** — `_components/MonthSwitcher.tsx` 신규.
  - GET `/api/call-scheduler/schedules` 전체 월 목록 fetch → 현재 id 기준 인접 월 계산.
  - ◀ 이전 · 「YYYY년 M월 ▼」 드롭다운 · ▶ 다음 — 헤더 좌측 (PageTitle 직 하단, status pill 옆).
  - 드롭다운: 최신 월이 위(DESC), 현재 ✓ 강조, 초안/공지/보관 상태 배지, 외부 클릭으로 닫힘.
  - `[id]/page.tsx` 헤더 「{year}년 {month}월」 정적 텍스트 → `<MonthSwitcher />` 교체.
- 알고리즘·자동 생성 로직 무변. 8월 자동 생성 결과(307/307) 자체는 정상 — 헤더 표시 공식만 보정.
- 검증: tsc CallScheduler 영역 에러 0 / 시각 검수 — 사용자 스크린샷 (8월 띄운 상태에서 「◀」 클릭 → 7월 이동 확인) 예정.

## 2026-05-26 (ROT-FIX) — 시프트 로테이션 월간 fallback (멤버 rotation_start_date NULL → group.created_at)

> 사용자 보고: 「6월·7월 근무표 시프트 로테이션 적용 안 됨」.
> 진단: `cs_group_member_rotations.rotation_start_date` 가 7명 전원 NULL → `auto-generate` N-19-b legacy path 가 `elapsed=0` 영구 → 매월 `shift[baseIdx]` 동일 → 회전 멈춤.
> 마이그 주석 의도(`NULL 이면 group.created_at 기준`)와 코드 불일치. 활성 버전 path(line 1783)는 `activeVersion.valid_from` fallback 이 있으나 legacy path 누락.

- **수정** `auto-generate/route.ts` —
  - `GroupRow` 인터페이스에 `created_iso?: string` 추가.
  - 그룹 SELECT 3개 변형(`hasSlotSafety` 분기) 모두 `DATE_FORMAT(g.created_at, '%Y-%m-%d') AS created_iso` 추가.
  - line 1850: `const startDate = mrot?.start_date || g.created_iso || null` — 멤버 NULL 시 그룹 생성일 fallback.
- monthly: `elapsed = (cur.year-start.year)*12 + (cur.month-start.month)` — 5월(group.created_at) elapsed=0 → 6월 1 → 7월 2 → 자연 매월 회전.
- 검증: ROT-FIX 푸시 후 6월/7월 schedule 재생성 → 멤버별 시프트가 월마다 1칸씩 shift 확인.

## 2026-05-24 (Phase W-1e) — 대시보드 + 스케줄 화면 날씨 위젯

> KPI 대시보드 상단에 권역별 날씨 카드 + 통합 보정율 배지. CallScheduler 「오늘」 카드 헤더에 거점 권역 날씨 인라인 표시.

- **신규** `app/(employees)/CallScheduler/_components/dashboard/WeatherWidget.tsx` —
  - `WeatherWidget` (default export): KPI 대시보드 상단 권역 카드 (default 5권역, 가중치 큰 순) + 통합 보정율 배지 (factor 1.2+ amber · 1.5+ red). fetch 실패·키 미설정 graceful (위젯 숨김 or 안내). 보정율 ≥1.2 시 「인입량 증가 예상」 안내 박스 (W-2 단계 연결).
  - `TodayWeatherBadge` (named export): 인라인 작은 배지 — 거점 권역(가중치 최대 active) 날씨 + 기온. title 속성에 권역명·설명·factor·통합값.
  - `weatherEmoji` (named export): condition_main → 이모지 매핑 (Clear/Clouds/Rain/Drizzle/Thunderstorm/Snow/Mist 등).
- **수정** `kpi/_components/KpiDashboard.tsx` — KpiPeriodPicker 상단에 `<WeatherWidget />` 렌더.
- **수정** `_components/dashboard/TodayTomorrowGrid.tsx` — `DayCard` 에 `showWeather` 옵션 prop 추가. 「오늘」만 `showWeather` true → 헤더에 `<TodayWeatherBadge />`. 「내일」은 미표시 (current API 비제공, forecast 추가 단계로 보류).
- API·DB 변경 없음. 다음: W-2 (staffing 확장 — `weather_adjusted` λ 가산 + 시간대별 알림).

## 2026-05-24 (Phase W-1d) — KPI 설정 「⛅ 날씨 기준」 섹션

> KPI 설정 탭에 5번째 섹션 추가 — 매니저가 권역·보정율 룰을 화면에서 자유롭게 추가/수정/삭제. W-1a~c API 위에 UI 얹기.

- **신규** `app/(employees)/CallScheduler/kpi/_components/WeatherConfigSection.tsx` — OpenWeather 키 상태 + 마지막 fetch 시각 / 권역 테이블(code·이름·위경도·가중치·순서·활성 인라인 편집, weight 합 100 라이브 검증, 추가/삭제) / 보정율 룰 테이블(condition_key·이름·factor·OpenWeather codes CSV·순서, 추가/삭제). bulk save 패턴 (POST + 누적 DELETE). 자체 ResultPanel.
- **수정** `KpiSettings.tsx` — 5번째 Section(⛅ 날씨 기준) JSX + `openWeather` state + `WeatherConfigSection` import. 헤더 4섹션→5섹션·인트로 텍스트 정정.
- API·DB 변경 없음 (W-1a/b/c 의존).

## 2026-05-24 (Phase W-1a + W-1b + W-1c) — 날씨 기반 인력 예측 초기 (스키마 + CRUD API + OpenWeather 어댑터·캐시)

> 설계서: `_docs/WEATHER-STAFFING-DESIGN.md`. 17 광역자치단체 + 인구비례 가중치 + OpenWeather + 1h 캐시 + Erlang C λ 가산. W-1d (설정 UI), W-1e (위젯), W-2 (staffing 확장 + 알림) 단계별 진행. W-3 (외부인력 SMS 호출) 다음 PR.

- **W-1a 마이그** `migrations/2026-05-24_cs_weather_init.sql` — 3 테이블 신설: `cs_weather_regions` (17 광역 시드, 인구비례 가중치, weight 합 100.00), `cs_weather_cache` (권역당 1행 덮어쓰기, 1h TTL, FK CASCADE), `cs_weather_factors` (보정율 10행 시드, condition_key UNIQUE). 멱등 (UNIQUE+INSERT IGNORE — 사용자 편집값 보존).
- **W-1b 권역 CRUD API** `app/api/call-scheduler/kpi/weather/regions/route.ts` — GET(`?include_inactive=1`, 가중치 합 동봉) / POST(bulk save: id→UPDATE / 없으면 INSERT, 한국 좌표 33~39°N · 124~132°E 검증) / DELETE(`?id=`).
- **W-1b 룰 CRUD API** `app/api/call-scheduler/kpi/weather/factors/route.ts` — GET / POST(bulk save, factor 0~10 검증, openweather_codes 콤마 구분 3자리 정수만 정규화) / DELETE.
- **W-1c OpenWeather 어댑터 + 캐시 GET** `app/api/call-scheduler/kpi/_lib/openweather.ts` + `app/api/call-scheduler/kpi/weather/route.ts` — OpenWeatherMap Current API 어댑터 (`WeatherSnap` 인터페이스 — 추후 기상청 어댑터 교체 호환). GET `/weather` 가 권역별 캐시(1h TTL) 우선 조회, stale/missing 시 fetch + UPSERT(`region_id` UNIQUE → DELETE+INSERT). condition_code → factor lookup → combined_factor = Σ(weight × factor)/Σ(weight) 가중평균. fetch 실패 시 stale 캐시 fallback(stale 플래그), 캐시도 없으면 factor 1.0. dry-run 200 검증 완료(서울 28.76°C / id=800).

## 2026-05-24 (Phase WHR-B2) — 상담원 ID 매칭을 워커 「편집」에 통합

> WHR-B 가 매칭을 별도 패널로 이식해 워커 목록이 위(워커 표)·아래(매칭 패널) 두 번 나옴. 같은 워커를 두 목록으로 관리하는 중복 → 워커 표 하나로 통합 (사용자 지시).

- **AgentMappingSection 재구성** — 단일 컴포넌트 → `useAgentMatching` 훅 + `MatchingTopBar`(미매칭 요약·전체 자동 매칭·일괄 저장) + `WorkerMatchEditor`(워커 편집 펼침의 per-워커 KT/Cafe24 드롭다운) + `MatchStatusDots`(행 접힘 상태 KT/C24 칩).
- **WorkersTab 통합** — 별도 매칭 패널 제거. 워커 표 상단에 `MatchingTopBar`, 각 행 이름 옆에 `MatchStatusDots`, 「편집」 펼침에 `WorkerMatchEditor` 추가. 워커 「저장」 시 정체성 + KT·Cafe24 매칭 동시 저장(`saveWorker`), 「편집」 취소 시 매칭 draft 원복(`resetWorker`).
- 워커 목록이 한 개로 통합 — 위/아래 중복 제거. API·DB 변경 없음.

## 2026-05-24 (Phase WHR-B) — KT·Cafe24 ID 매칭 UI를 「설정 › 워커」로 이동

> 워커 정체성이므로 ID 매칭도 워커 설정에 위치해야 한다는 사용자 지시 반영.

- **AgentMappingSection 독립 파일화** — `KpiSettings.tsx` 내부 함수였던 상담원 매칭 UI(워커별 KT 상담사 ID·Cafe24 접수자 드롭다운 + 이름일치 자동추천 + 「✨ 전체 자동 매칭」 + 미매칭 요약)를 `settings/AgentMappingSection.tsx` 독립 컴포넌트로 추출.
- **WorkersTab 에 패널 이식** — 워커 표 하단에 「🔗 상담원 ID 매칭」 패널로 렌더. API(`kpi/agent-mapping`)는 변경 없음.
- **KPI 설정 ④ 상담원 매칭 섹션 제거** — KpiSettings 는 4섹션(목표치·WFM·평가·근태)으로 간결화. 헤더·인트로 텍스트 정정, ⑤→④ 재번호.
- API·DB 변경 없음 (`cs_workers.kt_id`/`cafe24_user_id` 컬럼 그대로).

## 2026-05-24 (Phase WHR-A-fix) — 인사마스터 연동 대상 정정 (profiles → ride_employees)

> WHR-A 가 연동 대상을 `profiles` 로 잘못 잡음. 진단 결과 — CallScheduler 워커 16명은 `profiles` 에 없고 `ride_employees`(department='콜센터') 에 있으며, `cs_workers.employee_id` → `ride_employees.id` 연결이 16명 전원 이미 정상. WHR-A 의 `profile_id` 경로를 `employee_id` 경로로 전면 교체.

- **인사마스터 = `ride_employees`** — CallScheduler 워커의 인사 출처는 `profiles`(로그인 계정)가 아니라 `ride_employees`(Ride Inc. 직원 마스터, 콜센터 포함). 정식 연결 컬럼 = `cs_workers.employee_id` (FK `fk_cs_worker_employee`, 2026-05-03 신설, 16명 전원 채워져 있음).
- **`hr-employees` API** — `profiles` → `ride_employees` 조회로 교체. 재직자(is_active=1), 콜센터 우선 정렬, `cs_workers.employee_id` 사용 중이면 `already_linked`.
- **워커 CRUD API** — POST/PATCH 가 `profile_id` → `employee_id` 수용. `ride_employees` 에서 name/phone/email 복사, `employee_id` 1:1 중복 409 거부. GET 이 `employee_id` 반환(WorkersTab 이 `/api/ride-employees` 와 클라이언트 조인), profiles JOIN 제거.
- **WorkersTab / EmployeePickerModal / types** — 직원 선택·연결이 `employee_id` 전송. 행 이름·부서·직급은 ride_employees 조인값 사용. 「인사 미연결」 판정은 `employee_id` 기준. `Worker` 타입에서 `profile_name/department/position` 제거, `employee_id` 추가.
- **마이그레이션** — `migrations/2026-05-24_ride_employees_dedup.sql`(신규): `ride_employees` 콜센터 중복 정리(48행 → 16행) — 비활성 중복 32행 삭제(활성 정본·cs_workers 연결행 보존, 1093 회피 파생테이블 래핑, 멱등). `2026-05-24_cs_workers_profile_backfill.sql`(폐기): 잘못된 타깃 — git rm.

## 2026-05-24 (Phase WHR-A) — 워커↔인사마스터 연동 (직원 선택 생성 + profile_id 백필)

- **신규 API** — `GET /api/call-scheduler/hr-employees`: `profiles(is_active=1)` 직원 목록(id·name·phone·department·position) 반환, `cs_workers.profile_id` 사용 중인 직원은 `already_linked: true`. 정렬 = CX팀 우선 → 이름순. 부서 하드 필터 없음(프론트 검색).
- **워커 CRUD API** — POST 가 `profile_id` 수용: profiles 에서 name/phone/email 복사(단일 출처), 같은 profile_id 가 이미 워커면 409 거부. PATCH 가 `profile_id` 수용(레거시 워커 인사 연결) — 연결 시 name/phone/email 동반 갱신, 1:1 중복 거부. GET 이 profile 정보(profile_name·department·position) graceful JOIN.
- **WorkersTab UI** — 자유 입력 「+ 워커」 폐기 → 「+ 워커 (직원 선택)」 버튼이 `EmployeePickerModal`(신규) 열어 인사마스터 직원 선택. 이름/부서 검색, `already_linked` 직원은 회색 「이미 등록」. 워커 행 이름은 인사마스터 출처(읽기전용), `profile_id` NULL 레거시 워커는 「⚠ 인사 미연결」 배지 + 「👤 직원 연결」 버튼(같은 모달 link 모드).
- **마이그레이션** — `migrations/2026-05-24_cs_workers_profile_backfill.sql`: `profile_id` IS NULL 워커를 profiles 와 이름 정확 일치 + 해당 이름의 활성 profile 이 정확히 1명일 때만 연결. 동명이인 skip, 멱등, 1:1 보장. 검증 SELECT 주석 포함.

## 2026-05-24 (Phase N-74) — 그룹·워커 기본 색상 베이스

- 시프트는 N-73 에서 색상(카테고리 기본색 + ShiftsTab 선택)을 가졌으나 워커·그룹은 `color_tone` 기본값이 'none'(회색)이라 기본 색이 없었음. 마이그레이션 `2026-05-24_cs_default_colors.sql` — `cs_workers`·`cs_shift_groups` 의 'none' 행에 14색 팔레트를 이름순 순환 배정(멱등 — 'none' 만 대상이라 사용자 지정·기존 색 보존). 이제 그룹·워커·시프트 세 항목 모두 기본색 베이스를 갖고, 각 설정 탭(WorkersTab·GroupEditor·ShiftsTab)에서 직접 변경 가능.

## 2026-05-23 (Phase N-72-fix) — 대시보드 기준 시각 이중 보정 수정

- N-72 에서 백엔드 KST 보정은 맞았으나 `meta.now_iso` 까지 보정된 `now` 를 내보내 프론트가 또 KST 변환 → 표시 시각 +9h(예: 10:05 → 19:05). `now_iso` 를 실제 instant(`nowReal`)로 분리 — 백엔드 계산용 `now`(KST 값)와 표시용 `now_iso`(실제 instant)를 구분.

## 2026-05-23 (Phase N-73) — 시프트 색상 추가

- **마이그레이션** — `migrations/2026-05-23_cs_shift_slots_color.sql` 로 `cs_shift_slots` 에 `color_tone VARCHAR(16) DEFAULT 'none'` 추가. 카테고리별 기본색 자동 부여(주간 day→sky / 저녁 evening→orange / 야간 overnight→indigo). 멱등.
- **타입** — `ShiftSlot` 인터페이스에 `color_tone: ColorTone` 추가 (워커·그룹과 동일 14색 팔레트).
- **ShiftsTab UI** — 시프트 편집 폼에 14색 선택기 + 라벨 미리보기 추가, 목록 표에 「색상」 컬럼(dot + 라벨) 추가. WorkersTab 색상 편집 UX 와 동일. 신규 시프트에서 '없음' 선택 시 저장 시점에 카테고리 기본색 자동 적용.
- **API** — `shift-slots` GET/POST + `shift-slots/[id]` PATCH 가 `color_tone` 읽기/쓰기 (graceful 컬럼 detection, 허용값 14색 외 'none' 강제). `schedules/[id]` 상세 응답 슬롯에 `color_tone` 포함.
- **그리드 반영** — `ScheduleGrid` 의 시프트 행 헤더(코드+시간 라벨)를 슬롯 `color_tone` 으로 틴트, `DayView` 타임라인 슬롯 막대 + 슬롯 카드 좌측 보더/코드를 슬롯 색으로 반영. 워커 색은 셀쪽 유지 — 슬롯 색은 행 헤더쪽으로 역할 분리.

## 2026-05-23 (Phase N-72) — 운영 대시보드 버그 2건 수정

- **JOIN 중복** — `dashboard` route 의 `fetchDay`·어제야간 쿼리가 `LEFT JOIN cs_shift_groups`(슬롯↔그룹 1:N)로 워커 칩을 그룹 수만큼 복제(L02 ×3, L13 ×6). 그룹명을 스칼라 subquery(`LIMIT 1`)로 바꿔 1배정=1칩 보장 — 「오늘/내일/지금 일하는 사람」이 근무표 그대로 표시.
- **시간대 버그** — 서버 TZ(Cloud Run UTC)에서 `now.getHours()` 가 9시간 어긋나 09:51 인데 00:51 로 계산 → 20:30~08:30 야간조가 "지금 일하는 사람"으로 오표시. `getTimezoneOffset()` 기반 보정값으로 KST 고정(UTC 서버 +9h / KST 서버 0).

## 2026-05-23 (Phase CX-KPI-21) — 알리고 SMS 근무표 배포

- 알리고 헬퍼 `lib/aligo.ts` — `sendMass`(다건 발송)·`aligoConfigured`·`isValidPhone`·`normalizePhone`·`ALIGO_MAX_RECIPIENTS`. ALIGO_API_KEY/ALIGO_USER_ID/ALIGO_SENDER 환경변수 기반, testmode 지원.
- 발송 API `POST /api/call-scheduler/schedules/[id]/distribute` — body `{ mode:'preview'|'test'|'send' }`. preview=수신자/메시지 목록만, test=알리고 testmode 무과금 검증, send=실제 발송 + `cs_distributions` 이력 기록. 워커 `view_token` 멱등 생성, 직원별 메시지(근무일수·첫근무일·본인 일정 공개 링크) 빌드, 잘못된 전화번호 제외·보고.
- 모달 UI `_components/DistributeModal.tsx` 신규 — 열릴 때 `mode:'preview'` 자동 호출 → 요약 pill(총/발송가능/전화번호오류) + 수신자 표(이름·전화번호·근무일·메시지 펼침). `aligo_configured===false` 면 빨강 안내 + 발송 버튼 비활성. 「🧪 테스트 발송」(무과금)·「📤 실제 발송」 버튼, 실제 발송은 인라인 글래스 확인 패널("N명 실제 발송 — 과금됩니다") 한 번 더 거침(confirm() 미사용 — 규칙 20). 발송 결과는 글래스 패널(result_code/success_cnt/error_cnt/testmode). 전화번호 오류 행 빨강 강조 + "발송 제외" 표기. 색상 전부 COLORS/GLASS/BTN 토큰.
- `[id]/page.tsx` 그리드 상단 툴바 「⚡ 배포」 옆에 「📤 문자 배포」 버튼 추가 — 배정 시프트 없으면 비활성.

## 2026-05-23 (Phase CX-KPI-20) — 직원 근무표 공개 페이지 (토큰 링크)

- 마이그레이션 `2026-05-23_cs_workers_view_token.sql` — `cs_workers.view_token`(UUID 32자 hex) 컬럼 + UNIQUE 인덱스. 기존 워커 토큰 일괄 채움(멱등).
- 공개 페이지 `app/call-scheduler/[token]/page.tsx` 신규 — 직원이 로그인 없이 토큰 링크로 본인 월 근무표 조회. 서버 컴포넌트(prisma 직접 조회, 별도 API 없음). 월 네비(이전/다음달 ?ym=), 요약(근무일·총배정), 일별 근무 목록(날짜·요일·시프트·시간·근무구분 배지), 모바일 우선 글래스 레이아웃. 유효하지 않은 토큰·빈 월 안내 포함. 다음 PR(CX-KPI-21) 알리고 SMS 가 이 링크를 직원별 발송.

## 2026-05-23 (Phase CX-KPI-19) — 상담원 ↔ Cafe24 접수자 3자 연동

- 마이그레이션 `cs_workers.cafe24_user_id` 추가 — 콜센터 워커 ↔ Cafe24 접수자 코드 연결(사고·긴급출동 접수 귀속용). KT ID(`kt_id`) 와 별개 축.
- `kpi/agent-mapping` route 확장 — GET 응답에 `cafe24_users[]`(aceesosh∪acrotpth 최근 180일 접수자 코드별 건수 + picuserm 이름)·`cafe24_ok`·`workers[].cafe24_user_id`·`cafe24_matched_count`·`unmatched_cafe24[]` 추가. POST body 의 각 mapping 이 `kt_id`+`cafe24_user_id` 양쪽 처리(컬럼별 중복 배정 차단). Cafe24 미연결 시 graceful 빈 배열.
- `KpiSettings.tsx` 「상담원 매칭」 섹션(`AgentMappingSection`) UI 확장 — draft 를 `draftKt`/`draftCafe24` 둘로 분리. 워커 행을 2줄 구성(KT 행 + Cafe24 행)으로 바꿔 식별자 드롭다운·이름 일치 추천 배지·매칭 상태를 각 축마다 표시(KT=블루 배지, Cafe24=바이올렛 배지). 「전체 자동 매칭」을 KT·Cafe24 양쪽에 동일 로직(이름 일치 + 데이터 최다 우선) 적용, 저장 시 `kt_id`+`cafe24_user_id` 둘 다 전송하고 결과 패널에 KT·Cafe24 연결 건수 함께 표기. 미매칭 요약 줄·미사용 식별자 안내를 KT/Cafe24 각각 표시. `cafe24_ok===false` 면 Cafe24 드롭다운 disabled + 상단 amber 안내(KT 매칭은 정상 유지). 색상 전부 `COLORS`/`GLASS`/`BTN` 토큰.

## 2026-05-23 (Phase CX-KPI-18) — WFM 필요인원 재설계 (요일×인터벌 히트맵)

- `kpi/staffing` route 재작성 — 24시간 일렬 배열(`hourly[]`) 대신 **(요일 × 30/60분 인터벌) 격자**(`grid[]`, 7×`buckets_per_day` 셀)를 반환. `cs_call_records` 를 `WEEKDAY()`+`start_time` 의 실제 시·분으로 집계(가짜 균등분할 제거), `(요일,버킷) 평균 콜 = 합 ÷ 해당 요일 일수`. overnight 시프트는 다음날 요일로 spill. 응답에 `dow_days[]`(요일별 일수)·`buckets_per_day`·`peak_dow`/`peak_bucket`/`short_cells`/`active_cells` 추가.
- `KpiStaffing.tsx` 재작성 — 기간 픽커·산정 기준 줄·목표SL 패널·시프트 카드는 유지하고 새 계약 필드로 이식(`shifts` 의 `reason` 제거 → `shortage` 인원수만 표시). 5 스탯 카드는 `peak_required`(피크 요일·HH:MM subValue)·`short_cells`/`active_cells`·`total_calls`·`sum_required`/`sum_scheduled`·`interval_minutes` 로 교체.
- 「⏰ 시간대별 막대 표」를 **「🔥 요일×시간대 과부족 히트맵」**으로 교체 — 행=발생 요일(`dow_days[dow]>0`)·열=버킷 0..`buckets_per_day-1`. 셀 16×16px 정사각형(`overflow-x:auto` 가로 스크롤), 색은 `required=0`→회색·`diff<0`→`COLORS.danger`·`diff≥0`→`COLORS.success` 에 격차 비례 `opacity`(0.30~1.0). 상단 시각 라벨은 2시간 간격(60분=짝수 버킷·30분=4의 배수 버킷)만 표기, 셀 `title` 호버에 콜·필요·배정·과부족 상세, 하단 범례 한 줄. `COLORS`/`GLASS` 토큰만 사용.

## 2026-05-23 (Phase CX-KPI-17) — 커스텀 평가 항목

- 마이그레이션 2종 — `cs_kpi_eval_items`(매니저가 만드는 평가 항목: 이름·설명·만점·가중치·정렬·사용여부) + `cs_kpi_eval_scores`(상담원×항목×기간 점수). 계산지표(`cs_kpi_eval_weights`)와 별개의 정성 평가 축.
- API 3종 — `kpi/eval-items`(GET 목록 / POST 생성·수정 / DELETE), `kpi/eval-scores`(GET 기간별 항목·워커·점수 / POST 점수 일괄 저장). `kpi/evaluation` route 확장 — 응답에 `custom_items[]` + 각 agent 의 `custom_scores{item_id: {score,norm}|null}` 추가, 종합점수에 커스텀 항목 가중 반영.
- UI 2곳 — ① `KpiSettings`「🏅 평가 항목·가중치」섹션에 `CustomItemsManager` 추가: 커스텀 항목 목록·추가/수정 폼·인라인 삭제 확인·사용여부 토글, `_migration_pending` amber 배너, `ResultPanel` 글래스 결과. ② `KpiEvaluation` 에 `CustomScorePanel`(L4 접이식 글래스) 추가: 행=상담원·열=항목 점수 입력표, `eval-scores` GET 으로 초기값 채움 → POST 저장 → `evaluation` 재조회로 종합점수 갱신. 직접범위 모드는 입력 비활성+안내, 평가 테이블에 항목별 `✏` 점수 컬럼(전 컬럼 sortBy), `custom_items` 0개면 「⚙ 설정」 유도 안내.

## 2026-05-23 (Phase CX-KPI-16) — KPI 기간 선택 개선 (프리셋+이전/다음+직접범위)

- `kpi/_components/KpiPeriodPicker.tsx` 신규 — CX KPI 5개 탭이 공유하는 공용 기간 선택 컴포넌트. 프리셋(일/주/월) + ◀ 이전/다음 ▶ 네비게이션(일=±1일·주=±7일·월=±1개월) + 「직접」 모드(시작~종료 범위 입력, ◀▶ 는 범위 길이만큼 함께 이동, 시작>종료 자동 보정). `KpiPeriod` 타입 + `periodQuery()` 헬퍼 export — 프리셋이면 `?granularity=&date=`, 직접범위면 `?from=&to=`. 주는 월요일 시작. `COLORS`/`GLASS` 토큰만 사용.
- `KpiDashboard`/`KpiStaffing`/`KpiEvaluation`/`KpiAttendance`/`KpiData` — 각자의 인라인 기간 토글 바를 `<KpiPeriodPicker>` 로 교체. `granularity`/`date` 개별 state → `KpiPeriod` 단일 state. fetch URL 의 `?granularity=X&date=Y` → `?${periodQuery(period)}`. KpiDashboard 의 Cafe24 패널(`loadCafe24`)도 동일 period 반영.
- `kpi/evaluation` route — `from/to` 쿼리 지원 추가(`resolveRange` 후 `if (fromParam && toParam)` override, `prodLabel` 은 `from` 의 YYYY-MM). `kpi/staffing`·`kpi/data-status` route — `from/to` override 분기 추가. `dashboard`/`attendance`/`cafe24-intake` 는 이미 지원(확인).

## 2026-05-23 (Phase CX-KPI-15) — 근무시간 그룹 시간겹침 중복 합산 수정

- `lib/cs-shift-hours.ts` 신규 — 근무시간 union 계산 공용 모듈(`timeToMinutes`/`slotInterval`/`unionIntervals`/`workHoursByWorker`). 한 사람이 하루 여러 시프트(부엉 20:30~08:30 + 달빛 19:00~23:00)를 맡으면 시간이 겹치는데, `SUM(computed_hours)` 는 겹친 시간을 중복 합산(부엉12h+달빛4h=16h, 실제 19:00~08:30 13.5h). 슬롯 구간을 합집합으로 계산해 겹친 시간 1회만 집계.
- `kpi/dashboard` route ③ 근무 지표 — `SUM(computed_hours)` → `cs_shift_slots` JOIN 후 `workHoursByWorker` union 계산으로 교체. work_days 는 distinct (worker,date) 수 유지.
- `kpi/evaluation` route ③ 근무시간 — 동일 union 방식으로 교체. 평가 종합점수의 `work_hours` 지표가 겹침 미반영 정확값.
- `kpi/attendance` route — 직전 PR(CX-KPI-14)의 인라인 union 함수를 `lib/cs-shift-hours` 공용 모듈로 이관 — 3개 route 단일 소스(규칙 14).

## 2026-05-23 (Phase CX-KPI-14) — 근태 (지각·조퇴) 체크

- 마이그레이션 `2026-05-23_cs_kpi_attendance_config.sql` — 근태 판정 유예시간 1행 설정 테이블(`grace_minutes`, 기본 0분). 멱등(NOT EXISTS 가드).
- API `kpi/attendance-config` (GET/POST) 신규 — 유예시간 조회/저장. 단일 행 upsert, 0~120분 클램프. 테이블 미적용 시 `_migration_pending` graceful.
- API `kpi/attendance` (GET) 신규 — 근무표 예정 시각(`cs_shift_slots`) ↔ KT 생산성 실측 로그인/로그아웃(`cs_agent_productivity` daily) 매칭으로 지각·조퇴 산출. 매칭: `cs_assignments`→`cs_shift_slots`(예정) + `cs_assignments.worker_id`→`cs_workers.kt_id`→`cs_agent_productivity`(period_label=work_date). **그룹 시간 겹침 처리** — 한 사람이 하루 여러 슬롯(부엉+달빛)이면 슬롯 구간을 union 으로 계산(겹침 중복 제거), 지각=가장 이른 시작·조퇴=가장 늦은 종료 기준 1회 판정. 정시 ±grace 이내 정상. overnight(20:30~08:30)은 평면 TIME 비교(login_first 저녁/login_last 아침). cs_agent_productivity 는 별도 쿼리 후 TS 에서 kt_id join — collation mismatch 회피. 전 쿼리 graceful try/catch.
- 「🕐 근태」 탭 신설(`kpi/page.tsx`, KpiTab 'attendance') + `KpiAttendance` 컴포넌트 — 일/주/월 토글, DcStatStrip 5카드(근무일·지각·조퇴·정상·미집계), NeuDataTable 워커별 표(전 컬럼 sortBy), 「지각·조퇴 상세」 적발 일자 표(예정 vs 실측 + 판정 배지). daily 생산성 없음·마이그레이션 미적용·빈 상태 안내 포함.
- `KpiSettings` 에 5번째 섹션 「🕐 근태 기준」(`AttendanceConfigSection`) — 유예시간(분) 편집, 기본 0분. 저장 결과 글래스 패널(규칙 20).
- ⚠ 알려진 검증 항목: KT 가 야간(overnight) 근무 생산성을 시작일/종료일 어느 날짜 행에 기록하는지 — 배포 후 야간조 실데이터로 확인, 어긋나면 overnight 만 work_date 보정.

## 2026-05-23 (Phase CX-KPI-13) — Cafe24 사고·긴급출동 접수량 통합

- API `kpi/cafe24-intake` (GET) 신규 — Cafe24 ERP(read-only) 에서 일별 접수 건수 시계열. 사고 접수(`acrotpth`, `otptmddt`, `otptrgst='R'`) / 긴급출동 접수(`aceesosh`, `esosmddt`, `esosrgst='R'`) 각각 별도 `GROUP BY` 집계. 취소건('C') 제외 — 유효 접수만(사용자 명시). granularity(일/주/월)·date·from/to 로 범위 산정, 빈 날(0건)도 시계열 포함. 대시보드 본체와 분리된 독립 엔드포인트 — 느린 외부 DB 가 KPI 대시보드 로딩을 막지 않도록. graceful try/catch(Cafe24 미연결 시 `cafe24_ok:false`). MariaDB 10.1 호환 — COUNT/CHAR_LENGTH/BETWEEN/GROUP BY 만.
- `KpiDashboard` 에 「📥 Cafe24 접수 업무량」 패널 추가 — `kpi/cafe24-intake` 독립 호출(외부 DB 격리), 사고/긴급출동 합계 + 범례, 일별 스택 컬럼 차트(`DayColumns` — 사고 아래/긴급출동 위, 호버 시 날짜·건수). Cafe24 미연결·빈 기간 안내 포함. 새로고침 버튼이 본체와 함께 재호출.
- 상단 5번째 스탯 카드 — 기존 `cafe24_ok` 분기('접수 건수' vs '로그인 시간')를 항상 '로그인 시간' 으로 단순화. Cafe24 접수량은 전용 패널이 사고/긴급출동 분리·일별로 표시 → 카드 중복·라벨 혼선 제거(규칙 12 정합성).
- 테이블 매핑(사고=`acrotpth`, 긴급출동=`aceesosh`) 은 cafe24-dispatch-requests 진단 조사 결론 기반. 배포 후 실데이터 일별 숫자로 검증 — 어긋나면 두 쿼리 테이블만 교체.

## 2026-05-23 (Phase CX-KPI-12) — 상담원 매칭 설정

- `KpiSettings` 에 4번째 접이식 섹션 「🔗 상담원 매칭」 추가 — KT 엑셀 상담사 ID(`agent_kt_id`) ↔ 콜센터 워커(`cs_workers`) 직접 연결. 워커별 KT ID 드롭다운(표기: `이름(kt_id)·데이터 N건·활성`), 이름 일치 활성 ID 자동 추천 배지·「전체 자동 매칭」, 미매칭 워커/미사용 KT ID 빨강 강조 + 상단 "미매칭 N건" 요약. 같은 kt_id 화면상 단일 배정 보장.
- API `kpi/agent-mapping` (GET/POST) 신규 — GET: `cs_call_records` ∪ `cs_agent_productivity` distinct `agent_kt_id` 별 행수·대표이름·활성여부 + `cs_workers`(is_active=1) 현재 매칭 + matched_count/unmatched_kt. POST: `{mappings:[{worker_id,kt_id}]}` → `cs_workers.kt_id` UPDATE, 같은 kt_id 중복 배정 차단(입력 검증 + 새 배정 시 그 kt_id 쓰던 다른 워커 자동 해제). 전 쿼리 graceful try/catch.

## 2026-05-23 (Phase CX-KPI-11) — 데이터 검수·관리 탭

- `kpi/page.tsx` 에 「📁 데이터」 탭 신설(KpiTab 'data'). 업로드된 KT 베이스 데이터(4개 소스: cs_call_records / cs_agent_productivity / cs_response_ivr / cs_response_queue)가 「전체 다 들어왔는지 / 중복은 없는지 / 며칠치 기준인지」 를 검수·관리.
- API `kpi/data-status` (GET/DELETE) 신규 — GET: `?granularity=day|week|month&date=` 기준 소스별 총 행수·충족율(데이터 있는 날짜÷기간 일수)·빠진 날짜(최대 31)·날짜별 행수·전체 데이터 범위(min~max)·중복 안전(COUNT(*) vs COUNT(DISTINCT UNIQUE키)) 반환. 생산성은 daily 기준 충족율 + monthly 행수 별도. 전 소스 graceful try/catch(미적재 시 available:false). DELETE: `?source=&from=&to=` — source 화이트리스트 검증 후 소스별 고정 쿼리(테이블명 보간 X)로 날짜 BETWEEN 행 삭제, 삭제 건수 반환.
- `KpiData` 컴포넌트 신규 — 일/주/월 토글, 상단 DcStatStrip 5카드(평균 충족율·적재 소스·총 행수·중복 의심·빠진 날짜), 소스 4개 카드(충족율 막대 90%녹/50%노랑/미만빨강·중복 안전 배지·데이터 기간). 카드 펼침 시 날짜별 행수 표(중앙값 대비 급감 이상치 빨강 강조) + 빠진 날짜 목록. 「기간 데이터 삭제」 는 글래스 확인 모달(confirm() 금지 — 규칙 20) → DELETE → 새로고침. 빈 상태 안내 포함.

## 2026-05-23 (Phase CX-KPI-10) — KPI 설정 통합 + 페이지 좌측정렬

- KPI 페이지(`kpi/page.tsx`) 공통 래퍼의 `maxWidth:1100`·`margin:'0 auto'` 제거 → 좌측정렬·전체 폭 사용. 탭 바 `flexWrap` 추가로 좁은 폭 반응형. 내부 컴포넌트 grid 는 `minmax()` auto-fit/fill 유지로 그대로 반응형.
- 흩어져 있던 KPI 설정성 항목(목표치·WFM 산정기준·평가 가중치)을 「⚙ 설정」 탭 한 곳에 통합. 기존 「🎯 목표」 탭 제거 — 목표치는 설정 탭 1섹션으로 흡수.
- `KpiSettings` 컴포넌트 신규 — 접이식 3섹션: ① 목표치(`KpiTargets` 그대로 렌더) ② WFM 산정 기준(`kpi/wfm-config` 폼 — KpiStaffing 인라인 패널 이식) ③ 평가 항목·가중치(`kpi/eval-weights` 편집 — 지표별 사용 체크박스 + 가중치% 입력, 사용항목 합 표시). 저장 결과는 글래스 패널(규칙 20).
- API `kpi/eval-weights` (GET/POST) 신규 — `cs_kpi_eval_weights` 전체 행 반환(미적재 시 기본 4지표 + `_migration_pending`). POST 는 metric 단위 UPDATE(UNIQUE metric).
- `kpi/evaluation` route — 하드코딩 `WEIGHTS` 상수를 `cs_kpi_eval_weights` DB 조회(`loadWeights()`)로 교체. 테이블 미적재/빈 경우 기본 상수 graceful fallback. `enabled=0` 지표는 가중치 0 → 평가 제외(가중치 비례 재분배 로직 유지).
- `KpiStaffing` — 인라인 `⚙ 산정 기준` 편집 패널 제거(요약 줄은 유지). 편집은 「⚙ 설정」 탭으로 안내.

## 2026-05-22 (Phase CX-KPI-9) — 상담원 종합 평가 탭

- `kpi/page.tsx` 에 「🏅 평가」 탭 신설. 상담원별 종합 점수·팀 내 순위·강점/약점을 한 화면에서 확인.
- API `kpi/evaluation` (GET) 신규 — `?granularity=day|week|month&date=`. dashboard route 와 동일 소스(cs_call_records / cs_agent_productivity / cs_assignments) + 동일 법정검사 제외 필터. 평가 지표 4개(통화량·AHT·후처리이석비율·근무시간)를 팀 내 min~max 0~100 정규화(AHT·이석은 역방향) 후 가중 평균(35/30/15/20). 데이터 없는 지표는 평가 제외·가중치 비례 재분배. 팀 평균 대비 ±10% 편차로 강·약점 산출, 종합 점수 desc 순위.
- `KpiEvaluation` 컴포넌트 신규 — 일/주/월 토글, DcStatStrip 5카드(팀 평균/인원/최고·최저/편차), NeuDataTable 평가 표(전 컬럼 sortBy, 종합점수 색상 우수/보통/미흡, 강·약점 배지). 가중치 공개 안내·빈 상태·부분 데이터 안내 포함.

## 2026-05-22 (Phase CX-KPI-8) — 법정검사 제외 + WFM 기준 명확화 + 부족 사유

- KT 계정 공용으로 섞이던 「법정검사」 데이터를 CX KPI 집계 SQL 단계에서 완전 제외. `kpi/dashboard`·`kpi/staffing` route 의 모든 관련 쿼리에 `LEGAL_KEYWORD='%법정검사%'` LIKE 필터 일관 적용 — cs_call_records(department/center/type1/type2), cs_agent_productivity(department), cs_response_queue(skill), cs_response_ivr(scenario). CX 데이터(메리츠캐피탈·사고접수 등)는 보존.
- `KpiStaffing` 상단에 WFM 산정 기준 요약 줄 상시 표시 — 목표 응대율·목표 응대시간·부재율·평균 AHT·산정 단위 (펼치지 않아도 보임). `SummaryChip` 신규.
- `kpi/staffing` route 의 `shifts[]` 에 `shortage`(부족 인원)·`reason`(사유) 필드 추가. 사유 분류: 시프트 피크 필요가 평균 대비 20%+ 높으면 「인입량 과다」, 아니면 「배정 부족」. 승인된 회피(cs_group_member_skip_dates)·휴가(cs_leaves) 건수를 graceful 조인으로 동반 표시. `KpiStaffing` 시프트 카드에 🔴부족 시 사유 한 줄 노출.

## 2026-05-22 (Phase CX-KPI-7) — KT 엑셀 다중 업로드 + 자동 종류 판별

- `kpi/page.tsx` 업로드 탭 개편 — 「종류 선택 → 파일 1개」 단일 업로드를 다중 업로드로 대체. `<input multiple>` + 드래그앤드롭으로 4종 엑셀을 한 번에 업로드.
- 자동 종류 판별 2단계: 1차 파일명 패턴(상담이력/생산성/응대현황+IVR/큐), 2차 헤더 컬럼(콜키·상담사명(ID)·착신전화번호+시나리오명·스킬+서비스레벨(%)). 판별 실패 시 파일별 「종류 직접 선택」 드롭다운.
- 파일별 미리보기 카드 — 파일명·자동 판별 종류 배지(판별 방식 표기)·행수·기간·매칭 요약. 「전체 적용」 버튼 1개로 각 파일을 맞는 API(`upload-call-records`/`upload-productivity`/`upload-response`)에 mode:'apply' POST(Promise.all). 결과는 글래스 패널(규칙 20).
- 4종 업로드 API 는 수정 없이 재사용. response API 만 body 에 `kind` 분기.

## 2026-05-22 (Phase CX-KPI-6) — 응대현황 (IVR + 큐)

- KT 응대현황(IVR)·응대현황(큐) 2종 엑셀 업로드 추가 (migrations: 2026-05-22_cs_response.sql — cs_response_ivr / cs_response_queue).
- API `kpi/upload-response` (POST) — `{kind:'ivr'|'queue', mode, rows}`. preview/apply + INSERT ON DUPLICATE KEY UPDATE (멱등). 「합계」·날짜 파싱 실패 행 skip.
- `kpi/page.tsx` 업로드 탭에 「응대현황(IVR)」·「응대현황(큐)」 종류 추가 + ResponsePreview.
- `kpi/dashboard` — cs_response_queue/ivr 집계 추가 (응대율·포기율·서비스레벨·평균대기). KpiDashboard 응대현황 3카드 + 스킬별/시나리오별 드릴다운 표.
- `kpi/staffing` — 실제 서비스레벨(cs_response_queue 가중평균) 추가. KpiStaffing 「목표 SL vs 실제 SL」 비교 패널 (미달 시 빨강).
- 응대현황 미적재 시 graceful — 기존 화면 유지, 새 지표만 「—」.

## 2026-05-21 (Phase CX-KPI-5) — KPI 화면 영어 라벨 한글화

- KpiDashboard/KpiStaffing 의 영어 콜센터 약어 라벨 한글화:
  AHT → 평균 처리시간, IB → 수신, OB → 발신 (라벨·서브값·표 헤더).
- 변수명·코드 식별자·KT 데이터 키는 영어 유지 (표시 텍스트만 변경).

## 2026-05-21 (Phase CX-KPI-4) — 목표 설정 + 달성률

- KPI-DESIGN.md §5-3 / §3-3 / §6 의 목표 설정 구현 (CX KPI 마지막 조각).
- API: `kpi/targets` (GET/POST) — cs_kpi_targets CRUD. GET ?year=&month= 로
  team+agent scope 행 반환. POST 는 (scope, worker_id, metric, period_kind,
  year, month) 키로 SELECT 후 UPDATE/INSERT 분기 (테이블 UNIQUE 없음). 빈/0
  목표치는 해당 행 DELETE. metric 4종 = call_count/aht/login_sec/work_hours.
  모든 쿼리 graceful try/catch (cs_kpi_targets 미적재 시 빈 결과).
- 화면: `/CallScheduler/kpi` 에 「🎯 목표」 탭 신설 (KpiTargets.tsx) — 연·월 +
  일/주/월 단위 선택, 팀 목표 4지표 입력, 상담원별 목표 표(선택). 저장 결과는
  글래스 패널 메시지 (규칙 20 — alert 금지).
- KpiDashboard: 로드 시 kpi/targets 동시 fetch. 상단에 「통화량 달성률」 카드
  추가, 상담원 테이블에 「목표 달성률」 컬럼(개인 목표 우선, 없으면 팀 목표
  fallback) 추가. 달성 녹색/근접 노랑/미달 빨강, AHT 는 역방향. 목표 미설정 시 「—」.

## 2026-05-21 (N-58) — 대시보드/월별스케줄 탭 분리 + 설정 단순화

- 대시보드 page.tsx 의 「월별 스케줄」 NeuDataTable 섹션을 신규 탭
  `/CallScheduler/schedules` 로 분리 (fetch/컬럼 로직 그대로 이전). 대시보드
  탭은 KPI/현황 카드 1~7 만 표시.
- SubNav: 「📅 월별 스케줄」 탭 추가. 대시보드는 정확히 `/CallScheduler` 일
  때만 활성, `/schedules`·`/new`·`/[id]` 상세는 월별 스케줄 탭 활성.
- PageTitle: `/CallScheduler/schedules` (이름 「월별 스케줄」) 등록.
- 설정 단순화: 공통 `InfoLine` 컴포넌트 (한 줄 요약 + ⓘ 펼침) 신설.
  HolidaysTab·WorkersTab 의 여러 줄 안내 박스를 InfoLine 으로 축소,
  ShiftsTab 안전가드/가산율 박스 부제·간격 압축, GroupEditor 「우선순위
  정책」 7단계 explainer 를 기본 접힘으로 전환. 기능·입력 필드 불변.

## 2026-05-21 (Phase CX-KPI-3) — WFM 필요인원 (Erlang C)

- KPI-DESIGN.md §5-4 의 필요인원 산정 구현 (물량예측 §5-5 는 제외).
- `lib/erlang-c.ts` — Erlang C 순수 함수 엔진 (erlangC / serviceLevel /
  requiredAgents). 검증: 100콜/시간·AHT 180초·목표 80/20 → 8명 (업계 표준 일치).
- API: `kpi/staffing` (GET) — 시간대별 콜 인입량 λ + AHT → Erlang C →
  시간대별 필요인원. 배정(커버) 인원 = cs_assignments × cs_shift_slots
  (긴 시프트가 커버하는 모든 시간대 +1 — 가변 근무시간 반영). 시프트별
  과부족(🔴부족/🟢적정/🟡과잉). `kpi/wfm-config` (GET/POST) — 산정 기준 CRUD.
- 화면: `/CallScheduler/kpi` 에 「🧮 필요인원 (WFM)」 탭 — 시간대별 필요 vs
  배정 막대 표 + 시프트 과부족 카드 + 기준 인라인 편집.

## 2026-05-21 (Phase CX-KPI-2) — CX KPI 대시보드

- KPI-DESIGN.md §5-2 / §6 의 통합 KPI 대시보드 구현 (WFM·물량예측은 후속).
- API: `kpi/dashboard` (GET) — granularity(day/week/month)+date 로 통화
  (cs_call_records) · 생산성 (cs_agent_productivity is_active=1) · 근무
  (cs_assignments JOIN cs_workers) 를 상담원 단위로 통합. summary +
  byClient(캐피탈사) + byType(유형) 드릴다운 동봉. 모든 소스 graceful try/catch.
  Cafe24 접수건수는 선택 — `cafe24Db.count` aceesosh 조회, 실패 시 0.
- 화면: `/CallScheduler/kpi` 에 「📊 KPI 대시보드」 탭 추가 (기존 업로드 탭 유지).
  일/주/월 토글 + 날짜 선택, DcStatStrip 5카드, NeuDataTable 상담원별
  (전 컬럼 sortBy — 규칙 18), 캐피탈사/유형 분포 막대, 빈 상태 안내.
- 신규 컴포넌트: `kpi/_components/KpiDashboard.tsx`.

## 2026-05-21 (Phase CX-KPI-1) — KT 통화 데이터 엑셀 업로드

- KPI-DESIGN.md §5-1 / §6 의 업로드 기능 구현 (대시보드·WFM 은 후속).
- API: `kpi/upload-call-records` (KT 상담이력 → cs_call_records, INSERT IGNORE),
  `kpi/upload-productivity` (KT 생산성 → cs_agent_productivity, ON DUPLICATE UPDATE),
  `kpi/template` (업로드 양식 안내 다운로드).
- 화면: `/CallScheduler/kpi` 신규 — 파일 종류 선택 → 클라이언트 xlsx 파싱 →
  preview(매칭/기간/중복 요약) → apply. SubNav 에 「📈 CX KPI」 탭 추가.
- 상담원 매핑: agent_kt_id → cs_workers.kt_id → 실패 시 name 매칭 (graceful).

## 2026-05-20 (Phase N-72) — P2 로테이션 = 그룹 멤버 순서

### 배경
N-71 후 사용자: "패턴은 맞는데 그룹 로테이션 순서가 안맞아요".
N-69 클러스터 그리디가 공통 cursor 로 배정 → 그룹 멤버 순서를 무시.

### 해결 — 그룹별 cursor (멤버 순서 기준)
- 클러스터 공통 cursor 폐기 → `groupCursor` (그룹별)
- 각 그룹은 자기 `p2Members` (멤버 등록 순서) 대로 라운드 로빈
- 같은 날 충돌 시에만 다음 사람으로 skip (안전망 유지)
- 운영자가 그룹 편집기 멤버 순서로 로테이션 순서 직접 제어

### 검증 (시뮬레이션 — 부엉[윤민진,전유하,전정연]/달빛[전정연,전유하,윤민진])
- 부엉 6월 30칸 사용자 정답지와 완전 일치
- 달빛도 일치 (25~28 은 패턴 일관 유지 — RR 정상 연속)
- cover 5건 (6/6·20·21·23·24) 정답지대로

---

## 2026-05-20 (Phase N-71) — cover = 옆그룹 당일 근무자 (정답지 기반)

### 배경
N-70 (어제 근무 P2 1일 연장) 도 틀림 — 3일 연속근무 발생.
사용자가 6월 전체 정답지 (60칸) 제공. 5개 cover 케이스 전부
한 규칙으로 설명됨:
  cover = 「그날 옆그룹에서 일하는 사람」 (정동민이든 P2든)
  그 사람이 그날 두 그룹 다 맡음 = 추가 근무 (근무 길어질 뿐 근무일 X)
검증: 부엉6/6 전유하휴가→달빛 윤민진 / 부엉6/20 정동민회피→달빛 전유하
     달빛6/21 정동민회피→부엉 전유하 / 부엉6/23 전정연휴가→달빛 윤민진
     부엉6/24 전정연휴가→달빛 정동민 — 전부 옆그룹 근무자

### 해결 — whoWorksClusterPeer + 분기 2/4 교체
- `clusterPeersMap` — 그룹 → 같은 클러스터 옆그룹 ids
- `whoWorksClusterPeer(gId, isoDate)` — 옆그룹의 그날 근무자 판정
  · 옆그룹 P1 cycle 근무일 & 미결원 → P1(정동민)
  · 아니면 → 옆그룹 사전 계산 P2 (그 P2 도 결원이면 다음 peer)
- [분기 2] P1 회피 → cover = whoWorksClusterPeer (N-70 어제연장 폐기)
- [분기 4] P2 회피/휴가 → cover = whoWorksClusterPeer
- 처리 순서 무관 — 사전 계산표 직접 조회 (workedToday 의존 X)

### 효과
- cover 는 옆그룹 근무자의 추가 근무 → P2 cycle 절대 안 건드림
- 3일 연속근무 0 / 정상 패턴 틀어짐 0
- cover 날만 한 사람이 두 그룹 (의도된 추가근무)

### 검증 (시뮬레이션 — 회피 6/20·21 + 휴가 6/6·23·24)
정상블록 3일연속 0건, 회피일 cover 만 doubled (전유하 6/20·전정연 6/21)

---

## 2026-05-20 (Phase N-70) — 회피일 cover = 어제 근무 P2 추가근무

### 배경
부엉(20:30~08:30) · 달빛(19:00~23:00) 시프트 시간이 겹침.
정동민 회피 시 cover 를 「그날 옆 그룹 근무자(coverWorkingToday)」로 잡으면
한 사람이 시간 겹치는 두 시프트를 동시에 근무 = 물리적 불가.
(6/20 부엉 cover 로 달빛의 윤민진이 들어가 양쪽 중복으로 표시됨)

### 해결 — 분기 2/4 cover 로직 교체
- [분기 2] P1(정동민) 회피일 cover:
  · `coverWorkingToday` (옆 그룹 근무자) 폐기
  · cover = 어제 이 그룹 P2 (`precomputed.get(어제)`) 의 「추가 근무」 1일 연장
  · 어제 P2 가 없거나 오늘 다른 그룹 근무 중이면 → 그날 쉬는 P2 (workedToday 미포함)
- [분기 4] 사전 계산 P2 가 회피/연차:
  · `coverWorkingToday` 폐기 → 그날 쉬는 P2 로 대체
  · selectedViaCover X → 대체 사유 whyWorkerOut(planned) 로 정확 표기

### 검증 (정동민 회피 6/20~21 — 시뮬레이션)
- 6/20 부엉: 정동민 회피 → 6/19 부엉 근무한 윤민진이 1일 연장 cover
- 6/21 달빛: 정동민 회피 → 6/20 달빛 근무한 전유하가 1일 연장 cover
- 같은 날 부엉·달빛 충돌 0건 / P2 출근 전정연16·윤민진16·전유하15

---

## 2026-05-20 (Phase N-69) — 클러스터 조율 P2 사전 계산 (두 그룹 충돌 0)

### 배경
N-68 (그룹별 사전 계산) 배포 후에도 부엉·달빛 결과 꼬임.
실 셋팅 확인: 부엉(20:30~08:30)·달빛(19:00~23:00) 두 그룹이
**같은 P2 풀(윤민진·전유하·전정연)을 공유** + 시프트 시간 겹침 + 겹침허용 ON.
N-68 사전 계산표는 그룹별로 따로 계산 → 서로 모름 → 같은 날 같은 사람 동시 배정
(6/3·7·11·19·23 …). N-63~68 은 전부 「한 그룹 안」만 봄.

### 해결 — 클러스터 단위 사전 계산
- cycle-P1 그룹들을 P2 풀(멤버 집합) 시그니처로 묶어 **클러스터** 구성
- P2 자리 = P1(정동민) cycle 근무일 아닌 날 (`!isWorkDayByCyclePattern` — cycle 시작 전 포함)
- 각 그룹 P2 자리를 연속 구간 → `period`(2일) 블록으로 분할
- 블록을 (시작일, 그룹순서) 정렬 → 라운드 로빈 배정
- **그리디 충돌 회피**: 같은 날 다른 그룹에 이미 배정된 사람이면 다음 사람으로 skip
- N-68 `p2SlotOrdinal` 순수 함수 폐기 (블록 알고리즘으로 대체)

### 사용자 결정 (N-69)
정동민 사이클 오프셋 탓에 「연속 2일」 + 「매월 정확 균등」 동시 불가.
→ **연속 2일 블록 우선** 선택 ("매월 정확 균등은 지킬 수 없죠")

### 검증 (부엉·달빛 6월 — 시뮬레이션)
- 같은 날 충돌 **0건** — 부엉·달빛 항상 다른 사람
- 전원 한 그룹에서 2일 연속 블록 (월말 1일 잔여는 다음 달로 연속)
- 6월 P2 출근수 윤민진 16·전유하 15·전정연 14 (다음 달 cursor 연속 → 상쇄)

---

## 2026-05-20 (Phase N-68) — P2 배정 사전 계산 (cursor 깨짐 원천 차단)

### 배경
N-63~67 cursor 8회 fix 후에도 회피일 부근 cursor 어긋남 반복.
근본 원인: 일자 루프 안 실시간 cursor 추적이 회피/cover/cycle 조합에 구조적으로 취약.

### 해결 — cursor 폐기, 사전 계산표
일자 루프 **전에** 그룹별 P2 배정표를 미리 계산.
- `p2SlotOrdinal(pattern, isoDate)` — P1(정동민) cycle 휴무일에 0,1,2,… 전역 순번 부여 (날짜 → 순번 순수 함수)
- P2 자리 = P1 cycle 휴무일 → `floor(ord / period) % p2Members.length` 라운드 로빈
- `p2PrecomputedMap: Map<groupId, Map<isoDate, workerId>>`

### priority 분기 (사전 계산표 그룹)
1. P1 cycle 근무일 + P1 후보 → P1
2. P1 cycle 근무일 + P1 결원(회피/연차) → cover/임시 (사전 계산표 영향 X)
3. P2 자리 + 계획 워커 정상 → 계획 워커
4. P2 자리 + 계획 워커 회피/연차 → cover/대체 (계획 점유자 자리 안 밀림)

### 효과
- 회피/cover **어떤 조합도** P2 cycle 안 깨짐 — 날짜만 알면 워커 확정 (월 경계 무관 연속)
- 「근무자가 스케줄 미리 파악」 = 사전 계산표 그 자체
- 정상 P2 출근은 대체 마킹 X — 계획 점유자 불일치 시만 사유 표시 (matrix 깔끔)
- cycle-P1 없는 그룹은 기존 cursor 분기 그대로 유지

### 검증 (부엉 6월)
6/2~3 전정연 · 6/5~6 윤민진 · 6/7~8 전유하 · 6/10~11 전정연 … 완전 균등 순환
6/20 정동민 회피 → cover 채움, P2 표 무변동 (6/21~22 윤민진 그대로)

---

## 2026-05-19 (Phase N-67) — P1 결원 cursor 정지 + cover 마킹 정확화

### SQL 분석
부엉 6/2~19 라운드 로빈 완벽 ✓ 그러나:
- 6/20 정동민 회피일에 P2 cursor 1칸 소비 → 6/22 어긋남
- 6/19 cover_added 잘못 마킹 (P2 cursor 정상 진입인데)

### 수정 A — P1 결원 = cursor 정지
```ts
const p1ShouldWorkToday = p1Members.some(p1Id => {
  const wcp = memberWorkCycleMap.get(`${g.id}_${p1Id}`)
  return wcp ? isWorkDayByCyclePattern(wcp, isoDate) : false
})
const p1Vacant = p1ShouldWorkToday && !p1InCandidates
```
- 정동민 cycle 근무 phase 인데 회피/연차로 빠짐 = P1 결원
- [분기 2-N67] cover 또는 P2 임시 채움
- **p2CursorMap / prev 갱신 X** → P2 cursor 정지
- 정동민 회피일도 「정동민 자리」 로 취급 → P2 흐름 안 깨짐

### 수정 B — cover_added 마킹 정확화
- `selectedViaCoverGroup` 플래그 — 실제 cover 분기 진입 시만 true
- plan.push 시 selectedViaCoverGroup=true → cover_added
- 아니면 determineSubstitution (workedToday 인자 생략 → cover 자동 마킹 비활성)
- 자기 그룹 P2 cursor 정상 진입은 cover_added 마킹 X

### 알고리즘 분기 (최종 4)
1. P1 후보 → P1 (cycle 정상)
2. **P1 결원** (cycle 근무인데 회피) → cover/임시, cursor 정지
3. prev P2 cursor (period_days 연속)
4. 새 P2 cursor (라운드 로빈)

---

## 2026-05-19 (Phase N-66-algo2) — P2 cursor 라운드 로빈 (멤버 등록 순서)

### 사용자 지적
> "로테이션 패턴이 있는데 last_date 를 왜 찾나"
> "그거 이제 안 합니다. 패턴 고정이라"

### 변경 (N-66-algo 의 단순화 후속)
last_date 정렬 폐기 → **멤버 등록 순서 기반 round-robin cursor**

```ts
// 그룹별 p2CursorMap 추적
const p2CursorMap = new Map<string, number>()

// 새 P2 cursor 분기:
const p2Members = gMembers.filter(isP2Strict)  // priority ASC 순서
const startCur = p2CursorMap.get(g.id) ?? 0
for (let i = 0; i < p2Members.length; i++) {
  const idx = (startCur + i) % p2Members.length
  const wId = p2Members[idx]
  if (candidates.includes(wId)) {
    candidate = wId
    nextCursor = (idx + 1) % p2Members.length
    break
  }
}
```

### 효과
- 멤버 등록 순서 그대로 cursor 돈다 (사용자 의도)
- counter / last_date 가드 제거 → 단순 명료
- 「로테이션 주기 N일」 셋팅의 정확한 구현

### 예: 부엉 P2 = [전정연, 윤민진, 전유하] (등록 순)
```
6/2~3  전정연 (cursor 0)
6/5~6  윤민진 (cursor 1)
6/7~8  전유하 (cursor 2)
6/10~11 전정연 (cursor 0 — 라운드 로빈)
6/13~14 윤민진
6/15~16 전유하
...
```

각자 매월 약 8일 균등 출근 (cycle 휴무 빼고).

---

## 2026-05-19 (Phase N-66-algo) — P2 cursor 알고리즘 분기 단순화 (5→3)

### 사용자 보고
> "안 잡히네" — fix5 push 후에도 6/10 = 전정연 (윤민진 와야)

### 분석
5 분기 (P1 / cover / prev / p2Short / else) 가 엇갈리며 cursor 깨짐:
- fix4 의 else 분기가 작동 안 함
- p2Short / N-46 / cover 분기들이 cursor 분기를 가로채

### 수정 — 3 분기로 단순화

**[분기 1] P1 우선**
```ts
if (p1InCandidates) selectedList = candidates.slice(0, need)
// prev 갱신 X (P2 cursor 위치 유지)
```

**[분기 2] prev P2 cursor (period_days 내)**
```ts
else if (prev && prev.dayInPeriod < period && candidates.includes(prev.worker_id)) {
  selectedList = [prev.worker_id, ...]
  prev.dayInPeriod++
}
```

**[분기 3] 새 P2 cursor**
```ts
else {
  if (ownP2Candidates.length >= need) {
    // 자기 P2 충분 → counter + last_date 정렬
    selectedList = ownP2 정렬 후 slice
  } else if (coverWorkingToday.length > 0) {
    // 자기 P2 부족 → cover 진입
  } else {
    // fallback
  }
}
```

### 효과
- N-46 분기 제거 (P3 cov 는 fallback 에서 candidates 정렬로 자연 처리)
- cover 진입 조건 명확화: 자기 P2 부족 시만
- cursor 깨짐 방지: prev 또는 ownP2 정렬 둘 중 하나로 결정

### 기대 결과 (부엉 6월)
```
6/1  정동민
6/2~3  윤민진 (cursor 1)
6/4  정동민
6/5~6  전유하 (cursor 이동 — counter+last_date 정렬)
6/7~8  전정연 (cursor 이동)
6/9  정동민
6/10~11 윤민진 (last_date 6/3 가장 오래)
6/12 정동민
6/13~14 전유하
6/15~16 전정연
...
```

---

## 2026-05-19 (Phase N-65-fix5) — p2Short 가 P1 제외 (cursor 분기 진입)

### 데이터 분석 (fix4 push 후 SQL)
```
6/2~3 윤민진  ← cursor 1
6/5~6 전정연  ← cursor 2
6/7~8 전유하  ← cursor 3
6/10~11 전정연  ← 또 전정연! 윤민진이 와야 (last_date 가장 오래)
6/13~14 전유하
6/15  윤민진  ← 이제야
```

### 원인
fix4 의 새 cursor 분기가 작동 안 함.
실제로 N-46 분기 (P2 결원 P3 cov) 로 빠짐:
```ts
const isP2 = (wId) => priority_level <= 2  // P1 도 포함!
p2TotalMembers = 4명 (정동민 P1 + P2 3명)
정동민 cycle 휴무 phase (월 75%) → p2AvailableNow=3 → p2Short=1
→ N-46 분기 진입 → fix4 안 탐 → candidates 가중치 정렬 → by_dow 가드로 전정연 우선
```

### 수정 (auto-generate route)
`p2Short` 계산은 P2 만 카운트:
```ts
const isP2Strict = (wId) => priority_level === 2  // P2 만
const p2TotalMembers = gMembers.filter(isP2Strict)
```

### 효과
- 정동민 cycle 휴무 phase 라도 p2Short = 0
- fix4 새 cursor 분기 정상 진입 → last_date 가장 오래된 P2 우선
- 자연 순환: 윤민진 → 전유하 → 전정연 → 윤민진 → ...

---

## 2026-05-19 (Phase N-65-fix4) — P2 cursor 동률 시 last_date 가드 (균등 순환)

### 사용자 보고
> "패턴 출발이 아직 조금 이상합니다. 싸이클이 틀어지네요"

매트릭스 실측 (부엉 6월 초 2주):
- 윤민진: 3일 (적음)
- 전정연: 4일
- 전유하: 4일

cursor 동률 시 정렬 결과 → 전정연/전유하 자주, 윤민진 후순위

### 원인
새 P2 cursor 시 `candidates.slice(0, need)` 사용 → candidates 의 가중치 정렬이 by_dow 가드 (N-27) 영향
- counter 동률 시 「같은 요일 자주 안 들어간 사람」 우선
- last_date 가드는 더 뒤 → 묻힘

### 수정 (auto-generate route)
새 P2 cursor 결정 시 **명시적 정렬**:
```ts
const p2Pool = candidates.filter(wId => !isP1(wId))
p2Pool.sort((a, b) => {
  if (cnA.total !== cnB.total) return cnA.total - cnB.total  // counter 적은 우선
  return aLast.localeCompare(bLast)  // last_date 오래된 사람 우선
})
selectedList = p2Pool.slice(0, need)
```

### 효과
- P2 들 자연 순환: 윤민진 → 전유하 → 전정연 → 윤민진 → ...
- 매월 균등 분배 보장

---

## 2026-05-19 (Phase N-65-fix3) — cover 조건을 ownShort 로 + UI 빨간 테두리 무시

### 사용자 보고
> "다 했습니다. 그래도 적용 안 됍니다"

매트릭스 거의 모든 셀에 🤝 + 빨간 테두리 여전.

### 원인
`p2Short` 계산이 `isP2 = priority_level <= 2` → **P1 도 포함**.
정동민 (P1) cycle 휴무 phase (월 75%) 마다 → p2Short ≥ 1 → 매일 cover 진입.

### 수정 (auto-generate route)
`p2Short` → `ownShort` 로 교체:
```ts
const ownCandidates = candidates.filter(wId => gMembers.includes(wId))
const ownShort = Math.max(0, need - ownCandidates.length)
```
- 자기 그룹 후보가 need 못 채울 때만 cover 진입
- 정동민 cycle 휴무 phase 라도 P2 3명 있으면 need=1 채워짐 → cover X
- 회피일/연차로 자기 멤버 더 빠져서 need 못 채울 때만 cover 진입

### UI 수정 (AssignmentCell)
- `substitution_reason === 'cover_added'` 셀은 `time_conflict` 빨간 테두리 무시
- 의도된 추가 근무이므로 시간 충돌 가드 = 시각 노이즈 제거

### 알고리즘 우선순위 (최종)
1. P1 자기 그룹 (cycle 정상)
2. **ownShort > 0** + cover 후보 → cover 진입 (진짜 결원)
3. prev P2 cursor (period_days, cycle 정상)
4. 자기 P2 / P3 cov / 기타

---

## 2026-05-19 (Phase N-65-fix2) — cover 우선을 「P2 결원 시」 만 작동

### 사용자 보고
> "왜 전부다 악수가 됐지"

매트릭스 거의 모든 셀에 🤝 cover_added 마커 + 빨간 테두리 (시간 충돌) 표시.
자기 P2 cursor 가 작동 안 함.

### 원인
N-65-fix 의 알고리즘 순서:
1. P1 후보 → 정동민
2. cover + workedToday → 매일 우선 ← 문제
3. prev P2 cursor (안 들어감)
4. P3 cov / 기타

cover 가 P2 cursor 보다 먼저 → 매일 같은 사람이 두 그룹 동시 진입 → cycle 깨짐

### 수정
cover 진입 조건에 **`p2Short > 0`** 추가
- 자기 그룹 P2 결원 발생 시에만 cover 우선
- 평상 시 (자기 P2 충분) 은 prev cursor → 정상 cycle 분배

### 알고리즘 순서 (수정 후)
1. P1 자기 그룹 (cycle 정상)
2. **P2 결원 + cover 후보** → cover 진입 (사용자 의도)
3. prev P2 cursor (period_days)
4. 자기 P2 / P3 cov / 기타

---

## 2026-05-19 (Phase N-65-fix) — cover self-filter 제거 (멤버 동일 그룹 작동)

### 사용자 보고
> "결원시 동일날 옆그룹에서 커버는 아닌걸로 오이네 패터이 변경되는것보니"

### 원인
N-65 의 `coverWorkingToday` 필터에 `!gMembers.includes(wId)` 가드
→ 자기 그룹 멤버 제외 → 부엉/달빛 같이 멤버 동일이면 cover 후보 0

### 수정 (auto-generate route)
1. `coverWorkingToday` 필터에서 self filter 제거
   - 이전: `!gMembers.includes(wId) && coverWorkerSet.has(wId) && workedToday.has(wId)`
   - 변경: `coverWorkerSet.has(wId) && workedToday.has(wId)`
2. `determineSubstitution` 시그니처에 `workedTodaySet` 인자 추가
3. cover 진입 판단 조건 확장:
   - A. cover_pairs 매핑 + workedToday (이미 다른 그룹 일함 → 추가 근무)
   - B. 자기 그룹 멤버 아님 (외부 cover — 멤버 다른 경우)

### 효과
- 멤버 동일 그룹 (부엉/달빛) 에서 cover 정상 작동
- 결원 시 다른 그룹 일하는 사람이 추가 근무로 cover
- 자기 그룹 P2 cycle 흐름 보호

### 운영 검증
정동민 6/20 회피일 결원 시점:
- 부엉 처리 (먼저): 정동민 빠짐 → cover 후보 비어있음 (workedToday 비어있음) → P2 진입
- 달빛 처리: workedToday 에 부엉 selected 추가됨 → cover 후보 진입 가능

⚠ 한계: 첫 처리 그룹은 cover 작동 X (순서 의존). 향후 2-pass 알고리즘 필요 (N-67).

---

## 2026-05-19 (Phase N-66-a + N-66-b) — 매트릭스 검수 모드 + 라벨 자연어화

### 사용자 요청
> "전체적으로 심플하고 단순하게 ux ui 설정 설명 단어선택도 쉽게"
> "직관적 한눈 + 상세는 접기" + "검수와 디테일 필요한 부분"

### N-66-a — 매트릭스 검수 모드 (ScheduleGrid)
- **detailMode** 상태 추가 ('detail' | 'review')
  - 디폴트 'detail' (현재 풀 컬러)
  - 'review' 모드: 정상 셀 opacity 0.25 (회색) + 결원/회피/cover 셀만 풀 컬러
- 매트릭스 상단 토글 버튼: `📋 상세 모드` ↔ `🔍 검수 모드`
- localStorage 로 사용자 선택 유지
- 「이상한 셀만」 한눈에 검수 가능

### N-66-b — 라벨 자연어화 (GroupEditor)
주요 라벨 「개발 용어 → 운영 자연어」:

| Before | After |
|---|---|
| 휴일 처리 | 🎌 공휴일 처리 |
| 다른 그룹 겹침 | 🤝 다른 그룹 추가 근무 허용 |
| 공휴일 추가 출근 | 🎉 공휴일에도 출근 |
| 하루 인원 (rotation 시) | 👥 하루 N명 |
| 로테이션 주기 (일) | ⏱ 한 사람 연속 N일 |
| 전원 동시 | 👥 모두 매일 출근 |
| 로테이션 | 🔄 순환 배정 |
| P1 최우선 | ⭐ 1순위 (P1) |
| P2 일반 | 👤 2순위 (P2) |
| P3 백업 | 💤 백업 (P3) |
| 🆘 휴가 커버 순위 | 🆘 결원 시 투입 순서 |
| C1 1순위 | 🔴 결원 시 1순위 |
| ⚖️ 그룹 분배 비율 | ⚖️ 이 그룹 출근 비율 |

### 효과
- 운영자가 옵션 의미 한 번 보고 파악 가능
- 검수 모드로 「대체된 셀」 한눈에 검수
- 매트릭스 사이즈 그대로지만 인지 부담 ↓

### 다음 (예고)
- N-66-c: 그룹 편집기 카드 그리드 + 5탭 modal
- N-66-d: 설정 ↔ 운영 분리 (메뉴 구조)
- N-66-e: Preset (24/365 콜센터 등)
- N-66-f: 인라인 도움말 ⓘ

---

## 2026-05-19 (Phase N-64 + N-65) — 대체 내역 상단 토글 + cover 우선 (cycle 보호)

### 사용자 의도
> "그냥 그당일근무자가 추가근무를 해서 싸이클패턴을 안바꾸려고 하는거"
> "근무자가 스케줄을 미리 파악할수있게 고정으로"
> "매트릭스이름에서 어떻게 변경되었는지 바로 접거나"

운영 모델 확정:
- 평소: 부엉/달빛 cycle 패턴 고정 (P2 들 cycle 안 깨짐)
- 결원 시: 다른 그룹의 「당일 cycle 정상 근무자」 가 추가 근무로 임시 cover
- 자기 그룹 P2 의 차례를 침범하지 않음 (cycle 보호)

### N-65 — 알고리즘 변경 (auto-generate)
- **cover 멤버 + workedToday 가 자기 그룹 P2 보다 우선** (우선순위 역전)
- 우선순위:
  1. P1 자기 그룹 (cycle 정상)
  2. cover 그룹 멤버 + 오늘 그 그룹에 일하는 사람 (추가 근무, cycle 영향 X)
  3. 전일 P2 prev (N-63 period_days)
  4. 자기 그룹 P2 / P3 (cycle 영향)
  5. cover 멤버 X workedToday (다른 그룹 안 일하는 사람)

### substitution_reason 'cover_added' 추가
- determineSubstitution 이 cover 그룹 멤버 진입 감지 → reason='cover_added'
- substituted_for_worker_id = 자기 그룹의 빠진 사람

### N-64 — 매트릭스 상단 「📋 대체 N건 ▼」 토글
- 매트릭스 헤더의 view 토글 옆에 노란 배지 버튼
- 클릭 시 하단 「📋 대체 내역」 패널로 부드러운 자동 스크롤
- substitution 0건이면 버튼 미표시

### UI 마커 추가
- AssignmentCell: 🤝 (cover_added) 아이콘 추가
- SUB_REASON_META 에 cover_added 등록 (success 색)

### 효과
- 자기 그룹 cycle 패턴 안정 (P2 들의 일자 고정)
- cover 그룹 cycle 근무자가 결원 시 추가 근무로 cover
- 운영자가 cover/대체 내역 한눈에 매트릭스 상단 배지로 확인

### 운영 셋팅 필수 (사용자 직접)
- 부엉/달빛 그룹 「🔀 같은 날 다른 그룹과 겹침 허용」 ON
  ```sql
  UPDATE cs_shift_groups SET allow_same_day_other_group = 1
  WHERE name IN ('부엉', '달빛') AND is_active = 1;
  ```

---

## 2026-05-19 (Phase N-63) — Priority 모드에서 rotation_period_days 지원

### 사용자 발견
> "한사람이 2일씩 정동민제외 나머지분들은 적용이 안되고잇네요"
> "로테이션 주기를 2일로 해놨는데"

### 원인
- usePriority=true (디폴트) 모드: 매일 가중치 정렬 → cursor 무관 → 매일 다른 사람
- rotation_period_days 셋팅은 usePriority=false 모드에서만 작동
- 결과: 매일 윤민진 → 전유하 → 전정연 (period_days 무시)

### 변경 (auto-generate route)
**prevDaySelectedMap** — 그룹별 「전일 P2 selected + dayInPeriod」 추적

알고리즘 순서:
1. **P1 (정동민) 후보 있나?** → 있으면 P1 선택 (cursor 무관, P2 prev 갱신 X)
2. **전일 P2 워커가 후보 + dayInPeriod < period 면** → 그 워커 우선 (연속 N일)
3. **P2 결원 (N-46)** → P3 cov 우선 + 새 P2 cursor 시작
4. **나머지** → 가중치 정렬 + 새 P2 cursor 시작

### 효과
- 정동민 cycle 근무 phase = 정동민 (P1)
- 정동민 휴무 phase = P2 한 사람 2일씩 (rotation_period_days 적용)

### 운영 예시 (period=2)
```
6/1  정동민   (P1 cycle 근무)
6/2  윤민진   (P2 cursor 시작, day 1/2)
6/3  윤민진   (day 2/2)
6/4  정동민   (P1 cycle, prev P2 dayInPeriod 정지)
6/5  전유하   (P2 cursor 이동, day 1/2)
6/6  전유하   (day 2/2)
6/7  전정연   (P2 cursor 이동)
6/8  전정연
6/9  정동민   (P1 cycle 반복)
...
```

---

## 2026-05-19 (Phase N-62) — 매트릭스 카테고리/그룹 헤더 좌측 sticky 축소

### 사용자 요청
> "카테고리 그룹에 그룹이 위에 계속 나오니 리스트가 길어지는데 좌측으로 놓던가"

### 문제
- 카테고리 헤더 (야간/고정/로테이션/주말) + 그룹 헤더가 매번 풀 row 차지
- padding 8px + fontSize 13px → 세로 공간 낭비
- 한 화면에 보이는 데이터 양 ↓

### 변경 (ScheduleGrid.tsx)
1. **카테고리 헤더**
   - 좌측 sticky 컬럼만 카테고리 라벨 표시 (icon + 이름)
   - 우측 일자 컬럼들은 카테고리 색 얇은 띠 (height 8px)
   - padding 8px → 2px, fontSize 13 → 11

2. **그룹 헤더**
   - 좌측 sticky 컬럼만 「🚧 그룹명 · N명」 표시
   - 우측 일자 컬럼들은 헤더 색 얇은 띠 (height 6px)
   - padding 6px → 2px, fontSize 12 → 11

### 효과
- 카테고리/그룹 헤더 row 의 세로 공간 약 50% 축소
- 한 화면에 더 많은 슬롯 row 표시 가능
- 좌측 라벨은 가독성 유지

---

## 2026-05-19 (Phase N-61) — 대체 내역 추적 (셀 마커 + 펼침 패널)

### 사용자 요청
> "매트릭스도 어떤사유 휴가나,회피 기타이유등으로 변경대치 된사항도 보여야하지않나요"

### 데이터 모델 (마이그: 2026-05-19_cs_assignments_substitution.sql)
- `cs_assignments.substitution_reason` VARCHAR(64) NULL
- `cs_assignments.substituted_for_worker_id` CHAR(36) NULL

reason 종류 (자동 생성 시 알고리즘이 결정):
- `group_skip` — 회피일 (글로벌 또는 그룹별)
- `work_cycle_off` — 비균등 cycle 휴무 phase
- `leave` — 연차/휴가
- `max_days` — 월 최대 일수 도달
- `consec` — 연속 한도 도달
- `slot_blocked` — 슬롯 거부
- `cycle_external` — 외부 cycle 근무 (당사 X)

### 변경
1. **알고리즘 (auto-generate route)**
   - `determineSubstitution()` helper — 매 (group, worker, date) 처리 시
     "원래 P1 우선이었지만 빠진 사람" 추적
   - PlanRow 에 substitution_reason / substituted_for_worker_id 메타 추가
   - INSERT 후 `applySubstitution()` 으로 별도 UPDATE (graceful)

2. **API (`/api/call-scheduler/schedules/[id]`)**
   - 응답 assignments[] 에 substitution_reason / substituted_for_worker_id 포함 (graceful)

3. **UI (AssignmentCell)**
   - 셀 안 워커 이름 앞에 사유 마커 표시 (⚠ / 🔁 / 🏖 / 🚫 / 📅 / ⛔ / 🌐)
   - 셀 hover 시 「원래 정동민 (회피일) 대체」 같은 tooltip

4. **UI (ScheduleGrid)**
   - 매트릭스 하단 「📋 대체 내역 (N건)」 펼침 패널 추가
   - 날짜순 표: 날짜 / 원래 워커 / 대체 워커 / 사유 배지
   - reason 별 카운트 요약

### 마이그 적용 필수
- `migrations/2026-05-19_cs_assignments_substitution.sql`

---

## 2026-05-19 (Phase N-60) — 회피일 전역 적용 (group_id NULL = 글로벌)

### 사용자 정책
> "그룹별을 없애고 직원요청으로 통합했으니 전역셋팅으로 휴가,회피일 모두 적용되어야합니다."

### 데이터 모델 변경 (마이그: 2026-05-19_cs_skip_dates_global.sql)
- `cs_group_member_skip_dates.group_id` → NULL 허용
- 기존 행 모두 `group_id = NULL` 로 UPDATE (글로벌 전환)
- 의미: `group_id = NULL` = 모든 활성 그룹 적용 (글로벌)
- 호환: 특정 ID 셋팅 시 기존 그룹별 동작 유지

### 변경
1. **API** — `POST /api/call-scheduler/skip-dates` (글로벌 등록) 추가
   - group_id = NULL 로 INSERT
   - 매니저 직접 등록 = 즉시 승인 (status=approved)
2. **알고리즘** (auto-generate route)
   - globalSkipRows 별도 보관
   - 모든 그룹 가드에 globalSkipRows 자동 추가
   - skipsForGroup = [그룹별 + 글로벌] 통합 검사
3. **UI** (requests/page.tsx)
   - 회피일 등록 시 그룹 chip 선택 UI 제거
   - 「🌐 전역 회피일 — 모든 활성 그룹 자동 제외」 안내 배너
   - 워커 + 일자 + 사유만 입력 → 글로벌 API 호출

### 효과
- 정동민 회피일 1건 등록 → 부엉/달빛 모두 자동 제외
- 사용자가 그룹별 셋팅 안 해도 「당일 종일 OFF」 동작

### 마이그 적용 필수
- `migrations/2026-05-19_cs_skip_dates_global.sql`

---

## 2026-05-18 (Phase N-59) — 같은 이름 그룹 dropdown 에 시프트 정보 표시

### 사용자 결정
> "UX 개선 OK"
>
> 햇살 (L01) / 햇살 (L02) / 햇살 (L03) 같이 같은 이름이지만 다른 시간대로 운영되는
> 그룹이 다수 존재. 매니저가 회피일/cover-pair 등록 시 어느 「햇살」 인지 헷갈림.

### 변경
1. **GroupEditor cover-pairs dropdown**
   - 현재: 「햇살」 「햇살」 「햇살」
   - 개선: 「햇살 (L01 07:30~16:30) [로테이션]」 같이 시프트 정보 + 카테고리

2. **requests 페이지 회피일 등록 그룹 chip**
   - 같은 이름 그룹 chip 에 시프트 시간 + 카테고리 배지 추가
   - 「🚧 햇살 · L01 07:30~16:30 [로테이션]」

### 동형 패턴 적용 (Rule 14)
- GroupEditor cover-pairs ✓
- requests/page.tsx 회피일 등록 ✓
- (TBD) 향후 다른 그룹 선택 UI 발견 시 동일 적용

---

## 2026-05-18 (Phase N-58) — limit 컬럼 0 → NULL 정규화

### 사용자 보고
> "빈 칸이면 미설정이죠 0이 되면 안 되죠"
>
> 정동민 max_days_per_month=0 인 상태에서 자동 생성 → 매월 1회만 출근
> (06-01 만 진입, cycle 1,2,1,4 작동했지만 max 가드가 0 으로 첫 출근 후 매번 제외)

### 원인
- 옛 마이그/초기 데이터로 cs_workers.max_days_per_month=0 누적
- UI 「빈 칸 = 무제한」 안내지만 DB 에 0 들어가면 알고리즘이 「최대 0일」 로 해석
- 같은 부류: max_consecutive_work_days / min_days_per_month
- 같은 부류 영역: cs_group_members.max_days_per_month / max_consecutive_work_days (N-14 동형)

### 변경
1. **마이그** (2026-05-18_cs_limits_zero_to_null.sql)
   - cs_workers / cs_group_members 의 limit 컬럼 0 → NULL UPDATE
   - DEFAULT NULL 보장 (이미 NULL 이면 no-op)

2. **알고리즘 방어** (auto-generate route.ts)
   - max_days_per_month 가드: `> 0` 추가 (0 이면 NULL 처럼 통과)
   - max_consecutive_work_days: 기존부터 `> 0` 가드 있음 (확인)
   - min_days_per_month shortfall: `> 0` 가드 추가

3. **API 정규화** (workers PATCH / members PUT)
   - 입력 0 또는 음수 → NULL 변환 (`nullableLimit` 헬퍼)
   - 사용자 빈 칸 의도와 일치

### 효과
- 옛 데이터의 max_days=0 도 무제한 동작 (regression 방지)
- 새 입력 0 도 안전하게 NULL 로 정규화

### 마이그 적용 필수
- `migrations/2026-05-18_cs_limits_zero_to_null.sql`

---

## 2026-05-18 (Phase N-56-b) — work_cycle_pattern 워커→멤버 레벨 이동

### 사용자 결정
> "워커 로 불규칙 셋팅하면 안되고 그룹으로 해야할것같은데
>  정동민은 부엉이,달빛 둘다 들어가고 패턴은 같지만 출발일을 다르게 가져갈거라서
>  워커에는 2&2 외부패턴만 남아있는게 맞네"
>
> "외부일정은 2^2 고정이면 나머지 근무가능일에 일하면서
>  그안에서 새로운 패턴을 그룹에 셋팅하는거고"

### 운영 모델
```
정동민 (cs_workers):
  · is_external = 1
  · cycle_days_on = 2 / cycle_days_off = 2 (외부 회사 일정, 글로벌)
  · work_cycle_pattern = (사용 X)

정동민 in 부엉이 (cs_group_members):
  · work_cycle_pattern = '1,2,1,4'
  · work_cycle_start_date = 2026-06-01

정동민 in 달빛 (cs_group_members):
  · work_cycle_pattern = '1,2,1,4'   ← 같은 패턴
  · work_cycle_start_date = 2026-06-04  ← 출발일만 다름
```

### 운영 예시 (정동민 P1 + A/B/C P2, 그룹 rotation_period_days=2)
```
06-01 정동민 (cycle 1근무 + P1)
06-02 A (정동민 휴무 → P2 rotation 시작)
06-03 A (2일 연속)
06-04 정동민 (cycle 1근무 + P1)
06-05 B (정동민 휴무 → P2 rotation)
06-06 B
06-07 C
06-08 C
06-09 정동민 (cycle 반복)
```

### 데이터 모델 (마이그: 2026-05-18_cs_group_members_work_cycle.sql)
- `cs_group_members.work_cycle_pattern` VARCHAR(64) — '1,2,1,4'
- `cs_group_members.work_cycle_start_date` DATE — 그룹마다 다른 출발일

### N-55 A/B조 cycle UI 폐기 (사용자 선택 A — 완전 제거)
- 「🎭 A/B조 cycle」 UI 영역 제거 (그룹 셋팅 + 멤버 cfg squad selector)
- DB 컬럼 (`cs_shift_groups.cycle_kind` / `cs_group_members.squad`) 은 안전 유지
- 기존 squad_rotation 셋팅된 그룹은 알고리즘 그대로 작동 (호환)
- 새 셋팅은 N-56-b 멤버 cycle 로 표현 (출발일 어긋나게 잡으면 동일 효과)

### 변경
1. **마이그** — cs_group_members 2 컬럼 추가 (멱등)
2. **API members PUT** — work_cycle_pattern + start_date 받기 (graceful)
3. **API shift-groups GET** — 멤버 응답에 포함 (graceful)
4. **API workers (PATCH/GET)** — work_cycle_* 처리 제거 (cs_workers 컬럼은 deprecate, drop X)
5. **types.ts** — Worker 에서 제거, GroupMemberSettings 에 추가
6. **WorkersTab IdentityPanel** — 「🔁 비균등 cycle」 영역 제거 + 안내 배너
7. **GroupEditor MemberCfgPanel** — 「🔁 비균등 cycle 패턴」 영역 추가 (CSV + 시작일 + 미리보기)
8. **GroupEditor** — N-55 A/B조 cycle UI 완전 제거
9. **auto-generate** — `workerWorkCycleMap` → `memberWorkCycleMap` (Map<`${gId}_${wId}`, ...>)
   - 같은 워커가 그룹마다 다른 cycle 가능
   - squad_rotation active 멤버 가드도 멤버 레벨로

### GATE 진행 상태
- ✅ G3 사용자 GO + 「A: N-55 UI 완전 제거」 명시 결정
- ✅ G5 tsc PASS (변경 파일 에러 0건)
- ⏳ G6 lint:harness 새 위반 0건 (예상)
- ⚠ G7 Designer 시각 검수 — 배포 후 사용자 확인

### 마이그 적용 필수
- `migrations/2026-05-18_cs_group_members_work_cycle.sql`

---

## 2026-05-18 (Phase N-56 + N-57) — 비균등 cycle 패턴 + Cross-group cover

### N-56 — 워커별 비균등 cycle 패턴 (CSV)

#### 사용자 결정
> "정동민씨를 1근무 2휴무 1근무 4휴무 로설정이 가능하게 해야할것같아"
> → CSV 패턴: `1,2,1,4` (전체 8일 cycle)
>   짝수 idx (0, 2, ...) = 근무 일수
>   홀수 idx (1, 3, ...) = 휴무 일수

#### 운영 예시 (정동민)
```
work_cycle_pattern = '1,2,1,4' (전체 8일 cycle)
start_date 2026-06-01:
  06-01 (1근무) → 06-02~03 (2휴무) → 06-04 (1근무) → 06-05~08 (4휴무) → 06-09 다시 시작
```

#### 데이터 모델 (마이그: 2026-05-17_cs_workers_work_cycle_pattern.sql)
- `cs_workers.work_cycle_pattern` VARCHAR(64) — '1,2,1,4' 형식 CSV
- `cs_workers.work_cycle_start_date` DATE — cycle 기준 시작일

#### 변경
1. **마이그** — 멱등 2 컬럼 추가
2. **API workers (GET/PATCH)** — work_cycle_pattern + start_date 처리 + 응답 포함
3. **WorkersTab UI** — IdentityPanel 안 「🔁 비균등 근무 cycle (CSV 패턴)」 영역
   - 패턴 입력 + 시작일 + 미리보기 (`1근무 → 2휴무 → 1근무 → 4휴무`)
4. **auto-generate 알고리즘** — `parseWorkCyclePattern` + `isWorkDayByCyclePattern` 헬퍼
   - 모든 경로 (priority / rotation / squad) 공통 휴무 phase 가드
   - squad_rotation 의 active 멤버도 휴무 phase 면 빈자리

### N-57 — Cross-group cover 명시 매핑 (그룹 페어)

#### 사용자 결정
> "서브던, 부엉이던 휴가면 서로 그룹근무자가 커버하는것으로 셋팅하고 싶은데"
> → source_group_id (휴가 발생) → cover_group_id (커버할 그룹) 명시 매핑

#### 운영 예시
```
부엉이 휴가 시 → 서브 멤버 cover 후보 진입
서브 휴가 시 → 부엉이 멤버 cover 후보 진입
(상호 cover 는 양쪽 그룹에서 각각 설정 필요)
```

#### 데이터 모델 (마이그: 2026-05-17_cs_group_cover_pairs.sql)
- `cs_group_cover_pairs` 신설
  - source_group_id (휴가 발생 그룹)
  - cover_group_id (커버할 그룹)
  - priority TINYINT (1~3)
  - is_active TINYINT(1)
  - UNIQUE (source_group_id, cover_group_id)

#### 변경
1. **마이그** — cs_group_cover_pairs 멱등 CREATE
2. **API** — GET / PUT /api/call-scheduler/shift-groups/[id]/cover-pairs
3. **GroupEditor UI** — 「🔗 휴가 커버 그룹」 패널 (그룹 셋팅 옆)
   - 모든 그룹 dropdown → 선택 → 추가
   - priority 토글 (P1/P2/P3)
   - × 삭제
4. **auto-generate 알고리즘** — `getCoverWorkers(sourceGroupId)` 헬퍼
   - candidates 풀에 cover 그룹 멤버 추가 (자기 그룹에 없는 사람만)
   - 정렬 시 cover 멤버 항상 후순위 (own 먼저, cover 나중)
   - 자기 그룹 멤버 전원 fill / 휴가 / max 도달 시점에만 cover 멤버 진입

### GATE 진행 상태
- ✅ G3 설계서 + 사용자 GO (AskUserQuestion: "A. CSV 패턴" + "B. 명시 매핑 (그룹 페어)")
- ⏳ G5 tsc PASS (push 후 확인 필요)
- ⏳ G6 lint:harness (push 시 자동)
- ⚠ G7 Designer 시각 검수 — 사용자 직접 확인 권장
- ✅ Rule 22 CHANGELOG 갱신 (본 entry)
- ⚠ 마이그 적용 필수:
  - `migrations/2026-05-17_cs_workers_work_cycle_pattern.sql`
  - `migrations/2026-05-17_cs_group_cover_pairs.sql`

---

## 2026-05-17 (Phase N-55) — A/B조 cycle 로테이션 (조원수 × N일)

### 사용자 결정
> "A조 워커 한바퀴 돌면 B조 스타트"
> "조원수 × N일 (각자 N일씩)"

### 운영 예시 (부엉이)
```
A조: [윤민진(1), 전유하(2), 전정연(3)] = 3명 × 5일 = 15일
B조: [정동민(1), 백업(2)] = 2명 × 5일 = 10일
전체 cycle = 25일 → 반복

일자 0~4:   윤민진 (A1, 5일)
일자 5~9:   전유하 (A2, 5일)
일자 10~14: 전정연 (A3, 5일)
일자 15~19: 정동민 (B1, 5일)
일자 20~24: 백업 (B2, 5일)
일자 25~:   반복 (윤민진)
```

### 데이터 모델 (마이그: 2026-05-17_cs_squad_rotation.sql)
- `cs_shift_groups.cycle_kind` VARCHAR(20) — 'squad_rotation' | NULL
- `cs_shift_groups.cycle_days_per_member` INT — 각자 N일
- `cs_shift_groups.cycle_start_date` DATE — cycle 기준일
- `cs_group_members.squad` VARCHAR(1) — 'A' | 'B'
- `cs_group_members.squad_order` INT — 조 안 순서

### API
- shift-groups [id] GET — cycle_* + members 의 squad 응답
- shift-groups [id] PATCH — cycle_* 수용
- members PUT — squad / squad_order 별도 UPDATE (graceful)

### UI (GroupEditor)
- 그룹 셋팅 「🎭 A/B조 cycle 로테이션」 영역 — 체크박스 + N일 + cycle 시작일
- MemberCfgPanel 「🎭 소속 조 (A/B cycle)」 영역 — A/B/없음 + 순서 input

### 알고리즘 (auto-generate)
- groupCycleMap + memberSquadMap fetch (graceful)
- computeActiveSquadMember(g, isoDate) 헬퍼:
  · elapsed = isoDate - cycle_start_date
  · total = A.length × N + B.length × N
  · pos = elapsed % total
  · pos < A_cycle_len → A조[idx]
  · else → B조[idx]
- 메인 loop 진입 시 cycle_kind='squad_rotation' 우선 분기
- 휴일 가드 / 휴가 / 회피일 그대로 적용
- active 멤버가 휴가/회피 시 → 빈자리 (N-51 자동 재배정 후 fix 가능)

### 사용 절차
1. 마이그 적용
2. 부엉이 그룹 편집 → 🎭 A/B조 cycle 체크 + N=5 + 시작일 2026-06-01
3. 멤버 cfg → 각자 A/B + 순서 지정 (A1, A2, A3, B1, B2)
4. 자동 생성 재실행 → 25일 cycle 자동 반복

## 2026-05-17 (Phase N-53) — 카카오 알림톡/SMS 자동 발송 (토큰 발급 시)

### 사용자 결정
> "배포하면 자동 전용링크발송 및 비로그인 본인 페이지 ..."
> 채널: 카카오 알림톡 + 시점: 토큰 발급 시 자동

### 변경
1. **`lib/notification.ts` 신설** — 솔라피 (CoolSMS) API wrapper
   - sendKakaoOrSms(opts) — 알림톡 우선 + SMS fallback
   - buildScheduleLinkMessage — SMS 본문 빌더
   - 환경변수: SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_FROM_PHONE / KAKAO_PFID / KAKAO_TEMPLATE_ID
2. **`/api/ride-employees/[id]/token POST`** — 발급 후 자동 발송 호출
   - 응답에 `notify_result` 포함 (성공/실패/skip 사유)
   - 환경변수 미설정 시 graceful — 토큰만 발급
3. **`WorkersTab.tsx`** — 발급 후 결과 메시지 표시 (📱 카카오/SMS 발송 / ⚠ skip / ❌ 실패)

### 운영자 셋팅 필요 (배포 후)
- 솔라피 가입 (https://solapi.com) → API KEY
- 발신번호 인증 (회사 대표번호) → 1일
- 카카오 비즈니스 채널 (https://business.kakao.com) → 채널 등록
- 알림톡 템플릿 작성 + 카카오 심사 → 3~5일
- Cloud Run 환경변수 등록 (5종)

### 후속 작업
- N-54 연차 사용일 계산 (실제 근무일만 차감)
- N-51 자동 재배정

## 2026-05-17 (Phase N-52) — 연차/회피일 동기화 fix (status 필터 + 그룹 내 등록 폼 제거)

### 사용자 보고
> "연차/회피일이 그룹설정에서와 직원요청 페이지에서의 등록과 동기화가 안 되는데
>  그룹 내 설정을 삭제하든 해야 할 것 같습니다"
> "연차나 회피일이 직원요청에서 매니저가 등록한 것은 적용이 안 되는 것 같습니다"

### 진단
1. auto-generate 의 cs_leaves SELECT 에 status 필터 없음 → pending/rejected 도 가드 작동
2. 등록 위치 분리:
   - GroupEditor 안 인라인 폼 (N-39 — scope 토글)
   - 직원 요청 검토 페이지 매니저 직접 등록 (N-15 + N-49)
   - 두 곳에서 등록 가능 → 운영자 혼란

### 변경
1. **auto-generate/route.ts** — cs_leaves SELECT 에 `status = 'approved'` 추가
   - 매니저 등록 (status='approved') 만 자동 가드 작동
   - 직원 신청 (status='pending') 또는 거절 (status='rejected') 은 제외
2. **GroupEditor.tsx** — N-39 인라인 폼 (scope 토글 + 입력 + 등록 버튼) 제거
   - 안내 텍스트: "회피일/연차 등록은 「직원 요청 검토」 페이지에서만 가능"
   - 단일 등록 위치 (직원 요청 페이지) 유지

### 효과
- 매니저 등록한 연차/회피일이 자동 생성에 정확 반영 (status='approved' 만)
- 동기화 문제 해결 — 등록 위치 통일

### 후속
- N-51 자동 재배정 — 다음 commit 작업

## 2026-05-17 (Phase N-50) — 직원 토큰 발급 패널 + 매니저 row 액션 (취소/삭제)

### 사용자 요구 (2건)
1. "토큰 패널은 딱이 없는것같은데 진행하고 테스트해야할듯"
2. "연차/회피일 담당 매니저는 승인취소 반려, 또는 직접등록은 삭제 수정이 가능해야 되는데 해당 기능이 없어요"

### 변경 (1/2 — 영구 링크 발급 패널)
- **WorkersTab.tsx**: 워커 행 옆 「🔗 발급 / 🔗 링크」 버튼
  - 토큰 없으면 → 「발급」 클릭 → POST `/api/ride-employees/[id]/token` → 자동 클립보드 복사
  - 토큰 있으면 → 「링크」 클릭 → 복사 / 재발급(`r`) / 폐기(`d`) 선택
  - API 이미 존재 — UI 만 추가 (ride_employees.public_token)

### 변경 (2/2 — 매니저 row 액션)
- **requests/page.tsx**:
  - `revertSkip(skip)` — 회피일 「승인/거절 취소」 → status='requested' (대기로)
  - `deleteSkip(skip)` — 회피일 완전 삭제 (DELETE)
  - `revertLeave(leave)` — 연차 「승인/거절 취소」 → status='pending'
  - `deleteLeave(leave)` — 연차 완전 삭제 (DELETE)
- **ManagerRowActions 컴포넌트 신설** — 「↩ 취소」 / 「🗑」 버튼 2종
- SkipList / LeaveList row 에 매니저 액션 (승인/거절 row 만 표시)
- ⏳ 대기 row 는 기존 「✓ 승인 / ✗ 거절」 그대로

### 효과
- 매니저가 외부인력 (정동민 등) 에게 영구 링크 카톡 공유 가능
- 비로그인 직원도 본인 페이지에서 신청 가능
- 잘못 승인한 row 대기로 되돌리기 가능
- 직접 등록한 row 삭제 가능

## 2026-05-17 (Phase N-49) — 직원 요청 검토 휴가 탭 매니저 직접 등록

사용자 보고 (스크린샷): 회피일 탭에만 매니저 직접 등록 UI 있음 → 휴가 탭에도 추가

▸ 변경 (requests/page.tsx)
- registerLeave 함수 신설 — POST /api/call-scheduler/leaves (leave_type='annual', am_pm='full')
- 휴가 탭 안에 「📝 매니저 직접 등록 (연차)」 패널
- 워커 선택 → 시작일/종료일 → 사유 → + 등록
- 회피일과 동일 UX, 차이: 그룹 선택 X (전체 그룹 적용 — 연차는 글로벌)

▸ 효과
- 매니저가 직원 요청 검토 페이지에서 연차도 즉시 등록 가능
- 즉시 승인 status='approved' (회피일과 동일)

## 2026-05-17 (Phase N-48) — required_days_per_month 완전 제거

### 사용자 결정
> "워커에 최소, 최대 근무일수가 있는데 그룹에 월 필수일수가 필요할까요?"
> → 완전 제거 (데이터 + UI)

### 변경
- 마이그: `cs_group_members.required_days_per_month` DROP COLUMN (cs_group_member_versions 도)
- API: members PUT INSERT, shift-groups GET, versions PATCH 모두 컬럼 제거
- GroupEditor: MemberCfgPanel 의 「📈 월 필수 일수」 영역 제거 + state 제거
- auto-generate 알고리즘: required_days_per_month 정렬 기준 제거 (글로벌 min_days_per_month 만 사용)
- types.ts: 인터페이스 컬럼 제거

### 효과
- 그룹 멤버 cfg 단순화 (우선순위 + 비율 + 커버 순위 + 메모만)
- 워커 마스터 min/max 가 글로벌 의무
- 알고리즘 정렬 단순화 — 글로벌 min shortfall + priority + cov + dow + counter

## 2026-05-17 (Phase N-46 + N-47) — P2 결원 P3 cov 우선 + 카테고리 그룹 정렬

### N-46 — P2 결원 자리는 P3 cov 우선 채움 (균등 보장)

사용자 보고: "정동민이 윤민진/전유하/전정연 휴가 시 커버 → 정동민 max 도달 후
윤민진 추가 휴가 시 다른 사람 (전유하/전정연) 근무일 늘어남 → 균등 깨짐"

▸ 변경 (auto-generate/route.ts)
- 매 일자 후보 정렬 직후 「P2 결원 채우기」 로직 추가:
  - p2Short = 그룹 P2 멤버 수 - candidates 중 P2 수
  - p2Short > 0 면 P3 cov 우선 P2 결원 수 만큼 selected
  - 나머지 need 는 기존 정렬된 candidates 에서

▸ 효과
- 윤민진 휴가 → 그 자리 P3 cov=1 (정동민) 우선 진입
- 전유하/전정연 max=17 까지 안 채움 (P2 균등 유지)
- 정동민 cap 도달 → 빈자리 → warnings (운영자 추가 백업 또는 검토)

### N-47 — 카테고리 모드 정렬 강화 (카테고리 → 그룹 → 시간)

사용자 보고: "카테고리그룹별인데 그룹이 두 번씩 나오면서 분리되어 보이는"

▸ 원인: 카테고리 → 시간순 2단계 → 같은 카테고리 안 그룹들의 시프트가 섞임

▸ 변경 (ScheduleGrid.tsx)
- 정렬: 카테고리 → 그룹 sort_order → 시간 (3단계)
- rotation sequence 도 한 그룹 안에서 연속 표시

▸ 효과
- 같은 그룹 시프트들 연속 → 카테고리 헤더 한 번만 표시
- 그룹 라벨 흩어지지 않음

## 2026-05-17 (Phase N-43) — 주말 공휴일 가드 자동 제외 + 대체공휴일 페어 UI 시각화

### 사용자 보고
> "공휴일이 주말이라 대체공휴일이 되면 둘 중에 하나는 주말근무자가 정상근무고
>  대체공휴일이 공휴일 근무를 하게 되는 것도 정리해야 하지 않아요?"
> "둘 다 공휴일 근무 되면 안 되니"
> "6월 6일은 공휴일이 아니고"
> "주말에 공휴일이 들어가고 대체공휴일이 있는 것과의 관계가 명확하게 정리되어 있어야 함"

### 운영 의도
| 케이스 | 가드 작동 |
|--------|----------|
| 평일 공휴일 (5/5 화 어린이날) | ✓ 작동 |
| 평일 대체공휴일 (3/2 월) | ✓ 작동 |
| 주말 공휴일 — 대체공휴일 페어 있음 (3/1 일 삼일절) | **X 무시** (주말 근무자 정상) |
| 주말 공휴일 — 페어 없음 (6/6 토 현충일) | **X 무시** (운영상 주말) |

「둘 다 가드 적용되면 운영자가 휴일 근무자를 두 번 손해」 방지.

### 변경 (`auto-generate/route.ts`)
- holidayDates Set 빌드 시 dow ∈ {0,6} (토/일) 자동 제외
- 평일 공휴일/대체공휴일만 가드 작동
- pattern_type='holidays_only' (휴일 전담) 그룹도 평일 공휴일만 트리거

### 변경 (`HolidaysTab.tsx` UI 시각화)
- 날짜 옆에 요일 라벨 (월/화/.../토/일) + 「(주말)」 표시
- 「대체공휴일」 row 에 🔄 대체 배지
- 가드 작동 상태 시각 라벨 (3종):
  · 🔴 **가드 ON** — 평일 + exclude_auto=1 (휴일 가드 작동)
  · ⚠ **주말 — 가드 X** — 토/일 (주말 근무자 정상)
  · ⚪ **운영** — 평일 + exclude_auto=0 (회사 운영, 가드 X)

### 사용자 정정 (2026-05-17)
> "아니요 정부 공휴일이 회사휴무일 맞아요"

- 처음 옵션 A (sync 디폴트 exclude_auto=0) 선택했다가 정정
- 결론: 정부 공휴일 = 회사 휴무 (디폴트 exclude_auto=1 유지)
- 주말 (토/일) 에 떨어지는 경우만 알고리즘 차원에서 자동 가드 X
- 6/6 (토) 현충일 — 토요일이라 자동 가드 X (회사 휴무 표시는 유지)
- 평일 공휴일/대체공휴일 — 정상 가드 작동

### 효과
- 꿀벌 (주말 근무) 같은 그룹: 토/일 공휴일 정상 출근
- 햇살1/석양 (평일만): 평일 대체공휴일에만 빠짐
- 「둘 다 가드」 문제 사라짐
- 운영자가 UI 에서 「어떤 row 가 가드 작동/X」 시각 확인 가능

## 2026-05-17 (Phase N-40) — 매트릭스 카테고리 그룹 모드 토글 + WorkerPicker 모달 확대

### 사용자 보고 (3건)
1. "매트릭스 뷰가 시간대보다는 시간대 + 카테고리 별로 보이는 게 나으려나"
2. "날짜별에서 클릭했을 때 모달도 작아서 화면도 많이 짤려"
3. "날짜별에서 이름도 전체 근무자 다 표기되었으면 좋겠어"

### 사용자 결정 (1)
- 카테고리 모드 공존 + 토글 (디폴트 카테고리)

### 변경 (1) — `ScheduleGrid.tsx`
- 뷰 모드 state: `viewMode: 'category' | 'flat'` + localStorage 저장
- 카테고리 정렬 순서: 주간 → 저녁 → 야간 → 특수 → 일반
- sort 로직 분기:
  - `category`: 카테고리 우선 → 안에서 시간순
  - `flat`: 시간순만 (기존 N-26)
- 토글 버튼 (외부/회피 토글 옆) — 🗂 카테고리 / ⏱ 평면
- 카테고리 변경 시 섹션 헤더 row 삽입 (☀️주간 / 🌆저녁 / 🌙야간 / 🎌특수 / 📁일반)

### 변경 (2/3) — `WorkerPicker.tsx`
- 모달 크기: width 420 → **560** / maxWidth 92vw → **95vw** / maxHeight 85vh → **90vh** / padding 20 → 24
- 워커 list: maxHeight 260 → **480** (16명 워커 스크롤 없이 표시)
- 모달이 화면에 짤리지 않음

### 효과
- 24/365 운영에서 주간/야간 분리 검수
- 휴일 전담 같은 특수 그룹 시각 분리
- 워커 선택 모달 한 화면에 다 보임
- 운영자 선호에 따라 view mode 전환 가능 (localStorage 유지)

## 2026-05-17 (Phase N-39) — GroupEditor 안 연차/회피일 통합 등록 + coverage_priority 확인

### 사용자 보고
> "연차는 매니저가 회피일처럼 등록 못 하나요?"
> "연차 시 우선순위 직원 설정하는 것은 회피일은 적용 안 되나요?"

### 진단
1. **연차 vs 회피일 분리**
   - 연차: 워커 차원 (모든 그룹), 발급량 차감, 종일/반차 — 별도 탭
   - 회피일: 그룹 차원, 사유, 발급량 무관 — GroupEditor 안 인라인
2. **coverage_priority 적용 범위**: 둘 다 적용 ✓ (candidates 정렬 단계에서 보조)
   - 휴가 / 회피일 / 연속한도 / skip_on_holidays 어떤 원인이든 결원 → coverage 작동

### 사용자 결정
- "회피일에 설정하듯이 똑같이 적용하면 될 것 같고 기본을 전체 필터로 해 주세요"

### 변경 (`GroupEditor.tsx`)
1. SkipForm 에 `scope: 'global' | 'group'` 필드 추가 (디폴트 `'global'`)
2. 인라인 폼에 scope 토글 추가:
   - 📅 **연차 (전체 그룹)** — 디폴트 (블루 톤)
   - ⛔ **회피일 (이 그룹만)** — 회피일 (앰버 톤)
3. addSkipInline 분기:
   - `scope='global'` → POST `/api/call-scheduler/leaves` (leave_type='annual', am_pm='full')
   - `scope='group'` → 기존 POST `/api/call-scheduler/shift-groups/[id]/skip-dates`
4. 사유 placeholder 동적 변경 (연차/회피일)

### 효과
- 매니저가 워커 행 펼치면 한 흐름으로 연차/회피일 모두 등록 가능
- 디폴트 연차 (전체 그룹) — 일반적 케이스 우선
- 회피일 토글로 특정 그룹만 적용도 가능
- coverage_priority 는 둘 다에 작동 — 회피일이든 연차든 결원 발생 시 P3 끼리 cov=1 우선

## 2026-05-17 (Phase N-38) — 휴일 sync 중복 정리 + 임시공휴일 보강

### 사용자 보고 (2건)
> "근데 지방선거일이 6/3일인데 이 정보는 안 가져오는 이유는? 그런 건 안 뜨나?"
> (UI 화면) 같은 날짜에 "설날 연휴" (수동) + "설날" (API) 중복 row 발생

### 변경
1. **`holidays/sync/route.ts`** — 같은 날짜 'national' row 자동 대체
   - DELETE 기존 national row (해당 날짜) → INSERT API 데이터
   - type='company' (회사휴무) / 'etc' (기타) 는 보존
   - 응답에 `replaced` 카운터 추가
   - 「공식 공휴일 마스터 = API 데이터」 보장

2. **`lib/korea-holiday-api.ts`** — 양 endpoint 통합 호출 (사용자 추가 보고)
   - 사용자: "행안부 데이터는 못 가져온다는 얘기? 발표된 지 좀 됐는데"
   - 진단: 한국천문연구원 SpcdeInfoService 에 endpoint 여러 개
     · getRestDeInfo (휴일 정보 — 기존 사용)
     · getHoliDeInfo (공휴일 정보 — 임시공휴일 포함)
   - 변경: 두 endpoint 모두 호출 → 응답 merge + dedupe
   - 효과: 행안부 지정 임시공휴일 (지방선거 등) 자동 fetch
   - getExtraHolidaysOverride 는 API 반영 전 짧은 기간 보강용으로만 유지

3. **`HolidaysTab.tsx`** — UI 메시지 + 안내 텍스트
   - confirm 메시지: 「기존 national 대체 / 회사휴무 보존」 명시
   - 결과 메시지에 「기존 대체 N개」 카운터 표시

### 효과
- 매번 sync 할 때마다 깔끔한 결과 (중복 row 없음)
- 6/3 지방선거일 자동 포함 — 햇살/석양 그룹 (skip_on_holidays=1) 정상 skip
- 향후 임시공휴일 (대선/총선/보궐) 도 같은 패턴으로 추가

## 2026-05-17 (Phase N-37) — 워커 max_days_per_month hard cap (모든 경로 공통)

### 사용자 보고
> "최소 최대일 설정값에서 정동민씨가 다른 사람 연차 시 먼저 우선순위로 본인 근무가능일에
>  배정되더라도 최대일을 넘길 순 없습니다. 그래야 근무일을 정확히 가져가죠"

### 진단
- 기존 max 가드 (auto-generate 라인 1428~) 는 **usePriority=true 안에서만** 적용
- `lookupMember` 하나만 검사 — 멤버 cfg max 명시되면 워커 글로벌 max 우회 가능
- 단순 rotation 경로 (usePriority=false) 에는 max 가드 없음

### 변경 (`auto-generate/route.ts`)
- candidates 필터 단계 (target_ratio hard exclude 직후) 에 **글로벌 hard cap** 추가
- 워커 cfg max + 멤버 cfg max **둘 다 검사** → 작은 값 자동 적용
- 모든 경로 공통 (usePriority 분기 무관)

### 효과
- 정동민 워커 cfg max=8 → coverage_priority=1 일도 8일 초과 절대 X
- 멤버 cfg 가 더 빡빡한 경우 (예: 6) → 6일 초과 X
- "최소 8일 보장 + 최대 8일 한도" 정확 적용

### 운영 검증 시나리오
- 정동민 워커 마스터: min=8, max=8 → 정확히 8일
- 정동민 워커 마스터: min=8, max=10 → 평소 8일 + 휴가 커버 시 최대 10일까지

## 2026-05-17 (Phase N-36) — 워커 글로벌 min_days + 그룹 coverage_priority

### 사용자 보고
> "정동민은 8일 근무로 보여지는데 6월 스케줄은 외부인력이라 최소근무가 없어서 그런가?
>  그 기준도 있어야 하나 최소근무 그리고 휴가자 발생 시에 1순위로도 넣으려고 하는데
>  그 기준도 그럼 그룹에서 휴가 커버 순위도 지정해야 하나"
> "뭐 이건 외부인력이나 내부인력이나 상관은 없죠"

### 사용자 결정
- min_days 위치: 워커 마스터 (글로벌, 모든 그룹 합산)
- 휴가 커버 순위: 새 컬럼 신설 (priority_level 과 독립)
- is_external 가드는 신설 X — 모든 워커 같은 셋팅 흐름

### 데이터 모델
- 마이그: `migrations/2026-05-17_cs_workers_min_days_and_coverage.sql`
- `cs_workers.min_days_per_month` TINYINT UNSIGNED DEFAULT NULL
- `cs_group_members.coverage_priority` TINYINT UNSIGNED DEFAULT NULL (1~3)
- `cs_group_member_versions.coverage_priority` 도 (timeline 일관)

### 운영 예시
- **외부인력 정동민**:
  - priority_level=3 (P3 백업, 평소 후순위)
  - min_days_per_month=8 (글로벌 8일 보장)
  - coverage_priority=1 (휴가 결원 시 1순위)
  → 평소엔 P1/P2 가 다 채워주고 정동민 8일만 들어감
  → 휴가자 발생 → P1/P2 부족 → P3 후보 → 정동민이 cov=1 이라 우선 선택

### 변경
1. **API**
   - workers GET + PATCH — min_days_per_month graceful
   - members PUT — coverage_priority 수용 (post-INSERT UPDATE 패턴)
   - shift-groups [id] GET — coverage_priority 응답에 포함
2. **WorkersTab.tsx**
   - PersonalLimitsPanel 에 「📊 월 최소 일수」 input 추가 (3컬럼 grid)
   - state: editMinDays
3. **GroupEditor.tsx (MemberCfgPanel)**
   - MemberCfg interface 에 `coverage_priority: string`
   - 「🆘 휴가 커버 순위」 영역 — preset 4종 (─ priority 따라감 / C1 / C2 / C3)
4. **auto-generate/route.ts**
   - WorkerLimits 에 min_days_per_month 추가 + 별도 graceful 조회
   - coveragePriorityMap (graceful) + lookupCoveragePriority 헬퍼
   - 정렬 새 기준 (priority_level 다음 → 동등 시 coverage_priority):
     · 1순위 min_days shortfall (글로벌 외부인력 최소 보장)
     · 2순위 priority_level
     · 2.5순위 coverage_priority (P3 끼리 결원 시 우선)
     · 이후 dow / required / counter / last_date

### 검증
- tsc PASS
- 사용자 시나리오: 정동민 P3 + min=8 + cov=1 → 평소 8일 보장 + 휴가 시 우선

### 자동 휴일 API 진단 (별도)
- 사용자 보고: "자동 휴일 적용 api 오류납니다"
- 원인 추정: KOREA_HOLIDAY_API_KEY 환경변수 미설정 가능성
- 정확한 에러 메시지 확인 후 별도 hotfix 예정

## 2026-05-17 (Phase N-35) — 그룹 단위 「같은 날 다른 그룹 겹침」 허용 옵션 + target_ratio UI 명확화

### 사용자 보고
> "둘 다 0.5로 두 그룹을 하니까 겹치는 날이 발생되는데"
> "둘 다 1로 셋팅하면 맞고 이건 어떻게 쓰는게 맞는건지"
> "그룹설정에서 다른 그룹과 같은 날에 시간만 피하면 배정 가능 여부를 설정하면 될까요?"

### 진단
1. **target_ratio 의미 오해** — 사용자가 "0.5 = 절반" 절대값으로 해석
   · 실제는 「다른 그룹 대비 상대 가중치」 — 0.5/0.5 = 1.0/1.0 (둘 다 동일 비율)
   · UI 텍스트가 헷갈리게 작성됨
2. **「겹치는 날」 별개 문제** — 알고리즘이 workedToday 가드 없어 같은 워커 같은 날 양쪽 그룹 배정 가능

### 사용자 결정
- 옵션 B: 그룹 단위 토글 신설 (디폴트 금지)

### 데이터 모델
- 마이그: `migrations/2026-05-17_cs_shift_groups_allow_overlap.sql`
- 컬럼: `cs_shift_groups.allow_same_day_other_group TINYINT(1) DEFAULT 0`
- 디폴트 0 (금지) — 한 사람 하루 1그룹

### 동작
| 그룹 A / B 셋팅 | 결과 |
|----------------|------|
| 둘 다 0 (디폴트) | 같은 날 양쪽 X (한 사람 하루 1그룹) |
| 둘 다 1 | 시간만 안 겹치면 양쪽 OK (24/365 운영) |
| 비대칭 (한쪽만 1) | 안전한 해석 — false 그룹 입장에서 workedToday 가드 작동 → 결과적으로 겹침 방지 |

### 변경
1. **API** (shift-groups GET/POST/PATCH + [id]/GET/PATCH)
   - allow_same_day_other_group graceful 컬럼 감지 + 응답 + ALLOWED_COLS
2. **GroupEditor.tsx**
   - state: `allowSameDayOtherGroup` 추가
   - 「휴일 처리」 근처에 「🔀 다른 그룹 겹침」 토글 추가 (앰버 톤)
3. **auto-generate/route.ts**
   - GroupRow type 에 allow_same_day_other_group 추가
   - graceful 컬럼 감지 + 그룹 row 에 주입
   - candidates 필터: 현재 그룹 allow=false 면 workedToday hard exclude

### target_ratio UI 명확화 (작업 2)
- MemberCfgPanel 안내 박스 신설 (파란색)
- 「상대 가중치」 명시 — 절대값 아님 강조
- 둘 다 같은 값 = 균등 분배 명시
- preset 라벨 수정: "0.5 절반" → "0.5 상대 적게", "2.0 더 자주" → "2.0 상대 자주"
- 하단 안내에 겹침 토글 참조 추가

### 효과
- 둘 다 1.0 (디폴트) + 양쪽 그룹 allow=false → 사용자 의도대로 자연 균형 분배
- 24/365 특수 운영 (예: 같은 사람 주간 + 야간) 만 명시 ON
- target_ratio 의미 명확 → 운영자 혼란 방지

## 2026-05-17 (Phase N-34) — 워커별 그룹 분배 비율 (target_ratio)

### 사용자 보고
> "근무가 양쪽 그룹에 있을 때 양쪽 그룹의 우선순위도 지정할 수 있나? 어떻게 생각해?
>  지금 전정연은 달빛 위주로만 처음에 하게 되는게 있어서 밸런스를 좀 맞출 수 있을까?
>  아니면 배정순위가 필요한가"

### 진단
- 알고리즘 그룹 처리 순서 = sort_order ASC
- 전정연이 달빛 + 부엉이 둘 다 소속 → 달빛이 먼저 처리되면 우선 선택
- counter 가 글로벌 total 만 추적 → 그룹별 분배 불균형 미감지

### 사용자 결정
- 옵션 B 선택: 「워커별 그룹 분배 비율 명시」 (운영자 직접 통제)

### 데이터 모델
- 마이그: `migrations/2026-05-17_cs_group_members_target_ratio.sql`
- 컬럼: `cs_group_members.target_ratio FLOAT NOT NULL DEFAULT 1.0`
- `cs_group_member_versions.target_ratio` 도 (버전 timeline 일관성)

### 의미 매트릭스
| target_ratio | 의미 |
|--------------|------|
| **0** | 이 그룹 절대 안 들어감 (hard exclude) |
| 0.5 | 디폴트의 절반 — 적게 들어감 |
| **1.0** | 디폴트 — 같은 비중 |
| 2.0 | 디폴트의 2배 — 더 자주 |

### 운영 예시
- 전정연 「달빛 1.0 / 부엉이 1.0」 → 두 그룹 균등 분배
- 전정연 「달빛 0.5 / 부엉이 1.0」 → 부엉이 두 배
- 전정연 「달빛 0」 → 달빛 절대 안 감

### 변경
1. **API**
   - `members/route.ts` PUT — target_ratio 수용 + INSERT
   - `[id]/route.ts` GET — target_ratio 별도 조회 + 응답 포함
   - `route.ts` GET (list) — group ↔ worker ratio 일괄 조회 + member row 에 주입
2. **GroupEditor.tsx**
   - MemberCfg interface 에 `target_ratio: string` 추가
   - 로드 시 server 응답에서 setup
   - save 시 payload 에 포함
   - MemberCfgPanel 에 「⚖️ 그룹 분배 비율」 영역 신설 (input + preset 4종)
3. **auto-generate/route.ts**
   - counter 구조 확장 — `by_group: Map<groupId, { total, last_date }>`
   - prefill 시 group_id 함께 fetch — by_group 도 prefill
   - 할당 시 by_group 도 ++
   - target_ratio=0 candidates 단계에서 hard exclude
   - 정렬 새 기준 (priority_level/dow 다음) — 「by_group.total / target_ratio」 작은 사람 우선

### 효과
- 전정연 양쪽 1.0 → 달빛 ↔ 부엉이 자동 균등 분배
- 「부엉이 전담」 「달빛 안 감」 같은 케이스 명시 설정 가능
- 그룹 간 분배 불균형 자동 해결

### 검증
- tsc PASS
- 자동 생성 재실행 후 6월 매트릭스 — L12/L13 의 공유 워커 (전정연, 윤민진 등) 균등 분배 확인
- target_ratio=0 설정한 워커는 그 그룹 매트릭스에 안 나오는지 확인

## 2026-05-17 (Phase N-33) — 일당 1명 로테이션 끊김 후 「처음부터 시작」 fix (counter prefill)

### 사용자 보고
> "시간 로테이션 말고 일당 1명씩 로테이션 그룹이 어떤 사유에 의해 하루가 끊기면
>  근무자가 연속적으로 이어가야 하는데 그 로테이션이 다시 처음부터 시작되는 결과가 나옵니다"

스크린샷 (L13 부엉이): **윤민진 → 정동민 → (빈칸) → 윤민진** 처럼 첫 워커로 reset.

### Root Cause
- `auto-generate/route.ts` 의 priority 정렬 경로 (usePriority=true 기본)
- `counter` Map 은 **매 자동 생성 호출 시 새로 생성** (라인 880)
- 매월 1일 자동 생성 시 모든 워커 `total=0`, `last_date=null`
  → 정렬 기준 4(by_dow), 5(total), 6(last_date 거리) 모두 동등
  → JS stable sort → gMembers 의 priority 순서 그대로 → **첫 워커부터 시작**
- 같은 달 내 skip 발생 시에도 counter 변동 없으므로 다음 날 정렬이 흔들림

### 변경 (`auto-generate/route.ts`)
- counter 생성 직후 「직전 30일 cs_assignments」 prefill 추가
- 멱등: `WHERE work_date BETWEEN ${prefillStart} AND ${prefillEnd} AND worker_id IS NOT NULL AND special_code != 'off'`
- ASC 정렬로 마지막 row 가 최근 → `cn.last_date = r.work_date` 자연 갱신
- graceful try/catch — prefill 실패해도 자동 생성은 진행 (이전 동작과 동일)

### 효과
- 매월 1일 정렬 시 last_date 거리 기준이 「오래 안 일한 사람 우선」 정상 작동
- 같은 달 내 skip 후에도 자연 이어감 — 첫 워커 reset 사라짐
- 모든 그룹 적용 (사용자 선택 — rotation 외에 균형 분배에도 의미)

### 검증
- tsc PASS
- 자동 생성 재실행 후 L13 부엉이 / L12 달빛 매트릭스 확인 — 워커별 균등 분배 + skip 후 이어가는지

## 2026-05-17 (Phase N-32) — 그룹에 「공휴일 추가 출근」 옵션 (include_holidays_extra)

### 사용자 보고
> "그룹이 너무 많아지는데 공휴일을 추가옵션으로 해야하지않아? 기존 커스텀 요일 근무인데 거기서
>  공휴일도 근무하는걸로 지금은 둘 중 하나만 선택이 가능해서 별도로 그룹을 또 셋팅해야 하니"

### 의도
- 「토·일 + 공휴일도 출근」 같은 케이스를 위해 별도 그룹을 만들지 않아도 되게
- 한 그룹에서 「패턴 요일 + 공휴일 추가」 동시 처리

### 데이터 모델
- 마이그: `migrations/2026-05-17_cs_shift_groups_include_holidays.sql`
- 컬럼: `cs_shift_groups.include_holidays_extra TINYINT(1) DEFAULT 0`
- 멱등 (information_schema 체크 + PREPARE/EXECUTE)

### 동작 매트릭스
| pattern | skip_on_holidays | include_holidays_extra | 결과 |
|---------|------------------|----------------------|------|
| 평일만 | 1 | 0 | 평일만 (공휴일 빠짐) |
| 평일만 | 0 | 0 | 평일 (휴일은 패턴 매칭 X) |
| 평일만 | 0 | **1** | **평일 + 모든 공휴일** |
| 커스텀(토·일) | 0 | **1** | **토·일 + 모든 공휴일** |
| 커스텀(토·일) | 1 | 0 | 토·일 (공휴일 빠짐) |

- skip_on_holidays 와 include_holidays_extra 는 **상호배반** — UI 에서 한 쪽 ON 이면 다른 쪽 OFF
- 데이터 차원에서도 안전 처리: skip 가드는 `&& !include` 조건 추가

### 변경
1. **API** (`shift-groups/route.ts`, `shift-groups/[id]/route.ts`)
   - GET: 컬럼 graceful 감지 + 응답에 include_holidays_extra 포함
   - POST: body 수용 (`include_holidays_extra: number`)
   - PATCH: ALLOWED_COLS 확장 + boolean → 0/1 변환
2. **UI** (`GroupEditor.tsx`)
   - state: `includeHolidaysExtra` 추가
   - 로드: `Boolean(group.include_holidays_extra)`
   - 저장: payload 에 `include_holidays_extra: 0|1` 추가
   - 「휴일 처리」 Field 아래에 「공휴일 추가 출근」 Field 신설 (녹색 토글)
   - 상호배반 — skip 켜면 include 자동 해제 + disable 표시
3. **알고리즘** (`auto-generate/route.ts`)
   - GroupRow type 에 `include_holidays_extra?: number | boolean` 추가
   - graceful 컬럼 감지: `hasGroupIncludeHolidaysExtra`
   - 그룹 fetch 시 컬럼 별도 조회 + g 에 주입
   - 비-`holidays_only` 그룹 처리:
     ```ts
     const dowMatch = patternDays(...).has(dow)
     const holidayMatch = includeHolidaysExtra && isHoliday
     if (!dowMatch && !holidayMatch) continue
     // skip 가드: && !includeHolidaysExtra
     ```

### 운영 예시
- 「주말+공휴일 근무조」 그룹 1개:
  · pattern_type='custom', custom_days='0,6' (토·일)
  · skip_on_holidays=0, include_holidays_extra=**1**
  · 결과: 토·일 출근 + 모든 공휴일 추가 출근
- 별도 「공휴일 전담」 그룹 불필요 — 그룹 개수 감소

### 검증
- tsc 영향: `auto-generate/route.ts`, `shift-groups/route.ts`, `shift-groups/[id]/route.ts`, `GroupEditor.tsx`
- 마이그 적용 후: `SELECT include_holidays_extra FROM cs_shift_groups WHERE name LIKE '%주말%';`
- 사용 시나리오 1: 주말 그룹 → include=1 토글 → 6/6 (현충일) 출근 확인
- 사용 시나리오 2: 평일 그룹 + skip=1 → include 자동 disable → 6/3 (지방선거) 빠짐 확인

## 2026-05-17 (Phase N-31) — 휴일 가드 강화 (skip_on_holidays=1 이면 무조건 skip)

### 사용자 보고
> "휴일제외로 해놓은 그룹이 왜 근무로 또 들어가고 있는지"

### 진단
- SQL: 햇살 (skip=1) + 석양 (skip=1) 이 6/3 (지방선거일) 출근 ← 버그
- 원인: 메인 가드의 첫 조건 `skipHolidays` (다이얼로그 옵션) 이 false 면 모든 그룹 가드 무시
- 추가: `holidayDates` 자체가 `skipHolidays=true` 일 때만 fetch — OFF 시 빈 Set → 그룹 가드 작동 X

### 변경 (`auto-generate/route.ts`)
1. **`holidayDates` 항상 fetch** — 다이얼로그 옵션과 무관하게 cs_holidays 조회 (그룹 가드용)
2. **메인 휴일 가드 강화**:
```js
// 새 로직
const shouldSkipForHoliday = isHoliday && (groupSkipsHoliday || skipHolidays)
//                                          ^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^
//                                          그룹 셋팅 우선     OR 전역 강제
```

### 우선순위 (새)
| 그룹.skip_on_holidays | 다이얼로그 옵션 | 휴일 결과 |
|----------------------|--------------|----------|
| **1** (휴일 제외 ON) | 무관 | **무조건 skip** |
| 0 (휴일 출근) | ON | skip (전역 강제) |
| 0 (휴일 출근) | OFF | 출근 (24/365 운영) |

### 효과
- 「햇살」 「석양」 그룹의 skip_on_holidays=1 셋팅이 직관대로 동작 (휴일 출근 X)
- 부엉이/꿀벌/달빛 (skip=0) 은 휴일 출근 OK
- 다이얼로그 옵션은 skip=0 그룹에 대한 master kill switch 역할만

### 검증
- tsc PASS
- 자동 생성 재실행 후 6/3 매트릭스 확인 — 햇살/석양 row 빈 셀이어야

## 2026-05-17 (Phase N-30) — 「공휴일만」 패턴 추가 (휴일 전담 그룹)

### 사용자 보고
> "휴일 근무는 예를 들면 모든 요일에 휴일일때만 근무하는 내용은 없는것같은데"

### 변경
- pattern_type enum 에 `'holidays_only'` 추가
- `PATTERN_OPTIONS` 에 「공휴일만」 옵션 추가 — GroupEditor UI 표시
- shift-groups API POST/PATCH + version PATCH 의 PATTERNS Set 확장
- auto-generate 알고리즘 분기:
  · `pattern_type='holidays_only'` 시 → `holidayDates.has(isoDate)` 일 때만 통과 (dow 무관)
  · skip_on_holidays 가드 무시 (self-conflict — 휴일에 들어가는 그룹)
  · 그 외 패턴 — 기존 로직 그대로

### 운영
- 「휴일 전담」 그룹 생성:
  · 그룹 이름: "휴일 전담"
  · 카테고리: 특수
  · 시프트 선택
  · 패턴: 「공휴일만」
  · 멤버 추가
- 자동 생성 → cs_holidays 일자 (예: 6/3 지방선거일, 6/6 현충일) 에만 출근

### 검증
- tsc PASS

## 2026-05-17 (Phase N-29-c + N-29-d) — GroupEditor 멤버 cfg 축소 + 알고리즘 워커 cfg 우선

### N-29-c (GroupEditor 축소)
- `MemberCfgPanel` 에서 제거:
  · 🌟 희망 요일 / 🚫 비선호 요일
  · 🛑 월 최대 일수
  · 🛡 연속 근무 한도
  · 🚷 슬롯 거부
- 유지: 우선순위 (P1/P2/P3) / 📈 월 필수 일수 (그룹 단위) / 📝 패턴 메모 / rotation 시작 (워커별)
- 안내 메시지 추가: "💡 희망/비선호 요일 · 월 최대 일수 · 연속 근무 한도 · 슬롯 거부 는 워커 마스터에서 셋팅"

### N-29-d (자동 생성 알고리즘 — 워커 cfg 우선)
- `cs_workers` 의 개인 한계 5 컬럼 graceful fetch (`hasWorkerLimits`)
- `workerLimits` Map 신설 — 워커별 개인 한계 저장
- `memberCons.set` 시 **그룹 cfg 우선, NULL/빈 시 워커 cfg fallback**:
  · max_consecutive_work_days: 그룹 NULL → 워커 사용
  · max_days_per_month: 그룹 NULL → 워커 사용
  · blocked_slot_ids: 그룹 빈 → 워커 사용
  · preferred_dow_prefer/avoid: 그룹 빈 → 워커 사용
- `lookupMember` 에 워커 cfg fallback — memberCons 없으면 워커 cfg 로 MemberConstraint 합성

### 효과
- 사용자가 워커 마스터 1번 셋팅 → 모든 그룹의 자동 생성에 동일 적용
- 그룹마다 다른 한도 원하면 그룹 멤버 cfg 에 override 가능 (현재 UI 노출 X 단 컬럼 유지)
- 「개인 한계」 의미가 명확 — 워커 단위 룰

### 백워드 호환
- cs_group_members 의 옛 cfg 컬럼 유지 (마이그 X) — 데이터 그대로
- 알고리즘이 그룹 cfg 우선이라 기존 데이터 영향 없음

### 검증
- tsc PASS

## 2026-05-17 (Phase N-29-b) — 워커 마스터 UI 「개인 한계」 영역

### 변경 (`WorkersTab.tsx`)
- 새 state 5종 (`editMaxConsec`, `editMaxDays`, `editBlockedSlots`, `editDowPrefer`, `editDowAvoid`)
- `slots` 추가 fetch (`/api/call-scheduler/shift-slots`)
- `startEdit()` 에서 워커 데이터 → 5 state 초기화
- `saveEdit()` PATCH body 에 5 컬럼 추가
- `PersonalLimitsPanel` 신설 (인터페이스 추가됨, IdentityPanel 아래):
  · 📅 연속 근무 한도 (일) — 1~14
  · 🔴 월 최대 일수 — 1~31
  · 🌟 희망 요일 — 7 요일 토글 chip
  · 🚫 비선호 요일 — 7 요일 토글 chip
  · ⛔ 슬롯 거부 — 시프트 list chip
- UI 색깔: 녹색 패널 (개인 한계 = 워커 보호 의미)

### 효과
- 사용자가 워커 1번만 셋팅 → 모든 그룹에 적용 (그룹마다 같은 값 입력 X)
- 「전정연 연속 5일 + 월 15일 max」 같은 개인 한계가 모든 그룹의 자동 생성에 동일 적용 (N-29-d 후)

### 다음 단계 (N-29-c, N-29-d)
- N-29-c: GroupEditor 멤버 cfg 축소 (priority_level + rotation_start_* + work_pattern_text 만 유지)
- N-29-d: auto-generate 알고리즘 — 워커 cfg 우선, 그룹 cfg fallback

### 검증
- tsc PASS

## 2026-05-17 (Phase N-29-a) — 워커 마스터 분리 (Step A — 마이그 + API)

### 사용자 보고
> "그룹 하위에 워커별 셋팅은 여러 그룹에 소속된 경우 각각 적용되나요? 따로 되나요?
>  그룹에서 하는게 맞나? 개인 워커 설정에서 하는게 맞나"

### 결정 (B 안 — 워커 마스터로 분리)
- 「개인 한계」 (연속/월최대/슬롯거부/희망요일) = **워커 단위** (cs_workers)
- 「그룹 안 역할」 (priority_level / rotation_start_*) = **그룹별** (cs_group_members)
- 알고리즘: 워커 cfg 우선, 그룹 cfg fallback (backward compat)

### 변경 (Step A — 인프라)

#### 마이그 (`migrations/2026-05-17_cs_workers_personal_limits.sql`)
- cs_workers 에 5 컬럼 추가 (멱등):
  · max_consecutive_work_days
  · max_days_per_month
  · blocked_slot_ids (TEXT — JSON 배열)
  · preferred_dow_prefer (VARCHAR 32 CSV)
  · preferred_dow_avoid (VARCHAR 32 CSV)
- 백필 SQL 주석 포함 (검토 후 수동 실행 권장)

#### API workers GET (`workers/route.ts`)
- `hasPersonalLimits` graceful 감지 (`FeatureFlags`)
- 별도 SELECT 로 5 컬럼 fetch + Map merge
- 응답에 5 컬럼 포함

#### API workers PATCH (`workers/[id]/route.ts`)
- ALLOWED 에 5 컬럼 추가
- `hasLimits` graceful 감지
- nullable 숫자 / blocked_slot_ids JSON 변환

### Step B/C/D (다음 PR)
- Step B: 워커 마스터 UI 「개인 한계」 영역
- Step C: GroupEditor 멤버 cfg 축소 (역할만 — priority_level + rotation_start_*)
- Step D: auto-generate 알고리즘 워커 cfg 우선

### 검증
- tsc PASS
- 마이그 적용 후 워커 GET 응답에 5 컬럼 포함 확인 필요

## 2026-05-17 (Phase N-28-a) — 자동 생성 사유 가시화 (워커별 제외 사유 통계)

### 사용자 보고
> "근무일 15일이나 휴식 11시간 이런것들은 사용자가 설정이나 사용자눈에 확실이 보여야 검증이 가능하고 작성된 스케줄을 믿을수있어요. 어떤사유로 조정이 된부분들..."

### 변경 (`AutoGenerateDialog.tsx`)
- 결과 경고 패널에 **「🧑 워커별 제외 사유 (TOP 10)」** 섹션 추가
- 사유 카테고리별 카운트 표시:
  · 🌙 익일 휴식 (next_day_block)
  · ⏱ 시간 겹침 (time_conflict)
  · 📅 연속 한도 (consec_limit)
  · 🚫 슬롯 거부 (slot_blocked)
  · 🛌 그룹 회피 (group_skip)
- 한 워커가 자주 제외되면 어떤 사유 때문인지 즉시 파악 가능
- 안내 메시지: "익일 휴식 시간 / 연속 한도 / 월 최대 일수 설정 검토"

### 효과
- 사용자가 자동 생성 결과를 받으면 — 워커별로 어떤 가드 때문에 빠졌는지 한 화면에 표시
- 「전정연이 익일 휴식 8건 / 윤민진이 시간 겹침 5건」 같은 정량 정보로 가드 셋팅 조정 결정
- 운영 신뢰성 강화 — 자동 생성이 "왜" 이렇게 했는지 설명력 ↑

### 다음 단계 (대기)
- N-28-b: 「⚖ 운영 룰 검토」 페이지 — 모든 가드 한 화면 (시프트별 익일 휴식 / 워커별 월 최대 일수 등)
- N-28-c: 입력 한도 검증 + 잘못된 셋팅 사전 경고
- 매트릭스 빈 셀 hover 사유 표시 (별도)

### 검증
- tsc PASS

## 2026-05-17 (Phase N-27) — rotation cursor 균등 분배 fix (전정연 자주 출근 문제)

### 사용자 보고
> "전정연 반복적으로 같은그룹에서 돌아가지 않고 반복적으로 나옴"

### 진단
- SUB 그룹: generation_strategy='rotation', rotation_size=1, rotation_period_days=1, 멤버 3명 (priority 0/1/2)
- 멤버 모두 전속 직원 (외부 cycle X) — 정상 cycle 이면 매일 1명씩 3일 cycle
- 매트릭스 패턴: 6/1 전정연(p0) / 6/2 전유하(p1) / 6/3 전정연 / 6/4 윤민진(p2) / 6/5 전정연 → cursor 어긋남

### 원인
기존 cursor 코드 (auto-generate/route.ts):
```js
arr.push(candidates[(st.cursor + i) % candidates.length])
st.cursor = (st.cursor + size) % candidates.length
```
- `candidates.length` 가 매일 다름 (휴가/회피일/슬롯거부 가드로 후보 변동)
- 그 변동에 따라 cursor mod 가 흔들림
- → priority 0 인 워커 (전정연) 가 candidates 첫 번째에 자주 들어가 자주 차례

### Fix (`auto-generate/route.ts`)
```js
// N-27 — cursor mod gMembers.length (고정) + candidates 에 없으면 다음 워커로 skip
const memberLen = Math.max(1, gMembers.length)
const candidateSet = new Set(candidates)
let cur = st.cursor
let scanned = 0
while (arr.length < size && scanned < memberLen) {
  const wId = gMembers[cur % memberLen]
  if (candidateSet.has(wId) && !arr.includes(wId)) arr.push(wId)
  cur = (cur + 1) % memberLen
  scanned++
}
st.cursor = (st.cursor + size) % memberLen  // candidates.length → memberLen
```

### 효과
- cursor 가 gMembers 전체 인덱스 (고정 길이) 기준 — candidates 변동 무관
- 한 워커가 가드 (휴가/회피) 로 빠져도 cursor 는 정상 advance
- 균등 cycle 보장 — 3 멤버면 정확히 3일 cycle

### 백워드 호환
- 다른 그룹 (all_members) 은 영향 없음
- rotation 그룹의 candidate 가 가드로 모두 빠질 경우 selected 빈 배열 (기존과 동일)

### 검증
- tsc PASS
- 자동 생성 재실행 후 매트릭스 확인 필요 (예상: 전정연·전유하·윤민진이 균등 3일 cycle)

## 2026-05-17 (Phase N-26) — 매트릭스 시간순 view + 그룹 라벨 inline

### 사용자 보고
> "매트릭스가 그룹상관없이 시간대별로 시프트 시간순서대로 나와야하는데 보기가 불편해"

### 변경 (`ScheduleGrid.tsx`)
1. **slotsByGroup 시간순 sort**:
   - `slot.start_time` ASC (overnight 도 자기 start_time 기준)
   - 동시간이면 slot.code 사전순
   - 모든 (group, slot) row 가 시간 순서대로 평탄화 — 그룹과 무관
2. **그룹 헤더 row 제거** (`isNewGroupSection = false`):
   - 시간순이라 같은 그룹이 비연속적 → 그룹 헤더 row 의미 사라짐
   - 그룹 외부/회피 행도 제거
3. **그룹 라벨 inline** (slot 헤더 우측 작은 chip):
   - 그룹 이름 + rotation 순서 (예: 「로테이션 ·1」 = rotation sequence 1번)
   - 그룹 색 (category 별)
4. **중복 방지**:
   - 같은 (group, slot) 페어가 두 번 row 생성되지 않도록 `seenPairs` Set

### 효과
- 매트릭스가 시간순 (L01 07:30 → L02 08:00 → L03 08:30 → L05 09:00 → L07 10:00 → L09 11:00 → ...)
- 그룹 라벨은 slot 헤더 우측 작은 chip 으로 식별
- rotation 그룹의 sequence 시프트도 각각 시간순 위치에 배치 (예: 로테이션 ·1 = L01 / 로테이션 ·2 = L02)

### 백워드 호환
- 그룹 row 분리 (N-25 Step B) + group_id 필터 그대로 유지
- 시간 정렬 + 헤더만 변경

### 검증
- tsc PASS

## 2026-05-16 (Phase N-25 Step B) — ScheduleGrid 그룹별 row 분리 + rotation sequence 펼침

### 사용자 보고
> "로테이션인데 시프트가 하나만 표출 / 워커에 매칭된 시프트도 제대로 보여줘야지요"

### 변경

#### Assignment 타입
- `app/(employees)/CallScheduler/utils/types.ts` — `group_id?: string | null` 추가

#### API (`/schedules/[id]/route.ts`)
- `hasAsnGroupId` graceful 감지
- SELECT 4 분기 (hasLockCol × hasAsnGroupId) — group_id 포함
- 응답 `assignments[i].group_id` 채움

#### ScheduleGrid 핵심 변경
- `allGroups` 타입 확장: `rotation_enabled` + `rotation_shifts[]` 추가
- `slotsByGroup` 신설 — (slot, groupInfo) 단위 row list
  · rotation 그룹: `rotation_shifts` 모두 펼침 (sequence 전체 시프트 sub-row)
  · 일반 그룹: `shift_slot_id` 단일 row
  · 그룹 없는 slot: `groupInfo=null` 로 그대로 표시
- `slots.map` → `slotsByGroup.map` 으로 변경
- `<tr key>` 에 `${curGrp?.id}_${slot.id}` (같은 slot 이 여러 그룹 row 에)
- `cellMap` 키 변경: `${date}_${slot}_${group}` (group_id 있으면) + `${date}_${slot}` (legacy)
- 셀 lookup 우선순위:
  1. `cellMap.get("${d}_${slot}_${group}")` — 그룹별 워커 (group_id 채워진 데이터)
  2. fallback: 같은 slot legacy 데이터 → 그룹 멤버 필터 (member_ids.includes)
  3. 그룹 없는 row: 그대로 모든 worker

### 효과
- 「로테이션」 그룹 row 가 sequence 5 시프트 (L01/L02/L03/L05/L07) 모두 sub-row 로 표시
- 「주4 general · 멤버 1명」 row 에 「로테이션」 그룹 워커 안 섞임 (group_id 필터)
- 박혜정 (다른 그룹 멤버) 이 「로테이션」 row 의 L01 에 끼어 보이는 문제 해결

### 백워드 호환
- cs_assignments.group_id NULL 인 옛 데이터 → 같은 slot 의 모든 그룹 row 에 표시 + 멤버 필터로 정리
- 그룹 없는 slot → 기존 동작 그대로

### 검증
- tsc PASS
- lint:harness ui-token 2건 시프트 (실제 새 hardcode X — 줄 번호 변경) → baseline 갱신 필요

## 2026-05-16 (Phase N-25 Step A) — 매트릭스 sort 고정 + group_id 인프라

### 사용자 보고
> "로테이션인데 시프트가 하나만 표출되니 누가 몇시근무인지를 모르고 제대로 로테이션 되는지도 확인이 안되네 순서가 계속바뀌는것 보니 매일 바뀌는것처럼 보이기도 하고"
> "워커에 매칭된 시프트도 제대로 보여줘야지요 로테이션시프트중에 한가지를 보여주고 묶어서 직원들을 다배치하는게아니라"

### 진단 (SQL 확인)
- 알고리즘 정상: 6/1~6/5 매일 동일한 김현정·박혜정·정지은이 L01 (매월 1회 순환 OK)
- 매트릭스 표시 버그:
  1. 같은 시프트의 다른 그룹 워커가 같은 row 에 섞임 (cs_assignments 에 group_id 없음)
  2. 셀 내 worker chip 이 매일 다른 순서로 표시 (sort 안 됨)
  3. rotation 그룹의 시프트 sequence 가 한 row 만 보임 (L02~L07 안 보임 — 다른 row 에 섞임)

### 변경 (Step A — 인프라 + sort 고정)

#### 마이그 (`migrations/2026-05-16_cs_assignments_group_id.sql`)
- `cs_assignments.group_id CHAR(36) NULL` 컬럼 추가 (멱등)
- 인덱스 `idx_cs_asn_group_date (group_id, work_date)`
- FK `fk_cs_asn_group → cs_shift_groups(id) ON DELETE SET NULL`

#### auto-generate (`route.ts`)
- `hasAsnGroupId` graceful 감지
- INSERT 분기 4종 (clearFirst × hasAsnBreakdown × hasAsnGroupId) — 모든 경우 group_id 같이 INSERT
- 기존 plan 의 `group_id` 가 그대로 cs_assignments 에 들어감

#### ScheduleGrid sort 고정
- `cellMap` 구축 후 worker name 사전순 sort (한국어 localeCompare)
- 셀 내 worker chip 이 매일 같은 순서로 표시됨

### Step B (다음 PR)
- ScheduleGrid 의 row 구조 변경: slot 단위 → (group_id, slot_id) 단위
- 같은 시프트가 여러 그룹에 속하면 row 가 그룹별로 분리됨
- rotation 그룹의 sequence 시프트 (L01/L02/L03/L05/L07) 가 각각 sub-row 로 표시
- 그룹 row 의 worker 는 그 그룹 멤버만 (cs_assignments.group_id 필터)
- 작업 분량 ~300줄 — 큰 reshuffling 이라 별도 PR

### 검증
- tsc PASS
- 마이그 적용 후 자동 생성 재실행 → cs_assignments.group_id 채움
- 매트릭스 sort 즉시 효과 (날짜별 순서 흔들림 사라짐)

## 2026-05-16 (Phase N-24-a) — 탭 블루 pill + 컨텐츠 전체 width

### 사용자 지적
> "근데 왜 탭 커서 색이 왜 블랙이 되었고 그리고 보니 탭 아래 페이지들은 왜 가운데 정렬이야?"

### 결정사항 (사용자 옵션 선택)
- 탭 색: **블루 pill** (settlement 검정 → 블루 — 일반적인 액센트 컬러)
- 컨텐츠 정렬: **전체 width** (maxWidth 제거 — 사이드바 옆부터 우측 끝까지)

### 변경
- `_components/SubNav.tsx`:
  · 활성 탭 background: `#0f2440` → `COLORS.primary` (블루 #2563eb)
  · borderRadius: 8 → 99 (완전 둥근 pill)
  · 비활성 보더: transparent → `COLORS.borderFaint` (얇은 윤곽)
  · 활성 box-shadow: `0 2px 8px rgba(37,99,235,0.25)` (블루 글로우)
- `page.tsx` + `skips/page.tsx`: `maxWidth: 1400 / 1200 + margin: 0 auto` 제거 → 전체 width
- `[id]/page.tsx` 와 `new/page.tsx` 는 maxWidth 600/720 (form 형 페이지) — 유지

### 검증
- tsc PASS
- lint:harness 0건

## 2026-05-16 (Phase N-23) — Rotation 운영 fix (priority 기반 자동 분산으로 구조 재설계)

### 사용자 지적
> "시프트 로테이션은 당연히 다른 시프트에 배정되는 설정인데 자동 분산 적용이 왜 필요한가?
>  구조적으로 문제를 만들고 거기에 임시조치 기능을 넣은건가?"

→ **인정.** rotation_start_index 컬럼을 사용자에게 노출 + 「자동 분산」 버튼은 임시조치.
정상 흐름은 sequence + 멤버만 정의하면 알고리즘이 자동 분산해야 함.

### 변경 (구조 재설계)

#### 1. 알고리즘 (`auto-generate/route.ts`)
- **rotation path** (N-19-b) + **버전 path** (N-21-b) 둘 다:
  - 기존: `shift_index = (start_index + elapsed) % shifts.length`
  - 변경: `shift_index = (baseIdx + elapsed) % shifts.length`
  - `baseIdx = (mrot.start_index > 0) ? mrot.start_index : memberIdx`
  - memberIdx = 멤버 priority 순서 (gMembers / verMembers 의 인덱스)
  - 명시적 override (start_index > 0) 한 경우만 그 값 사용 — backward compat
- 결과: 워커 추가 순서만으로 자동 분산 — 1순위→L01 / 2순위→L02 / ...

#### 2. UI (`GroupEditor.tsx`)
- 「⚖️ 자동 분산 적용」 버튼 **제거**
- 새 멤버 추가 시 자동 startIndex 셋팅 **제거**
- 멤버 cfg 펼침 — 「시작 시프트 (1번/2번/...)」 select **제거**, 시작일/종료일만 유지
- 시프트 로테이션 ON 시 안내 박스 변경: "워커는 추가 순서대로 sequence 에 자동 매핑됩니다 (1순위→L01 / 2순위→L02 / ...)"
- 멤버 cfg 안내: "💡 멤버 순서가 시프트 매핑 결정 — priority 자동 분산"
- rotation ON 시 단일 시프트 영역 hide + 안내 박스 (이전 N-23 변경 유지)

### 효과
- 사용자가 rotation ON + sequence + 멤버 추가만 하면 자동 분산
- 별도 「자동 분산」 버튼 클릭 또는 startIndex 입력 필요 X
- rotation_start_index 컬럼은 데이터 모델에 유지 (DB 호환) 단, UI 노출 X — 명시 override 용 reserved

### 회고
- ⚠ Rule 14 (동형 패턴) — 자동 분산을 사용자에게 떠넘긴 임시조치 1회. 사용자 지적으로 즉시 구조 변경.
- 향후 강화: 데이터 모델 컬럼 추가 시 "사용자가 항상 manual 입력 필요한가? 알고리즘 자동 계산 가능한가?" 사전 검토 의무.

### 검증
- tsc PASS (GroupEditor + auto-generate 0 errors)
- 멤버 추가 순서만으로 자동 분산 — 사용자 추가 셋업 X
- ✅ 미리보기 동작 확인: 워커별 4일씩 균등 분포 (자동 분산 정상)

### 🐛 Bug fix 추가 — `Cannot read properties of undefined (reading 'slot_start')`
- 원인: rotation 그룹은 워커마다 다른 shift_slot_id 가 plan 에 들어가는데,
  `targetGroups.find(g => g.shift_slot_id === p.shift_slot_id)` 는 그룹.shift_slot_id (= sequence[0]) 만 매칭 → L02/L03/L05/L07 slot 은 find = undefined → `slot.slot_start` 에러
- Fix: 모든 cs_shift_slots 직접 fetch → `slotByIdMap` 으로 lookup
  · `lookupSlot(slotId)` helper — Map 우선, fallback to targetGroups.find
  · graceful — slot 못 찾으면 plan row skip
- 영향: rotation 그룹의 모든 시프트 (sequence 전체) 가 cs_assignments INSERT 가능

## 2026-05-16 (Phase N-21-c) — Cron 자동 다음 달 스케줄 생성 (Step 3 — C 안)

### 사용자 보고
> "현재 로테이션 매월 반복으로 근무자를 셋팅하고 해당 시프트도 적용했는데
>  실제로 표출은 다른시프트는 공백이 되고 모두 같은 시프트 시간에
>  매일변경되는 로테이션 출근으로 표출되고있습니다."

### 진단
- DB 확인: 7명 멤버 모두 `rotation_start_index=0` / `rotation_start_date=''` (default)
- N-19-b 알고리즘: `shift_index = (start_index + elapsed) % shifts.length`
  - 모든 워커 start_index=0 + start_date=null → elapsed=0 → 모두 sequence[0] (L01)
- 결과: L01 에만 7명 매일 배정 / L02~L07 모두 빈 셀

### 변경 (`GroupEditor.tsx`)
1. **자동 분산 함수** `autoDistributeStartIndex(commonStartDate?)`:
   - 멤버 순서대로 `start_index = priority % shifts.length` 자동 설정
   - 시작일 통일 (이번 달 1일)
2. **「⚖️ 워커 startIndex 자동 분산」 Field 추가** (시프트 sequence + 주기 아래):
   - 「자동 분산 적용」 버튼 — 클릭 시 모든 멤버 startIndex 재배치
   - 안내 메시지 — "모든 워커가 같은 시프트에 배정되는 문제 해결"
3. **새 멤버 추가 시 자동 startIndex 분산** (`toggleMember`):
   - rotation_enabled ON 일 때 새 워커 추가하면 자동으로 `priority % shifts.length` startIndex + 시작일 셋팅
   - 멤버 제거 시 rot cfg 정리
4. **rotation ON 시 단일 slotId 자동 동기화** (useEffect):
   - rotation_enabled && rotationShifts.length > 0 → `slotId = rotationShifts[0]` 자동
   - 사용자가 단일 시프트 선택 영역을 따로 만질 필요 X

### 운영 흐름
**Before** (이슈):
1. 그룹 만들기 + rotation ON + sequence 5개 + 워커 7명 추가
2. 워커 cfg 안 만지고 저장
3. 자동 생성 → 모두 L01 / L02~L07 빈 셀

**After** (N-23):
1. 그룹 만들기 + rotation ON + sequence 5개 + 워커 7명 추가
   → 새 워커 추가 시 자동 startIndex (0/1/2/3/4/0/1) 자동 셋팅
2. 또는 기존 그룹에 「⚖️ 자동 분산 적용」 클릭 → 모든 멤버 재배치
3. 저장 + 자동 생성 → 워커별 다른 시프트 배정 (L01: 1순위·6순위 / L02: 2순위·7순위 / L03: 3순위 / L05: 4순위 / L07: 5순위)
4. 매월 자동 순환 (N-19-b 알고리즘)

### 검증
- tsc PASS (GroupEditor 0 errors)
- lint:harness ui-token 13건 시프트 (실제 새 hardcode X — 줄 번호 변경) → baseline 갱신 필요

### 미해결 (별도 PR — N-24)
- 버전 timeline 위치 — 그룹 편집 최상단으로 이동 (사용자 요청)
- 스케줄 목록 — 카드 → 리스트 상세화 (사용자 요청)
- 근무표 매트릭스 표출 — 실제 동작 확인 후 fix

## 2026-05-16 (Phase N-21-c) — Cron 자동 다음 달 스케줄 생성 (Step 3 — C 안)

### 사용자 의도
> "들어가요 검증하고있을테니" — N-21-c (C cron + D 오버라이드) 시작
> 분할: C 먼저 (가벼움), D 다음 PR

### 신설
- `app/api/call-scheduler/cron/auto-generate-monthly/route.ts` — Cloud Scheduler 트리거 endpoint
  · POST + GET 모두 지원 (테스트 편의)
  · 인증: `?secret=<CRON_SECRET>` 또는 `Authorization: Bearer ...` 또는 `X-CloudScheduler-Jobname` 헤더
  · 동작: 다음 달 (또는 ?target=YYYY-MM 강제) cs_schedules draft 자동 생성
  · 멱등 — 이미 있으면 `action: 'skip-already-exists'`
  · source='cron' / note='Cron 자동 생성 — <timestamp>'

### 설계 결정
- **자동 생성 알고리즘 (auto-generate) 호출 X** — draft 만 만들고 매니저가 검토 후 수동 실행
  · 안전성 우선 (운영 데이터 자동 publish 위험 방지)
  · 매니저가 출근 후 「📅 월별 스케줄」 에서 새 draft 발견 → 클릭 → 자동 생성 → 검토 → publish
- 미래 확장 (TBD): 자동 생성 알고리즘도 cron 에서 실행 + 이메일/Slack 알림

### 운영 셋업 가이드
- `_docs/CRON-SETUP.md` 신설
  · Cloud Run `CRON_SECRET` 환경변수 등록 단계
  · Cloud Scheduler 작업 생성 가이드 (cron: `0 6 1 * *` — 매월 1일 06:00 KST)
  · 호출 예시 + 트러블슈팅 표

### Step 분할 진행 상황
- ✅ Step 1 (N-21-a): 데이터 모델 + UI
- ✅ Step 2 (N-21-b): 자동 생성 알고리즘 적용 + B 예약 변경
- ✅ Step 3-C (N-21-c): Cron 자동 다음 달 생성 (이번 commit)
- ⏸ Step 3-D (다음 PR): 임시 오버라이드 (cs_assignment_overrides 마이그 + 알고리즘 + UI)

### 환경변수
- `CRON_SECRET` (Cloud Run 등록 필요) — `openssl rand -hex 32` 같은 충분히 긴 random 문자열

### 검증
- tsc PASS (cron route 0 errors)
- lint:harness 0건
- 멱등 — 여러 번 호출해도 안전 (이미 있는 월 skip)

## 2026-05-16 (Phase N-21-b) — 자동 생성 알고리즘: 버전 timeline 적용 (Step 2)

### 사용자 의도
> "다음 진행하시죠" — N-21-a 버전 timeline 데이터/UI 완료 후 알고리즘 적용

### 변경 (`app/api/call-scheduler/schedules/[id]/auto-generate/route.ts`)
- Graceful 감지: `hasGroupVersions` (cs_shift_group_versions 테이블 존재 여부)
- 버전 일괄 fetch (3 Map):
  · `groupVersionsMap<group_id, VersionRow[]>` — 그룹별 버전 list (valid_from ASC)
  · `versionShiftsMap<version_id, shifts[]>` — 각 버전의 시프트 sequence
  · `versionMembersMap<version_id, members[]>` — 각 버전의 멤버 + rotation_start_*
- 메인 loop 휴일 체크 직후 **버전 우선 lookup 분기** 추가:
  · 활성 버전 = `valid_from <= isoDate AND (valid_to IS NULL OR valid_to >= isoDate)`
  · 활성 버전 + rotation_enabled + shifts + members 있으면 버전 데이터로 처리
  · skip_on_holidays / pattern_type / rotation_period_kind / rotation_custom_days 모두 버전 우선
  · 멤버 rotation_start_date 가 NULL 이면 version.valid_from 으로 fallback
  · 가드: 휴가 풀-오프 / 그룹 회피일 / 멤버 시작일·종료일
- 활성 버전 없거나 rotation_disabled 면 → 기존 N-19-b rotation path
- N-19-b rotation 도 없으면 → 기존 단일 shift path (백워드 호환)

### 우선순위 (work_date 처리 순서)
```
1. 휴일 체크 (전역 + 그룹별 skip_on_holidays)
2. 활성 버전 (rotation_enabled) → 버전 데이터 사용  ★ N-21-b 추가
3. 그룹 rotation_enabled (cs_shift_groups) → 기존 cs_group_shifts 사용 (N-19-b)
4. 일반 그룹 → 단일 g.shift_slot_id (기존)
```

### 예약 변경 (B 안) — N-21-a 에서 이미 구현됨
- 「+ 새 버전」 버튼이 곧 예약 변경 (미래 시점 새 버전 추가 = 그 시점부터 다른 설정 적용)
- N-21-b 의 알고리즘이 자동으로 활성 버전을 보고 적용

### 효과
- 「로테이션」 그룹에 v1 (6~8월 sequence [L01,L02,L03]) / v2 (9~12월 sequence [L02,L03,L04]) 등록 시
- 자동 생성 → 6~8월은 v1 / 9~12월은 v2 자동 적용
- 워커별 시작 시점도 버전별로 독립 — 인원 변경 / 패턴 변경 등 분기/시즌별 운영 가능

### 백워드 호환
- 버전 없는 그룹 → 기존 N-19-b / 단일 path 그대로
- rotation_enabled = false 버전 → 기존 path 로 fall-through
- 마이그 미적용 (cs_shift_group_versions 없음) → graceful — 영향 X

### 검증
- tsc PASS (auto-generate 0 errors)
- lint:harness 새 위반 0건
- 백워드 호환 확인 — 기존 단일 그룹 자동 생성 그대로 동작

### Step 분할 진행 상황
- ✅ Step 1 (N-21-a): 데이터 모델 + UI 기본
- ✅ Step 2 (N-21-b): 자동 생성 알고리즘 적용 + B 예약 변경 (UI 는 이미 N-21-a)
- ⏸ Step 3 (예정): C cron 자동 생성 + D 임시 오버라이드

## 2026-05-16 (Phase N-22) — 대체공휴일 자동 채우기 (공공데이터 API)

### 사용자 의도
> "우리는 대체휴무일도 다 지정하는데 그럼 외부에서 확인해서 대체휴무일 체크하는것도 추가해야할것같아 사용자가 다 체크하긴 어렵자나"

### 데이터 source
- **공공데이터 OPEN API** (data.go.kr) — 한국천문연구원_특일 정보
- Endpoint: `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`
- 응답: XML (response/header/resultCode + body/items/item[])
- 2026년 22개 row 확인 — 공휴일 + 대체공휴일 (삼일절/부처님오신날/광복절/개천절 대체 4개) 모두 포함

### 신설 파일
- `lib/korea-holiday-api.ts` — XML regex 파서 + `getKoreaHolidays(year)` wrapper
  · 외부 라이브러리 X (xml2js 등 install 불필요)
  · isHoliday=Y row 만 필터 + locdate YYYYMMDD → YYYY-MM-DD 변환
  · date+name dedupe (seq=2 같이 중복 row 처리)
  · KOREA_HOLIDAY_API_KEY 환경변수 누락 시 명확한 에러
- `app/api/call-scheduler/holidays/sync/route.ts` — `POST /holidays/sync?year=YYYY`
  · 멱등 INSERT IGNORE (UNIQUE KEY uq_cs_holiday_date_name 활용)
  · 응답: `{ inserted, skipped, total, year }`
  · type='national', exclude_auto=1, is_paid=1, color_tone='red' 디폴트
  · memo='공공데이터 API 자동 동기화' 라벨

### UI (`HolidaysTab.tsx`)
- 「📥 자동 채우기」 버튼 신설 — 「+ 휴일 추가」 옆
- 클릭 시 confirm 후 fetch — 진행 중 「⏳ 가져오는 중...」 표시
- 결과 메시지 패널 (글래스 디자인 — 규칙 20) — 신규/중복/총 API 카운트
- 자동 동기화 후 자동 reload

### 환경변수
- `KOREA_HOLIDAY_API_KEY` — data.go.kr 발급 일반 인증키
- 로컬: `.env.local`
- 배포: GCP Cloud Run > 변수 및 보안 비밀

### 효과
- 매년 사용자가 일일이 22개 (또는 더) 휴일 + 대체공휴일 입력 필요 없음
- 정부 정책 변경 (대체공휴일 추가 등) 즉시 반영
- 멱등 — 여러 번 클릭해도 안전 (이미 있는 항목 skip)

### 검증
- API key 동기화 후 dry-run 통과 (Rule 13 — 외부 시스템 호환성)
- 2026년 22 row 응답 확인 (대체공휴일 4건 포함)
- tsc PASS / lint:harness 0건

### 사용법
1. 설정 → 휴일 탭 → 연도 선택 (2026)
2. 「📥 자동 채우기」 클릭 → confirm
3. 결과 메시지 확인 (예: "신규 22개 추가 / 중복 0개 skip")
4. 자동 추가된 휴일은 type='national', exclude_auto=1 (24/365 운영이라 그룹별 skip_on_holidays 로 제어)
5. 필요 시 수동 편집 가능

## 2026-05-16 (Phase N-21-a) — 그룹 설정 버전 timeline (Step 1: 데이터 모델 + UI 기본)

### 사용자 의도
> "로테이션이나 이런 그룹설정 주기를 스케줄링 해놓을순없을까?"
> 4 안 (timeline / 예약변경 / cron / 오버라이드) 모두 진행, 단계 분할 — Step 1 부터 순차 진행 (추천)

### 마이그레이션 (`migrations/2026-05-16_cs_shift_group_versions.sql`)
- **신설** `cs_shift_group_versions` — 그룹 ↔ 기간별 설정 (valid_from / valid_to / rotation_* / pattern_* / note)
- **신설** `cs_group_shift_versions` — 각 버전의 시프트 sequence (1:N)
- **신설** `cs_group_member_versions` — 각 버전의 멤버 + 8 cfg + rotation_start_*
- FK 모두 ON DELETE CASCADE — 버전 삭제 시 시프트/멤버 함께 삭제

### API 신설
- `GET  /api/call-scheduler/shift-groups/[id]/versions` — 버전 list (shift_count / member_count 집계 포함)
- `POST /api/call-scheduler/shift-groups/[id]/versions` — 새 버전 생성 (현재 설정 복제 + valid_from)
  · body: `{ valid_from, valid_to, note, copy_from_version_id? }`
  · copy_from_version_id 없으면 그룹 현재 cs_shift_groups + cs_group_shifts + cs_group_members 복제
- `GET    /api/call-scheduler/shift-groups/[id]/versions/[versionId]` — 단일 버전 상세 (settings + shifts + members)
- `PATCH  /api/call-scheduler/shift-groups/[id]/versions/[versionId]` — settings / shifts / members 부분 업데이트
- `DELETE /api/call-scheduler/shift-groups/[id]/versions/[versionId]` — 버전 삭제 (cascade)

### UI 변경 (`GroupEditor.tsx`)
- 「📅 버전 timeline」 collapsible 영역 추가
- 기존 버전 list — valid_from~valid_to / 시프트 수 / 멤버 수 / note + 삭제 버튼
- 새 버전 만들기 폼 — 시작일 / 종료일 / 설명 + 추가 버튼
- 마이그 미적용 시 graceful 안내 (배너 표시)

### 백워드 호환
- 버전 0개 그룹 → 기존 cs_shift_groups + cs_group_shifts + cs_group_members 그대로 동작
- 자동 생성 알고리즘 영향 X (N-21-b 에서 변경 예정)
- 마이그 미적용 시 graceful — 버전 영역만 안내 배너, 다른 기능 정상 동작

### Step 분할 (4 안 진행 계획)
- **Step 1 (지금)**: 데이터 모델 + UI 기본 (이번 PR)
- Step 2: A 알고리즘 적용 + B 예약 변경 (현재 설정 복제 wrapper)
- Step 3: C cron 자동 생성 + D 임시 오버라이드 (cs_assignment_overrides)

### 검증
- tsc PASS (GroupEditor + 새 API 라우트 0 errors)
- lint:harness ui-token 13건 시프트 (실제 새 hardcode X — line 번호 변경) → baseline 갱신 필요
- 마이그 적용 후 검증 SQL 주석 포함

## 2026-05-16 (N-19-a-fix) — GroupEditor 다시 열 때 rotation 데이터 누락 fix

### 사용자 보고
> "그룹 설정에서 저장이 안되는것같은데"

### 진단
- DB 확인 — cs_shift_groups.rotation_enabled=1, cs_group_shifts 5 row 모두 정상 저장됨
- 문제: `GET /api/call-scheduler/shift-groups/[id]` (단일 그룹 상세) 가 rotation_* 컬럼 + rotation_shifts list + 멤버 rotation_start_* 안 반환
- 결과: GroupEditor 다시 열면 토글 OFF / sequence 빈 칸으로 보임 (= "저장 안 됨" 으로 보임)
- 원인: N-19-a 에서 list GET / PATCH 만 확장하고 [id] 단일 GET 누락

### 변경 (`app/api/call-scheduler/shift-groups/[id]/route.ts`)
- graceful 컬럼 감지 추가 (hasCategory / hasSkipOnHolidays / hasRotation / hasGroupShifts / hasMemberRotation)
- 별도 SELECT 로 category / skip_on_holidays / rotation_* 조회 후 응답 group 객체에 merge
- `rotation_shifts` — cs_group_shifts JOIN cs_shift_slots 으로 sequence 반환
- 멤버 query 에 `rotation_start_date / rotation_start_index / rotation_end_date` 추가 (조건부)
- 응답 정규화 (blocked_slot_ids JSON parse 등)

### 효과
- 그룹 편집 화면을 닫았다 다시 열어도 로테이션 토글 + 시프트 sequence + 멤버 시작 시점 모두 그대로 표시
- DB 에는 정상 저장됐던 데이터가 UI 에 가시화됨

### 회고
- ⚠ N-19-a 때 GET list + PATCH 만 검증하고 [id] 단일 GET 미검증 — 동형 패턴 검사 부족
- Rule 14 (동형 패턴 자동 확장) 적용 사례 추가 — 새 컬럼 추가 시 list + 단일 + POST/PATCH 4개 모두 검증 의무

## 2026-05-16 (Phase N-20) — KPI 카드 드릴다운 확장 (5/5 카드 모두 클릭 가능)

### 사용자 의도
> "순서대로 가시죠" (N-18 균형도만 → 나머지 4 카드도 드릴다운 통일)

### 변경 (`app/(employees)/CallScheduler/components/KpiStrip.tsx`)
- DrillKey type 확장: 'fill' | 'avg' | 'half' | 'unfilled' | 'balance'
- 각 카드 clickable 조건 정의:
  · 충원율 — slots.length > 0
  · 평균시간 — activeWorkers.length > 0
  · 반차·F — half + free > 0
  · 미배정 — unfilled_slots > 0
  · 균형도 — alertCount > 0
- 한 번에 1 카드만 펼침 (다른 카드 클릭 시 자동 전환)
- 드릴다운 컴포넌트 4종 신설:
  · `FillDrilldown` — 슬롯별 충원율 (낮은 순)
  · `AvgDrilldown` — 워커별 시간 막대 + 평균 세로선 + 편차 %
  · `HalfDrilldown` — 워커별 반차/F 카운트
  · `UnfilledDrilldown` — 슬롯별 미배정 셀 카운트 + 비중 %
- 기존 `BalanceColumn` (N-18) 재사용

### UI 일관성
- 모든 드릴다운: 글래스 L1 + 타이틀 + × 닫기 + 정렬된 list
- 워커 칩: tone bg + 이름 + 보조 정보 + 우측 정렬된 수치
- 슬롯 항목: 코드 + 라벨 + 충원/미배정 카운트
- 색상 의미: 빨강=경고 / 앰버=주의 / 초록=양호

### 효과
- 사용자가 KPI 숫자 클릭 → 어떤 워커/슬롯에 문제 있는지 즉시 확인
- "균형도 12" 처럼 추상 수치가 구체 워커 list 로 분해됨
- 운영 결정 (멤버 추가 / 일수 조정 / 슬롯 정리) 의 근거가 명확해짐

### 검증
- tsc PASS (KpiStrip 0 errors)
- lint:harness 새 위반 0건
- 기존 N-18 균형도 드릴다운 동작 유지


## 2026-05-16 (Phase N-19-b) — 자동 생성 알고리즘: 그룹 rotation_enabled 시 워커별 시프트 순환

### 사용자 의도
> "주중 통합 그룹 1개 안에 7-18 / 8-17 / 9-18 시프트 다 넣고, 워커마다 매월(또는 N일) 자동 순환"
> (N-19-a 에서 데이터 + UI 완료, N-19-b 에서 자동 생성 적용)

### 변경 (`app/api/call-scheduler/schedules/[id]/auto-generate/route.ts`)
- Graceful 컬럼/테이블 감지 추가:
  · `hasGroupRotation` — cs_shift_groups.rotation_enabled
  · `hasGroupShifts` — cs_group_shifts 테이블
  · `hasMemberRotation` — cs_group_members.rotation_start_date
- 그룹 rotation 설정 별도 조회 — `groupRotMap<group_id, {enabled, period_kind, period_days}>`
- 그룹 ↔ 시프트 sequence 일괄 조회 — `groupShiftsMap<group_id, GroupShiftRow[]>`
- 멤버 rotation 시작 시점 일괄 조회 — `memberRotMap<group_id+'_'+worker_id, {start_date, start_index, end_date}>`
- 메인 loop 안 휴일 체크 직후 **rotation 분기** 추가:
  - rotation_enabled && shifts.length > 0 이면 새 path
  - 워커별 elapsed_periods 계산 (monthly = 자연 월 차이 / days = days / period_days)
  - `shift_index = (start_index + elapsed) % shifts.length`
  - `targetSlotId = shifts[shift_index].shift_slot_id`
  - 가드 적용: 휴가 풀-오프 / 그룹 회피일 (approved) / 멤버 시작일·종료일
  - plan.push (action='insert', special_code=am_half/pm_half/none)
  - continue (기존 path skip)
- rotation_enabled=false 그룹 → 기존 동작 그대로 유지 (백워드 호환)

### 알고리즘 (의사코드)
```
for each work_date in month:
  for each group g:
    if g.skip_on_holidays && isHoliday: skip
    if g.rotation_enabled && shifts.length > 0:
      for each member m:
        if leave==off || group_skip || isoDate<start_date || isoDate>end_date: skip
        elapsed = monthDiff(m.start_date, isoDate)  // or daysDiff / period_days
        shift_index = (m.start_index + elapsed) % shifts.length
        plan.push(isoDate, shifts[shift_index].slot_id, m.worker_id)
    else:
      기존 path (g.shift_slot_id 단일)
```

### 제한사항 (N-19-c 다음 단계)
- 슬롯 거부 (blocked_slot_ids) 미적용 — rotation 그룹의 시프트는 sequence 가 결정하므로 슬롯 거부와 충돌 시 경고만
- 연속 한도 (max_consecutive_work_days) 미적용 — rotation 은 전체 멤버 매일 출근 가정
- 익일 휴식 (next_day_blocking_hours) 미적용 — 같은 그룹 안에서 큰 시간 차 없으면 안전
- workerLastEnd / counter 갱신 단순화 — 다음 PR 에서 통합

### 효과
- 그룹 13개 → 통합 1개 운영 가능 (사용자 의도)
- 한 그룹 안에 시프트 sequence 정의 + 워커별 시작 시점 → 매월 자동 순환
- 자동 생성 시 워커 A는 1월 L01, 2월 L02, 3월 L03 → 4월 L01 로 자동 cycling

### 검증
- tsc PASS (auto-generate 0 errors)
- lint:harness 새 위반 0건
- 기존 단일 시프트 그룹은 rotation_enabled=0 default 라 영향 없음 (백워드 호환)

### 테스트 시나리오 (사용자 확인 권장)
1. 「주중 통합」 그룹 신규 + 시프트 sequence [L01, L02, L03]
2. 워커 A: start_date=2026-06-01, start_index=0 (6월 L01 시작)
3. 워커 B: start_date=2026-06-01, start_index=1 (6월 L02 시작)
4. 워커 C: start_date=2026-06-01, start_index=2 (6월 L03 시작)
5. 6월 자동 생성 → A=L01, B=L02, C=L03 (매일)
6. 7월 자동 생성 → A=L02, B=L03, C=L01 (1칸씩 이동)
7. 8월 자동 생성 → A=L03, B=L01, C=L02


## 2026-05-16 (Phase N-18 + N-19-a) — 균형도 드릴다운 + 그룹 multi-shift 로테이션

### N-18 — 균형도 KPI 카드 드릴다운
- KpiStrip.tsx — 균형도 카드 클릭 시 펼침 패널
- 과로 워커 list (빨강 +N%) / 부족 워커 list (앰버 -N%)
- 워커 칩 (tone bg) + 시간 + 평균 대비 편차 %
- alertCount > 0 일 때만 클릭 가능 (양호 시 단순 표시)

### N-19-a — 그룹 1개 안 시프트 sequence + 워커별 시작 시점 (마이그 + UI)

#### 사용자 의도
> "주중 통합 그룹 하나에 7-18 / 8-17 / 9-18 시프트 다 넣고, 워커마다 매월(또는 N일) 자동 순환"

#### 마이그레이션 (`migrations/2026-05-16_cs_group_shift_rotation.sql`, 멱등)
- **신설** `cs_group_shifts (id, group_id, shift_slot_id, sort_order)` — 그룹 ↔ 시프트 1:N + 순서 보존
- **ALTER** `cs_shift_groups` + `rotation_enabled` + `rotation_period_kind` ('monthly'|'days') + `rotation_custom_days`
- **ALTER** `cs_group_members` + `rotation_start_date` + `rotation_start_index` + `rotation_end_date`

#### API (graceful 컬럼 감지)
- `GET /shift-groups` — `rotation_enabled / period_kind / custom_days / rotation_shifts list` 응답
- `PATCH /shift-groups/[id]` — rotation 컬럼 + `rotation_shifts` body (DELETE + INSERT 동기화)
- `PUT /shift-groups/[id]/members` — 멤버별 rotation_start_date / index / end_date 추가

#### UI (`GroupEditor.tsx`)
- 「🔄 시프트 로테이션」 토글
- ON 시: 시프트 sequence (↑↓× 순서 조작) + 후보 칩에서 추가 + 주기 (매월 / N일 커스텀)
- 멤버 cfg 펼침에 추가: 시작일 / 시작 시프트 (1번 / 2번 / ...) / 종료일

#### 알고리즘 (auto-generate)
- **변경 없음** — rotation_enabled OFF default 라 기존 단일 shift_slot_id 동작 유지
- N-19-b 에서 알고리즘 변경 + 한 그룹 테스트 후 적용 예정

### 효과
- 그룹 13개 → 통합 1개 (예: 「주중 통합」) 운영 가능 (사용자 의도)
- 메뉴 복잡도 감소 + 워커별 자동 순환 가시화
- 균형도 알람 클릭으로 어떤 워커가 과로 / 부족인지 즉시 확인

### 검증
- tsc PASS (CallScheduler 0 errors)
- lint:harness 새 위반 0건 (ui-token baseline 갱신 — 543 위반 동결)
- 마이그 적용 후 검증 SQL 주석 포함

### 회고
- ⚠ Rule 22 위반 — 처음 commit 시 CHANGELOG 누락 (lock 정리 + cross-module 처리로 정신 팔림)
- 별도 hotfix commit 으로 추가 — 향후 staged 직전 CHANGELOG 체크 의무화 (자가 강화)


## 2026-05-16 (Phase N-17) — 대시보드 운영 풀세트 + KPI 통합

### 사용자 의도
> "이렇게 표출만 되는게 맞나요? 정보들이 별로 도움이 안되는데 대시보드에서"
> "KPI도 같이 넣을 예정이긴한데 직원 근무 분석이나 채용율 그리고 업무강도나 이런것들"
> "우리 시스템이 카페24 연동하고있으니 사고접수량, 긴출 및 기타 접수량, 상담등록량 추가"

### 변경 (제거)
- 운영 셋팅 펼침 카드 4종 (시프트/그룹/워커/quota) + 펼침 영역 통째로 제거
- 단순 카운트 (`opsCounts.slots/groups/workers/quotaWorkers`) 제거 — 대시보드 의미 없음

### 변경 (신설)
- **새 API**: `GET /api/call-scheduler/dashboard?date=YYYY-MM-DD` — 한 번 round-trip 에 9 KPI + 6 영역 묶음
- **새 컴포넌트** `_components/dashboard/` 7종:
  · `KpiStrip.tsx` — 운영 5 + 카페24 5 (2줄)
  · `NowWorkingStrip.tsx` — 현재 시각 active workers (24/365 가시화)
  · `TodayTomorrowGrid.tsx` — 오늘/내일 시프트별 워커
  · `PendingReviewsCard.tsx` — 검토 대기 (skip/leave/swap)
  · `EmptySlotsAlert.tsx` — 이번 주 min_coverage 미달 일자
  · `NextActionCard.tsx` — 월말 다음 달 생성 CTA
  · `UpcomingHolidaysCard.tsx` — 다음 14일 휴일 + 영향 그룹
- **page.tsx 재작성** — 8 영역 순차 표출, fetch 한 번으로 통합

### KPI 묶음 (9개)
**운영 인력 (5)**
- 인당 근무일 평균 + 최대/최소 워커
- 활성 워커 vs 필요 인원 (min_coverage 합)
- 야간 근무 비율 (is_overnight)
- 부하 편차 σ (워커간 근무일수 표준편차 — 균형 깨진 정도)
- 충원율 (filled / total)

**외부 부하 (5 — 카페24 + 자체)**
- 사고접수 (`aceesosh` esosmddt — graceful)
- 긴급출동 (`acrotpth` otptdcyn='Y' — graceful)
- 기타 접수 (`operations_dispatch_orders` created_at)
- 상담등록 (`operations_consultations` created_at)
- 카페24 총합

### 데이터 source
- cs_assignments / cs_workers / cs_shift_slots / cs_shift_groups / cs_group_min_coverage
- cs_holidays / cs_group_member_skip_dates / cs_leaves / cs_swap_requests
- cafe24Db (외부) — aceesosh / acrotpth
- operations_dispatch_orders / operations_consultations (자체)

### Graceful 처리
- 카페24 외부 DB 연결 실패 시 `null` → KPI 타일 "—" + "카페24 연결 안 됨" 라벨
- 모든 SQL try/catch — 마이그 미적용 / collation 이슈 안전
- skip_on_holidays 컬럼 없으면 affected_groups 빈 배열 (N-16 graceful)

### 효과
- 진입 즉시 24/365 운영 상태 파악 (지금 누가 / 오늘/내일 누가 / 빈자리 / 휴일)
- 검토 대기는 클릭으로 /requests 이동
- 월말 자동 생성 시기 자동 안내
- 외부 부하 (카페24 사고/긴급/상담) 실시간 가시화

### 검증
- tsc PASS (CallScheduler 0 errors)
- lint:harness 새 위반 0건
- lint:ui-design CallScheduler 0건


## 2026-05-15 (Phase N-16) — 그룹별 휴일 자동 제외 옵션 (skip_on_holidays)

### 사용자 의도
> "그룹설정에서 주중근무자들이 휴일은 빠져야 되는데 설정이 없는것같아 휴일설정에서 휴일로 들어간것에는 빠지도록 설정추가해줘 그부분은 또 다른근무그룹이 할수있게도 셋팅도 해야겠지?"

### 변경
- **마이그레이션**: `migrations/2026-05-10_cs_shift_groups_skip_on_holidays.sql`
  · `cs_shift_groups.skip_on_holidays TINYINT(1) NOT NULL DEFAULT 0` 추가 (멱등)
- **API GET `/api/call-scheduler/shift-groups`**: `hasSkipOnHolidays` 감지 + 별도 조회로 graceful 응답에 `skip_on_holidays` 포함
- **API POST `/api/call-scheduler/shift-groups`**: body `skip_on_holidays` 수용, INSERT 분기 (hasCategory && hasSkipOnHolidays / hasCategory only / legacy)
- **API PATCH `/api/call-scheduler/shift-groups/[id]`**: `ALLOWED_COLS` 에 `skip_on_holidays` 추가, graceful 컬럼 감지, boolean → 0/1 변환
- **UI `GroupEditor.tsx`**: 그룹 정의 섹션에 「🎌 휴일에는 자동 배정 제외」 체크박스 (설명 아래, 최소인원 위)
  · ON: 주중 근무 그룹 (휴일 자동 배정 제외)
  · OFF: 24/365 운영 그룹 (휴일에도 정상 배정)
- **알고리즘 `auto-generate/route.ts`**:
  · `GroupRow` 에 `skip_on_holidays` 추가
  · 그룹별 skip flag 별도 조회 → targetGroups 에 주입
  · 메인 루프 휴일 분기: `g.skip_on_holidays` 우선, 컬럼 미적용 시 legacy 전역 `skipHolidays` 사용
  · 전역 `skipHolidays` 는 master kill switch (전역 false 면 모든 그룹 휴일 정상 배정)

### 효과
- 주중 근무 그룹 (09:00~18:00 주4): `skip_on_holidays=1` → 자동 생성 시 cs_holidays 일자 후보 제외
- 야간/특수 그룹: `skip_on_holidays=0` → 휴일에도 정상 배정 (24/365 콜센터 유지)

### 검증
- tsc PASS (CallScheduler 모듈 0 errors)
- 마이그레이션 사용자 적용 완료 (skip_on_holidays / tinyint / default 0)


## 2026-05-09 (Phase K-3) — 자동 생성 알고리즘 그룹별 정교화 + AssignmentCell dow 색상 재활성

### 자동 생성 알고리즘
- WorkerConstraint → MemberConstraint + WorkerCycle 분리
- memberCons: Map<`${groupId}_${workerId}`, MemberConstraint> — multi-group 워커가 그룹마다 다른 priority/dow/한도 적용
- workerCycle: Map<workerId, WorkerCycle> — 외부 cycle 은 워커 글로벌 (모든 그룹 공통)
- ranking 시 lookupMember(g.id, wId) — 그룹 컨텍스트 lookup
- 슬롯 거부 / 연속 한도 / max_days_per_month / required_days_per_month / dow prefer/avoid 모두 멤버 단위
- isAvailableOnCycle 시그니처 변경 (cycle 정보만)

### AssignmentCell — dow 색상 layer 재활성
- 새 prop: `memberPreferDow`, `memberAvoidDow` (CSV "0,5") — ScheduleGrid 가 그룹 컨텍스트로 내림
- ScheduleGrid: `memberCfgMap = Map<\`${groupId}_${workerId}\`, { priority_level, dow_prefer, dow_avoid }>` 신설
- shift-groups GET 응답의 멤버 cfg 파싱 → cfgMap 채움
- 셀 호출 시 `slotGroups[slot.id].id + worker_id` 로 lookup → 색상 layer 재활성
- 효과: 같은 워커가 야간 그룹에서 화/목 희망, 주간 그룹에서 월/금 비선호 등 다른 색상 layer 표출

## 2026-05-10 (Phase N-15) — 회피일 통합 운영 (D안 — 메뉴 복잡도 최소)

### 사용자 의도
> "d 가 좋치 않을까요 점점 복잡해질수록 직관적으로 메뉴 복잡도가 적어야합니다"

### 변경 (/CallScheduler/requests 회피일 탭)
- **매니저 직접 등록 패널** 추가 (탭 위쪽):
  · 워커 chip (14명 tone bg + 선택 시 검정 pill)
  · 그룹 chip (워커 선택 시 그 워커가 속한 그룹만 자동 표출)
  · 시작일 / 종료일 / 사유 (선택)
  · [+ 등록] 즉시 `status='approved'`
  · 등록 후 워커/그룹 유지 (연속 입력 편의)
- 워커/그룹 fetch (workers + shift-groups API)
- 검증: 워커/그룹/일자 필수, 시작 ≤ 종료

### 효과
- 매니저가 **한 곳 (/requests 회피일 탭)** 에서:
  1. 직원 신청 검토 (기존)
  2. 직접 등록 (신규 — D안)
  3. 등록된 회피일 list (전체 필터)
- 깊은 메뉴 탐색 X (이전: ⚙ 설정 → 그룹 → 멤버 → 회피일 토글 4 클릭)
- "기본 셋팅" 가능 — 매니저가 미리 워커/그룹별 회피일 입력

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 0건

## 2026-05-10 (Phase N-14) — SubNav 운영/설정 분류 (사용자 의도)

### 사용자 피드백
> "시간부터 휴가랑 공휴일 은 전부 상위탭 설정으로 두고 하위로 빼도 될것같은데?
>  설정탭은 설정안으로 운영중인건 상위로 하면 느낌도 딱 맞네"
> "워커 그룹도 설정이니 넣어주세요"

### 변경
- **SubNav (상위, 운영만)**: 📊 대시보드 / 📋 직원 요청 / ⚙ 설정
  · 운영 중인 영역 (자주 보는 페이지) 만 상위 노출
  · 「⚙ 설정」 클릭 → settings 페이지 (모든 셋팅 통합)
- **settings 페이지 sub-nav (모든 셋팅)**: 🕐 시간 / 🚧 그룹 / 👥 워커 / 🎌 공휴일 / 💼 직원 휴가
  · 5 탭 유지 (그룹/워커도 셋팅이라 안에 포함 — 사용자 추가 의도)
  · 검정 pill 스타일 (정산 관리 §4 일관)

### 결과
- 매니저 직관: 운영 빈도 높은 그룹/워커는 상위, 자주 안 만지는 시간/공휴일/휴가는 설정 안
- 정산 관리와 같은 검정 pill 패턴 일관

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 0건

## 2026-05-10 (Phase N-13) — NeuDataTable 마이그 (CLAUDE.md §10 의무 컴포넌트 3종 완성)

### 변경
- 메인 page.tsx 의 자체 `<table>` 스케줄 list → **NeuDataTable**
- TableColumn<ScheduleListItem>[] 5 컬럼 (년/월 / 상태 / 근무자 / 충원율 / 최근 수정)
- 각 컬럼 sortBy 함수 — NeuDataTable 자체 정렬 (헤더 클릭)
- defaultSort 'year_month' / 'desc'
- onRowClick — 행 클릭 시 /CallScheduler/[id] navigate
- 자체 SortKey/SortDir/sorted/toggle/Th 함수 모두 제거 (NeuDataTable 자체 정렬)
- 빈 상태 emptyIcon "📅" + emptyMessage

### 효과
- CLAUDE.md §10 의무 컴포넌트 3종 완성:
  · ✓ DcStatStrip (N-10)
  · ✓ DcToolbar — settings 페이지 자체 nav 가 toolbar 역할 (이미 적용)
  · ✓ NeuDataTable (N-13)
- /loans (대출 관리) 와 동일 패턴

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 0건

## 2026-05-10 (Phase N-12) — PageTitle 자동 + 자체 헤더 모두 제거 (정산/대출 기준)

### 사용자 명령
> "CLAUDE.md 0-0 + 「🎨 페이지 디자인 표준」 정독.
>  페이지 헤더는 PageTitle 자동 — 자체 헤더 만들지 마세요.
>  기준: /loans (대출) 또는 /finance/settlement.
>  의무: DcStatStrip + DcToolbar + NeuDataTable.
>  검증: npm run lint:ui-design"

### PageTitle 등록 (`app/components/PageTitle.tsx`)
- PATH_TO_GROUP 에 CallScheduler 영역 추가 → group `cx`
- GROUP_LABELS 에 `cx: 'CX팀'` 신규
- PAGE_NAMES 에 6 페이지 등록:
  · /CallScheduler — 근무시간표 분석 & 배포
  · /CallScheduler/new — 새 월 만들기
  · /CallScheduler/settings — 설정
  · /CallScheduler/requests — 직원 요청 검토
  · /CallScheduler/skips — 회피일 검토
  · /CallScheduler/me — 내 시간표

### 자체 헤더 제거 (CLAUDE.md §10 위반 정정)
- **page.tsx**: Breadcrumb / 컬러점 / h1 / description 제거
  · 액션 버튼 (새 월 만들기 / 직원 마스터) → DcStatStrip actions 슬롯으로 이동
- **settings/page.tsx**: ← 링크 / h1 / description 제거
- **requests/page.tsx**: ← 링크 / h1 / description 제거 (필터만 우측 정렬)
- **new/page.tsx**: ← 링크 / h1 / description 제거
- **skips/page.tsx**: ← 링크 / h1 / description 제거 (필터만 우측 정렬)
- **[id]/page.tsx**: ← 링크 / h1 제거 (월 정보 + status pill 만 유지)

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 위반 0건

### 남은 작업 (선택)
- 메인 page.tsx 의 자체 `<table>` (스케줄 list) → NeuDataTable 마이그
- 운영 셋팅 펼침 (자체 SettingsTile div) → DcStatStrip 또는 DcToolbar 변형 사용

## 2026-05-10 (Phase N-11) — SubNav 검정 pill 패턴 (정산 관리 §4 준수)

### 사용자 피드백
> "상단부분이 정산페이지처럼 되어야합니다" + 정산/CallScheduler/factory-search 3 스크린샷 비교

### 문제
- N-9 의 SubNav 는 underline 스타일 (factory-search 와 같은 잘못)
- UI-DESIGN-STANDARD.md §4: **활성 검정 배경 #0f2440 + 흰 글씨**, 비활성 투명 + #64748b
- §6.2 factory-search 의 hr underline 위반 사례 명시

### 변경
- SubNav.tsx 재작성:
  · borderBottom 제거 (단순 padding-only 컨테이너)
  · 활성 탭: `background: #0f2440 + color: #fff + borderRadius: 8` (검정 pill)
  · 비활성 탭: `background: transparent + color: #64748b`
  · padding 8/16 fontSize 13 fontWeight 700 — 정산 관리 §4 동일
- 이모지 + 라벨 같은 string (fontSize 통일)

### 검증
- tsc CallScheduler 0 errors
- lint:ui-design CallScheduler 위반 0건

## 2026-05-10 (Phase N-10) — UI 디자인 표준 적용 (정산 관리 기준)

### 사용자 명령
> "CLAUDE.md 0-0 섹션 + 10 섹션 정독. 디자인 기준 = /finance/settlement (정산 관리).
>  표준 문서: _docs/UI-DESIGN-STANDARD.md. DcStatStrip + DcToolbar 의무 사용.
>  검증: npm run lint:ui-design"

### 변경 (UI-DESIGN-STANDARD.md §6.1 위반 정정)
- **메인 page.tsx**:
  · Breadcrumb 추가 ("운영 › 근무시간표 분석")
  · 페이지 제목 fontSize 22 → 20 / fontWeight 800 → 700 / 색 #0f2440
  · 컬러 점 (red/yellow/green) — 정산 관리와 동일
  · 큰 description 제거
  · 자체 KpiTile 4 카드 → **DcStatStrip 5 stat** (활성/공지/근무자/충원율/직원요청)
  · 헤더 액션 버튼 — 정산 관리 인라인 스타일 (5/12, 11/12)
- **[id]/page.tsx, settings/page.tsx, requests/page.tsx, new/page.tsx, skips/page.tsx**:
  · 페이지 제목 fontSize 22 → 20 / fontWeight 800 → 700 / 색 #0f2440
  · 큰 이모지 prefix 제거 (정산 관리 기준은 단순)
- **자체 stat 카드 (KpiTile, SettingsTile)** fontSize 24/22 → 18 (24px+ 위반 제거)

### 검증
- tsc CallScheduler 0 errors
- npm run lint:ui-design — CallScheduler 영역 위반 0건 ✓

### 표준 따라가야 할 다음 영역
- 자체 stat 카드 (KpiTile / SettingsTile) → DcStatStrip 으로 마이그 가능
- 검색바 → DcToolbar 적용 (현재 자체 구현 없음)

## 2026-05-09 (Phase N-9) — SubNav 표준 패턴 정정 (ClientLayout 중첩 제거)

### 사용자 피드백
> "ui 기준 다 어디갔나요? 컴포넌트? 기준 하네스? 다 아웃됌?"

### 문제 (N-8 잘못)
- ClientLayout (메인 사이드바 + 헤더 — `app/components/auth/ClientLayout.tsx`) 위에 자체 사이드바 만들어서 **중첩**
- factory-search 의 SubNav 패턴 (모듈 내 탭 line) 무시
- `lib/menu-registry.ts` SSOT 패턴 무시

### 정정
- `_components/SubNav.tsx` 신설 (factory-search 와 같은 탭 line 패턴)
  · 📊 대시보드 / 📋 직원 요청 / 🕐 시프트 / 🚧 그룹 / 👥 워커 / 🎌 공휴일 / 💼 휴가
  · settings 페이지는 `?tab=...` 매칭으로 활성 탭 표시
- `layout.tsx` 신설 — SubNav 자동 적용 (모든 자식 페이지)
- `page.tsx` 자체 사이드바 layout 제거 → 기존 단순 페이지 (대시보드)
- 기존 ClientLayout 메인 사이드바 그대로 (CallScheduler 메뉴 1개 — menu-registry SSOT)

### 결과
- ERP 표준 layout 회복: 메인 사이드바 (ClientLayout) + 모듈 SubNav (CallScheduler) + 페이지 컨텐트
- 다른 모듈 (factory-search 등) 과 동일 패턴

## 2026-05-09 (Phase N-8) — 사이드바 layout 통합 (매니저 통합 콘솔) [revert by N-9]

### 사용자 피드백
> "하위 편집도 기존 설정 페이지, 운영요약 전체설정 눌러도 기존페이지 이상하지않아요?
>  뭔가 페이지랑 구조가 정상적이지않을것같은데 전체 플로우를 점검해야하나"
> "B (사이드바 + 컨텐트) 가 쓰기엔 편하겠지?"

### 변경
- /CallScheduler 메인을 **사이드바 + 컨텐트 layout** 으로 재구성
- **좌측 사이드바** (220px sticky):
  · 📊 대시보드 / 📅 스케줄 / 📋 직원 요청 (⏳ 대기 카운트 배지)
  · ⚙ 운영 셋팅: 🕐 시프트 / 🚧 그룹 / 👥 워커 / 🎌 공휴일 / 💼 휴가 quota
  · 카운트 배지 (시프트/그룹/워커 N개)
  · 외부 link: 직원 마스터
- **우측 컨텐트** view 분기:
  · dashboard: 4 stat 카드 + 운영 셋팅 펼침 카드 + 최근 스케줄 5개
  · schedules: 전체 스케줄 list
  · requests: /CallScheduler/requests 페이지 link
  · shifts/groups/workers/holidays/leaves: settings tab 컴포넌트 임포트 (인플레이스 표출)
- **URL ?view=...** deep-link 동기화
- 기존 /CallScheduler/settings, /requests 페이지는 그대로 유지 (호환)

### 효과
- 매니저 1 페이지에서 모든 운영 영역 즉시 접근 (좌측 nav 1 클릭)
- "하위 편집이 같은 탭" 문제 해결 — 운영 셋팅이 메인 안에서 직접 표출/편집
- ERP 표준 layout — 데스크톱 운영팀에 익숙

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase N-7) — 메인 운영 셋팅 카드 인라인 펼침

### 사용자 피드백
> "뭘눌러도 상세는 같은탭인데 좀더 노력할순없었어?"

### 변경
- 운영 셋팅 카드 클릭 → 같은 탭 이동 X → **메인에서 인라인 펼침**
- 카드 ▶/▼ 토글 + 활성 시 boxShadow + translateY
- 펼침 영역 4종:
  · 🕐 시프트: 코드 + 시간 chip 그리드 (overnight 보라)
  · 🚧 그룹: 카테고리별 묶음 (야간 보라 / 주간 파랑 / 저녁 호박 / 특수 빨강) + 멤버 카운트
  · 👥 워커: tone bg chip + 🔒(외부) / 🏢(외부 cycle) 마크
  · 💼 휴가 quota: 잔여 부족 (< 3일) 워커 list — 0일은 빨강 보더, 1~2일 호박 보더
- 각 펼침 영역 [편집 →] 또는 [관리 →] 링크 — 깊은 편집은 settings 탭

### 효과
- 매니저가 메인에서 즉시 운영 디테일 파악 (시프트 9개 분포 / 그룹 13개 카테고리 / 워커 16명 chip / 잔여 부족 워커)
- 깊은 편집 필요 시만 settings 탭 진입

## 2026-05-09 (Phase N-6) — 메인 페이지 운영 셋팅 요약 카드

### 사용자 피드백
> "결국에 메인에 근무시간표 리스트 밖에없는데 설정에 저많은것들을 따로 들어가서 봐야하나?"

### 변경
- 메인 페이지에 「⚙️ 운영 셋팅 요약」 영역 신설 (스케줄 list 위)
- 4 카드 grid:
  · 🕐 시프트 N개 (시간대 정의) → /settings?tab=shifts
  · 🚧 그룹 N개 (시프트 + 멤버 + 패턴) → /settings?tab=groups
  · 👥 콜센터 워커 N명 → /settings?tab=workers
  · 💼 휴가 quota 셋팅 N/M 명 → /settings?tab=leaves
- 카드 hover translateY(-2px) + boxShadow
- 휴가 quota 셋팅 < 워커 수면 빨강 (위급 알림)
- 「전체 설정 →」 link 우측

### 운영 효과
- 매니저 메인에서 운영 상태 한눈에 (스케줄 list + 셋팅 요약)
- 설정 들어갈 필요 없이 카드 클릭 1번으로 해당 탭 직접 진입

## 2026-05-09 (Phase N-5) — GroupEditor 레이아웃 정리 (2분할 → 수직 1컬럼)

### 사용자 피드백
> "그룹편집 ui가 정리가 잘안된것같은데 / 큰 의미 없이 2분할된것같기도 하고"

### 변경
- 좌우 2분할 (`gridTemplateColumns: '1fr 1fr'`) → **수직 1컬럼** (`flexDirection: column`)
  · 위 카드: 그룹 정의 (이름/카테고리/색상/시프트/패턴/전략 — 가로 폭 활용)
  · 아래 카드: 멤버 + 후보 (가로 폭 넉넉)
- **최소 인원 collapsible** — 자주 안 만지는 셋팅 default 접힘
  · 토글 버튼: ⚖️ 최소 인원 [셋팅됨/미설정] [▶/▼]
  · 펼치면 매일 디폴트 + 요일별 grid
- padding 16 → 18 (시원시원 일관)
- 카드 gap 12 → 14

### L-1 효과
- 그룹 1개 편집 시 화면 좌우 빈 공간 X
- 멤버 영역이 가로 폭 활용해서 더 넓어짐 — 펼침 카드가 답답하지 않음
- 최소 인원은 필요 시만 펼침 (운영 빈도 적음)

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase N-4) — /requests 거절 사유 입력 모달

### 변경
- [✗ 거절] 즉시 거절 X → 모달 띄우고 사유 입력
- 거절 사유 textarea (4줄, placeholder 가이드)
- "거절 확정" 시 PATCH body 에 reason / resolution_note 포함
- skip / leave / swap 모두 동일 UX
- 사유는 직원 측 (MyScheduleView 또는 신청 list) 에 전달되어 거절 이유 명확

## 2026-05-09 (Phase N-3) — 직원별 휴가 잔여 시각화

### LeavesTab 신규 패널
- 「💼 {year}년 직원별 휴가 잔여」 — 카드 grid (auto-fill 280px)
- 각 카드: 워커 이름 + 휴가 종류별:
  · 라벨 (연차/패밀리데이/병가/...)
  · 잔여 N일 / 발급량 N (잔여 < 1 시 빨간 ⚠)
  · 사용량 막대 (≥90% 빨강 / ≥70% 노랑 / 그 외 파랑)
- quota 0 + 사용 0 인 종류는 숨김
- 잔여 적은 순 정렬 (위급한 워커 먼저)

## 2026-05-09 (Phase N-2) — MyScheduleView 디자인 시원시원

### 변경
- 헤더 액션 버튼 (휴가 신청 / 회피 신청 / 캘린더 다운로드) BTN.sm → BTN.md
- 보더 1px → 1.5px / fontWeight 700 → 800
- viewMode 토글 (월간/주간/오늘) padding 5/12 → 10/20, fontSize 12 → 14, fontWeight 700 → 800
- 활성 토글에 보더 2px + boxShadow

## 2026-05-09 (Phase N-1) — 자동 생성 미리보기 시각화 강화

### 변경
- AutoGenerateDialog 에 workers / slots prop 추가 (이름 lookup)
- shift-groups 별도 fetch — 그룹 이름 lookup
- warnings 안 worker_id slice → **워커 이름 (color tone bg)**
  · 🌙 익일 휴식 위반 시 "정동민" 등 명시
  · ⏱ 시간 겹침 시 슬롯 코드 (L05 × L13) 명시
- by_group chip → **그룹 이름 row + 생성수 + skip**
  (📊 야간콜 + 24, 🚧 주간 09-18 + 18 등)
- **🆕 워커별 예상 근무 분포 (균형 막대)** — plan 기반 워커별 카운트 합산
  · 워커 이름 + 색 + 막대 + 카운트
  · 전체 max 기준 비례
  · 균형 검토 즉시 가능

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase M-2) — 멤버 cfg 펼침 카드 시원시원 + 메인 헤더 ⏳ 카운트 배지

### 사용자 피드백
> "여기부분 ui 좀 제대로 표출했음 좋겠습니다. 숨지말고 시원시원하게 셋팅하자고요"

### MemberCfgPanel 큼직하게
- 들여쓰기: marginLeft 24 → 12 (시원하게 보여줌)
- padding: 10 → 18, gap: 10 → 18
- 보더 1px → 2px + 박스 그림자 추가
- 배경 0.92 → 0.96 (선명)
- 라벨: fontSize 10 → 13 fontWeight 700 → 800 + 부설명 inline
- P1/P2/P3 버튼: padding 5px → 14px, fontSize 11 → 14
- 요일 버튼: padding 4px → 10px, fontSize 10 → 13, borderRadius 4 → 8
- 입력 필드: padding 5/8 → 10/14, fontSize 11 → 14
- 슬롯 거부 chip: padding 3/8 → 8/14, fontSize 10 → 13, 활성 시 🚫 prefix
- gridGap 10 → 16

### 회피일 펼침 카드도 통일
- marginLeft 24 → 12, padding 8 → 16
- 보더 1 → 2 (호박색)
- 입력 필드 큼직 (padding 4/8 → 8/12, fontSize 11 → 13)
- + 추가 버튼 padding 4/10 → 8/18

### 메인 페이지 ⏳ 카운트 배지 (M-2 추가)
- /CallScheduler 페이지 mount 시 회피+휴가+교체 대기 카운트 fetch
- 「📋 직원 요청」 버튼:
  · 대기 0건 — 기본 디자인
  · 대기 N건 — 호박 배경 + ⏳ N 빨간 배지 (눈에 띄게)
- 매니저 한눈에 처리할 일 파악

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase M-1) — 매니저 직원 요청 통합 검토 페이지

### 사용자 의도
> 매니저 검토 동선 단순화 — 회피/휴가/교체 3 군데 흩어진 검토를 1 페이지로

### 신규 페이지: `/CallScheduler/requests`
- 3 탭: 🛌 회피일 / 🙋 휴가 / 🔄 시프트 교체
- 각 탭 ⏳ 대기 카운트 배지
- 상태 필터: 대기 / 승인됨 / 전체
- 일괄 검토 [✓ 승인] [✗ 거절] 버튼
- 회피는 그룹별 묶음 (기존 /skips 로직 재사용)

### 메인 페이지 링크
- `/CallScheduler` 헤더에 「📋 직원 요청」 버튼 추가 (⚙️ 설정 옆)

### 기존 화면 호환성
- `/CallScheduler/skips` (회피만) — 그대로 유지 (deep-link 호환)
- `EmployeeRequestsPanel` (모달) — 그대로 유지 ([⋯] 메뉴 안)
- 새 페이지는 통합 동선 추가 옵션

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase L-2) — 「내것만」 토글 + MyScheduleView 뷰 모드

### 사용자 요청
> "뷰도 일별로 보기 / 주간보기 / 내것만보기 등 지원"

### ScheduleGrid (매니저 매트릭스)
- Props 신규: `myWorkerId?: string` — 본인 워커 ID (없으면 토글 비활성)
- 「🙋 내것만」 토글 버튼 (외부/회피 토글 옆)
- ON 시 본인 워커 없는 셀 opacity 0.25 — 내 일정만 시각 강조
- 매트릭스 구조 (그룹/슬롯) 그대로 유지

### [id]/page.tsx
- /api/call-scheduler/me 호출하여 본인 worker_id fetch
- ScheduleGrid 에 myWorkerId prop 전달

### MyScheduleView (직원 본인)
- 뷰 모드 토글 (월간 / 주간 / 오늘)
- CalendarView prop 신규: `viewMode?: 'month' | 'week' | 'day'`
- month: 기존 그대로 (월 카드 그리드 + firstDow 빈칸)
- week: 오늘 포함 주 (일~토 7일) — 1행 grid
- day: 오늘 단일 일자 (또는 첫 일자) — 1 카드

### 검증
- tsc CallScheduler 0 errors

## 2026-05-09 (Phase L-1) — WeekView 신규 + 매니저 매트릭스 viewMode (월/주/일)

### 사용자 요청
> "뷰도 일별로 보기 / 주간보기 / 내것만보기 등 지원"

### WeekView 신규 컴포넌트
- 1주 7일 × 슬롯 매트릭스 (좁은 화면 가독성)
- ◀ 이전 주 / 이번 달 첫 주 / 다음 주 ▶ 이동
- 셀 폭 70px (월간 매트릭스보다 넓게 — 가독성)
- 슬롯 좌측 그룹 헤더 + 24h 시간 막대 + 6h 눈금 (ScheduleGrid 와 동일)
- 멤버 dow 색상 layer 재활성 (memberCfgMap)
- 월 경계 넘는 날짜는 흐릿하게 + 월 표시 (예: "5/3")
- 주간 뷰는 read-only — 편집은 매트릭스 모드 안내

### 매니저 [id]/page.tsx
- ViewMode 'week' 추가 — 토글 버튼 「📆 주간」
- 기존 「📋 매트릭스」 / 「📅 날짜별」 사이에 위치

### 검증
- tsc CallScheduler 0 errors

### L-2 (다음) 예정
- ScheduleGrid 에 「내것만 보기」 토글 (본인 워커 ID 매칭만 강조)
- MyScheduleView 에 viewMode (월/주/일 토글)

## 2026-05-09 (Phase K-2) — GroupEditor 멤버 카드 인라인 설정

### 사용자 의도
> "그룹에 인원 추가하면서 그 자리에서 셋팅"

### GroupEditor 변경
- 멤버 행 헤더 요약 칩: P1 / 🌟희망N / 🚫비선호N / 🛡연속한도 / 🚷슬롯거부
- ⚙ 펼침 토글 → MemberCfgPanel:
  - 🏷 우선순위 (P1/P2/P3)
  - 🌟 희망 / 🚫 비선호 요일 (toggle, 상호 배타)
  - 📈 월 필수 / 🛑 월 최대 / 🛡 연속 한도 (숫자, 빈칸=무제한)
  - 🚷 슬롯 거부 (모든 슬롯 chip toggle)
  - 📝 패턴 메모
- 새 멤버 추가 시 자동 펼침 (즉시 cfg 입력)
- 저장 시 PUT body — 새 형식 `members: [{worker_id, priority_level, ...}]`
- 신규 그룹: POST 후 cfg 별도 PUT (POST 가 priority 만 받음)

### 사고 회고 (코워크 멀티세션)
- 1차 작성 후 lock 충돌 → working tree 변경분 손실 → 재작성
- 향후: lock 발생 시 staging 결과 즉시 git diff > backup.patch 권장

## 2026-05-09 (Phase K-1) — 그룹 중심 설정 재구성 (DB + API + Worker UI 슬림)

### 사용자 의도
> "셋팅이 여기저기 가는게 불편 — 그룹에 인원 추가하면서 그 자리에서 셋팅"
> 워커 페이지는 그 결과/설정을 보여주는 쪽 (편집 X)

### 데이터 모델 변경
- cs_group_members 에 멤버별 8 컬럼 추가 (priority_level / preferred_dow_prefer/avoid /
  max_consecutive_work_days / required_days_per_month / max_days_per_month /
  blocked_slot_ids / work_pattern_text)
- cs_workers 의 위 8 컬럼 → 그룹멤버로 데이터 복사 후 cs_workers 에서 삭제
- cs_workers 는 정체성만: name/color_tone/group_label/is_external/external_pattern/
  cycle_days_on/off/cycle_start_date

### 마이그레이션
- migrations/2026-05-09_cs_phase_K_group_member_settings.sql (멱등 + 검증 SELECT)

### API 변경
- workers/route.ts: SELECT/INSERT 옮긴 컬럼 모두 제거, 정체성만
- workers/[id]/route.ts: PATCH ALLOWED 정체성 컬럼만 (color/group/is_external/external_pattern/cycle_*)
- shift-groups/route.ts: 멤버 응답에 8 멤버 설정 컬럼 추가 (graceful)
- shift-groups/[id]/members/route.ts: PUT body 확장 — `members: [{worker_id, priority_level, ...}]`
  (옛 `worker_ids` 호환)

### 자동 생성 알고리즘
- cs_workers SELECT 옮긴 컬럼 제거, 정체성 (cycle_*) 만
- cs_group_members JOIN 으로 워커별 첫 그룹 멤버 설정 fallback
  (그룹별 정교화는 K-2 별도)

### UI
- WorkersTab: 정체성만 (색상/그룹라벨/외부/외부cycle), 옮긴 필드 입력 모두 제거
- 안내 배너: "우선순위/요일/한도/슬롯거부/패턴은 「그룹」 탭의 멤버 카드에서"
- AssignmentCell: 워커 dow 색상 layer 임시 비활성 (그룹 컨텍스트 필요)

### K-2 (다음 commit) 예정
- GroupEditor 의 멤버 카드 인라인 설정 입력 (priority_level / dow_prefer/avoid / 한도 / 슬롯거부 / 패턴)
- 자동 생성 알고리즘 그룹별 정교화 (multi-group 워커가 각 그룹에서 다른 설정 적용)

### 검증
- tsc --noEmit CallScheduler 영역 0 errors
- 마이그레이션 검증 ① 8 컬럼 추가 PASS (사용자 확인)

## 2026-05-09 (Phase J-2C) — 외부/회피 행 매니저 전용 토글 (기본 숨김)

### 사용자 피드백
> "외부나 회피나 저런건 대놓고 표출하는건 별로야 다른직원들 눈도 있는데"

### 문제
- 정동민 외부 cycle 회색 막대 + 박혜정/김현정 등 회피 신청 🛌 행이 매트릭스에 그대로 표출
- 직원 시야에 노출 — 누가 외부 근무, 누가 회피 신청했는지 다른 직원이 알 수 있는 사생활 노출

### 해결
- ScheduleGrid 에 `showPrivate` state (기본 false)
- 툴바 토글 버튼: 🙈 외부/회피 숨김 ↔ 👁 외부/회피 표시 (기본 OFF)
- 매니저가 계획 시점에만 켜고 보는 용도
- 영향 영역:
  - thead 외부 cycle 행 (그룹 미배정 워커) — `showPrivate &&` 로 게이팅
  - thead 회피 행 — 동일 게이팅
  - tbody 그룹 섹션 안 외부/회피 행 — `sectionExt`/`sectionSkip` 둘 다 OFF 면 빈 배열
- 셀 자체 (AssignmentCell) 의 가드 위반 색상 등은 그대로 — 셀 안에서는 가독성 유지
- 향후: 직원 본인 화면 (CallScheduler/me) 에서는 본인 회피만 보이도록

### 검증
- tsc --noEmit CallScheduler 영역 0 errors
- lint:harness 새 위반 0건

## 2026-05-08 (Phase J-2B) — 매트릭스 화면 너비 축소 + 24h 시간 막대 가시화

### 사용자 피드백
> "화면도 뭔가 너무넓고 시간대 구성은 추가 안된것같고 24시간 구성으로"

### ScheduleGrid 변경
- 슬롯 좌측 td 너비: minWidth 200 / maxWidth 220 → **148 / 168**
- 일자 셀 너비: minWidth 56 → **48** (header / assignment td / group cycle/skip td 일치)
- 슬롯 좌측 시간 막대:
  - 항상 24h 스케일 (overnight 도 1440 분 기준)
  - overnight 슬롯 → **2 segment 분리 wrap** ([start→24:00] + [00:00→end], 두 번째 segment 65% opacity + 흰 dash 보더)
  - 막대 높이 6 → **12 px** (시각 가시성 강화)
  - **6시간 눈금** (0/6/12/18/24) — 12 시 라인 진하게 (0.18) + 나머지 (0.08)
  - **시간 라벨 행** (0 6 12 18 24) — monospace 7px
- 슬롯 코드/시간 한 줄로 압축 (그룹 chip 은 tbody 그룹 헤더 row 가 표출하므로 좌측 셀에서 제거 — Phase J-3 효과)

### 운영 효과
- 매트릭스 31 일 + 슬롯 행 합쳐도 화면 폭 ~25% 축소 (cell 56→48 + 좌측 200→148)
- 슬롯 시간대가 24h 막대로 직관 표출 → "L13 야간이 어디부터 어디까지 + 익일 wrap" 한눈에 파악
- 좌측 좁아져도 코드 + 시간 + 24h 막대 + 시간 라벨 모두 보임

### 검증
- tsc --noEmit PASS (CallScheduler 영역 0 errors)
- lint:harness 새 위반 0건

## 2026-05-08 (Phase J-3) — 그룹별 섹션 묶음 (매트릭스 시각 분리)

### Phase J-3 — 슬롯/cycle/회피를 그룹 영역에 통합 (사용자 5/8 의도)
- 사용자 의도: "회피나 근무 블럭은 정동민처럼 해당 근무그룹쪽에 표출"
- ScheduleGrid 변경:
  - thead 의 외부 cycle 행 / 회피일 행 = **그룹 미배정 워커만** 유지 (그룹 멤버는 tbody 그룹 섹션으로 이동)
  - tbody 의 슬롯 행 → React.Fragment 로 그룹별 섹션 구성:
    - 🚧 **그룹 헤더 row** (카테고리 색 + 멤버 카운트)
    - 🏢 그룹 멤버 외부 cycle 행 (들여쓰기)
    - 🛌 그룹 멤버 회피일 행 (들여쓰기)
    - L?? 슬롯 행 (기존)
  - 그룹 변경 시점에 헤더 + 그룹별 cycle/회피 자동 삽입
- 카테고리 색:
  - 야간 → 보라 / 저녁 → 호박 / 주간 → 파랑 / 특수 → 빨강
  - 헤더 보더 3px stripe
- 운영 효과:
  - 매니저 한눈에 "이 그룹은 누가 야간 / 누가 회피 / 어느 슬롯" 파악
  - 야간콜 그룹 영역 안에 정동민 외부 cycle + 회피 + L13 슬롯 행 모두 모임
  - 주간 09-18 영역엔 주간 워커 회피만

### 검증
- tsc --noEmit PASS
- lint:harness 새 위반 0건

## 2026-05-08 (Phase J-2A) — DayView 24h Timeline Gantt

### Phase J-2A — 일별 24시간 시간 매트릭스 (사용자 5/8 의도)
- 사용자 의도: "달력/시간 기준 → 그 안에 그룹/워커 표출"
- DayView 의 일자 디테일 패널 위에 **24h Timeline Gantt 추가**
  - X축: 0~24시 (overnight 포함 시 48h 스케일 자동)
  - Y축: 슬롯 (시작 시각 정렬)
  - 슬롯 막대: 시간 범위만큼 가로 폭, 색상 (주간 파랑 / 야간 보라)
  - 막대 안: 워커 chip 4명까지 + "외 N명"
  - 시간 헤더: 0/2/4/6...24 (overnight 시 0/2/4...48)
  - 12h / 24h 마커 (회색 세로선)
- hover 툴팁: "L13 20:30~08:30 — 정동민, 전정연, 윤민진"
- overnight 슬롯 자동 처리 — 48h 스케일 + 24h 마커 (날 경계 표시)

### 운영 효과
- 매니저가 일자 카드 펼치면 **시간대 분포 한눈에**:
  - "8시에 누가 일하나" → 막대 보면 즉시
  - "야간 인계 시간" → L12 19~23 + L13 20:30~08:30 겹침 시각
  - "9-18시 동시 일하는 사람" → 막대들 겹침 영역
- 기존 슬롯 list 도 유지 (디테일)

## 2026-05-08 (Phase J) — 시간대 + 그룹 같이 표출

### Phase J — 슬롯 좌측 컬럼 보강 (사용자 5/8 요청)
- 사용자 의도: "매트릭스에 실제 시간대 + 그룹 같이 표출"
- ScheduleGrid 변경:
  · `slotGroups` state — `/api/call-scheduler/shift-groups` fetch (slotId → group 매핑)
  · 슬롯 좌측 sticky 컬럼 폭 100→200px / minWidth 200, maxWidth 220
  · 카테고리별 색 stripe (좌측 3px border)
    - 야간 → violet / 저녁 → amber / 주간 → blue / 특수 → red / 일반 → gray
- 표출 구조 (각 슬롯 행):
  ```
  [stripe] L13 20:30~08:30 익  [야간콜]
            ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ (24h 시간 막대)
                    12h            24h
  ```
- 24h 시간 막대 (mini SVG-like div):
  · overnight 슬롯 → 48h 스케일
  · 슬롯 시작/종료 시각을 막대 left/width 로 시각화
  · 12h / 24h 마커 (회색 세로선)
- 그룹 chip:
  · 슬롯 라벨 옆 작은 pill (max-width 80, ellipsis)
  · 카테고리별 색
  · hover 툴팁: "그룹: {name} ({category})"

### 운영 효과
- 매니저가 매트릭스 첫 컬럼 보면 즉시 파악:
  · 슬롯 코드 (L13) + 시간 (20:30~08:30) + 익일 표시
  · 어느 그룹 (야간콜 / 주간 09-18 / 등)
  · 24h 시간대 막대 — 야간 vs 주간 시각 구분 (보라 vs 파랑)
- 사용자 원칙 충족: "시간대 + 그룹 같이 표출"

## 2026-05-08 (Phase E + F) — 가드 위반 시각화 + 빈 셀 사유

### Phase E — 가드 위반 시각화 (clientside)
- ScheduleGrid 에 `violationMap` 신설 — 워커별 일자별 위반 검사
  - **시간 겹침** (time_conflict): 같은 워커 같은 날 두 슬롯 시간 범위 비교
  - **익일 휴식** (next_day_block): overnight 종료 + slot.next_day_blocking_hours > 다음날 슬롯 시작
  - **연속 한도** (consec_limit): 워커별 연속 근무일 streak vs slot.max_consecutive_days
- AssignmentCell 신규 prop `violations: Set<...>`
- 시각 표시:
  - 🔴 시간 겹침 → 강한 빨강 보더 + ⏱ 아이콘
  - 🔴 익일 휴식 위반 → 빨강 보더 + 🌙 아이콘
  - 🟡 연속 한도 → 노랑 보더 + 📅 아이콘
- 우선순위: violation 보더 > Phase D 색상 layer

### Phase F — 빈 셀 사유 분석 (Phase 1)
- AssignmentCell 신규 prop `emptyReason: string`
- ScheduleGrid 에서 일자별 회피 신청자 (skipDates) 매핑
- 빈 셀 hover 툴팁: "비어있음 — 회피: 정동민, 윤민진⏳"
  - ⏳ 마크: 신청 대기 중

### 통합 hover 툴팁 형식
```
"{워커명} · {special} [✓ 희망 요일] [⏱ 시간 겹침]"
"비어있음 — 회피: 정동민, 윤민진⏳"
```

## 2026-05-08 (Phase G + H) — 직원 회피 신청 + 매니저 검토 통합

### Phase G — 직원 본인 회피일 신청
- 신설: `components/SkipRequestDialog.tsx`
  · 그룹 선택 (활성 그룹 chip) + 일자 범위 + 사유
  · POST /api/call-scheduler/shift-groups/[id]/skip-dates
  · status='requested' 명시 → 매니저 검토 대기
- MyScheduleView 헤더에 "🛌 회피 신청" 버튼 추가
  · 휴가 신청 (🙋) 옆에 나란히
  · 토큰 페이지 (/e/[token]) 도 같은 컴포넌트 사용 — 본인 토큰으로 동작

### Phase H — 매니저 검토 통합 페이지
- 신설: `/CallScheduler/skips` 페이지
- 기능:
  · 미래 90일 범위의 모든 그룹 회피일 일괄 표시
  · 필터: ⏳ 대기 / ✓ 승인됨 / 전체
  · 그룹별 묶음 표시 (Glass L4 카드)
  · 각 row: status pill + 워커명 + 일자 + 사유
  · 대기 신청에 [✓ 승인] / [✗ 거절] 버튼
- API: 기존 `GET /skip-dates` + `PATCH /skip-dates/[id]` 활용

### 운영 흐름 완성
```
직원 마이페이지 [🛌 회피 신청] → status='requested'
   ↓
매니저 /CallScheduler/skips 페이지 — 일괄 검토
   ↓
[✓ 승인] → status='approved'
   ↓
자동 생성 알고리즘이 후보 제외 (group_skip warning 발생)
   ↓
매트릭스 워커별 회피일 행에 🛌 표시 (h-4)
```

## 2026-05-08 (Phase B + C 일부 + D) — UI 가이드 + 매트릭스 직관화 + 색상 layer

### Phase B — UI 디자인 가이드 신설
- `_docs/UI-GUIDE.md` 작성
  · 버튼 크기 정책 (작은 버튼 지양 — 22×22 미만 mini 버튼 금지)
  · Glass L1~L5 깊이 정의
  · 매트릭스 셀 크기 (32px) + 14색 토큰
  · Phase D 색상 layer 정의

### Phase C 일부 — 매트릭스 셀 크기 확대
- AssignmentCell 높이 24 → **32px**
- AssignmentCell 폰트 11 → **12px**
- AssignmentCell 보더 radius 4 → 6
- ScheduleGrid 셀 td minWidth 44 → **56px**
- ScheduleGrid 헤더 th minWidth 44 → 56
- 사용자 원칙 충족: "쪼그만 버튼 지양, 시간대×워커 직관적"

### Phase D — 워커 조건 색상 layer (요일 매치)
- AssignmentCell 신규 prop `dow?: number` (0~6)
- `matchDow(csv, dow)` 헬퍼 — preferred_dow_avoid/prefer 매치 검사
- 매치 시 보더 강화:
  · 희망 요일 → 옅은 녹색 (rgba(34,197,94,0.55))
  · 비선호 요일 → 옅은 빨강 (rgba(239,68,68,0.55))
- 툴팁에 "[✓ 희망 요일]" / "[⚠ 비선호 요일]" 추가
- ScheduleGrid 가 `dowIndex(d)` 계산해서 prop 전달

## 2026-05-08 (Phase I) — 그룹별 우선순위 정책 표출

### PR-2SS-Phase-I — 매니저 판단 도구 (GroupEditor 정책 박스)
- 사용자 시나리오:
  > "야간 1번 직원이 근무가능일 지정 → 10일만 근무 → 빠질 날짜 지정 →
  >  다른 워커가 그 날짜 들어갈 때, 그 그룹의 우선순위 설정이 표출되어야"
  > "근무 안한지 오래된 순 / 근무시간 짧은 순 / 빼달라는 날짜 (제외) / 연차 포함"
- 변경 (GroupEditor 좌측 폼 끝에 신규 박스):
  - 🎯 우선순위 정책 — Glass L1 + 파랑 보더
  - ✓ 채울 워커 결정 7단계 (priority → prefer → avoid → required 미달 → by_dow → total → last_date)
  - ✗ 후보 제외 규칙 6개 (회피일 / 연차 / cycle / 슬롯거부 / 연속 / 익일)
  - 💡 정책 변경 위치 안내 (직원 탭 / 시간 탭 / 멤버 패널 / 휴가 탭)
- 운영 효과:
  - 매니저가 그룹 편집 시 한눈에 "이 그룹은 어떻게 채워지나" 파악
  - 사용자 의도 (5/8) "어떻게 설정해서 어떻게 활용하겠다는 매니저 판단이 서겠죠" 충족
  - 정책 변경하려면 어디 가야 하는지 즉시 안내

### 마스터플랜 신설 (`_docs/SESSION-MASTER-PLAN.md`)
- PR-2SS 시리즈 전체 회고 (a/b/c/d/e/g/h-1/h-1-fix/h-4 + Z2/Z3)
- 현재 시스템 상태 (DB / 알고리즘 ranking / UI 페이지 맵)
- 미완료 Phase B~I 정리 + 진행 순서

## 2026-05-08 — PR-2SS-h-4 (매트릭스 회피일 시각 표출)

### PR-2SS-h-4 — 매트릭스에 회피일 워커별 행 추가
- 사용자 원칙: 매트릭스 = '왜' 답하는 곳 / 설정 = 단일 입력 위치
  → 회피일 입력해도 매트릭스에 안 보이는 답답함 해소
- API 신설: `GET /api/call-scheduler/skip-dates?from=&to=&status=`
  - 모든 그룹 통합 조회 (status=approved,requested 디폴트)
  - graceful fallback (테이블 미적용 시 빈 배열)
- ScheduleGrid 변경:
  - 월간 회피일 fetch (schedule.year/month + status filter)
  - skipMap 매핑: `(worker_id, isoDate) → { status, reason, group_name }`
  - 외부 cycle 행 패턴 따라 **회피일 워커별 행** 추가 (요약 layer)
    · 🛌 (승인) — 노랑 배경
    · ⏳ (신청 대기) — 빨강 배경
    · hover 툴팁: "{워커} 회피 [그룹명] — 사유 — 일자"
- 매트릭스 시각 효과:
  - 외부 cycle 행 + 회피일 행이 일자별 헤더 아래 표출
  - 매니저가 한눈에 "왜 5/15 야간 비었지" 답 — 정동민 회피 행에 🛌 보임
- 다음 Phase (h-5/6/7):
  - h-5: 비선호/희망 요일 셀 색상 + cycle 회색 줄
  - h-6: 가드 위반 시각화 (익일 휴식 / 연속 한도 / 시간 겹침)
  - h-7: 빈 셀 hover 사유 분석

## 2026-05-06 (저녁 후) — PR-2SS-h-1-fix (회피일 모달 → 인라인 펼침)

### PR-2SS-h-1-fix — UX 개선 (사용자 피드백)
- 사용자 피드백: "쓰기 좀 불편" + "바로 표출 (모달 말고)"
- 변경:
  - 🛌 chip 클릭 → **모달** 대신 **그 자리에서 펼침** (accordion)
  - 한 명씩 펼친 상태로 다른 멤버 보면서 작업 가능
  - 빠른 입력 한 줄: 시작일 / `~` / 종료일 / 사유 / [+ 추가]
  - 시작일 입력 시 종료일 자동 동일 (단일 일자 빠른 입력)
- UI:
  - `expandedSkipWorkerId` state — 한 명씩 펼침
  - chip 라벨에 ▶ / ▼ 표시 (펼침 상태)
  - 펼친 영역: 기존 회피일 목록 (status pill + 승인/거절/삭제) + 빠른 입력 한 줄
  - 모달 (GroupSkipDatesModal) 컴포넌트 사용처 제거 (파일은 orphan 으로 남겨둠)

## 2026-05-06 (저녁) — PR-2SS-h-1 (그룹 회피일 — 매니저 측)

### PR-2SS-h-1 — 그룹 차원 회피일 (Group Member Skip Date)
- 사용자 시나리오: "정동민이 야간 그룹에서 5/15 빠지고 싶음" → ranking 으로 다른 멤버 자동 채움
- cs_leaves 와 별개 — 그룹 한정, 정식 휴가 X, 단순 회피
- DB 마이그레이션: `2026-05-06_cs_group_member_skip_dates.sql`
  - 신규 테이블 `cs_group_member_skip_dates` (id / group_id / worker_id / start_date / end_date / reason / status / requested_by/at / approved_by/at)
  - status: requested / approved / rejected / canceled
  - INDEX (worker_id, start_date, end_date), (group_id, status, start_date)
  - FK group/worker ON DELETE CASCADE
- API:
  - `GET    /api/call-scheduler/shift-groups/[id]/skip-dates?status=&from=&to=`
  - `POST   /api/call-scheduler/shift-groups/[id]/skip-dates` (매니저 직접 = 즉시 'approved')
  - `PATCH  /api/call-scheduler/shift-groups/[id]/skip-dates/[skipId]` (status / reason / start/end)
  - `DELETE /api/call-scheduler/shift-groups/[id]/skip-dates/[skipId]`
- 알고리즘:
  - 후보 필터에 `group_skip` hard exclude (approved status 만)
  - `groupSkipMap` 사전 로드 (월간 일괄)
  - `Warning` 타입 'group_skip' 추가 — sourceWarning 패널 분류
- UI:
  - `GroupEditor` 멤버 패널 — 워커별 🛌 chip (승인 N건 / 신청 M건 대기)
  - 클릭 시 `GroupSkipDatesModal` — 신청 목록 + 승인/거절/삭제 + 매니저 즉시 추가
  - 회피일 요약 (최대 3건 + 더보기) 인라인 표시
  - `AutoGenerateDialog` warning 'group_skip' pill + 디테일
- _docs / types: SkipStatus + GroupMemberSkipDate 타입 + 갱신
- 다음 단계 (h-2/h-3):
  - 직원 본인 신청 흐름 (마이페이지)
  - 매니저 검토 일괄 처리 화면

## 2026-05-06 — PR-2SS-d revert + PR-2SS-g (희망 요일)

### PR-2SS-d revert — 최소 경력 폐기 (사용자 운영 정책)
- 사용자 결정: 매니저가 신입 야간 직접 판단해서 배치, hard rule 강제 X
- DB 마이그레이션: `2026-05-06_cs_seniority_drop_prefer_dow.sql` (cs_shift_slots.min_seniority_months DROP + cs_workers.preferred_dow_prefer 신설)
- 알고리즘: hire_date LEFT JOIN 제거, monthsSince 헬퍼 폐기, seniority_short warning 제거
- API: shift-slots GET/POST/PATCH min_seniority_months 화이트리스트 제거 (graceful)
- UI: ShiftsTab 최소 경력 섹션 + 🌱{N}m 배지 폐기, AutoGenerateDialog seniority_short pill/디테일 폐기
- types.ts: ShiftSlot.min_seniority_months 제거

### PR-2SS-g — 희망 근무일 (Hard ranking)
- 운영 사실: 워커별 "이 요일 매치 시 우선 배정" 신규 정책
- DB 마이그레이션: cs_workers.preferred_dow_prefer VARCHAR(16) NULL 신설 ('1,3,5' = 월수금)
- 알고리즘: ranking 정렬 2순위 신설 (priority 다음, avoid 앞)
  ```
  1. priority_level ASC
  2. preferred_dow_prefer 매치 (NEW — 매치 우선)
  3. preferred_dow_avoid 매치 (기존 — 후순위)
  4. required 미달 우선
  5. by_dow ASC
  6. total ASC
  7. last_date 거리 DESC
  ```
- API: workers GET/POST/PATCH preferred_dow_prefer graceful 추가
- UI: WorkersTab ConstraintsPanel "🌟 희망 요일" 7-button chip 그리드 (비선호 위)
- types.ts: Worker.preferred_dow_prefer

## 2026-05-05 (저녁 — 야간 100% 설정화 시리즈)

### PR-2SS-e — 시간 분해 + 가산율 (KPI 보조)
- 운영 사실 (Rule 25): 야간 가산율 없음 (현재). 컬럼만 신설 — 향후 정책 변경 시 매니저 직접 설정.
- DB 마이그레이션: `2026-05-05_cs_time_breakdown.sql`
  - `cs_shift_slots.night_period_start TIME NULL` (가산 시간대 시작)
  - `cs_shift_slots.night_period_end TIME NULL` (가산 시간대 종료, 자정 넘음 가능)
  - `cs_shift_slots.night_premium_rate DECIMAL(4,2) DEFAULT 0` (가산율)
  - `cs_assignments.day_hours / night_hours / premium_hours DECIMAL(4,2) NULL`
- 알고리즘:
  - `computeBreakdown()` — slot 시간을 day/night 로 분해 (자정 넘는 가산 시간대 처리)
  - `intersectMin()` — 두 분 단위 구간 교집합
  - apply 단계: insert/update 시 day_hours/night_hours/premium_hours 동시 저장 (graceful)
- API:
  - `shift-slots GET/POST/PATCH`: 세 컬럼 graceful 추가
- UI:
  - `ShiftsTab` — 시간 분해 + 가산율 섹션 (가산 시작 / 종료 / 가산율 input)
- 운영 효과:
  - 현재 가산율 0 → 인건비 영향 없음
  - 향후 KPI 분석 페이지에서 야간시간 / 가산시간 누적 표시 가능

### PR-2SS-d — 신입 페어링 (최소 경력)
- 운영 사실 (Rule 25): 신입은 야간 안 보냄 (운영 정책)
- DB 마이그레이션: `2026-05-05_cs_shift_slots_min_seniority.sql`
  - `cs_shift_slots.min_seniority_months TINYINT NOT NULL DEFAULT 0`
  - 시드: `is_overnight=1` 슬롯에 6개월 자동 적용 (이미 손댄 row 보존)
- API:
  - `shift-slots GET/POST/PATCH`: 컬럼 graceful 추가
  - `auto-generate`: ride_employees LEFT JOIN (employee_id || name 매칭) → hire_date 로드
  - 후보 필터: hire_date 모르면 후보 X (안전), `monthsSince(hire_date, isoDate) < required` 면 제외
  - Warning 타입 'seniority_short' (실제 개월수 + 필요 개월수 응답)
- UI:
  - `ShiftsTab` — 안전 가드 섹션에 최소 경력 input + 카테고리 overnight 시 6개월 자동 제안
  - 시프트 목록에 `🌱{N}m` 작은 배지
  - `AutoGenerateDialog` — 경고 type 'seniority_short' 분류 표시
- 운영 효과:
  - 매니저가 야간 슬롯에 6개월 디폴트 두면 신입 자동 후보 제외
  - 입사일 모르는 워커도 자동 후보 X (운영 안전 보수)

### PR-2SS-c — 연속 한도 + 슬롯 거부
- DB 마이그레이션: `2026-05-05_cs_workers_blocked_consec.sql`
  - `cs_workers.max_consecutive_work_days TINYINT NULL` (워커별 연속 근무 한도)
  - `cs_workers.blocked_slot_ids JSON NULL` (슬롯 거부 명단)
- 알고리즘:
  - `workerConsec` Map — 일자별 누적 (선택 시 ++ / 휴무일 = 리셋 0)
  - `workedToday` Set — 그룹 무관 같은 날 1회만 카운트
  - 후보 필터에 slot_blocked + consec_limit hard exclude
  - slot.max_consecutive_days + worker.max_consecutive_work_days 둘 중 작은 값 적용
  - Warning 타입 추가: `consec_limit`, `slot_blocked`
- API:
  - `workers GET/POST/PATCH`: 두 컬럼 graceful + JSON 안전 파싱
- UI:
  - `WorkersTab` ConstraintsPanel — 연속 한도 input + 슬롯 거부 chip 그리드
  - `AutoGenerateDialog` — 경고 type 'consec_limit' / 'slot_blocked' 분류 표시
- 운영 효과:
  - 야간 슬롯 max_consecutive_days=3 + 워커별 한도 둘 중 작은 값 적용
  - "이 워커는 이 슬롯 절대 X" 같은 hard exclusion 표현 (예: 신입은 야간 거부)

### PR-2SS-a — REVERTED (사용자 통찰: ranking 으로 충분)
- 처음 cycle_kind ENUM (external | internal_pattern) 추가하려 했으나
- 사용자 통찰: **현재 자동 생성 알고리즘이 이미 "ranking 으로 빈자리 자동 채움"** 으로 동작
  - required_days_per_month 미달 우선 (정동민 10일 채우기)
  - by_dow / total ASC + last_date 거리 DESC (오래되고 적게 한 사람 우선)
  - cs_leaves 'off' 자동 제외 + ranking 백필
- internal_pattern 의 hard 패턴 강제는 ranking 으로 자연스럽게 표현됨 → over-engineering
- 모든 변경 revert (types / workers API / auto-generate / WorkersTab)
- 마이그레이션 파일은 mount 권한상 삭제 불가 → noop SELECT 으로 덮어씀 (실행해도 무해)

### PR-2SS-b — 익일 휴식 + 시간 겹침 가드
- 운영 사실 (Rule 25 — 사용자 인터뷰):
  - 야간 가산율 없음 / 연속 야간 한도 운영 기본 3일 / 야간 종료 후 휴식 자연 16시간
  - 휴일 야간 특수 인원 X / 신입 야간 금지 (PR-2SS-d 에서 시드)
- DB 마이그레이션: `2026-05-05_cs_shift_slots_safety_attrs.sql`
  - `cs_shift_slots.next_day_blocking_hours TINYINT NOT NULL DEFAULT 0`
  - `cs_shift_slots.max_consecutive_days TINYINT NULL`
  - 시드: `is_overnight=1` 슬롯에 16h / 3일 자동 적용 (이미 손댄 row 보존)
- API:
  - `shift-slots GET/POST/PATCH`: 두 컬럼 graceful 추가
  - `auto-generate`:
    - `workerLastEnd` Map — 워커별 마지막 슬롯 종료 시각 추적 (overnight 면 다음날 자정 이후)
    - 후보 필터에 `next_day_blocking_hours` 가드 — 직전 슬롯 종료 + N시간 < 오늘 슬롯 시작 → 후보 제외
    - apply 전 시간 겹침 검사 — 같은 (worker, date) 의 plan + existing + lock 슬롯들 시간 비교
    - `Warning` 다중 타입 (`missing` / `next_day_block` / `time_conflict`)
    - `summary.warn_by_type` 카운트 응답
- UI:
  - `ShiftsTab` — 안전 가드 입력 섹션 (종료 후 휴식 / 연속 한도) + 카테고리 'overnight' 시 16/3 자동 제안
  - 시프트 목록 테이블에 `🌙16h` `📅3` 작은 배지
  - `AutoGenerateDialog` — warning 패널 다중 타입 분류 표시 (인원 부족 / 익일 휴식 위반 / 시간 겹침)
- 운영 효과:
  - 야간조 누군가가 다른 그룹에 추가 멤버로 들어가도 다음날 새벽 자동 제외
  - manual_lock 으로 박는 시간 겹침도 미리 경고
  - 5월 케이스 회귀: 야간조 (정동민·전·윤) 모두 야간 그룹만 → 자연 격리, 동작 동일

## 2026-05-05 (새벽 — 매트릭스 외부 cycle 시각화)

### PR-2RR-a-fix — schedules API cycle 컬럼 응답
- 사용자 보고: 매트릭스에 외부 cycle 행 안 보임
- 원인: `/api/call-scheduler/schedules/[id]` GET 이 `is_external` 만 응답하고 `cycle_days_on/off/start_date` 누락
- 수정: workers SELECT 에 cycle 컬럼 graceful 추가 (`hasCycleCol` 체크)
- 회귀 케이스: `regression-cases/...api-data-missing.md` 같은 패턴 — 다음에 cycle 같은 새 컬럼 추가 시 schedules/[id] API 도 같이 갱신 필요

### PR-2RR-a — 매트릭스 외부 직원 cycle 시각화
- 매트릭스 일자 헤더 아래에 외부 직원(is_external + cycle 정의)별 한 줄 추가
- cycle on phase = 회색 막대 (외부 근무 — 당사 X)
- cycle off phase = 투명 (외부 휴무 — 당사 가능)
- 호버 툴팁: "정동민 외부 근무 (당사 X) — 2026-05-01"
- 라벨: 🏢 정동민 외부
- `utils/hours.ts` 에 `isOnExternalDuty()` 헬퍼 추가 (서버/클라 공용)
- 운영 효과:
  - 매니저가 매트릭스 보면서 정동민 외부 일정 한눈에 확인
  - 회색 셀 = 정동민이 들어올 수 없는 날 (자동 제외)
  - 흰색 셀 = 정동민 가능일 (협의 후 매니저가 직접 박음)

## 2026-05-05 (새벽 — d-3 회귀 + 데이터 분석 기반 단순화)

### PR-2QQ-d-revert — preferred_dow_only 폐기 + cycle 의미 반전
- **데이터 분석** (17개월 실 운영 데이터): dow_only 사용 사례 없음 → 폐기
- 정동민 cycle 5/1 start 2-on-2-off 패턴 검증 ✓ (외부 회사 일정 = 1년 고정)
- DB 마이그레이션: `2026-05-05_cs_workers_dow_only_drop.sql`
  - `cs_workers.preferred_dow_only` 컬럼 DROP (data 비어있음 — 안전)
- API:
  - `workers GET/POST/PATCH`: dow_only 필드 제거 (graceful)
- UI `WorkersTab` ConstraintsPanel:
  - "요일 한정" 7-button 영역 제거
  - "🔁 자동 근무 패턴" → "🏢 외부 근무 cycle (당사 X)" 라벨 변경
  - 입력 라벨: "근무일/휴무일" → "외부 근무일/외부 휴무일"
  - 안내: "외부 근무일은 자동 생성에서 당사 후보 제외"
- 자동 생성 알고리즘:
  - `cycleAllows()` → `isAvailableOnCycle()` 함수명 변경
  - 의미 반전: cycle on phase = 외부 근무 = 당사 X / cycle off phase = 외부 휴무 = 당사 가능
  - `dowOnlyAllows()` 함수 제거
  - 기존 알고리즘 흐름은 동일, cycle 의미만 운영 사실에 맞게 반전
- 운영 사실 (Rule 25):
  - 정동민 외부 cycle = 1년 고정 → 한 번 입력 후 매월 자동 적용
  - 외부 휴무일 16일 = 정동민 후보 풀
  - 매월 9-10일 = 매니저 협의 후 manual_lock (의견 수렴 도구는 PR-2RR 시리즈)

## 2026-05-04 (밤 — 자동 생성 알고리즘 v3)

### PR-2QQ-d-3 — 자동 생성 v3 + 패턴 모델 (cycle + 요일 한정)
- 운영 사실 (Rule 25): 외부 직원 (정동민) 의 2-on-2-off 패턴을 자동 생성에 직접 반영. 일반 직원도 같은 모델로 패턴 입력 가능. 요일 한정 (월·수·금만 출근) 도 지원.
- DB 마이그레이션: `2026-05-04_cs_workers_pattern.sql`
  - `cs_workers.cycle_days_on TINYINT NULL`
  - `cs_workers.cycle_days_off TINYINT NULL`
  - `cs_workers.cycle_start_date DATE NULL`
  - `cs_workers.preferred_dow_only VARCHAR(16) NULL` (avoid 와 의미 다름 — 한정)
- API:
  - `/api/call-scheduler/workers` GET/POST: 패턴 컬럼 graceful 추가
  - `/api/call-scheduler/workers/[id]` PATCH: 패턴 화이트리스트
  - `/api/call-scheduler/schedules/[id]/auto-generate` 알고리즘 v3 재작성:
    - 새 옵션: `use_priority` (기본 true), `enforce_min_coverage` (기본 true)
    - 통합 카운터 (워커 무관 그룹 합산)
    - 일자 우선 루프 (시간 순서 일관성)
    - min 결정: `lookupMinCoverage(group, dow) ?? lookupMinCoverage(group, NULL) ?? rotation_size or members.length`
    - 후보 필터: locked + leave(off) + max_days 초과 + cycle 휴무 phase + dow_only 미일치
    - 가중치 정렬 (priority → dow_avoid → required 미달 → by_dow ASC → total ASC → last_date 거리 DESC)
    - 부족 경고 `summary.warnings` 응답 (최대 50건)
- UI:
  - `WorkersTab` ConstraintsPanel — 자동 근무 패턴 영역 추가 (cycle 3 input + 요일 한정 7 button)
  - `AutoGenerateDialog` — 우선순위/최소인원 옵션 체크박스 + 부족 경고 표시
- 회귀 케이스 검토:
  - 빈 토큰 파싱 (regression-fix1) — `parseDowList` 헬퍼 사용
  - 1셀 N워커 (PR-2OO) — selected.size 안전
  - manual_lock 보존 (PR-2QQ-b) — 알고리즘에서 lockedSlotMap 카운트 포함

## 2026-05-04 (밤 — 그룹 최소 인원 셋팅)

### PR-2QQ-d-2 — cs_group_min_coverage (디폴트 + 요일 예외)
- 운영 사실 (Rule 25): 그룹별로 매일 최소 N명 + 특정 요일만 다른 인원 (예: 금요일 피크 3명, 일요일 1명)
- DB 마이그레이션: `2026-05-04_cs_group_min_coverage.sql`
  - 신규 테이블 `cs_group_min_coverage` (id / group_id / dow nullable / min_workers)
  - UNIQUE (group_id, dow) — dow=NULL = 매일 디폴트 1행 + 0~6 요일 예외 N행
  - FK ON DELETE CASCADE
  - max_workers 폐기 (사용자 결정 — 사용 안 함)
- API:
  - `GET /api/call-scheduler/shift-groups/[id]/min-coverage` — 행 모두 반환 (dow=NULL 우선)
  - `PUT /api/call-scheduler/shift-groups/[id]/min-coverage` — 일괄 재정의 (DELETE + INSERT 패턴)
  - graceful: 마이그 미적용 시 GET 빈 배열 + `_migration_pending: true`
- UI `GroupEditor`:
  - 좌측 패널 하단에 "⚖️ 최소 인원 (자동 생성용)" 섹션 추가
  - 매일 디폴트 1칸 + 요일별 7칸 (빈 칸 = 디폴트 사용)
  - 요일 라벨 색상 (일=빨강 / 토=파랑)
  - graceful: 마이그 미적용 시 안내 배너
- 자동 생성 알고리즘에서 활용 예정 (PR-2QQ-d-3)

## 2026-05-04 (밤 — 워커 제약 모델)

### PR-2QQ-d-1-fix — 일요일 비선호 자동 표시 버그
- 사용자 보고: 모든 워커가 편집 시 일요일이 비선호로 표시됨 + 해제 후 저장 안 됨
- 원인: `''.split(',')` → `['']` → `Number('')` === 0 (일요일) 로 잘못 파싱
- 수정: 빈 토큰 먼저 제거 후 Number() 파싱 + 0~6 범위 필터

### PR-2QQ-d-1 — 워커 제약 모델 + WorkersTab UI 강화
- 운영 사실 (Rule 25): 외부/내부 통합 모델. priority + 비선호 요일 + 필수/최대 일수 + 자유 패턴.
- DB 마이그레이션: `2026-05-04_cs_workers_constraints.sql`
  - `cs_workers.priority_level TINYINT DEFAULT 2` (1=최우선, 2=일반, 3=백업)
  - `cs_workers.preferred_dow_avoid VARCHAR(16)` ('0,5' = 일·금)
  - `cs_workers.required_days_per_month TINYINT NULL`
  - `cs_workers.max_days_per_month TINYINT NULL`
  - `cs_workers.work_pattern_text VARCHAR(64)` (외부 + 일반 통합 — 자유 메모)
  - 인덱스: `idx_cs_w_priority (priority_level, is_active)`
  - external_pattern → work_pattern_text 자동 마이그
- API:
  - `/api/call-scheduler/workers` GET/POST: 새 컬럼 graceful 추가
  - `/api/call-scheduler/workers/[id]` PATCH: 새 컬럼 화이트리스트
- UI `WorkersTab`:
  - 편집 모드 시 ConstraintsPanel 펼침 (colSpan row)
  - 좌측: 우선순위 (P1/P2/P3) + 외부 직원 토글 + 비선호 요일 (7 button)
  - 우측: 월 필수/최대 일수 + 자유 패턴 메모
  - 비편집 모드: 외부 직원 🔒 배지 + P1 빨간 배지 표시
  - 저장 시 RideEmployees PATCH (color/group) + cs_workers PATCH (constraints) 동시
- **외부 직원 엑셀 업로드 폐기** — `ExternalScheduleDialog` + `external-schedule` API orphan
  - 상세 [⋯] 메뉴에서 항목 제거
  - 코드 파일 자체는 남아있음 (commit 시 git rm 필요)

## 2026-05-04 (밤 — 사소한 UX 보강)

### PR-2QQ-fix1 — RideEmployees 목록 헤더 뒤로가기
- `/RideEmployees` 메인 목록 페이지 헤더에 [← 근무시간표] 링크 추가
- new / [id] 페이지는 이미 있었으나 메인 목록 페이지만 누락

## 2026-05-04 (밤 — 외부 직원 + manual_lock)

### PR-2QQ-b — 외부 직원 + manual_lock + 엑셀 업로드
- 운영 사실 (Rule 25): 야간 슬롯 L13 외부 직원 정동민(1명, 2-on-2-off)이 1순위. 매월 매니저가 엑셀로 외부 일정 업로드.
- DB 마이그레이션: `2026-05-04_cs_external_workers.sql`
  - `cs_workers.is_external TINYINT(1)` (1순위 표식)
  - `cs_workers.external_pattern VARCHAR(128)` (자유 메타)
  - `cs_assignments.manual_lock TINYINT(1)` (자동 생성 보존)
  - 인덱스: `idx_cs_asn_lock (schedule_id, manual_lock)`
- API:
  - `/api/call-scheduler/workers` GET/POST: is_external + external_pattern 지원 (graceful)
  - `/api/call-scheduler/workers/[id]` PATCH 신설 (cs_workers 직접 수정, RideEmployees 와 분리)
  - `/api/call-scheduler/schedules/[id]/external-schedule` POST/GET 신설:
    - GET = 엑셀 템플릿 다운로드 (외부 직원 + 야간 슬롯 자동 샘플)
    - POST = 엑셀 업로드 → manual_lock=1 upsert (preview/apply)
  - `/api/call-scheduler/schedules/[id]` GET: manual_lock + is_external 응답 (graceful)
  - `/api/call-scheduler/schedules/[id]/auto-generate`:
    - manual_lock 셀 항상 skip-existing (overwrite 무시)
    - clear_first 시 manual_lock=1 보존 (조건부 DELETE)
- UI:
  - `ExternalScheduleDialog` 신설 (720px) — 템플릿 → 업로드 → preview → apply
  - 상세 [⋯] 메뉴: [🔒 외부 직원 일정] 항목 추가
  - `AssignmentCell`: manual_lock=1 셀에 🔒 아이콘 prefix

## 2026-05-04 (밤 — KPI 균형도 상세)

### PR-2QQ-c — KPI 균형도 상세 (야간/금야간/일야간)
- WorkerKpi 확장: `fri_overnight`, `sun_overnight`, `weekend_count`, `weekday_count`
- API `/api/call-scheduler/schedules/[id]`: work_date 의 day-of-week 로 카운트
- AnalyticsPanel:
  - 균형도 카드 4개 (전체 야간 / 시간 편차 / 금야간 / 일야간) — max-min range + min/avg/max
  - 인당 분석 테이블 컬럼 확장: 금야 / 일야 / 주말 추가 (10 컬럼)
  - 편차 알림: 금/일 야간 range >= 3 시 빨간 배너
  - 워커별 금/일 야간 빨강 강조 (평균의 1.5배 초과)
- 운영 사실 (Rule 25): 야간 워커는 금/일 비선호 → 균등 분배 시각화

## 2026-05-04 (밤 — 그룹 마스터 강화)

### PR-2QQ-a — 그룹 마스터 UI 강화 (카테고리/카드/색상)
- DB 마이그레이션: `2026-05-04_cs_shift_groups_category.sql`
  - `cs_shift_groups.category VARCHAR(32)` 추가 (default 'general')
  - `cs_shift_groups.color_tone` ENUM 7→14 (indigo/sky/teal/lime/orange/pink/slate 추가)
  - `cs_workers.color_tone` 동일 14개로 확장
  - 인덱스: `idx_cs_grp_category (category, sort_order)`
- API:
  - `/api/call-scheduler/shift-groups` GET: 멤버 chip 정보 + category 응답 (graceful — 컬럼 없어도 'general' fallback)
  - POST/PATCH: category 인자 지원 + color_tone 14개 화이트리스트
- UI `GroupsTab`:
  - 카테고리 필터 pill (전체 / 주간 / 야간 / 특수 / 일반 / 사용자 정의)
  - 정렬 옵션 (커스텀 순서 / 시작 시간 / 이름 / 멤버 수)
  - 카테고리별 섹션 표시 (sort_order 모드 + 전체 필터 시)
  - 그룹 카드 상세화: 좌측 색상바 + 시간/익일 배지 + 패턴 detail (custom 요일 명시) + 멤버 chip stack (워커 색상 적용) + 설명
  - 카드 안 [▲▼] 순서 변경 버튼 (sort_order 모드)
- UI `GroupEditor`:
  - 카테고리 선택 (pill + 직접 입력)
  - 색상 picker → 14 dot swatches (그룹 색상)
- UI `WorkersTab`:
  - 직원 색상 picker → 14 dot swatches
- 유틸 `palette.ts`: 14개 토큰 매핑 (TONE_BG/BORDER/TEXT/SOLID)
- 유틸 `types.ts`: ColorTone union 14개 + COLOR_TONE_OPTIONS hex 동봉

## 2026-05-04 (밤 — 메뉴 정리 추가)

### PR-2PP — 상세 [⋯] 메뉴 단순화
- 공통 셋팅 6개 항목 제거 (시간/그룹/직원/직원마스터/공휴일/휴가)
- 이유: 목록 헤더의 [📋 직원마스터] / [⚙️ 설정] 직접 버튼과 중복 (PR-2NN-fix 와 일관)
- 상세 [⋯] 에는 본 월 한정 작업만 잔존:
  - 작업: 공지로 변경 / 자동 생성 / 직원 요청 / 분석·배포 이력
  - 위험: 삭제

## 2026-05-04 (밤 — 동시 근무 허용)

### PR-2OO — 1셀 N워커 동시 근무 (운영 사실 반영, Rule 25)
- 운영 사실: 같은 그룹 안 멤버가 같은 시간 슬롯에 동시 출근 (예: 야간콜 4명 모두 22-08)
- DB 마이그레이션: `cs_assignments` UNIQUE KEY 변경
  - 이전: `(schedule_id, work_date, shift_slot_id)` — 1셀 1워커 강제
  - 변경: `(schedule_id, work_date, shift_slot_id, worker_id)` — 1셀 N워커 허용
- API `auto-generate`: existingMap 키를 `(date, slot, worker)` 단위로 변경
- API `assignments PUT`: `assignment_id` 옵션 인자 추가 — 특정 row UPDATE 명시
  - `worker_id` + (date, slot) 키로 upsert (멀티 워커 지원)
- 매트릭스 UI: 1셀에 워커 chip 세로 stack + [+] 추가 버튼
  - `cellMap`: `Map<string, Assignment>` → `Map<string, Assignment[]>`
  - 빈 셀 클릭 → 새 워커 추가 picker
  - 기존 chip 클릭 → 그 워커 수정 picker
- 버그: 자동 생성 시 `Duplicate entry '...' for key 'uq_cs_asn_cell'` 1062 에러 해결

### PR-2NN-fix — 목록 페이지 헤더 단순화
- [⋯] 드롭다운 폐기 (6개 셋팅 탭 = 모두 같은 settings 페이지로 → 중복)
- [📋 직원 마스터] + [⚙️ 설정] 2개 직접 버튼만 노출

## 2026-05-04 (저녁 — UX 보강)

### PR-2MM — 자동 생성 모달 자동 미리보기
- 모달 열림 시 자동으로 미리보기 실행 (300ms debounce)
- 옵션 변경 시 자동 재계산 (overwrite/clear/skip-holidays/mark-leaves)
- 적용 버튼 활성화 조건 완화 — `to_insert + to_update > 0` 이면 항상 활성
- 변경 사항 0건 시 비활성 + tooltip "변경 사항 없음"
- "✨ N건 적용" 버튼 라벨로 적용 분량 즉시 노출
- 생성 안 눌리던 사용자 보고 즉시 반영

### PR-2NN — 목록 페이지 [⋯] 더보기 메뉴
- `/CallScheduler` 메인 헤더에 [⋯] 메뉴 추가 (상세 페이지와 동일 패턴)
- 메뉴 항목: 시간 / 그룹 / 직원 / 직원마스터 / 공휴일 / 휴가 + 설정 페이지
- 매월 새 월 만들기 전 / 후 셋팅 직접 진입 (목록 페이지에서도 가능)
- 외부 클릭 시 자동 닫기 (mousedown 핸들러)

## 2026-05-04 (오후 — 추가 정리)

### Route Group 이동 — `app/(employees)/`
- `app/CallScheduler/` → `app/(employees)/CallScheduler/`
- `app/RideEmployees/` → `app/(employees)/RideEmployees/`
- URL 변경 없음 (Route Group `()` 은 URL에 안 나타남)
- import 경로 일괄 sed: `@/app/CallScheduler` → `@/app/(employees)/CallScheduler`
- 직원 토큰 링크 유효 (`/CallScheduler/e/<token>` 그대로)

### PR-2II — 직원 마이페이지 휴가 신청
- `LeaveRequestDialog` 신설 (480px 모달)
- 마이페이지 [🙋 휴가 신청] — 토큰 모드는 status='pending' 자동
- 종류 선택 시 회사 정책 default 자동 (PR-2HH 활용)
- 빠른 프리셋 (반차 4h / 패밀리 3h / 종일 8h) + 차감 미리보기

### PR-2JJ — RideEmployees 엑셀 일괄 등록
- API: `GET /template` (샘플 .xlsx) + `POST /bulk-upload` (preview/apply)
- `BulkUploadDialog` 신설 (800px) — 5타일 결과 (전체/정상/중복/오류/빈)
- 이름 중복 자동 skip + 안내 시트 포함
- RideEmployees 목록에 [📤 일괄 등록] / [🔧 중복 정리] 버튼

### PR-2KK — 월 생성 + 자동 채우기 통합
- `/CallScheduler/new` 폼에 ☑ 자동 채우기 체크박스 (기본 ON, 보라색 배너)
- 생성 직후 `auto-generate?mode=apply` 자동 호출 → 그룹 패턴 + 휴가 반영
- 진행 상태 라벨 (월 생성 → 자동 생성 → 결과 N건 → 이동)
- 전월 복제 선택 시 비활성 (복제로 채워지므로)

### PR-2LL — [⋯] 더보기 메뉴 확장 (셋팅 직접 진입)
- 상세 페이지 [⋯] 메뉴 재구성:
  - 작업: 공지 / 자동 생성 / 직원 요청 / 분석
  - **공통 셋팅 (월과 무관 — 한 번만)**: 시간 / 그룹 / 직원 / 직원마스터 / 공휴일 / 휴가 6개 직접 항목
  - 위험: 삭제
- `settings/page.tsx` `useSearchParams` + `Suspense` — `?tab=...` query 수신
- 사이드바 변경 없음 (단일 진입점 유지) — 매월 셋팅 X
- 운영 흐름: 셋팅 한 번 → 매월 [+ 새 월] (자동 채우기) → 미세 조정

## 2026-05-04 (오전)

### PR-2AA — 휴가 발급량 + 잔여 자동 차감
- 마이그레이션: `cs_leave_quotas` 테이블 신설 (worker × year × month × leave_type, 반차 0.5일 단위)
- API: `GET/POST /api/call-scheduler/leave-quotas` (잔여 자동 계산) + `PUT /bulk` (일괄 발급)
- UI: `QuotaBulkDialog` — 연차(연1회) / 패밀리데이(월1회) / 병가(연단위) 프리셋
- 영향: LeavesTab 헤더에 [💼 일괄 발급] 버튼 + 워커별 잔여 표시 (예정)

### 휴일/휴가 24/365 재구성
- 사용자 명시: 24/365 콜센터 운영, 공휴일도 일부 직원 근무
- cs_holidays.exclude_auto 디폴트 `true → false` 변경
- 휴일 탭: "🏖 회사 휴일" → "🏖 공휴일 (참고)" — 자동 제외 X, 시각화 + 일괄 적용 도구
- 휴가 탭: 종류 추가 — `familyday` (패밀리데이) + 사용자 운영 흐름 반영
- 영향: HolidaysTab 안내 배너 추가, LeavesTab 종류 6개로 확장

### PR-2M ~ PR-2P — 헤더 정리 + 설정 페이지 5탭
- **2M** 상세 헤더 단순화: 7버튼 → [✍️작성/📋매트릭스/📅날짜별] + [⚡배포] + [⋯더보기]
  - 더보기 메뉴: 공지/초안 토글 · 분석 · 설정 · 삭제
- **2N** 워커 탭: RideEmployees 와 cs_workers 양방향 연동, 미활성 후보 알림
- **2O** 휴일 마스터: cs_holidays 마이그레이션 + UI (year 필터, 종류별 통계)
- **2P** 연차 마스터: cs_leaves 마이그레이션 + UI (워커×기간×반차+사유)

### PR-2Q ~ PR-2Z — 매니저/직원 양방향 강화
- **2Q** 균형도 경보: KPI 5번째 타일, ±20% 벗어난 워커 카운트 (양호/주의/위험)
- **2R** 시프트 교체: 매트릭스 [🔄] 토글 → 두 셀 클릭 = swap
- **2S** 빈자리 한눈: 매트릭스 상단 [👀] 토글 + 빈 셀 빨간 점선 강조
- **2T** 워커 부담 인디케이터: ComposeMode 좌측 워커 list 막대 + 평균선 + 편차 색상
- **2V** 캘린더 다운로드: 마이페이지 [📥] iCal(.ics) export — 휴대폰 캘린더 import
- **2W** 같은 날 동료: 마이페이지 캘린더 셀 클릭 → 그날 시프트별 동료 모달 (본인 강조)
- **2X** 새 공지 배지: 공지 7일 이내 시 "🆕 새 공지" 펄스 애니메이션
- **2Y** 시프트 교체 요청: cs_swap_requests 테이블 + 직원 신청 + 매니저 [⋯] 카운트 배지
- **2Z** 결근/병가 즉석: 매트릭스 셀 우클릭 → 휴무/오전반차/오후반차/F/비우기 quick action

### PR-2C — 직원 마이페이지 + 토큰 진입
- `/CallScheduler/me` (로그인) + `/CallScheduler/e/[token]` (영구 링크)
- API: `/api/call-scheduler/me` (token 모드는 published 만 노출)
- 컴포넌트: `MyScheduleView` (인사 + KPI + 캘린더 + 상세 시간표)
- ride_employees.public_token 컬럼 — RideEmployees 페이지에서 발급/재발급/폐기

## 2026-05-03

### PR-2J — 자동 생성 API + 버튼
- API: `POST /api/call-scheduler/schedules/[id]/auto-generate`
  - 그룹 패턴 (all_days/all_weekdays/weekends_only/custom) + 전략 (all_members/rotation)
  - skip_holidays / mark_leaves / overwrite_existing / clear_first 옵션
- UI: ComposeMode 상단 보라색 배너 + AutoGenerateDialog (preview → apply)

### PR-2L — 날짜별 뷰 (3번째 모드)
- 모드 토글: ✍️작성 / 📋매트릭스 / 📅날짜별
- 일자 카드 grid + 그날 시프트별 워커 list (DayDetailModal)

### PR-2I — 그룹 마스터
- 마이그레이션: cs_shift_groups + cs_group_members
- 그룹 = 시프트 + 패턴 + 전략 + 멤버
- `/settings` 그룹 탭 + GroupEditor (멤버 순서 ↑↓)

### PR-2H — 워커 기준 작성 모드
- 매트릭스 외 두 번째 모드 — 워커 1명씩 시프트 + 일자 토글
- 빠른 입력 매크로 (평일/주말/요일별/한줄 입력) + 한 줄 입력 파서

### PR-2A / PR-2B — 풀폭 + 직원 마스터
- 메인 캘린더 max-width 제거 + AnalyticsDrawer (우측 슬라이드)
- 셀 60→44px → 31일 한 화면
- ride_employees 마스터 + RideEmployees CRUD 페이지

## 2026-05-03 (모듈 신설)

### PR-1 v1 MVP
- migrations: cs_shift_slots / cs_workers / cs_schedules / cs_assignments / cs_distributions
- 시드: 13 시프트 + 16 워커 (5월 스케줄 분석 기반)
- API 6 + UI 3 페이지 (목록/등록/상세) + 컴포넌트 6
