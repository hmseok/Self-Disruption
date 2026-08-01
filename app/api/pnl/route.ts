import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { calculatePnl } from '@/lib/pnl-engine'

// ═══════════════════════════════════════════════════════════════════
// GET /api/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD — 손익 (단일 엔진)
//   REDESIGN 5단계: 차량별·전체 손익을 lib/pnl-engine 한 곳에서 계산.
//   기본 기간: 이번 달 1일 ~ 오늘.
// ═══════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const sp = request.nextUrl.searchParams
    const today = new Date().toISOString().slice(0, 10)
    const from = sp.get('from') || `${today.slice(0, 7)}-01`
    const to = sp.get('to') || today
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json({ error: 'from/to 는 YYYY-MM-DD 형식' }, { status: 400 })
    }

    const result = await calculatePnl(from, to)
    return NextResponse.json({ data: result, error: null })
  } catch (e: any) {
    console.error('[GET /api/pnl]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
