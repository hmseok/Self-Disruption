import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  sendSMS, sendEmail, sendKakaoAlimtalk, logMessageSend,
  sendWithTemplate, buildEmailHTML, buildInfoTableHTML,
} from '../../../../utils/messaging'
import { recordLifecycleEvent, maskRecipient } from '@/app/utils/lifecycle-events'

// ============================================
// 견적서 발송 API (SMS / 카카오 알림톡 / 이메일)
// POST → 견적서 링크를 고객에게 직접 발송
// ============================================

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  // TODO: Phase 5 Firebase Auth - JWT decode to get userId
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString())
    const userId = decoded.sub || decoded.user_id
    if (!userId) return null

    const profile = await prisma.$queryRaw<any[]>`
      SELECT role, employee_name FROM profiles WHERE id = ${userId} LIMIT 1
    `
    return profile && profile.length > 0 ? { id: userId, role: profile[0].role, employee_name: profile[0].employee_name } : null
  } catch {
    return null
  }
}

// 숫자 포맷
const f = (n: number) => Math.round(n || 0).toLocaleString()

// ── 폴백용 이메일 HTML ──
function getQuoteEmailFallback(vars: Record<string, string>) {
  const rows = [
    { label: '차종', value: `${vars.brand} ${vars.model}${vars.trim ? ` ${vars.trim}` : ''}` },
    { label: '계약유형', value: `${vars.contractType} · ${vars.termMonths}개월` },
    { label: '약정주행', value: `연 ${vars.annualMileage}km` },
    { label: '월 렌탈료', value: `${vars.rentWithVAT}원 (VAT포함) · 공급가 ${vars.rentFee}원` },
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

    // 1. 견적 정보 조회
    const quote = await prisma.$queryRaw<any[]>`
      SELECT * FROM quotes WHERE id = ${quoteId} LIMIT 1
    `

    if (!quote || quote.length === 0) {
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    const detail = quote[0].quote_detail || {}
    const carInfo = detail.car_info || {}

    // 차량 정보
    let car = {}
    if (quote[0].car_id) {
      const carData = await prisma.$queryRaw<any[]>`
        SELECT * FROM cars WHERE id = ${quote[0].car_id} LIMIT 1
      `
      car = carData?.[0] || {}
    }

    // 회사 정보
    let companyName = '당사'
    if (quote[0].company_id) {
      const comp = await prisma.$queryRaw<any[]>`
        SELECT name FROM companies WHERE id = ${quote[0].company_id} LIMIT 1
      `
      if (comp && comp.length > 0) companyName = comp[0].name
    }

    // 변수 준비
    const vars: Record<string, string> = {
      companyName,
      customerName: quote[0].customer_name || detail.manual_customer?.name || '고객',
      brand: (car as any).brand || carInfo.brand || '',
      model: (car as any).model || carInfo.model || '',
      trim: (car as any).trim || carInfo.trim || '',
      year: String((car as any).year || carInfo.year || ''),
      contractType: detail.contract_type === 'buyout' ? '인수형' : '반납형',
      termMonths: String(detail.term_months || 36),
      annualMileage: f((detail.annualMileage || detail.baselineKm || 2) * 10000),
      rentFee: f(Math.round((quote[0].rent_fee || 0) / 1000) * 1000),
      rentWithVAT: f(Math.round((quote[0].rent_fee || 0) * 1.1 / 1000) * 1000),
      deposit: f(quote[0].deposit || 0),
      depositRaw: String(quote[0].deposit || 0),
      shareUrl,
    }

    const recipient = channel === 'email' ? email! : phone!
    let result: any

    // 2. 템플릿 기반 발송 시도 → 실패 시 fallback
    const templateResult = await sendWithTemplate({
      companyId: quote[0].company_id!,
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
      result = templateResult
    } else {
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
        companyId: quote[0].company_id!,
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
      await prisma.$executeRaw`
        UPDATE quotes SET shared_at = NOW() WHERE id = ${quoteId}
      `

      // 라이프사이클 이벤트 기록
      recordLifecycleEvent({
        companyId: quote[0].company_id!,
        quoteId,
        eventType: 'sent',
        channel,
        recipient: maskRecipient(recipient),
        actorId: user.id,
        metadata: { method: result?.method || channel },
      })
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
