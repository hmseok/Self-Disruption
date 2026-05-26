import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/public/long-term-quotes/[token]
 *   장기렌트 견적 공개 조회 — 인증 없음, share_token 으로 진입.
 *   조회 시 share_views++, share_last_viewed_at=NOW
 *   민감 필드 (owner_id 등) 제외, 고객 표시용 필드만 응답.
 *
 * PR-Q1 (2026-05-26)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
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
      SELECT q.id, q.quote_no, q.status, q.contract_type,
             q.customer_name, q.customer_company,
             q.vehicle_id, q.vehicle_car_number, q.vehicle_spec,
             q.start_date, q.months, q.end_date,
             q.monthly_fee, q.deposit, q.upfront_months, q.annual_km,
             q.insurance_option, q.delivery_fee, q.options_json,
             q.sent_at, q.valid_until, q.owner_name,
             q.memo, q.created_at, q.updated_at,
             c.brand AS vehicle_brand, c.model AS vehicle_model
        FROM long_term_quotes q
        LEFT JOIN cars c ON c.id = q.vehicle_id
       WHERE q.share_token = ${token}
       LIMIT 1`

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    const q = rows[0]

    // 만료 / converted 시 표시는 하되 상태 알림
    // 조회수 + 마지막 조회시각 갱신 (best effort)
    prisma.$executeRaw`
      UPDATE long_term_quotes
         SET share_views = COALESCE(share_views, 0) + 1,
             share_last_viewed_at = NOW()
       WHERE share_token = ${token}`
      .catch((e: unknown) => console.warn('[public quote view++]', (e as Error)?.message))

    const data = {
      ...q,
      monthly_fee: q.monthly_fee != null ? Number(q.monthly_fee) : null,
      deposit: q.deposit != null ? Number(q.deposit) : null,
      delivery_fee: q.delivery_fee != null ? Number(q.delivery_fee) : null,
      upfront_months: q.upfront_months != null ? Number(q.upfront_months) : null,
      annual_km: q.annual_km != null ? Number(q.annual_km) : null,
      months: q.months != null ? Number(q.months) : null,
    }
    return NextResponse.json({ data: serialize(data), error: null })
  } catch (e: unknown) {
    console.error('[public long-term-quotes GET]', e)
    return NextResponse.json({ error: (e as Error)?.message || 'error' }, { status: 500 })
  }
}
