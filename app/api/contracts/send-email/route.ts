import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  sendSMS, sendEmail, sendKakaoAlimtalk, logMessageSend,
  sendWithTemplate, buildEmailHTML, buildInfoTableHTML,
} from '../../../utils/messaging'

// ============================================
// 계약 발송 API (이메일 + 카카오 알림톡)
// POST → 계약 링크 발송 + 발송 로그
// GET  → 발송 이력 조회
// ============================================

async function verifyAdmin(request: NextRequest) {
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
    if (!profile || profile.length === 0 || !['admin', 'master'].includes(profile[0].role)) {
      return null
    }
    return { id: userId, role: profile[0].role, employee_name: profile[0].employee_name }
  } catch {
    return null
  }
}

// ── 폴백용 이메일 HTML ──
function getContractEmailFallback(vars: {
  companyName: string; investorName: string; investAmount: string;
  contractLabel: string; contractPeriod: string; signUrl: string;
}) {
  const rows = [
    { label: '계약 유형', value: vars.contractLabel },
    { label: '투자자', value: vars.investorName },
    { label: '투자금', value: `${vars.investAmount}원` },
    { label: '계약 기간', value: vars.contractPeriod },
  ]
  return buildEmailHTML({
    heading: `${vars.contractLabel} 서명 요청`,
    subtitle: `<strong style="color: #0369a1;">${vars.companyName}</strong>에서 계약서 서명을 요청했습니다.`,
    bodyContent: buildInfoTableHTML(rows),
    ctaText: '계약서 확인 및 서명',
    ctaUrl: vars.signUrl,
  })
}

// ── 폴백용 SMS 메시지 ──
function getContractSMSFallback(vars: Record<string, string>) {
  return `[${vars.companyName}] 계약서 서명 요청
${vars.investorName}님, ${vars.contractLabel} 서명을 요청합니다.
투자금: ${vars.investAmount}원
아래 링크에서 확인해주세요.
${vars.signUrl}`
}

// POST: 계약서 발송 (이메일 / 카카오 / 둘 다)
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const {
    contract_type, contract_id,
    recipient_email, recipient_phone,
    send_channel = 'email',
  } = body

  if (!contract_type || !contract_id) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }
  if (!['jiip', 'invest'].includes(contract_type)) {
    return NextResponse.json({ error: '유효하지 않은 계약 유형' }, { status: 400 })
  }
  if ((send_channel === 'email' || send_channel === 'both') && !recipient_email) {
    return NextResponse.json({ error: '이메일 주소를 입력해주세요.' }, { status: 400 })
  }
  if ((send_channel === 'kakao' || send_channel === 'both') && !recipient_phone) {
    return NextResponse.json({ error: '휴대폰 번호를 입력해주세요.' }, { status: 400 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hmseok.com'

  try {
    const tableName = contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'

    // 계약 정보 조회
    const contract = await prisma.$queryRaw<any[]>`
      SELECT * FROM ${Prisma.raw(tableName)} WHERE id = ${contract_id} LIMIT 1
    `

    if (!contract || contract.length === 0) {
      console.error('[contracts send-email] 계약 조회 실패:', { tableName, contract_id })
      return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 회사명 별도 조회
    let companyNameFromDb = '회사'
    if (contract[0].company_id) {
      const companyData = await prisma.$queryRaw<any[]>`
        SELECT name FROM companies WHERE id = ${contract[0].company_id} LIMIT 1
      `
      if (companyData && companyData.length > 0 && companyData[0].name) {
        companyNameFromDb = companyData[0].name
      }
    }

    // 발송 로그 생성
    const logId = Date.now().toString()
    await prisma.$executeRaw`
      INSERT INTO contract_sending_logs
      (id, contract_type, contract_id, recipient_email, recipient_phone, send_channel, status, created_by, created_at)
      VALUES (${logId}, ${contract_type}, ${contract_id}, ${recipient_email || null}, ${recipient_phone || null}, ${send_channel}, 'sent', ${admin.id}, NOW())
    `

    // 공통 변수
    const signUrl = contract_type === 'jiip'
      ? `${siteUrl}/jiip/${contract_id}/sign`
      : `${siteUrl}/invest/general/${contract_id}/sign`

    const companyName = companyNameFromDb
    const investorName = contract[0].investor_name || '투자자'
    const investAmount = Number(contract[0].invest_amount || 0).toLocaleString()
    const contractLabel = contract_type === 'jiip' ? '위수탁(지입) 계약' : '일반 투자 계약'
    const contractPeriod = `${contract[0].contract_start_date || '-'} ~ ${contract[0].contract_end_date || '-'}`

    const templateVars: Record<string, string> = {
      company_name: companyName,
      customer_name: investorName,
      contract_label: contractLabel,
      invest_amount: investAmount,
      contract_period: contractPeriod,
      sign_url: signUrl,
      companyName, investorName, contractLabel, investAmount, contractPeriod, signUrl,
    }

    let emailResult: { success: boolean; error?: string; resultCode?: string } = { success: false, error: '' }
    let kakaoResult: { success: boolean; error?: string; method?: string; resultCode?: string } = { success: false, error: '' }

    // ── 이메일 발송 ──
    if (send_channel === 'email' || send_channel === 'both') {
      console.log(`[contracts send-email] 이메일 발송 시작: ${recipient_email}`)

      const templateResult = await sendWithTemplate({
        companyId: contract[0].company_id,
        templateKey: 'contract_sign_request',
        channel: 'email',
        recipient: recipient_email,
        recipientName: investorName,
        variables: templateVars,
        relatedType: contract_type,
        relatedId: contract_id,
        sentBy: admin.id,
      })

      if (templateResult.success) {
        emailResult = { success: true, resultCode: templateResult.resultCode }
      } else {
        console.log('[contracts send-email] DB 템플릿 실패, 폴백:', templateResult.error)
        emailResult = await sendEmail({
          to: recipient_email,
          subject: `[${companyName}] ${contractLabel} 서명 요청`,
          html: getContractEmailFallback({ companyName, investorName, investAmount, contractLabel, contractPeriod, signUrl }),
        })
        logMessageSend({
          companyId: contract[0].company_id, templateKey: 'contract_sign_request', channel: 'email',
          recipient: recipient_email, recipientName: investorName,
          subject: `[${companyName}] ${contractLabel} 서명 요청`, body: '(fallback)',
          status: emailResult.success ? 'sent' : 'failed',
          resultCode: emailResult.resultCode, errorDetail: emailResult.error,
          relatedType: contract_type, relatedId: contract_id, sentBy: admin.id,
        }).catch(() => {})
      }

      console.log(`[contracts send-email] 이메일 결과:`, emailResult)
    }

    // ── 카카오 알림톡 발송 ──
    if (send_channel === 'kakao' || send_channel === 'both') {
      console.log(`[contracts send-email] 카카오 발송 시작: ${recipient_phone}`)

      const smsMessage = getContractSMSFallback(templateVars)

      kakaoResult = await sendKakaoAlimtalk({
        phone: recipient_phone,
        templateCode: 'CONTRACT_SIGN',
        templateVars,
        smsMessage,
        smsTitle: `[${companyName}] 계약서 서명`,
        buttons: [{
          name: '계약서 확인 및 서명', linkType: 'WL', linkTypeName: '웹링크',
          linkMo: signUrl, linkPc: signUrl,
        }],
      })

      const kakaoMethod = (kakaoResult as any).method || 'kakao'
      logMessageSend({
        companyId: contract[0].company_id, templateKey: 'contract_sign_request',
        channel: kakaoMethod === 'sms' ? 'sms' : 'kakao',
        recipient: recipient_phone, recipientName: investorName,
        subject: '계약서 서명 요청', body: smsMessage,
        status: kakaoResult.success ? 'sent' : 'failed',
        resultCode: kakaoResult.resultCode, errorDetail: kakaoResult.error,
        relatedType: contract_type, relatedId: contract_id, sentBy: admin.id,
      }).catch(() => {})

      console.log(`[contracts send-email] 카카오 결과:`, kakaoResult)
    }

    // 결과 판단
    const anySuccess = emailResult.success || kakaoResult.success
    const errors: string[] = []
    if ((send_channel === 'email' || send_channel === 'both') && !emailResult.success && emailResult.error) {
      errors.push(`이메일: ${emailResult.error}`)
    }
    if ((send_channel === 'kakao' || send_channel === 'both') && !kakaoResult.success && kakaoResult.error) {
      errors.push(`카카오: ${kakaoResult.error}`)
    }

    if (!anySuccess) {
      await prisma.$executeRaw`
        UPDATE contract_sending_logs
        SET status = 'failed', notes = ${errors.join(' | ')}
        WHERE id = ${logId}
      `
    }

    const kakaoMethod = (kakaoResult as any).method
    if (kakaoResult.success && kakaoMethod === 'sms') {
      await prisma.$executeRaw`
        UPDATE contract_sending_logs
        SET notes = '카카오 알림톡 실패 → SMS 대체 발송'
        WHERE id = ${logId}
      `
    }

    return NextResponse.json({
      success: true, log_id: logId,
      emailSent: emailResult.success,
      kakaoSent: kakaoResult.success,
      smsFallback: kakaoMethod === 'sms',
      errors: errors.length > 0 ? errors : undefined,
      signUrl,
    })
  } catch (e: any) {
    console.error('[contracts/send-email] 에러:', e.message)
    return NextResponse.json({ error: '발송 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

// GET: 발송 이력 조회
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const contractType = searchParams.get('contract_type')
  const contractId = searchParams.get('contract_id')

  if (!contractType || !contractId) {
    return NextResponse.json({ error: 'contract_type, contract_id 필수' }, { status: 400 })
  }

  try {
    const data = await prisma.$queryRaw<any[]>`
      SELECT csl.*, p.employee_name as creator_employee_name
      FROM contract_sending_logs csl
      LEFT JOIN profiles p ON csl.created_by = p.id
      WHERE csl.contract_type = ${contractType} AND csl.contract_id = ${contractId}
      ORDER BY csl.created_at DESC
      LIMIT 20
    `

    return NextResponse.json({ data })
  } catch (e: any) {
    console.error('[contracts/send-email GET] 에러:', e.message)
    return NextResponse.json({ error: '조회 오류' }, { status: 500 })
  }
}
