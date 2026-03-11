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
    // - 현재 정산서의 월은 제외
    // - settlement_month에 여러 월이 포함된 경우(콤마구분) 분리하여 각각 표시
    // - 월별 중복 제거 (최신 1건만)
    let pastSettlements: { settlement_month: string; total_amount: number; created_at: string; paid_at: string | null }[] = []
    if (share.recipient_phone) {
      // 현재 정산서의 월 목록 (예: "2026-01,2026-02" → ["2026-01", "2026-02"])
      const currentMonths = new Set(
        (share.settlement_month || '').split(',').map((m: string) => m.trim()).filter(Boolean)
      )

      const { data: pastData } = await supabase
        .from('settlement_shares')
        .select('settlement_month, total_amount, items, created_at, paid_at')
        .eq('recipient_phone', share.recipient_phone)
        .eq('recipient_name', share.recipient_name)
        .eq('company_id', share.company_id)
        .neq('id', share.id)
        .order('created_at', { ascending: false })
        .limit(50)

      // 월별 분리 + 중복 제거
      const seen = new Set<string>()
      const expanded: typeof pastSettlements = []

      ;(pastData || []).forEach(ps => {
        // settlement_month가 여러 월인 경우 분리
        const months = (ps.settlement_month || '').split(',').map((m: string) => m.trim()).filter(Boolean)
        const itemsArr = Array.isArray(ps.items) ? ps.items : []

        if (months.length <= 1) {
          // 단일 월
          const m = months[0] || ps.settlement_month
          if (currentMonths.has(m)) return  // 현재 정산서 월 제외
          if (seen.has(m)) return
          seen.add(m)
          expanded.push({
            settlement_month: m,
            total_amount: ps.total_amount,
            created_at: ps.created_at,
            paid_at: ps.paid_at,
          })
        } else {
          // 여러 월 → 각 월별로 분리 (items에서 해당 월 금액 추출)
          months.forEach((m: string) => {
            if (currentMonths.has(m)) return
            if (seen.has(m)) return
            seen.add(m)
            // items에서 해당 월의 금액만 합산
            const monthItems = itemsArr.filter((it: any) => it.monthLabel === m)
            const monthAmount = monthItems.length > 0
              ? monthItems.reduce((s: number, it: any) => s + (it.amount || 0), 0)
              : Math.round(ps.total_amount / months.length)  // fallback: 균등 분배
            expanded.push({
              settlement_month: m,
              total_amount: monthAmount,
              created_at: ps.created_at,
              paid_at: ps.paid_at,
            })
          })
        }
      })

      // 최신순 정렬 후 최대 12건
      pastSettlements = expanded
        .sort((a, b) => b.settlement_month.localeCompare(a.settlement_month))
        .slice(0, 12)
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
