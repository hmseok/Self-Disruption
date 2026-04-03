import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { prisma } from '@/lib/prisma'

/**
 * 견적서 타임라인 조회 API
 * GET /api/quotes/[id]/timeline
 *
 * quote_lifecycle_events 테이블에서 해당 견적서의 이벤트 목록을 반환
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { id: quoteId } = await params

    const events = await prisma.$queryRaw<any[]>`
      SELECT id, event_type, channel, recipient, metadata, actor_id, contract_id, created_at
      FROM quote_lifecycle_events
      WHERE quote_id = ${quoteId}
      ORDER BY created_at DESC
      LIMIT 100
    `

    return NextResponse.json({ events: events || [] })
  } catch (e: any) {
    console.error('[quotes/timeline] 에러:', e.message)
    return NextResponse.json({ error: '타임라인 조회 오류' }, { status: 500 })
  }
}
