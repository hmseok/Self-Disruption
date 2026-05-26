// ═══════════════════════════════════════════════════════════════════
// /api/call-scheduler/kpi/weather/factors — 날씨 보정율 룰 CRUD
//   Phase W-1b (2026-05-24) — 설계서: _docs/WEATHER-STAFFING-DESIGN.md
//
//   GET    — 룰 목록 (sort_order 순)
//   POST   body { factors:[{id?, condition_key, label, factor,
//                            openweather_codes, sort_order}] }
//          · id 있으면 UPDATE, 없으면 INSERT (UUID)
//          · openweather_codes — '500,520' 형식 CSV (3자리 정수만)
//          · factor — 0~10 범위 (1.00=무영향, 1.60=폭우 가중 등)
//   DELETE ?id=<uuid>
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
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, condition_key, label, factor, openweather_codes, sort_order,
             DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM cs_weather_factors
      ORDER BY sort_order ASC, condition_key ASC
    `

    const factors = rows.map((r) => ({
      id: String(r.id),
      condition_key: String(r.condition_key),
      label: String(r.label),
      factor: Number(r.factor),
      openweather_codes: String(r.openweather_codes),
      sort_order: Number(r.sort_order),
      updated_at: r.updated_at ?? null,
    }))

    return NextResponse.json({
      data: serialize({ factors }),
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
    const items = Array.isArray(body?.factors) ? body.factors : []
    if (items.length === 0) {
      return NextResponse.json({ error: '저장할 룰이 없습니다.' }, { status: 400 })
    }

    let inserted = 0
    let updated = 0
    const errors: string[] = []

    for (const it of items) {
      const id = it?.id ? String(it.id).trim() : ''
      const condition_key = String(it?.condition_key || '').trim()
      const label = String(it?.label || '').trim()
      const factor = Number(it?.factor ?? 1)
      const rawCodes = String(it?.openweather_codes || '').trim()
      const sort_order = Number(it?.sort_order ?? 0)

      // 검증
      if (!condition_key || !label) {
        errors.push(`condition_key/label 필수`)
        continue
      }
      if (!Number.isFinite(factor) || factor < 0 || factor > 10) {
        errors.push(`factor 0~10 (${condition_key})`)
        continue
      }
      if (!rawCodes) {
        errors.push(`openweather_codes 필수 (${condition_key})`)
        continue
      }
      // CSV — 콤마로 split, 각 3자리 정수만
      const codes = rawCodes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const allValid = codes.length > 0 &&
        codes.every((c) => /^\d{3}$/.test(c))
      if (!allValid) {
        errors.push(
          `openweather_codes 는 콤마 구분 3자리 정수만 (${condition_key})`,
        )
        continue
      }
      const normalizedCodes = codes.join(',')

      try {
        if (id) {
          const aff = await prisma.$executeRaw`
            UPDATE cs_weather_factors
            SET condition_key = ${condition_key}, label = ${label},
                factor = ${factor},
                openweather_codes = ${normalizedCodes},
                sort_order = ${sort_order}, updated_at = NOW()
            WHERE id = ${id}
          `
          if (Number(aff) > 0) updated++
          else errors.push(`룰 없음 (${id})`)
        } else {
          const newId = crypto.randomUUID()
          await prisma.$executeRaw`
            INSERT INTO cs_weather_factors
              (id, condition_key, label, factor, openweather_codes,
               sort_order, updated_at)
            VALUES
              (${newId}, ${condition_key}, ${label}, ${factor},
               ${normalizedCodes}, ${sort_order}, NOW())
          `
          inserted++
        }
      } catch (e: any) {
        const msg = String(e?.message || '저장 실패')
        if (msg.includes('Duplicate')) {
          errors.push(`condition_key 중복 (${condition_key})`)
        } else {
          errors.push(`${condition_key}: ${msg}`)
        }
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
      DELETE FROM cs_weather_factors WHERE id = ${id}
    `
    return NextResponse.json({
      data: { deleted: Number(aff) },
      error: null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
