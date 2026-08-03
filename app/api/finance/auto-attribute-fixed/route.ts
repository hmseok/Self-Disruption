import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { attributeFixedCosts } from '@/lib/fixed-cost-attribution'

// POST /api/finance/auto-attribute-fixed — 고정비(보험료/대출/차량번호 적요) 자동 귀속
// body: { dryRun?: boolean = true, monthsBack?: number = 12 }
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const result = await attributeFixedCosts(body.dryRun !== false, Number(body.monthsBack) || 12)
    return NextResponse.json({ data: result, dryRun: body.dryRun !== false, error: null })
  } catch (e: any) {
    console.error('[POST /api/finance/auto-attribute-fixed]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
