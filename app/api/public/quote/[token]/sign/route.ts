import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { recordLifecycleEvent, maskRecipient } from '@/app/utils/lifecycle-events'

/**
 * 공개 서명 제출 API (인증 불필요)
 * POST /api/public/quote/[token]/sign
 *
 * 고객이 서명하면:
 * 1. 서명 데이터 저장
 * 2. 계약 자동 생성 + 납부 스케줄 + 약관 버전 연결
 * 3. 차량 상태 변경
 * 4. 토큰 상태 업데이트
 * 5. 이메일 발송 (고객 + 담당자)
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

    // 5-1. 현재 활성 약관 버전 조회 → 계약에 연결
    let termsVersionId: number | null = null
    try {
      const { data: activeTerms } = await supabase
        .from('contract_terms')
        .select('id')
        .eq('company_id', shareToken.company_id)
        .eq('status', 'active')
        .single()
      if (activeTerms) termsVersionId = activeTerms.id
    } catch { /* contract_terms 테이블이 없어도 진행 */ }

    // 5-2. 계약 유형에 맞는 기본 특약사항
    const contractType = detail.contract_type || 'return'
    let specialTermsText: string | null = null
    try {
      const { data: defaultSpecials } = await supabase
        .from('contract_special_terms')
        .select('content')
        .eq('company_id', shareToken.company_id)
        .eq('is_active', true)
        .eq('is_default', true)
        .in('contract_type', [contractType, 'all'])
        .order('sort_order')
      if (defaultSpecials?.length) {
        specialTermsText = defaultSpecials.map((s: any) => s.content).join('\n\n')
      }
    } catch { /* 테이블 없어도 진행 */ }

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
        signature_id: signature.id,
        ...(termsVersionId ? { terms_version_id: termsVersionId } : {}),
        ...(specialTermsText ? { special_terms: specialTermsText } : {}),
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
        ...(termsVersionId ? { terms_version_id: termsVersionId } : {}),
      })
      .eq('id', quote.id)

    // 10. 라이프사이클 이벤트 기록 (signed + contract_created)
    recordLifecycleEvent({
      companyId: shareToken.company_id,
      quoteId: quote.id,
      contractId: contract.id,
      eventType: 'signed',
      metadata: {
        customer_name,
        ip,
        user_agent: ua,
        signature_id: signature.id,
      },
    })
    recordLifecycleEvent({
      companyId: shareToken.company_id,
      quoteId: quote.id,
      contractId: contract.id,
      eventType: 'contract_created',
      metadata: {
        contract_id: contract.id,
        term_months: termMonths,
        monthly_rent: quote.rent_fee,
      },
    })

    // 11. 이메일 발송 (비동기 — 실패해도 계약 체결은 유지)
    try {
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey && customer_email) {
        const resend = new Resend(resendKey)

        // 회사 정보 조회
        const { data: companyInfo } = await supabase
          .from('companies')
          .select('name, email')
          .eq('id', shareToken.company_id)
          .single()

        const companyName = companyInfo?.name || '장기렌트'
        const carName = `${detail.car_info?.brand || ''} ${detail.car_info?.model || ''}`.trim()
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@resend.dev'
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin
        const pdfLink = `${baseUrl}/public/quote/${token}`

        // 고객 이메일
        await resend.emails.send({
          from: `${companyName} <${fromEmail}>`,
          to: [customer_email],
          subject: `[${companyName}] ${carName} 장기렌트 계약 체결 완료`,
          html: `
            <div style="font-family:'맑은 고딕',sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2 style="color:#111;">${customer_name}님, 계약이 완료되었습니다.</h2>
              <p style="color:#555;line-height:1.6;">
                ${carName} 장기렌트 계약이 정상적으로 체결되었습니다.<br/>
                아래 링크에서 계약서 PDF를 다운로드하실 수 있습니다.
              </p>
              <div style="text-align:center;margin:30px 0;">
                <a href="${pdfLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;font-weight:bold;text-decoration:none;">
                  계약서 확인 및 PDF 다운로드
                </a>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
                <tr><td style="padding:8px 0;color:#888;">차량</td><td style="padding:8px 0;font-weight:bold;">${carName}</td></tr>
                <tr><td style="padding:8px 0;color:#888;">월 렌탈료</td><td style="padding:8px 0;font-weight:bold;">${(quote.rent_fee || 0).toLocaleString('ko-KR')}원 (VAT 별도)</td></tr>
                <tr><td style="padding:8px 0;color:#888;">계약기간</td><td style="padding:8px 0;">${termMonths}개월</td></tr>
              </table>
              <p style="font-size:12px;color:#999;margin-top:30px;border-top:1px solid #eee;padding-top:12px;">
                본 메일은 자동 발송되었습니다. 문의사항은 담당자에게 연락해주세요.
              </p>
            </div>
          `,
        }).catch(err => console.error('[email] 고객 이메일 발송 실패:', err))

        // 담당자 알림 이메일
        if (companyInfo?.email) {
          await resend.emails.send({
            from: `${companyName} 시스템 <${fromEmail}>`,
            to: [companyInfo.email],
            subject: `[신규 계약] ${customer_name} - ${carName}`,
            html: `
              <div style="font-family:'맑은 고딕',sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#111;">신규 계약이 체결되었습니다</h2>
                <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
                  <tr><td style="padding:8px 0;color:#888;">고객명</td><td style="padding:8px 0;font-weight:bold;">${customer_name}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">연락처</td><td style="padding:8px 0;">${customer_phone || '-'}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">이메일</td><td style="padding:8px 0;">${customer_email}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">차량</td><td style="padding:8px 0;font-weight:bold;">${carName}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">월 렌탈료</td><td style="padding:8px 0;">${(quote.rent_fee || 0).toLocaleString('ko-KR')}원</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">계약기간</td><td style="padding:8px 0;">${termMonths}개월</td></tr>
                </table>
              </div>
            `,
          }).catch(err => console.error('[email] 담당자 알림 발송 실패:', err))
        }
      }
    } catch (emailErr: any) {
      console.error('[email] 이메일 발송 오류 (계약 체결은 정상):', emailErr.message)
    }

    return NextResponse.json({
      success: true,
      contractId: contract.id,
      token: token,  // PDF 다운로드에 필요
      message: '계약이 성공적으로 체결되었습니다.'
    })

  } catch (e: any) {
    console.error('[public/quote/sign] 에러:', e.message)
    return NextResponse.json({ error: '서명 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
