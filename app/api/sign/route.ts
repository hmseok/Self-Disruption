import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: 토큰으로 견적서 정보 조회 (공개 접근)
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: '토큰이 필요합니다' }, { status: 400 })

  // 토큰 유효성 확인
  const { data: tokenData, error: tokenErr } = await supabase
    .from('quote_share_tokens')
    .select('*')
    .eq('token', token)
    .eq('status', 'active')
    .single()

  if (tokenErr || !tokenData) {
    return NextResponse.json({ error: '유효하지 않거나 만료된 링크입니다.' }, { status: 404 })
  }

  // 만료 확인
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    await supabase.from('quote_share_tokens').update({ status: 'expired' }).eq('id', tokenData.id)
    return NextResponse.json({ error: '링크가 만료되었습니다.' }, { status: 410 })
  }

  // 견적서 정보 조회
  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .select('*, cars(*)')
    .eq('id', tokenData.quote_id)
    .single()

  if (quoteErr || !quote) {
    return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 회사 정보 조회
  const { data: company } = await supabase
    .from('companies')
    .select('name, phone, address, representative')
    .eq('id', tokenData.company_id)
    .single()

  // 접근 기록
  await supabase.from('quote_share_tokens').update({
    accessed_at: new Date().toISOString(),
    access_count: (tokenData.access_count || 0) + 1,
  }).eq('id', tokenData.id)

  // viewed 이벤트 기록
  await supabase.from('quote_lifecycle_events').insert({
    company_id: tokenData.company_id,
    quote_id: tokenData.quote_id,
    event_type: 'viewed',
    channel: 'link',
    metadata: { token: token.slice(0, 8) + '...' },
  })

  // 이미 서명 완료된 경우 확인
  const { data: existingSig } = await supabase
    .from('customer_signatures')
    .select('id, signed_at, customer_name')
    .eq('token_id', tokenData.id)
    .limit(1)
    .single()

  return NextResponse.json({
    quote,
    company,
    token_id: tokenData.id,
    already_signed: !!existingSig,
    signed_info: existingSig ? { name: existingSig.customer_name, signed_at: existingSig.signed_at } : null,
  })
}

// POST: 서명 저장
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const body = await request.json()
    const { token, customer_name, customer_phone, signature_data, agreed_terms } = body

    if (!token || !signature_data || !agreed_terms) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    // 토큰 확인
    const { data: tokenData, error: tokenErr } = await supabase
      .from('quote_share_tokens')
      .select('*')
      .eq('token', token)
      .eq('status', 'active')
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 링크입니다.' }, { status: 404 })
    }

    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: '링크가 만료되었습니다.' }, { status: 410 })
    }

    // 이미 서명 여부 확인
    const { data: existing } = await supabase
      .from('customer_signatures')
      .select('id')
      .eq('token_id', tokenData.id)
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({ error: '이미 서명이 완료되었습니다.' }, { status: 409 })
    }

    // 서명 저장
    const { data: sig, error: sigErr } = await supabase
      .from('customer_signatures')
      .insert({
        quote_id: tokenData.quote_id,
        token_id: tokenData.id,
        customer_name: customer_name || '',
        customer_phone: customer_phone || '',
        signature_data,
        agreed_terms: true,
        signed_at: new Date().toISOString(),
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        user_agent: request.headers.get('user-agent') || '',
      })
      .select()
      .single()

    if (sigErr) {
      console.error('서명 저장 실패:', sigErr)
      return NextResponse.json({ error: '서명 저장에 실패했습니다.' }, { status: 500 })
    }

    // 토큰 상태 → signed
    await supabase.from('quote_share_tokens').update({ status: 'signed' }).eq('id', tokenData.id)

    // 견적서 상태 업데이트
    await supabase.from('quotes').update({ signed_at: new Date().toISOString() }).eq('id', tokenData.quote_id)

    // signed 이벤트
    await supabase.from('quote_lifecycle_events').insert({
      company_id: tokenData.company_id,
      quote_id: tokenData.quote_id,
      event_type: 'signed',
      channel: 'link',
      recipient: customer_name || '',
      metadata: { signature_id: sig.id },
    })

    return NextResponse.json({ success: true, signature_id: sig.id })
  } catch (err: any) {
    console.error('서명 API 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
