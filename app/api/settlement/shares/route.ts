import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ============================================
// 정산 공유 목록 조회 API (관리자 전용)
// GET /api/settlement/shares?months=2026-04,2026-03
// GET /api/settlement/shares?paid_only=true
// ============================================

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const monthsParam = searchParams.get('months')
    const paidOnly = searchParams.get('paid_only') === 'true'

    let data: any[]

    if (paidOnly) {
      // 지급완료된 정산 공유 전체 (payment_date 가 설정되어 있으면 지급완료 간주)
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM settlement_shares
        WHERE payment_date IS NOT NULL
        ORDER BY payment_date DESC, created_at DESC
        LIMIT 1000
      `
    } else if (monthsParam) {
      // 특정 월(들)의 정산 공유
      const months = monthsParam.split(',').map(s => s.trim()).filter(Boolean)
      if (months.length === 0) {
        data = []
      } else if (months.length === 1) {
        data = await prisma.$queryRaw<any[]>`
          SELECT * FROM settlement_shares
          WHERE settlement_month = ${months[0]}
          ORDER BY created_at DESC
          LIMIT 1000
        `
      } else if (months.length === 2) {
        data = await prisma.$queryRaw<any[]>`
          SELECT * FROM settlement_shares
          WHERE settlement_month IN (${months[0]}, ${months[1]})
          ORDER BY created_at DESC
          LIMIT 1000
        `
      } else {
        // 3개 이상 — IN 확장
        const placeholders = months.map(() => '?').join(',')
        data = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM settlement_shares WHERE settlement_month IN (${placeholders}) ORDER BY created_at DESC LIMIT 1000`,
          ...months
        )
      }
    } else {
      // 기본 — 최근 500건
      data = await prisma.$queryRaw<any[]>`
        SELECT * FROM settlement_shares
        ORDER BY created_at DESC
        LIMIT 500
      `
    }

    // paid_at 파생 (payment_date 가 오늘 이전이면 지급완료로 간주 — settlement_shares 에 paid_at 컬럼이 없음)
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0)
    const enriched = (data || []).map((s: any) => {
      const pd = s.payment_date ? new Date(s.payment_date) : null
      const paidAt = pd && pd <= todayDate ? pd.toISOString() : null
      return { ...s, paid_at: paidAt }
    })

    return NextResponse.json({ data: serialize(enriched), error: null })
  } catch (e: any) {
    console.error('[GET /api/settlement/shares]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
