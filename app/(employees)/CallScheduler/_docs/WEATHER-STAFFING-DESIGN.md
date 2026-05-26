# CallScheduler — Phase W: 날씨 기반 인력 예측 설계서

> 2026-05-24 · GATE-3 (Planner) · 사용자 승인 대기
> 트리거: 「날씨 + 추가 인력 알림이 대시보드에 같이 있어서 액션할 수 있도록」
> 범위: **W-1 (날씨 표시) + W-2 (인력 예측 알림)**. W-3 (SMS 액션) 다음 PR.

---

## 1. 개요

KPI-DESIGN.md §5-5 「물량 예측」 자리에 **날씨 입력**을 끼우는 작업.
날씨 → 사고·긴급출동 인입량 보정 → WFM Erlang C λ 가산 → 시간대별 추가 필요 인원 알림.

### 1.1 사용자 결정 사항 (2026-05-24)
- 권역 = **전국 17개 광역자치단체** (도청·시청 소재지 좌표)
- 가중치 디폴트 = **인구 비례** (KPI 설정 「⛅ 날씨 기준」에서 매니저 조정 가능)
- 외부 날씨 = **OpenWeatherMap 무료 티어** (`OPENWEATHER_API_KEY` 저장 완료)
- 캐시 = **1시간 TTL** — 17권역 × 24 = 408 calls/day (무료 한도 1,000 절반)
- 향후 교체 = 기상청 단기예보 (어댑터 추상화로 교체 용이)

### 1.2 범위
- ✅ W-1 — 날씨 표시 (대시보드 + 스케줄 화면 + KPI 설정 편집)
- ✅ W-2 — 인력 예측 알림 (대시보드, staffing 격자 오버레이)
- ⏳ W-3 — 외부인력 SMS 호출 액션 (다음 PR — CX-KPI-21 알리고 채널 재사용)

---

## 2. 데이터 모델 (마이그 3종)

### 2-1. `cs_weather_regions` — 권역 마스터

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| code | VARCHAR(16) | 'SEOUL'/'BUSAN'/'GYEONGGI'... — `UNIQUE` (시드 멱등) |
| label | VARCHAR(32) | '서울특별시'/'부산광역시'... |
| lat | DECIMAL(8,5) | 위도 |
| lon | DECIMAL(8,5) | 경도 |
| weight_pct | DECIMAL(5,2) | 가중치 % (합 100) |
| sort_order | INT | 표시 순 |
| is_active | TINYINT(1) | DEFAULT 1 |
| created_at / updated_at | DATETIME | |

`UNIQUE KEY uq_weather_region_code (code)` (Rule 24)

### 2-2. `cs_weather_cache` — 날씨 캐시 (1h TTL)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | CHAR(36) PK | |
| region_id | CHAR(36) | FK cs_weather_regions.id, ON DELETE CASCADE |
| fetched_at | DATETIME | |
| valid_until | DATETIME | fetched_at + 1h |
| current_temp | DECIMAL(4,1) | °C |
| current_code | INT | OpenWeather condition.id |
| current_main | VARCHAR(16) | 'Rain'/'Snow'/... |
| current_desc | VARCHAR(64) | 현지화 설명 |
| today_min / today_max | DECIMAL(4,1) | |
| today_pop | DECIMAL(4,2) | 강수 확률 0~1 |
| raw_json | JSON | 원본 응답 |
| created_at | DATETIME | |

`UNIQUE KEY uq_weather_cache_region (region_id)` — 권역당 1행, 항상 덮어쓰기.
`KEY idx_weather_cache_valid (valid_until)` — 만료 조회.

### 2-3. `cs_weather_factors` — 보정율 룰

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | CHAR(36) PK | |
| condition_key | VARCHAR(32) | 'rain_light'/'snow_heavy'/... — UNIQUE |
| label | VARCHAR(32) | '약한 비'/'폭설'... |
| factor | DECIMAL(4,2) | 1.00/1.20/1.60... (λ 곱셈) |
| openweather_codes | VARCHAR(64) | '500,520' (CSV) |
| sort_order | INT | |
| updated_at | DATETIME | |

`UNIQUE KEY uq_weather_factor_key (condition_key)`. 시드 10행 (§ 9).

---

## 3. API (신규 3 + 확장 1)

### 3-1. `GET /api/call-scheduler/kpi/weather`
권역별 현재 + 오늘 예보. 캐시 우선, stale 시 OpenWeather fetch.

응답:
```ts
{
  data: {
    fetched_at: ISO,
    api_key_set: boolean,         // env 키 유무 — UI 표시용
    regions: [{
      code, label, lat, lon, weight_pct,
      current: { temp, condition_main, condition_desc, condition_code, factor },
      today: { min, max, pop },
      cache_hit: boolean, valid_until,
    }],
    combined_factor: number,      // Σ(weight_pct × factor) / 100
  },
}
```

### 3-2. `GET / POST / DELETE /api/call-scheduler/kpi/weather/regions`
권역 CRUD. POST 시 weight_pct 합 100 검증.

### 3-3. `GET / POST /api/call-scheduler/kpi/weather/factors`
보정율 룰 CRUD.

### 3-4. `GET /api/call-scheduler/kpi/staffing` (확장)
`?weather_adjusted=1` 옵션. λ × combined_factor → adjusted_required.
응답에 `weather: { combined_factor, regions[], fetched_at }` + 격자 셀에 `adjusted_required` 추가.

---

## 4. UI (4곳)

### 4-1. 「KPI 설정 › ⛅ 날씨 기준」 (KpiSettings.tsx 5번째 섹션)
- 「오픈웨더 키 상태」 배지 (env 유무, 캐시 마지막 fetched_at)
- 권역 목록 (NeuDataTable) — 추가/수정/삭제, weight_pct 합 100 검증 라이브
- 보정율 룰 목록 — 10행 편집, 신규 추가

### 4-2. 대시보드 권역별 날씨 위젯 (CallScheduler/kpi 페이지 상단)
- 권역 카드 — 가중치 큰 5권역 (경기·서울·부산·경남·인천) 카드 + 「전체 17권역」 펼침
- 카드 = 아이콘 + 기온 + condition + 권역 factor
- 통합 보정율 배지 (예: "전국 통합 1.28×")

### 4-3. 스케줄 화면 날씨 아이콘 (TodayTomorrowGrid.tsx · NowWorkingStrip.tsx)
- 「오늘」/「내일」 헤더에 거점 권역(서울 디폴트) 날씨 아이콘 + 기온
- 거점 권역 선택은 KPI 설정 권역 sort_order=0 으로 결정

### 4-4. 대시보드 「인력 예측 알림」 패널 (W-2)
- staffing `weather_adjusted=1` 응답으로 시간대별 required vs adjusted_required
- 알림 카드: 「오늘 ⛈ 비 → 14~17시 +2명 부족 (현재 5 → 필요 7)」
- 격자 차트에 두 라인 오버레이 (기본 vs 날씨 보정)

---

## 5. 알고리즘

```ts
// 5-1. condition code → factor
function lookupFactor(code: number, rules: FactorRow[]): number {
  for (const r of rules) {
    if (r.openweather_codes.split(',').map(s => Number(s.trim())).includes(code)) {
      return Number(r.factor)
    }
  }
  return 1.0
}

// 5-2. 통합 보정율 (가중 평균)
combined_factor = sum(region.weight_pct * region.factor) / 100

// 5-3. WFM λ 가산 (staffing route)
const lambda_adjusted = lambda_base * combined_factor
const adjusted_required = requiredAgents({ lambda: lambda_adjusted, aht, ... })
```

---

## 6. 외부 API 어댑터

`lib/cs-weather-openweather.ts` (모듈 전용 lib — callscheduler 모듈):

```ts
export interface WeatherSnap {
  temp: number; condition_code: number; condition_main: string
  condition_desc: string; today_min: number; today_max: number; today_pop: number
  raw: unknown
}

export async function fetchOpenWeather(lat: number, lon: number): Promise<WeatherSnap> {
  const key = process.env.OPENWEATHER_API_KEY
  if (!key) throw new Error('OPENWEATHER_API_KEY missing')
  const url = `https://api.openweathermap.org/data/2.5/weather`
    + `?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=kr`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`OpenWeather ${res.status}`)
  const j: any = await res.json()
  return {
    temp: j.main.temp,
    condition_code: j.weather[0].id,
    condition_main: j.weather[0].main,
    condition_desc: j.weather[0].description,
    today_min: j.main.temp_min,
    today_max: j.main.temp_max,
    today_pop: 0,  // current API 에 없음 — forecast API 별도 호출 (W-1c 결정)
    raw: j,
  }
}
```

추후 `lib/cs-weather-kma.ts` 추가 시 동일 `WeatherSnap` 반환 — 호출자(staffing/weather route) 변경 최소.

---

## 7. 17 광역 시드 (인구 비례)

| code | label | lat | lon | weight_pct |
|------|-------|-----|-----|------------|
| GYEONGGI | 경기도 | 37.27500 | 127.00900 | 26.40 |
| SEOUL | 서울특별시 | 37.56650 | 126.97800 | 18.30 |
| BUSAN | 부산광역시 | 35.17960 | 129.07560 | 6.40 |
| GYEONGNAM | 경상남도 | 35.23820 | 128.69210 | 6.30 |
| INCHEON | 인천광역시 | 37.45630 | 126.70520 | 5.80 |
| GYEONGBUK | 경상북도 | 36.57600 | 128.72740 | 5.00 |
| DAEGU | 대구광역시 | 35.87140 | 128.60140 | 4.60 |
| CHUNGNAM | 충청남도 | 36.65880 | 126.67080 | 4.10 |
| JEONNAM | 전라남도 | 34.81610 | 126.46300 | 3.50 |
| JEONBUK | 전북특별자치도 | 35.82420 | 127.14800 | 3.40 |
| CHUNGBUK | 충청북도 | 36.63570 | 127.49140 | 3.10 |
| GANGWON | 강원특별자치도 | 37.88540 | 127.72980 | 3.00 |
| DAEJEON | 대전광역시 | 36.35040 | 127.38450 | 2.80 |
| GWANGJU | 광주광역시 | 35.15950 | 126.85260 | 2.80 |
| ULSAN | 울산광역시 | 35.53840 | 129.31140 | 2.10 |
| JEJU | 제주특별자치도 | 33.48900 | 126.49830 | 1.30 |
| SEJONG | 세종특별자치시 | 36.48000 | 127.28900 | 1.10 |

합 100.00 (반올림 보정).

---

## 8. 보정율 룰 시드 (10행)

| condition_key | label | factor | openweather_codes |
|---------------|-------|--------|-------------------|
| thunder | 천둥번개 | 1.60 | 200,201,202,210,211,212,221,230,231,232 |
| drizzle | 이슬비 | 1.20 | 300,301,302,310,311,312,313,314,321 |
| rain_light | 약한 비 | 1.20 | 500,520 |
| rain_moderate | 보통 비 | 1.30 | 501,521 |
| rain_heavy | 폭우 | 1.60 | 502,503,504,522,531 |
| snow_light | 약한 눈 | 1.40 | 600,612,615,620 |
| snow_heavy | 폭설 | 1.80 | 601,602,613,616,621,622 |
| fog | 안개 | 1.10 | 701,711,721,731,741,751,761,762,771,781 |
| clear | 맑음 | 1.00 | 800 |
| clouds | 흐림 | 1.00 | 801,802,803,804 |

---

## 9. 단계 (서브-commit 6개 · Rule 7.3 즉시 push)

| # | 서브 commit | 변경 영역 | 모듈 |
|---|-------------|-----------|------|
| W-1a | 마이그 3종 + 시드 (regions·cache·factors) | migrations/ | _db |
| W-1b | 권역·룰 CRUD API | app/api/call-scheduler/kpi/weather/regions·factors | callscheduler |
| W-1c | OpenWeather 어댑터 + weather GET API + 캐시 | lib/cs-weather-openweather.ts + app/api/call-scheduler/kpi/weather | callscheduler |
| W-1d | KPI 설정 「⛅ 날씨 기준」 섹션 | KpiSettings.tsx | callscheduler |
| W-1e | 대시보드·스케줄 날씨 위젯 | CallScheduler/_components/* + kpi 페이지 | callscheduler |
| W-2 | staffing 확장 + 인력 예측 알림 패널 | app/api/call-scheduler/kpi/staffing + 대시보드 UI | callscheduler |

각 서브 commit 절차 (Rule 7.1 + 7.3):
1. `git pull --rebase`
2. `git status --short` 확인
3. 명시적 `git add` (자기 영역만)
4. tsc + lint 통과 후 commit
5. `git pull --rebase` 재
6. `git push` (5분 내)

---

## 10. GATE 진행 상태

| GATE | 항목 | 상태 |
|------|------|------|
| G1 | 컨텍스트 (CLAUDE.md §21·22, KPI-DESIGN, KPI-DATA-REQUIREMENTS) | ✅ |
| G2 | 조사 (cafe24-intake · erlang-c · staffing · dashboard) | ✅ |
| G3 | 본 설계서 + 사용자 GO | ⏳ 대기 |
| G4 | 마이그 (W-1a) — 🟡 사용자 SQL 적용 | 단계별 |
| G5 | tsc + 영향 검증 | 단계별 |
| G6 | lint:harness 새 위반 0 | 단계별 |
| G7 | Designer 시각 검수 (위젯·알림 화면 캡처) | UI 단계 |
| G8 | evaluate.js (해당 시) | 종료 시 |
| G9 | commit + push (5분 내) | 단계별 |

---

## 11. 위험·롤백

- **OpenWeather rate limit** — 408/1,000 calls. local + prod 동시 운영 시 초과 위험 → Cloud Run 단일 인스턴스 fetch + 1h 캐시.
- **OpenWeather 장애** — fetch 실패 시 만료된 캐시라도 stale 반환 + UI "캐시 stale" 표시. λ 보정 = 1.0 fallback.
- **가중치 합 ≠ 100** — UI 라이브 검증, 저장 시 차단.
- **롤백** — 마이그 SQL 하단 `DROP TABLE cs_weather_*`. staffing 확장은 기본값 유지(`weather_adjusted=0` → 동작 변화 없음).

---

## 12. dry-run (Rule 13) — 사용자 의무

설계 통과 전 OpenWeather 한 번 호출해 응답 구조 확인 (서울 좌표):

```bash
KEY=발급받은키
curl "https://api.openweathermap.org/data/2.5/weather?lat=37.5665&lon=126.9780&appid=${KEY}&units=metric&lang=kr"
```

기대 응답 (canonical):
```json
{
  "weather": [{ "id": 800, "main": "Clear", "description": "맑음", "icon": "01d" }],
  "main": { "temp": 18.3, "temp_min": 15.2, "temp_max": 22.7, "humidity": 45 },
  "wind": { "speed": 2.1, "deg": 180 },
  "name": "Seoul",
  "dt": 1716530000
}
```

응답 OK 확인 후 GATE-3 통과 → W-1a 진입.

> 신규 키는 활성화까지 10분~2시간. 401 떠도 잠시 후 재시도.

---

## 13. 향후 (Phase 별)

- **W-3 (다음 PR)** — 외부인력 SMS 호출 액션 (알리고 CX-KPI-21 채널 재사용)
- **W-4 (운영 검증 후)** — 기상청 단기예보 어댑터 교체 (정확도 강화)
- **W-5 (데이터 축적 후)** — 과거 날씨 × 인입량 회귀 학습으로 보정율 자동 보정
