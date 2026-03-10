import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 정산 상세 조회 API (공개)
// GET /api/settlement/share/[token]
// 인증 불필요 - 토큰으로만 접근
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. 토큰으로 정산 공유 조회
    const { data: share, error: shareErr } = await supabase
      .from('settlement_shares')
      .select('*')
      .eq('token', token)
      .single()

    if (shareErr || !share) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 })
    }

    // 2. 만료 여부 확인
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 링크입니다.', code: 'EXPIRED' }, { status: 410 })
    }

    // 3. 첫 조회 시 viewed_at 설정
    const isFirstView = !share.viewed_at
    const newViewCount = (share.view_count || 0) + 1

    // 4. 조회 정보 업데이트
    await supabase
      .from('settlement_shares')
      .update({
        view_count: newViewCount,
        viewed_at: isFirstView ? new Date().toISOString() : share.viewed_at,
      })
      .eq('id', share.id)

    // 5. 회사 정보 조회
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, business_number, address, phone, email, logo_url')
      .eq('id', share.company_id)
      .single()

    // 6. 반환 데이터 가공
    const publicData = {
      id: share.id,
      token: share.token,
      recipient_name: share.recipient_name,
      settlement_month: share.settlement_month,
      payment_date: share.payment_date,
      total_amount: share.total_amount,
      items: share.items,
      breakdown: share.breakdown,
      message: share.message,
      created_at: share.created_at,
      expires_at: share.expires_at,
      viewed_at: share.viewed_at,
      view_count: newViewCount,
      is_first_view: isFirstView,
      company: company || null,
    }

    return NextResponse.json(publicData)
  } catch (e: any) {
    console.error('[settlement/share] 에러:', e.message)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
