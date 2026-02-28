import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/utils/auth-guard'
import { createClient } from '@supabase/supabase-js'

/**
 * 견적서 타임라인 조회 API
 * GET /api/quotes/[id]/timeline
 *
 * quote_lifecycle_events 테이블에서 해당 견적서의 이벤트 목록을 반환
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error

  try {
    const { id: quoteId } = await params
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: events, error } = await supabase
      .from('quote_lifecycle_events')
      .select('id, event_type, channel, recipient, metadata, actor_id, contract_id, created_at')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    return NextResponse.json({ events: events || [] })
  } catch (e: any) {
    console.error('[quotes/timeline] 에러:', e.message)
    return NextResponse.json({ error: '타임라인 조회 오류' }, { status: 500 })
  }
}
