// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/weather/regions — 날씨 권역 마스터 CRUD
//   Phase W-1b (2026-05-24) — 설계서: _docs/WEATHER-STAFFING-DESIGN.md
//
//   GET    ?include_inactive=1 — 권역 목록 (디폴트 활성만)
//   POST   body { regions:[{id?, code, label, lat, lon, weight_pct,
//                            sort_order, is_active}] }
//          · id 있으면 UPDATE, 없으면 INSERT (UUID 생성)
//          · 한국 좌표 범위 검증 (lat 33~39 / lon 124~132)
//          · weight_pct 합 100 강제 X — UI 가 라이브 검증
//   DELETE ?id=<uuid> — 권역 삭제 (cs_weather_cache CASCADE)
//
//   호환: MySQL 8.0
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const url = new URL(request.url)
    const includeInactive = url.searchParams.get('include_inactive') === '1'
    const rows = includeInactive
      ? await prisma.$queryRaw<any[]>`
          SELECT id, code, label, lat, lon, weight_pct, sort_order, is_active,
                 DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
          FROM cs_weather_regions
          ORDER BY sort_order ASC, label ASC
        `
      : await prisma.$queryRaw<any[]>`
          SELECT id, code, label, lat, lon, weight_pct, sort_order, is_active,
                 DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
          FROM cs_weather_regions
          WHERE is_active = 1
          ORDER BY sort_order ASC, label ASC
        `

    const regions = rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      label: String(r.label),
      lat: Number(r.lat),
      lon: Number(r.lon),
      weight_pct: Number(r.weight_pct),
      sort_order: Number(r.sort_order),
      is_active: Number(r.is_active) === 1,
      updated_at: r.updated_at ?? null,
    }))

    const sumWeight = Math.round(
      regions.filter((r) => r.is_active).reduce((s, r) => s + r.weight_pct, 0) * 100
    ) / 100

    return NextResponse.json({
      data: serialize({ regions, sum_weight: sumWeight }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const body = await request.json()
    const items = Array.isArray(body?.regions) ? body.regions : []
    if (items.length === 0) {
      return NextResponse.json({ error: '저장할 권역이 없습니다.' }, { status: 400 })
    }

    let inserted = 0
    let updated = 0
    const errors: string[] = []

    for (const it of items) {
      const id = it?.id ? String(it.id).trim() : ''
      const code = String(it?.code || '').trim().toUpperCase()
      const label = String(it?.label || '').trim()
      const lat = Number(it?.lat)
      const lon = Number(it?.lon)
      const weight_pct = Number(it?.weight_pct ?? 0)
      const sort_order = Number(it?.sort_order ?? 0)
      const is_active =
        it?.is_active === false || it?.is_active === 0 ? 0 : 1

      // 검증
      if (!code || !label) {
        errors.push(`code/label 필수 (${code || '?'})`)
        continue
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        errors.push(`lat/lon 숫자 필수 (${code})`)
        continue
      }
      if (lat < 33 || lat > 39 || lon < 124 || lon > 132) {
        errors.push(`한국 좌표 범위 벗어남 (${code}: ${lat}, ${lon})`)
        continue
      }
      if (!Number.isFinite(weight_pct) || weight_pct < 0 || weight_pct > 100) {
        errors.push(`weight_pct 0~100 (${code})`)
        continue
      }

      try {
        if (id) {
          const aff = await prisma.$executeRaw`
            UPDATE cs_weather_regions
            SET code = ${code}, label = ${label},
                lat = ${lat}, lon = ${lon},
                weight_pct = ${weight_pct}, sort_order = ${sort_order},
                is_active = ${is_active}, updated_at = NOW()
            WHERE id = ${id}
          `
          if (Number(aff) > 0) updated++
          else errors.push(`권역 없음 (${id})`)
        } else {
          const newId = crypto.randomUUID()
          await prisma.$executeRaw`
            INSERT INTO cs_weather_regions
              (id, code, label, lat, lon, weight_pct, sort_order, is_active,
               created_at, updated_at)
            VALUES
              (${newId}, ${code}, ${label}, ${lat}, ${lon}, ${weight_pct},
               ${sort_order}, ${is_active}, NOW(), NOW())
          `
          inserted++
        }
      } catch (e: any) {
        const msg = String(e?.message || '저장 실패')
        if (msg.includes('Duplicate')) errors.push(`code 중복 (${code})`)
        else errors.push(`${code}: ${msg}`)
      }
    }

    return NextResponse.json({
      data: serialize({
        inserted, updated, errors,
        total: items.length,
      }),
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id') || ''
    if (!id) {
      return NextResponse.json({ error: 'id 파라미터 필수' }, { status: 400 })
    }

    const aff = await prisma.$executeRaw`
      DELETE FROM cs_weather_regions WHERE id = ${id}
    `
    return NextResponse.json({
      data: { deleted: Number(aff) },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
