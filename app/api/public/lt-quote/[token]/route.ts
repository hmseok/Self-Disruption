import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/public/lt-quote/[token]
 *   장기렌트 견적 공개 조회 — 인증 없음, share_token 으로 진입.
 *   조회 시 share_views++, share_last_viewed_at=NOW (best-effort).
 *   민감 필드 (owner_id 등) 제외, 고객 표시용 필드만 응답.
 *
 * PR-Q2-4 (2026-05-26)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || token.length < 8) {
      return NextResponse.json({ error: 'invalid token' }, { status: 400 })
    }

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT q.id, q.quote_no, q.status, q.contract_type, q.rent_type,
             q.customer_name, q.customer_company,
             q.vehicle_car_number,
             q.vehicle_brand, q.vehicle_model, q.vehicle_trim, q.vehicle_year,
             q.vehicle_fuel, q.vehicle_engine_cc,
             q.vehicle_color_ext, q.vehicle_color_int, q.vehicle_options_text,
             q.start_date, q.months, q.end_date, q.annual_km, q.residual_rate,
             q.monthly_fee, q.deposit, q.upfront_months, q.delivery_fee,
             q.insurance_option,
             q.sent_at, q.valid_until, q.owner_name,
             q.memo, q.created_at, q.updated_at
        FROM lt_quotes q
       WHERE q.share_token = ${token}
       LIMIT 1`

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const q = rows[0]

    // best effort views++
    prisma.$executeRaw`
      UPDATE lt_quotes
         SET share_views = COALESCE(share_views, 0) + 1,
             share_last_viewed_at = NOW()
       WHERE share_token = ${token}`
      .catch((e: unknown) => console.warn('[public lt-quote views++]', (e as Error)?.message))

    const data = {
      ...q,
      monthly_fee: q.monthly_fee != null ? Number(q.monthly_fee) : null,
      deposit: q.deposit != null ? Number(q.deposit) : null,
      delivery_fee: q.delivery_fee != null ? Number(q.delivery_fee) : null,
      upfront_months: q.upfront_months != null ? Number(q.upfront_months) : null,
      annual_km: q.annual_km != null ? Number(q.annual_km) : null,
      months: q.months != null ? Number(q.months) : null,
      vehicle_year: q.vehicle_year != null ? Number(q.vehicle_year) : null,
      vehicle_engine_cc: q.vehicle_engine_cc != null ? Number(q.vehicle_engine_cc) : null,
      residual_rate: q.residual_rate != null ? Number(q.residual_rate) : null,
    }
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: unknown) {
    console.error('[public lt-quote GET]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
