import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * vehicle_market_price — 차종별 중고 시세 기준표 CRUD + 3-column 비교 조회
 *
 * 3-column 구조:
 *   1) 외부시세 (market_price from vehicle_market_price, 크롤러/수동)
 *   2) 자체 매입가 (cars.purchase_price AVG, ownership_type='company')
 *   3) 블렌드 결과 (외부시세 × DEP_MARKET_PRICE_WEIGHT + 매입가 × DEP_CURVE_WEIGHT)
 *
 * 엔진(rent-calc-engine v2.1)이 참조하는 마스터 테이블.
 */

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// 블렌드 가중치 (business_rules 조회 시 기본값)
const FALLBACK_MARKET_WEIGHT = 0.7
const FALLBACK_CURVE_WEIGHT = 0.3

async function loadBlendWeights(): Promise<{ market: number; curve: number }> {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT \`key\`, value
      FROM business_rules
      WHERE \`key\` IN ('DEP_MARKET_PRICE_WEIGHT', 'DEP_CURVE_WEIGHT')
    `
    const map = new Map<string, number>()
    for (const r of rows) {
      const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
      map.set(r.key, Number(v))
    }
    return {
      market: map.get('DEP_MARKET_PRICE_WEIGHT') ?? FALLBACK_MARKET_WEIGHT,
      curve: map.get('DEP_CURVE_WEIGHT') ?? FALLBACK_CURVE_WEIGHT,
    }
  } catch {
    return { market: FALLBACK_MARKET_WEIGHT, curve: FALLBACK_CURVE_WEIGHT }
  }
}

/**
 * GET /api/vehicle-market-prices
 *   ?mode=comparison — 3-column 비교 뷰 (외부시세 + 자체 매입가 + 블렌드)
 *   default         — vehicle_market_price 전체 로우
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const mode = searchParams.get('mode') || 'list'

    if (mode === 'comparison') {
      const weights = await loadBlendWeights()

      // 외부시세 (active 전체)
      const vmps = await prisma.$queryRaw<any[]>`
        SELECT id, brand, model, trim_name, year, fuel_type, origin, vehicle_class,
               mileage_km, market_price, min_price, max_price, sample_count,
               source_site, crawled_at, note
        FROM vehicle_market_price
        WHERE is_active = 1
        ORDER BY brand, model, year DESC
      `

      // 자체 보유 차량 매입가 통계 (brand/model/year 그룹)
      const fleetStats = await prisma.$queryRaw<any[]>`
        SELECT brand, model, year,
               COUNT(*) AS fleet_count,
               AVG(purchase_price) AS avg_purchase_price,
               MIN(purchase_price) AS min_purchase_price,
               MAX(purchase_price) AS max_purchase_price
        FROM cars
        WHERE ownership_type = 'company'
          AND status NOT IN ('returned', 'sold', 'disposed', 'retired')
          AND purchase_price IS NOT NULL
          AND purchase_price > 0
        GROUP BY brand, model, year
      `

      // 매칭 + 블렌드 계산
      const fleetMap = new Map<string, any>()
      for (const f of fleetStats) {
        fleetMap.set(`${f.brand}|${f.model}|${f.year}`, f)
      }

      const comparison = vmps.map((vmp: any) => {
        const key = `${vmp.brand}|${vmp.model}|${vmp.year}`
        const fleet = fleetMap.get(key)
        const marketPrice = Number(vmp.market_price)
        const avgPurchase = fleet ? Number(fleet.avg_purchase_price) : 0
        const fleetCount = fleet ? Number(fleet.fleet_count) : 0

        // 블렌드: 자체 매입가가 있으면 curve 근사값으로 사용, 없으면 외부시세만
        const blended = avgPurchase > 0
          ? Math.round(marketPrice * weights.market + avgPurchase * weights.curve)
          : marketPrice

        // 편차율 = (외부시세 - 매입가) / 매입가 × 100
        const deviationPct = avgPurchase > 0
          ? Math.round((marketPrice - avgPurchase) / avgPurchase * 1000) / 10
          : null

        return {
          ...vmp,
          fleet_count: fleetCount,
          avg_purchase_price: avgPurchase,
          min_purchase_price: fleet ? Number(fleet.min_purchase_price) : 0,
          max_purchase_price: fleet ? Number(fleet.max_purchase_price) : 0,
          blended_price: blended,
          deviation_pct: deviationPct,
        }
      })

      return NextResponse.json({
        data: serialize(comparison),
        weights,
        error: null,
      })
    }

    // default: 전체 리스트
    const rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM vehicle_market_price
      WHERE is_active = 1
      ORDER BY brand, model, year DESC
    `
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/vehicle-market-prices — 시세 신규 등록 (수동)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const {
      brand, model, trim_name, year, fuel_type, origin, vehicle_class,
      mileage_km, market_price, min_price, max_price, sample_count,
      source_site, source_url, note,
    } = body

    if (!brand || !model || !year || !fuel_type || !origin || !market_price) {
      return NextResponse.json({ error: 'brand/model/year/fuel_type/origin/market_price 필수' }, { status: 400 })
    }

    await prisma.$executeRaw`
      INSERT INTO vehicle_market_price
        (brand, model, trim_name, year, fuel_type, origin, vehicle_class,
         mileage_km, market_price, min_price, max_price, sample_count,
         source_site, source_url, crawled_at, is_active, note)
      VALUES
        (${brand}, ${model}, ${trim_name || null}, ${Number(year)}, ${fuel_type}, ${origin}, ${vehicle_class || null},
         ${Number(mileage_km) || 0}, ${Number(market_price)}, ${Number(min_price) || Number(market_price)}, ${Number(max_price) || Number(market_price)}, ${Number(sample_count) || 1},
         ${source_site || 'manual'}, ${source_url || null}, NOW(), 1, ${note || null})
    `
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * PATCH /api/vehicle-market-prices?id=123 — 시세 수정
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    const body = await request.json()
    // 허용 컬럼 화이트리스트
    const ALLOWED = new Set([
      'brand', 'model', 'trim_name', 'year', 'fuel_type', 'origin', 'vehicle_class',
      'mileage_km', 'market_price', 'min_price', 'max_price', 'sample_count',
      'source_site', 'source_url', 'note', 'is_active',
    ])
    const entries = Object.entries(body).filter(([k]) => ALLOWED.has(k))
    if (entries.length === 0) {
      return NextResponse.json({ error: '변경할 필드 없음' }, { status: 400 })
    }

    // 파라미터 바인딩 안전하게 처리
    for (const [key, val] of entries) {
      const safeVal = val === null || val === undefined ? null : val
      await prisma.$executeRawUnsafe(
        `UPDATE vehicle_market_price SET \`${key}\` = ? WHERE id = ?`,
        safeVal, Number(id)
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * DELETE /api/vehicle-market-prices?id=123 — 시세 비활성화
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    await prisma.$executeRaw`UPDATE vehicle_market_price SET is_active = 0 WHERE id = ${Number(id)}`
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
