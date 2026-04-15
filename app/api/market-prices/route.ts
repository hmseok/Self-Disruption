import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

/**
 * GET /api/market-prices
 * Query:
 *   brand, model, year, term_months, annual_km
 * Returns: 동일 조건의 대기업 실판매 샘플 (롯데/SK/현대/KB/AJ)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ data: [], error: null }, { status: 200 })

    const { searchParams } = new URL(request.url)
    const brand = searchParams.get('brand') || ''
    const model = searchParams.get('model') || ''
    const year = searchParams.get('year')
    const termMonths = searchParams.get('term_months') || '60'
    const annualKm = searchParams.get('annual_km') || '20000'

    const all = searchParams.get('all')
    // 관리자 리스트 모드: 전체 로우 반환
    if (all === '1') {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT * FROM market_prices
        ORDER BY brand, model, year DESC, company
        LIMIT 1000
      `.catch(() => [] as any[])
      return NextResponse.json({ data: serialize(rows), error: null })
    }

    if (!brand || !model) {
      return NextResponse.json({ data: [], error: null })
    }

    // 기본: 정확 매칭 (year 포함) 시도
    let rows: any[] = []
    if (year) {
      rows = await prisma.$queryRaw<any[]>`
        SELECT * FROM market_prices
        WHERE is_active = 1
          AND brand = ${brand}
          AND model = ${model}
          AND year = ${Number(year)}
          AND term_months = ${Number(termMonths)}
          AND annual_km = ${Number(annualKm)}
        ORDER BY updated_at DESC
        LIMIT 20
      `.catch(() => [] as any[])
    }

    // fallback: year 매칭 해제
    if (!rows || rows.length === 0) {
      rows = await prisma.$queryRaw<any[]>`
        SELECT * FROM market_prices
        WHERE is_active = 1
          AND brand = ${brand}
          AND model = ${model}
        ORDER BY updated_at DESC
        LIMIT 20
      `.catch(() => [] as any[])
    }

    // 집계: 평균/최저
    const prices = rows.map(r => Number(r.monthly_price)).filter(p => p > 0)
    const avg = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0
    const min = prices.length > 0 ? Math.min(...prices) : 0
    const max = prices.length > 0 ? Math.max(...prices) : 0

    return NextResponse.json({
      data: serialize(rows),
      summary: { avg, min, max, count: prices.length },
      error: null
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

/**
 * POST /api/market-prices — 시중가 샘플 추가 (관리자)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const body = await request.json()
    const { brand, model, year, trim_name, company, product_name, term_months, annual_km, deposit_pct, prepay_pct, monthly_price, source_url, note } = body
    if (!brand || !model || !company || !monthly_price) {
      return NextResponse.json({ error: 'brand/model/company/monthly_price required' }, { status: 400 })
    }
    await prisma.$executeRaw`
      INSERT INTO market_prices
        (brand, model, year, trim_name, company, product_name, term_months, annual_km, deposit_pct, prepay_pct, monthly_price, source_url, note, is_active)
      VALUES
        (${brand}, ${model}, ${Number(year) || 2026}, ${trim_name || null}, ${company},
         ${product_name || null}, ${Number(term_months) || 60}, ${Number(annual_km) || 20000},
         ${Number(deposit_pct) || 30}, ${Number(prepay_pct) || 0}, ${Number(monthly_price)},
         ${source_url || null}, ${note || null}, 1)
    `
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * PUT /api/market-prices — 시중가 샘플 수정 (관리자)
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const body = await request.json()
    const { id, brand, model, year, trim_name, company, product_name, term_months, annual_km, deposit_pct, prepay_pct, monthly_price, source_url, note, is_active } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await prisma.$executeRaw`
      UPDATE market_prices SET
        brand = ${brand}, model = ${model}, year = ${Number(year) || 2026},
        trim_name = ${trim_name || null}, company = ${company}, product_name = ${product_name || null},
        term_months = ${Number(term_months) || 60}, annual_km = ${Number(annual_km) || 20000},
        deposit_pct = ${Number(deposit_pct) || 30}, prepay_pct = ${Number(prepay_pct) || 0},
        monthly_price = ${Number(monthly_price)}, source_url = ${source_url || null},
        note = ${note || null}, is_active = ${is_active === false ? 0 : 1}
      WHERE id = ${Number(id)}
    `
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * DELETE /api/market-prices?id=123 — 시중가 샘플 비활성화 (관리자)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    // Soft delete — is_active=0
    await prisma.$executeRaw`UPDATE market_prices SET is_active = 0 WHERE id = ${Number(id)}`
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
