import { prisma } from '@/lib/prisma'
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

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

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

    // 1. 토큰 검증
    const shareToken = await prisma.$queryRaw<any[]>`
      SELECT * FROM quote_share_tokens WHERE token = ${token} LIMIT 1
    `

    if (!shareToken || shareToken.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 404 })
    }
    if (shareToken[0].status === 'signed') {
      return NextResponse.json({ error: '이미 서명이 완료되었습니다.' }, { status: 409 })
    }
    if (shareToken[0].status === 'revoked') {
      return NextResponse.json({ error: '취소된 링크입니다.' }, { status: 410 })
    }
    if (new Date(shareToken[0].expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 링크입니다.' }, { status: 410 })
    }

    // 2. 견적 조회
    const quote = await prisma.$queryRaw<any[]>`
      SELECT * FROM quotes WHERE id = ${shareToken[0].quote_id} LIMIT 1
    `

    if (!quote || quote.length === 0) {
      return NextResponse.json({ error: '견적서를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 3. 이미 계약이 있는지 확인
    const existingContract = await prisma.$queryRaw<any[]>`
      SELECT id FROM contracts WHERE quote_id = ${quote[0].id} LIMIT 1
    `

    if (existingContract && existingContract.length > 0) {
      return NextResponse.json({ error: '이미 계약이 생성된 견적입니다.' }, { status: 409 })
    }

    // 4. 서명 저장
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const ua = req.headers.get('user-agent') || 'unknown'
    const signatureId = Date.now().toString()

    await prisma.$executeRaw`
      INSERT INTO customer_signatures
      (id, quote_id, token_id, customer_name, customer_phone, customer_email, signature_data, agreed_terms, ip_address, user_agent, created_at)
      VALUES (${signatureId}, ${quote[0].id}, ${shareToken[0].id}, ${customer_name}, ${customer_phone || null}, ${customer_email || null}, ${signature_data}, ${agreed_terms !== false ? 1 : 0}, ${ip}, ${ua}, NOW())
    `

    // 5. 계약 자동 생성
    const detail = quote[0].quote_detail || {}
    const termMonths = detail.term_months || 36

    // 5-1. 현재 활성 약관 버전 조회
    let termsVersionId: number | null = null
    try {
      const activeTerms = await prisma.$queryRaw<any[]>`
        SELECT id FROM contract_terms WHERE status = 'active' LIMIT 1
      `
      if (activeTerms && activeTerms.length > 0) {
        termsVersionId = activeTerms[0].id
      }
    } catch {
      // contract_terms 테이블이 없어도 진행
    }

    // 5-2. 계약 유형에 맞는 기본 특약사항
    const contractType = detail.contract_type || 'return'
    let specialTermsText: string | null = null
    try {
      const defaultSpecials = await prisma.$queryRaw<any[]>`
        SELECT content FROM contract_special_terms
        WHERE is_active = 1 AND is_default = 1
        AND (contract_type = ${contractType} OR contract_type = 'all')
        ORDER BY sort_order
      `
      if (defaultSpecials?.length) {
        specialTermsText = defaultSpecials.map((s: any) => s.content).join('\n\n')
      }
    } catch {
      // 테이블 없어도 진행
    }

    const contractId = Date.now().toString()
    await prisma.$executeRaw`
      INSERT INTO contracts
      (id, quote_id, car_id, customer_id, customer_name, start_date, end_date, term_months, deposit, monthly_rent, status, signature_id, terms_version_id, special_terms, created_at)
      VALUES (${contractId}, ${quote[0].id}, ${quote[0].car_id}, ${quote[0].customer_id || null}, ${quote[0].customer_name || customer_name}, ${quote[0].start_date}, ${quote[0].end_date}, ${termMonths}, ${quote[0].deposit}, ${quote[0].rent_fee}, 'active', ${signatureId}, ${termsVersionId || null}, ${specialTermsText || null}, NOW())
    `

    // 6. 납부 스케줄 생성
    const schedules: any[] = []
    const rent = quote[0].rent_fee
    const vat = Math.round(rent * 0.1)
    const startDate = new Date(quote[0].start_date)

    // 보증금 (회차 0)
    if (quote[0].deposit > 0) {
      schedules.push({
        contract_id: contractId,
        round_number: 0,
        due_date: quote[0].start_date,
        amount: quote[0].deposit,
        vat: 0,
        status: 'unpaid'
      })
    }

    // 월 납부 (1 ~ termMonths)
    for (let i = 1; i <= termMonths; i++) {
      const d = new Date(startDate)
      d.setMonth(d.getMonth() + i)
      schedules.push({
        contract_id: contractId,
        round_number: i,
        due_date: d.toISOString().split('T')[0],
        amount: rent + vat,
        vat,
        status: 'unpaid'
      })
    }

    if (schedules.length > 0) {
      for (const schedule of schedules) {
        await prisma.$executeRaw`
          INSERT INTO payment_schedules
          (contract_id, round_number, due_date, amount, vat, status, created_at)
          VALUES (${schedule.contract_id}, ${schedule.round_number}, ${schedule.due_date}, ${schedule.amount}, ${schedule.vat}, ${schedule.status}, NOW())
        `
      }
    }

    // 7. 차량 상태 변경
    if (quote[0].car_id) {
      await prisma.$executeRaw`
        UPDATE cars SET status = 'rented' WHERE id = ${quote[0].car_id}
      `
    }

    // 8. 토큰 상태 업데이트
    await prisma.$executeRaw`
      UPDATE quote_share_tokens SET status = 'signed' WHERE id = ${shareToken[0].id}
    `

    // 9. 견적 상태 업데이트
    await prisma.$executeRaw`
      UPDATE quotes SET signed_at = NOW(), terms_version_id = ${termsVersionId || null} WHERE id = ${quote[0].id}
    `

    // 10. 라이프사이클 이벤트 기록
    recordLifecycleEvent({
      companyId: shareToken[0].company_id,
      quoteId: quote[0].id,
      contractId: contractId,
      eventType: 'signed',
      metadata: {
        customer_name,
        ip,
        user_agent: ua,
        signature_id: signatureId,
      },
    })
    recordLifecycleEvent({
      companyId: shareToken[0].company_id,
      quoteId: quote[0].id,
      contractId: contractId,
      eventType: 'contract_created',
      metadata: {
        contract_id: contractId,
        term_months: termMonths,
        monthly_rent: quote[0].rent_fee,
      },
    })

    // 11. 이메일 발송 (비동기)
    try {
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey && customer_email) {
        const resend = new Resend(resendKey)

        const companyInfo = await prisma.$queryRaw<any[]>`
          SELECT name, email FROM companies WHERE id = ${shareToken[0].company_id} LIMIT 1
        `

        const companyName = companyInfo?.[0]?.name || '장기렌트'
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
                <tr><td style="padding:8px 0;color:#888;">월 렌탈료</td><td style="padding:8px 0;font-weight:bold;">${(quote[0].rent_fee || 0).toLocaleString('ko-KR')}원 (VAT 별도)</td></tr>
                <tr><td style="padding:8px 0;color:#888;">계약기간</td><td style="padding:8px 0;">${termMonths}개월</td></tr>
              </table>
              <p style="font-size:12px;color:#999;margin-top:30px;border-top:1px solid #eee;padding-top:12px;">
                본 메일은 자동 발송되었습니다. 문의사항은 담당자에게 연락해주세요.
              </p>
            </div>
          `,
        }).catch(err => console.error('[email] 고객 이메일 발송 실패:', err))

        // 담당자 알림 이메일
        if (companyInfo?.[0]?.email) {
          await resend.emails.send({
            from: `${companyName} 시스템 <${fromEmail}>`,
            to: [companyInfo[0].email],
            subject: `[신규 계약] ${customer_name} - ${carName}`,
            html: `
              <div style="font-family:'맑은 고딕',sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#111;">신규 계약이 체결되었습니다</h2>
                <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
                  <tr><td style="padding:8px 0;color:#888;">고객명</td><td style="padding:8px 0;font-weight:bold;">${customer_name}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">연락처</td><td style="padding:8px 0;">${customer_phone || '-'}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">이메일</td><td style="padding:8px 0;">${customer_email}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">차량</td><td style="padding:8px 0;font-weight:bold;">${carName}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">월 렌탈료</td><td style="padding:8px 0;">${(quote[0].rent_fee || 0).toLocaleString('ko-KR')}원</td></tr>
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
      contractId: contractId,
      token: token,
      message: '계약이 성공적으로 체결되었습니다.'
    })
  } catch (e: any) {
    console.error('[public/quote/sign] 에러:', e.message)
    return NextResponse.json({ error: '서명 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
