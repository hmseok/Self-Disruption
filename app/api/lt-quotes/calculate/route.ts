import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { calculateQuoteCost, type QuoteCostInput } from '@/lib/quote-cost'
import { loadCostReference, describeCostReference, invalidateCostReference } from '@/lib/quote-cost-data'

/**
 * POST /api/lt-quotes/calculate
 *   장기렌트 원가 자동 산출 (저장 X — 모달 실시간 표시용).
 *
 *   Body: QuoteCostInput (purchase_price, brand, model, fuel, engine_cc,
 *                         term_months, annual_km, rent_type + 선택)
 *   Response: { data: QuoteCostResult, reference_summary, error }
 *
 * GET /api/lt-quotes/calculate?invalidate=1
 *   캐시 진단 (현재 캐시 상태) + ?invalidate=1 시 강제 무효화.
 *
 * PR-Q2-2 (2026-05-26) — 엔진 추출 검증 + Q2-4 모달 실시간 산출 진입점.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_FUEL = new Set(['gasoline', 'diesel', 'hybrid', 'ev'])
const ALLOWED_TERM = new Set([24, 36, 48, 60])
const ALLOWED_RENT_TYPE = new Set(['return', 'buyout'])

function validateInput(body: any): { ok: true; input: QuoteCostInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body 가 없습니다' }
  const purchase_price = Number(body.purchase_price)
  if (!Number.isFinite(purchase_price) || purchase_price < 1_000_000) {
    return { ok: false, error: 'purchase_price 는 1,000,000 이상 (정수, 원)' }
  }
  if (!body.brand || !body.model) return { ok: false, error: 'brand / model 필수' }
  if (!ALLOWED_FUEL.has(String(body.fuel))) {
    return { ok: false, error: `fuel 은 ${[...ALLOWED_FUEL].join('/')} 중 하나` }
  }
  const engine_cc = Number(body.engine_cc)
  if (!Number.isFinite(engine_cc) || engine_cc < 100) {
    return { ok: false, error: 'engine_cc 는 100 이상' }
  }
  const term_months = Number(body.term_months)
  if (!ALLOWED_TERM.has(term_months)) {
    return { ok: false, error: `term_months 는 ${[...ALLOWED_TERM].join('/')} 중 하나` }
  }
  const annual_km = Number(body.annual_km)
  if (!Number.isFinite(annual_km) || annual_km < 1000) {
    return { ok: false, error: 'annual_km 는 1000 이상' }
  }
  if (!ALLOWED_RENT_TYPE.has(String(body.rent_type))) {
    return { ok: false, error: `rent_type 는 ${[...ALLOWED_RENT_TYPE].join('/')} 중 하나` }
  }
  return {
    ok: true,
    input: {
      purchase_price,
      brand: String(body.brand),
      model: String(body.model),
      fuel: body.fuel,
      engine_cc,
      term_months: term_months as 24 | 36 | 48 | 60,
      annual_km,
      rent_type: body.rent_type,
      deposit: body.deposit != null ? Number(body.deposit) : undefined,
      upfront_months: body.upfront_months != null ? Number(body.upfront_months) : undefined,
      year: body.year != null ? Number(body.year) : undefined,
      registration_region: body.registration_region || undefined,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const v = validateInput(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const ref = await loadCostReference()
    const data = calculateQuoteCost(v.input, ref)

    return NextResponse.json({
      data,
      reference_summary: describeCostReference(ref),
      error: null,
    })
  } catch (e: unknown) {
    console.error('[lt-quotes/calculate POST]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    if (searchParams.get('invalidate') === '1') {
      invalidateCostReference()
    }
    const ref = await loadCostReference()
    return NextResponse.json({
      reference_summary: describeCostReference(ref),
      error: null,
    })
  } catch (e: unknown) {
    console.error('[lt-quotes/calculate GET]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
