import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendSMS, sendEmail, sendKakaoAlimtalk, logMessageSend,
  sendWithTemplate, buildEmailHTML, buildInfoTableHTML,
} from '../../../../utils/messaging'

// ============================================
// 견적서 발송 API (SMS / 카카오 알림톡 / 이메일)
// POST → 견적서 링크를 고객에게 직접 발송
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles').select('role, company_id, employee_name').eq('id', user.id).single()
  return profile ? { ...user, role: profile.role, company_id: profile.company_id, employee_name: profile.employee_name } : null
}

// 숫자 포맷
const f = (n: number) => Math.round(n || 0).toLocaleString()

// ── 폴백용 이메일 HTML ──
function getQuoteEmailFallback(vars: Record<string, string>) {
  const rows = [
    { label: '차종', value: `${vars.brand} ${vars.model}${vars.trim ? ` ${vars.trim}` : ''}` },
    { label: '계약유형', value: `${vars.contractType} · ${vars.termMonths}개월` },
    { label: '약정주행', value: `연 ${vars.annualMileage}km` },
    { label: '월 렌탈료', value: `${vars.rentFee}원 (VAT포함 ${vars.rentWithVAT}원)` },
    ...(Number(vars.depositRaw) > 0 ? [{ label: '보증금', value: `${vars.deposit}원` }] : []),
  ]
  return buildEmailHTML({
    heading: '장기렌트 견적서',
    subtitle: `<strong style="color: #0369a1;">${vars.companyName}</strong>에서 장기렌트 견적서를 발송하였습니다.`,
    bodyContent: buildInfoTableHTML(rows),
    ctaText: '견적서 확인하기',
    ctaUrl: vars.shareUrl,
  })
}

// ── 폴백용 SMS 메시지 ──
function getQuoteSMSFallback(vars: Record<string, string>) {
  return `[${vars.companyName}] 장기렌트 견적서
${vars.customerName}님, 견적서를 발송합니다.

${vars.brand} ${vars.model}
${vars.contractType} · ${vars.termMonths}개월
월 ${vars.rentWithVAT}원(VAT포함)

아래 링크에서 견적을 확인해주세요.
${vars.shareUrl}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 인증 확인
  const user = await verifyUser(req)
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const { id: quoteId } = await params
    const body = await req.json()
    const { channel, phone, email, shareUrl } = body as {
      channel: 'sms' | 'kakao' | 'email'
      phone?: string
      email?: string
      shareUrl: string
    }

    if (!channel || !shareUrl) {
      return NextResponse.json({ error: '채널과 공유링크가 필요합니다.' }, { status: 400 })
    }
    if ((channel === 'sms' || channel === 'kakao') && !phone) {
      return NextResponse.json({ error: '전화번호가 필요합니다.' }, { status: 400 })
    }
    if (channel === 'email' && !email) {
      return NextResponse.json({ error: '이메일 주소가 필요합니다.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 1. 견적 정보 조회
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('*, car:car_id(*)')
      .eq('id', quoteId)
      .single()

    if (qErr || !quote) {
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const detail = quote.quote_detail || {}
    const carInfo = detail.car_info || {}
    const car = quote.car || {}

    // 회사 정보
    let companyName = '당사'
    if (quote.company_id) {
      const { data: comp } = await supabase.from('companies').select('name').eq('id', quote.company_id).single()
      if (comp) companyName = comp.name
    }

    // 변수 준비
    const vars: Record<string, string> = {
      companyName,
      customerName: quote.customer_name || detail.manual_customer?.name || '고객',
      brand: car.brand || carInfo.brand || '',
      model: car.model || carInfo.model || '',
      trim: car.trim || carInfo.trim || '',
      year: String(car.year || carInfo.year || ''),
      contractType: detail.contract_type === 'buyout' ? '인수형' : '반납형',
      termMonths: String(detail.term_months || 36),
      annualMileage: f((detail.annualMileage || detail.baselineKm || 2) * 10000),
      rentFee: f(quote.rent_fee || 0),
      rentWithVAT: f(Math.round((quote.rent_fee || 0) * 1.1)),
      deposit: f(quote.deposit || 0),
      depositRaw: String(quote.deposit || 0),
      shareUrl,
    }

    const recipient = channel === 'email' ? email! : phone!
    let result: any

    // 2. 템플릿 기반 발송 시도 → 실패 시 fallback
    const templateResult = await sendWithTemplate({
      companyId: quote.company_id || user.company_id,
      templateKey: 'quote_share',
      channel,
      recipient,
      recipientName: vars.customerName,
      variables: vars,
      relatedType: 'quote',
      relatedId: quoteId,
      sentBy: user.id,
    })

    if (templateResult.success) {
      // 템플릿 발송 성공
      result = templateResult
    } else {
      // 템플릿 없거나 실패 → fallback 직접 발송
      console.log('[quote/send] 템플릿 발송 실패, fallback 사용:', templateResult.error)

      if (channel === 'email') {
        const html = getQuoteEmailFallback(vars)
        result = await sendEmail({
          to: email!,
          subject: `[${companyName}] 장기렌트 견적서 - ${vars.brand} ${vars.model}`,
          html,
        })
      } else if (channel === 'kakao') {
        const smsMsg = getQuoteSMSFallback(vars)
        result = await sendKakaoAlimtalk({
          phone: phone!,
          templateCode: 'QUOTE_SHARE',
          templateVars: vars,
          smsMessage: smsMsg,
          smsTitle: `[${companyName}] 견적서`,
          buttons: [{
            name: '견적서 확인',
            linkType: 'WL',
            linkM: shareUrl,
            linkP: shareUrl,
          }],
        })
      } else {
        // SMS
        const smsMsg = getQuoteSMSFallback(vars)
        result = await sendSMS({ phone: phone!, message: smsMsg, title: `[${companyName}] 견적서` })
      }

      // fallback 로그 저장
      await logMessageSend({
        companyId: quote.company_id || user.company_id,
        templateKey: 'quote_share_fallback',
        channel,
        recipient,
        recipientName: vars.customerName,
        subject: `견적서 발송 - ${vars.brand} ${vars.model}`,
        body: channel === 'email' ? '(HTML)' : getQuoteSMSFallback(vars),
        status: result?.success ? 'sent' : 'failed',
        resultCode: result?.resultCode,
        errorDetail: result?.error,
        relatedType: 'quote',
        relatedId: quoteId,
        sentBy: user.id,
      })
    }

    // 3. quotes.shared_at 업데이트
    if (result?.success) {
      await supabase
        .from('quotes')
        .update({ shared_at: new Date().toISOString() })
        .eq('id', quoteId)
    }

    return NextResponse.json({
      success: result?.success || false,
      method: result?.method || channel,
      error: result?.error,
    })

  } catch (e: any) {
    console.error('[quotes/send] 에러:', e.message)
    return NextResponse.json({ error: '발송 중 오류가 발생했습니다.', detail: e.message }, { status: 500 })
  }
}
