'use client'
// ═══════════════════════════════════════════════════════════════════
// Phase W-1e — 날씨 위젯 (대시보드용) + 거점 날씨 배지 (TodayTomorrowGrid용)
//   설계서: _docs/WEATHER-STAFFING-DESIGN.md §4-2·§4-3
//
//   · WeatherWidget — KPI 대시보드 상단. 가중치 큰 N권역 카드 + 통합 보정율.
//   · TodayWeatherBadge — 「오늘」 DayCard 헤더용 인라인 배지 (거점 권역).
//
//   둘 다 GET /api/call-scheduler/kpi/weather (서버 1h 캐시) 사용.
//   API 키 미설정·fetch 실패 시 graceful (위젯 자체 숨김 또는 안내 배지).
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { COLORS, GLASS } from '@/app/utils/ui-tokens'
import { getAuthHeader } from '@/app/utils/auth-client'

export interface WeatherRegion {
  id: string
  code: string
  label: string
  weight_pct: number
  sort_order: number
  current: {
    temp: number
    condition_main: string
    condition_desc: string
    condition_code: number
    factor: number
  } | null
  cache_hit: boolean
  stale: boolean
  fetched_at: string | null
}

export interface WeatherResponse {
  fetched_at: string
  api_key_set: boolean
  regions: WeatherRegion[]
  combined_factor: number
}

// ─── 공용 ─────────────────────────────────────────────────────
async function fetchWeather(): Promise<WeatherResponse | null> {
  try {
    const auth = await getAuthHeader()
    const res = await fetch('/api/call-scheduler/kpi/weather', { headers: auth })
    if (!res.ok) return null
    const json = await res.json()
    return (json?.data ?? null) as WeatherResponse | null
  } catch {
    return null
  }
}

// condition_main → 이모지 (OpenWeather 그룹 매핑)
export function weatherEmoji(main: string | null | undefined): string {
  switch ((main || '').toLowerCase()) {
    case 'clear': return '☀️'
    case 'clouds': return '☁️'
    case 'rain': return '🌧'
    case 'drizzle': return '🌦'
    case 'thunderstorm': return '⛈'
    case 'snow': return '🌨'
    case 'mist': case 'fog': case 'haze':
    case 'smoke': case 'dust': case 'sand': case 'ash':
      return '🌫'
    default: return '☁️'
  }
}

// factor 색상 — 1.0=중립(녹), 1.2~1.5=경고(앰버), ≥1.5=위험(빨강)
function factorColor(f: number): { bg: string; bd: string; text: string } {
  if (f >= 1.5) {
    return { bg: COLORS.bgRed, bd: COLORS.borderRed, text: COLORS.danger }
  }
  if (f >= 1.2) {
    return { bg: COLORS.bgAmber, bd: COLORS.borderAmber, text: COLORS.warning }
  }
  return { bg: COLORS.bgGreen, bd: COLORS.borderGreen, text: COLORS.success }
}

// ═════════════════════════════════════════════════════════════════════
// WeatherWidget — KPI 대시보드 상단 권역 카드 (default 5권역)
// ═════════════════════════════════════════════════════════════════════
export default function WeatherWidget({ topN = 5 }: { topN?: number }) {
  const [data, setData] = useState<WeatherResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetchWeather()
    setData(r)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading && !data) {
    return (
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 12,
        border: `1px solid ${COLORS.borderSubtle}`,
      }}>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>
          ⛅ 날씨 로딩 중...
        </span>
      </div>
    )
  }
  if (!data) return null  // graceful — fetch 실패 시 위젯 숨김

  if (!data.api_key_set) {
    return (
      <div style={{
        ...GLASS.L4, borderRadius: 12, padding: '10px 14px', marginBottom: 12,
        background: COLORS.bgAmber, border: `1px solid ${COLORS.borderAmber}`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.warning }}>
          ⚠ OpenWeather 키 미설정 — KPI 설정 「⛅ 날씨 기준」 또는 Cloud Run 환경변수 확인
        </span>
      </div>
    )
  }

  const top = data.regions
    .filter((r) => r.current != null)
    .sort((a, b) => b.weight_pct - a.weight_pct)
    .slice(0, topN)

  const fc = factorColor(data.combined_factor)
  const cacheHits = data.regions.filter((r) => r.cache_hit).length
  const cacheLabel =
    cacheHits === data.regions.length
      ? `🗄 캐시 ${cacheHits}/${data.regions.length}`
      : `↻ ${data.regions.length - cacheHits}권역 새로 fetch`

  return (
    <div style={{
      ...GLASS.L4, borderRadius: 12, padding: 14, marginBottom: 12,
      border: `1px solid ${COLORS.borderSubtle}`,
    }}>
      {/* 헤더 — 라벨 + 통합 보정율 + 캐시 상태 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 13, fontWeight: 800, color: COLORS.textPrimary,
        }}>
          ⛅ 전국 날씨 ({data.regions.length}권역)
        </span>
        <span style={{
          fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 6,
          background: fc.bg, border: `1px solid ${fc.bd}`, color: fc.text,
        }} title="권역별 weight × factor 가중평균 → WFM Erlang C λ 곱셈">
          통합 보정율 {data.combined_factor.toFixed(2)}×
        </span>
        <span style={{
          fontSize: 10, color: COLORS.textMuted, marginLeft: 'auto',
        }}>
          {cacheLabel}
          {data.fetched_at && ` · ${new Date(data.fetched_at).toLocaleTimeString('ko-KR')}`}
        </span>
      </div>

      {/* 권역 카드 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 8,
      }}>
        {top.map((r) => {
          const factor = r.current?.factor ?? 1.0
          const fcCard = factorColor(factor)
          return (
            <div key={r.id} style={{
              ...GLASS.L1, borderRadius: 8, padding: '8px 10px',
              border: `1px solid ${fcCard.bd}`,
              background: fcCard.bg,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
              }}>
                <span style={{ fontSize: 20 }}>
                  {weatherEmoji(r.current?.condition_main)}
                </span>
                <span style={{
                  fontSize: 16, fontWeight: 800, color: COLORS.textPrimary,
                }}>
                  {r.current?.temp.toFixed(1)}°
                </span>
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: COLORS.textSecondary,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {r.label}
              </div>
              <div style={{
                fontSize: 10, color: fcCard.text, fontWeight: 700,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {r.current?.condition_desc} · ×{factor.toFixed(2)}
              </div>
              <div style={{
                fontSize: 9, color: COLORS.textMuted, marginTop: 2,
              }}>
                가중 {r.weight_pct.toFixed(1)}%
              </div>
            </div>
          )
        })}
      </div>

      {data.combined_factor >= 1.2 && (
        <div style={{
          fontSize: 11, color: fc.text, marginTop: 8, padding: '6px 10px',
          background: fc.bg, border: `1px solid ${fc.bd}`, borderRadius: 6,
          fontWeight: 700,
        }}>
          ⚠ 인입량 증가 예상 — WFM 필요인원이 평소 대비 ×{data.combined_factor.toFixed(2)}
          {' '}배. 「필요인원」 탭의 날씨 보정 적용 후 시간대별 부족분 확인 (W-2 단계).
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// TodayWeatherBadge — TodayTomorrowGrid 「오늘」 헤더 인라인 배지
//   거점 권역 = 가중치 큰 active 첫 권역 (보통 경기/서울)
// ═════════════════════════════════════════════════════════════════════
export function TodayWeatherBadge() {
  const [data, setData] = useState<WeatherResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await fetchWeather()
      if (!cancelled) setData(r)
    })()
    return () => { cancelled = true }
  }, [])

  if (!data || !data.api_key_set) return null

  // 거점 = 가중치 최대 active 권역 (current 있는 것 중)
  const base = [...data.regions]
    .filter((r) => r.current != null)
    .sort((a, b) => b.weight_pct - a.weight_pct)[0]
  if (!base || !base.current) return null

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700, color: COLORS.textSecondary,
      background: COLORS.bgGray, padding: '2px 8px', borderRadius: 99,
      border: `1px solid ${COLORS.borderFaint}`, marginLeft: 8,
    }} title={
      `${base.label} · ${base.current.condition_desc} · ×${base.current.factor.toFixed(2)} ` +
      `(전국 통합 ×${data.combined_factor.toFixed(2)})`
    }>
      <span style={{ fontSize: 13 }}>
        {weatherEmoji(base.current.condition_main)}
      </span>
      <span>{base.current.temp.toFixed(1)}°</span>
    </span>
  )
}
