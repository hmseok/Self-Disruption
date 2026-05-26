// ═══════════════════════════════════════════════════════════════════
// GET /api/call-scheduler/kpi/weather
//   Phase W-1c (2026-05-24) — 권역별 현재 날씨 + 통합 보정율
//   설계서: _docs/WEATHER-STAFFING-DESIGN.md §3-1
//
//   처리:
//     ① cs_weather_regions (활성) — 권역 + 가중치 로드
//     ② cs_weather_factors — 보정율 룰 로드
//     ③ cs_weather_cache — 권역별 기존 캐시 일괄 로드
//     ④ 권역별 — 캐시 fresh 면 그대로, stale/missing 이면 OpenWeather fetch
//        → cs_weather_cache UPSERT (region_id UNIQUE — DELETE+INSERT)
//     ⑤ 권역별 condition_code → lookupFactor → factor
//     ⑥ combined_factor = Σ(weight_pct × factor) / Σ(weight_pct)
//
//   fetch 실패 시 — stale 캐시 fallback (stale=true 표시), 캐시도 없으면 factor 1.0
//
//   호환: MySQL 8.0 / OpenWeather Current API
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { fetchOpenWeather, type WeatherSnap } from '../_lib/openweather'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const CACHE_TTL_MS = 60 * 60 * 1000  // 1h

interface RegionRow {
  id: string; code: string; label: string
  lat: number; lon: number; weight_pct: number; sort_order: number
}
interface FactorRow {
  condition_key: string; label: string; factor: number; openweather_codes: string
}
interface CacheRow {
  region_id: string
  fetched_at: Date
  valid_until: Date
  current_temp: number | null
  current_code: number | null
  current_main: string | null
  current_desc: string | null
}

// condition_code → factor (보정율 룰 매칭)
function lookupFactor(code: number, factors: FactorRow[]): number {
  for (const f of factors) {
    const codes = f.openweather_codes
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
    if (codes.includes(code)) return Number(f.factor)
  }
  return 1.0  // 매칭 없으면 무영향
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const apiKeySet = !!process.env.OPENWEATHER_API_KEY

    // ── 1. 권역 (활성) ──
    const regions: RegionRow[] = (await prisma.$queryRaw<any[]>`
      SELECT id, code, label, lat, lon, weight_pct, sort_order
      FROM cs_weather_regions
      WHERE is_active = 1
      ORDER BY sort_order ASC, label ASC
    `).map((r) => ({
      id: String(r.id),
      code: String(r.code),
      label: String(r.label),
      lat: Number(r.lat),
      lon: Number(r.lon),
      weight_pct: Number(r.weight_pct),
      sort_order: Number(r.sort_order),
    }))

    // ── 2. 보정율 룰 ──
    const factors: FactorRow[] = (await prisma.$queryRaw<any[]>`
      SELECT condition_key, label, factor, openweather_codes
      FROM cs_weather_factors
      ORDER BY sort_order ASC
    `).map((r) => ({
      condition_key: String(r.condition_key),
      label: String(r.label),
      factor: Number(r.factor),
      openweather_codes: String(r.openweather_codes),
    }))

    // ── 3. 기존 캐시 일괄 ──
    const cacheMap = new Map<string, CacheRow>()
    if (regions.length > 0) {
      const ids = regions.map((r) => r.id)
      const placeholders = ids.map(() => '?').join(',')
      const cacheRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT region_id, fetched_at, valid_until,
                current_temp, current_code, current_main, current_desc
         FROM cs_weather_cache WHERE region_id IN (${placeholders})`,
        ...ids,
      )
      for (const c of cacheRows) {
        cacheMap.set(String(c.region_id), {
          region_id: String(c.region_id),
          fetched_at: new Date(c.fetched_at),
          valid_until: new Date(c.valid_until),
          current_temp: c.current_temp == null ? null : Number(c.current_temp),
          current_code: c.current_code == null ? null : Number(c.current_code),
          current_main: c.current_main == null ? null : String(c.current_main),
          current_desc: c.current_desc == null ? null : String(c.current_desc),
        })
      }
    }

    // ── 4. 권역별 — 캐시 hit 그대로, stale/missing 이면 fetch + UPSERT ──
    const now = new Date()
    const results: any[] = []

    for (const region of regions) {
      const cached = cacheMap.get(region.id)
      const isFresh = !!cached && cached.valid_until.getTime() > now.getTime()
      let snap: WeatherSnap | null = null
      let cacheHit = false
      let stale = false
      let fetchedAt = cached?.fetched_at ?? null
      let validUntil = cached?.valid_until ?? null

      if (isFresh && cached) {
        // 캐시 hit
        cacheHit = true
        snap = {
          temp: cached.current_temp ?? 0,
          condition_code: cached.current_code ?? 800,
          condition_main: cached.current_main ?? 'Clear',
          condition_desc: cached.current_desc ?? '맑음',
          today_min: cached.current_temp ?? 0,
          today_max: cached.current_temp ?? 0,
          today_pop: 0,
          raw: null,
        }
      } else if (apiKeySet) {
        // stale or missing — fetch + UPSERT
        try {
          snap = await fetchOpenWeather(region.lat, region.lon)
          fetchedAt = now
          validUntil = new Date(now.getTime() + CACHE_TTL_MS)
          // UPSERT — region_id UNIQUE → DELETE+INSERT
          await prisma.$executeRaw`
            DELETE FROM cs_weather_cache WHERE region_id = ${region.id}
          `
          const cacheId = crypto.randomUUID()
          await prisma.$executeRaw`
            INSERT INTO cs_weather_cache
              (id, region_id, fetched_at, valid_until,
               current_temp, current_code, current_main, current_desc,
               today_min, today_max, today_pop, raw_json, created_at)
            VALUES
              (${cacheId}, ${region.id}, ${fetchedAt}, ${validUntil},
               ${snap.temp}, ${snap.condition_code}, ${snap.condition_main},
               ${snap.condition_desc},
               ${snap.today_min}, ${snap.today_max}, ${snap.today_pop},
               ${JSON.stringify(snap.raw)}, NOW())
          `
        } catch {
          // fetch 실패 — stale 캐시 fallback
          if (cached) {
            stale = true
            snap = {
              temp: cached.current_temp ?? 0,
              condition_code: cached.current_code ?? 800,
              condition_main: cached.current_main ?? 'Clear',
              condition_desc: cached.current_desc ?? '맑음',
              today_min: 0,
              today_max: 0,
              today_pop: 0,
              raw: null,
            }
          }
          // 캐시도 없으면 snap = null → factor 1.0
        }
      }
      // apiKeySet false 인데 캐시도 없으면 snap = null → factor 1.0

      const code = snap?.condition_code ?? 800
      const factor = snap ? lookupFactor(code, factors) : 1.0

      results.push({
        id: region.id,
        code: region.code,
        label: region.label,
        lat: region.lat,
        lon: region.lon,
        weight_pct: region.weight_pct,
        sort_order: region.sort_order,
        current: snap
          ? {
              temp: snap.temp,
              condition_code: snap.condition_code,
              condition_main: snap.condition_main,
              condition_desc: snap.condition_desc,
              factor,
            }
          : null,
        cache_hit: cacheHit,
        stale,
        fetched_at: fetchedAt?.toISOString() ?? null,
        valid_until: validUntil?.toISOString() ?? null,
      })
    }

    // ── 5. 통합 보정율 (가중평균) ──
    const totalWeight = results.reduce((s, r) => s + r.weight_pct, 0)
    let combinedFactor = 1.0
    if (totalWeight > 0) {
      const weighted = results.reduce((s, r) => {
        const f = r.current?.factor ?? 1.0
        return s + r.weight_pct * f
      }, 0)
      combinedFactor = Math.round((weighted / totalWeight) * 1000) / 1000
    }

    return NextResponse.json({
      data: serialize({
        fetched_at: now.toISOString(),
        api_key_set: apiKeySet,
        regions: results,
        combined_factor: combinedFactor,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Weather API error' },
      { status: 500 },
    )
  }
}
