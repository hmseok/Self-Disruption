import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * 공개 서명 제출 API (인증 불필요)
 * POST /api/public/quote/[token]/sign
 *
 * 고객이 서명하면:
 * 1. 서명 데이터 저장
 * 2. 계약 자동 생성 + 납부 스케줄
 * 3. 차량 상태 변경
 * 4. 토큰 상태 업데이트
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await req.json()
    const { customer_name, customer_phone, customer_email, signature_data, agreed_terms } = body

    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 })
    }
    if (!customer_name || !signature_data) {
      return NextResponse.json({ error: '서명자 이름과 서명이 필요합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. 토큰 검증
    const { data: shareToken, error: tokenErr } = await supabase
      .from('quote_share_tokens')
      .select('*')
      .eq('token', token)
      .single()

    if (tokenErr || !shareToken) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 })
    }
    if (shareToken.status === 'signed') {
      return NextResponse.json({ error: '이미 서명이 완료되었습니다.' }, { status: 409 })
    }
    if (shareToken.status === 'revoked') {
      return NextResponse.json({ error: '취소된 링크입니다.' }, { status: 410 })
    }
    if (new Date(shareToken.expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 링크입니다.' }, { status: 410 })
    }

    // 2. 견적 조회
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', shareToken.quote_id)
      .single()

    if (quoteErr || !quote) {
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 3. 이미 계약이 있는지 확인
    const { data: existingContract } = await supabase
      .from('contracts')
      .select('id')
      .eq('quote_id', quote.id)
      .limit(1)
      .single()

    if (existingContract) {
      return NextResponse.json({ error: '이미 계약이 생성된 견적입니다.' }, { status: 409 })
    }

    // 4. 서명 저장
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const ua = req.headers.get('user-agent') || 'unknown'

    const { data: signature, error: sigErr } = await supabase
      .from('customer_signatures')
      .insert([{
        quote_id: quote.id,
        token_id: shareToken.id,
        customer_name,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        signature_data,
        agreed_terms: agreed_terms !== false,
        ip_address: ip,
        user_agent: ua
      }])
      .select()
      .single()

    if (sigErr) throw sigErr

    // 5. 계약 자동 생성 (handleCreateContract 로직 재사용)
    const detail = quote.quote_detail || {}
    const termMonths = detail.term_months || 36

    const { data: contract, error: cErr } = await supabase
      .from('contracts')
      .insert([{
        quote_id: quote.id,
        car_id: quote.car_id,
        customer_id: quote.customer_id || null,
        customer_name: quote.customer_name || customer_name,
        start_date: quote.start_date,
        end_date: quote.end_date,
        term_months: termMonths,
        deposit: quote.deposit,
        monthly_rent: quote.rent_fee,
        status: 'active',
        signature_id: signature.id
      }])
      .select()
      .single()

    if (cErr) throw cErr

    // 6. 납부 스케줄 생성
    const schedules: any[] = []
    const rent = quote.rent_fee
    const vat = Math.round(rent * 0.1)
    const startDate = new Date(quote.start_date)

    // 보증금 (회차 0)
    if (quote.deposit > 0) {
      schedules.push({
        contract_id: contract.id,
        round_number: 0,
        due_date: quote.start_date,
        amount: quote.deposit,
        vat: 0,
        status: 'unpaid'
      })
    }

    // 월 납부 (1 ~ termMonths)
    for (let i = 1; i <= termMonths; i++) {
      const d = new Date(startDate)
      d.setMonth(d.getMonth() + i)
      schedules.push({
        contract_id: contract.id,
        round_number: i,
        due_date: d.toISOString().split('T')[0],
        amount: rent + vat,
        vat,
        status: 'unpaid'
      })
    }

    if (schedules.length > 0) {
      await supabase.from('payment_schedules').insert(schedules)
    }

    // 7. 차량 상태 변경
    if (quote.car_id) {
      await supabase.from('cars').update({ status: 'rented' }).eq('id', quote.car_id)
    }

    // 8. 토큰 상태 업데이트
    await supabase
      .from('quote_share_tokens')
      .update({ status: 'signed' })
      .eq('id', shareToken.id)

    // 9. 견적 상태 업데이트
    await supabase
      .from('quotes')
      .update({
        signed_at: new Date().toISOString(),
      })
      .eq('id', quote.id)

    return NextResponse.json({
      success: true,
      contractId: contract.id,
      message: '계약이 성공적으로 체결되었습니다.'
    })

  } catch (e: any) {
    console.error('[public/quote/sign] 에러:', e.message)
    return NextResponse.json({ error: '서명 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
