// ═══════════════════════════════════════════════════════════════════
// app/api/call-scheduler/kpi/_lib/openweather.ts
//   OpenWeatherMap 어댑터 — Phase W-1c (2026-05-24)
//   설계서: _docs/WEATHER-STAFFING-DESIGN.md §6-1
//
//   현재 날씨(Current Weather API) 한 번에 받음.
//   today min/max·pop 은 current API 비제공 — 0/현재값 fallback.
//   향후 정확도 강화 시 forecast API 추가 또는 기상청 어댑터로 교체
//   (인터페이스 WeatherSnap 유지 → 호출자 변경 최소).
//
//   env: OPENWEATHER_API_KEY (필수)
//   API: https://openweathermap.org/current
//   _lib/ 폴더 = Next.js 라우팅 제외 (underscore-prefixed private)
// ═══════════════════════════════════════════════════════════════════

export interface WeatherSnap {
  temp: number               // 현재 기온 °C
  condition_code: number     // OpenWeather condition.id (200~804)
  condition_main: string     // 'Rain'/'Snow'/'Clear'/...
  condition_desc: string     // 현지화 설명 ('맑음'/'약한 비'/...)
  today_min: number          // 오늘 최저 (current API: temp_min ≈ 현재값)
  today_max: number          // 오늘 최고 (current API: temp_max ≈ 현재값)
  today_pop: number          // 강수 확률 0~1 (current API 비제공 — 0)
  raw: unknown               // 원본 응답 (캐시 raw_json 보존)
}

export async function fetchOpenWeather(
  lat: number,
  lon: number,
): Promise<WeatherSnap> {
  const key = process.env.OPENWEATHER_API_KEY
  if (!key) {
    throw new Error('OPENWEATHER_API_KEY 환경변수 미설정')
  }
  const url = `https://api.openweathermap.org/data/2.5/weather`
    + `?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=kr`

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenWeather ${res.status}: ${body.slice(0, 200)}`)
  }
  const j: any = await res.json()
  if (!j?.weather?.[0] || !j?.main) {
    throw new Error('OpenWeather 응답 구조 이상')
  }

  return {
    temp: Number(j.main.temp ?? 0),
    condition_code: Number(j.weather[0].id ?? 800),
    condition_main: String(j.weather[0].main || 'Clear'),
    condition_desc: String(j.weather[0].description || '맑음'),
    today_min: Number(j.main.temp_min ?? j.main.temp ?? 0),
    today_max: Number(j.main.temp_max ?? j.main.temp ?? 0),
    today_pop: 0,  // current API 비제공
    raw: j,
  }
}
