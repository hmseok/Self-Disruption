import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 정산 상세 조회 API (공개)
// GET /api/settlement/share/[token]?phone=1234
// 전화번호 뒷4자리 인증 → 인증 통과 시 상세 데이터 반환
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

    // 3. 전화번호 인증 확인
    const phoneParam = req.nextUrl.searchParams.get('phone')
    const hasPhone = !!share.recipient_phone
    let phoneVerified = false

    if (hasPhone) {
      if (!phoneParam) {
        // 전화번호 인증 필요 → 기본 정보만 반환
        return NextResponse.json({
          requires_phone: true,
          recipient_name: share.recipient_name,
          settlement_month: share.settlement_month,
          company_name: null, // 아래에서 채움
        })
      }
      // 뒷4자리 비교
      const storedLast4 = share.recipient_phone.slice(-4)
      const inputLast4 = phoneParam.replace(/[^0-9]/g, '').slice(-4)
      if (storedLast4 !== inputLast4) {
        return NextResponse.json({ error: '전화번호가 일치하지 않습니다.', code: 'PHONE_MISMATCH' }, { status: 401 })
      }
      phoneVerified = true
    }

    // 4. 첫 조회 시 viewed_at 설정
    const isFirstView = !share.viewed_at
    const newViewCount = (share.view_count || 0) + 1

    // 5. 조회 정보 업데이트
    await supabase
      .from('settlement_shares')
      .update({
        view_count: newViewCount,
        viewed_at: isFirstView ? new Date().toISOString() : share.viewed_at,
      })
      .eq('id', share.id)

    // 6. 회사 정보 조회
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, business_number, address, phone, email, logo_url')
      .eq('id', share.company_id)
      .single()

    // 7. 과거 정산 이력 조회 (같은 전화번호 + 회사)
    let pastSettlements: { settlement_month: string; total_amount: number; created_at: string; paid_at: string | null }[] = []
    if (share.recipient_phone) {
      const { data: pastData } = await supabase
        .from('settlement_shares')
        .select('settlement_month, total_amount, created_at, paid_at')
        .eq('recipient_phone', share.recipient_phone)
        .eq('company_id', share.company_id)
        .neq('id', share.id)
        .order('created_at', { ascending: false })
        .limit(12)
      pastSettlements = pastData || []
    }

    // 8. 계좌 정보 마스킹 처리
    let maskedBankInfo = null
    if (share.bank_info) {
      const bi = share.bank_info as { bank_name?: string; account_holder?: string; account_number?: string }
      const maskAccount = (acc: string) => {
        if (!acc || acc.length < 4) return acc
        return '****' + acc.slice(-4)
      }
      const maskName = (name: string) => {
        if (!name) return name
        if (name.length <= 1) return name
        return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
      }
      maskedBankInfo = {
        bank_name: bi.bank_name || '',
        account_holder: maskName(bi.account_holder || ''),
        account_number: maskAccount(bi.account_number || ''),
      }
    }

    // 9. 반환 데이터 가공
    const publicData = {
      id: share.id,
      token: share.token,
      recipient_name: share.recipient_name,
      settlement_month: share.settlement_month,
      payment_date: share.payment_date,
      paid_at: share.paid_at || null,
      total_amount: share.total_amount,
      items: share.items,
      breakdown: share.breakdown,
      transaction_details: share.transaction_details || null,
      bank_info: maskedBankInfo,
      message: share.message,
      created_at: share.created_at,
      expires_at: share.expires_at,
      viewed_at: share.viewed_at,
      view_count: newViewCount,
      is_first_view: isFirstView,
      phone_verified: phoneVerified,
      company: company || null,
      past_settlements: pastSettlements,
    }

    return NextResponse.json(publicData)
  } catch (e: any) {
    console.error('[settlement/share] 에러:', e.message)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
