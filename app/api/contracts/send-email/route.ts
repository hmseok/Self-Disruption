import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, sendEmail, sendKakaoAlimtalk, logMessageSend } from '../../../utils/messaging'

// ============================================
// 계약 발송 API (이메일 + 카카오 알림톡)
// POST → 계약 링크 발송 + 발송 로그
// GET  → 발송 이력 조회
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles').select('role, company_id, employee_name').eq('id', user.id).single()
  if (!profile || !['god_admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id, employee_name: profile.employee_name }
}


// Email HTML template for contracts
function getContractEmailHTML(
  companyName: string,
  investorName: string,
  investAmount: string,
  contractLabel: string,
  contractPeriod: string,
  signUrl: string
) {
  return `
    <div style="font-family: 'Apple SD Gothic Neo', -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: #1B3A5C; color: white; font-size: 11px; font-weight: 900; padding: 4px 12px; border-radius: 6px; letter-spacing: 1px;">SELF-DISRUPTION</div>
      </div>
      <h2 style="color: #0f172a; margin: 0 0 8px; text-align: center;">${contractLabel} 서명 요청</h2>
      <p style="color: #64748b; font-size: 14px; margin: 0 0 24px; text-align: center;">
        <strong style="color: #0369a1;">${companyName}</strong>에서 계약서 서명을 요청했습니다.
      </p>
      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <table style="width: 100%; font-size: 14px; color: #334155;">
          <tr><td style="padding: 6px 0; color: #94a3b8;">계약 유형</td><td style="padding: 6px 0; font-weight: 700;">${contractLabel}</td></tr>
          <tr><td style="padding: 6px 0; color: #94a3b8;">투자자</td><td style="padding: 6px 0; font-weight: 700;">${investorName}</td></tr>
          <tr><td style="padding: 6px 0; color: #94a3b8;">투자금</td><td style="padding: 6px 0; font-weight: 700;">${investAmount}원</td></tr>
          <tr><td style="padding: 6px 0; color: #94a3b8;">계약 기간</td><td style="padding: 6px 0; font-weight: 700;">${contractPeriod}</td></tr>
        </table>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${signUrl}" style="display: inline-block; background: #1B3A5C; color: white; padding: 14px 48px; border-radius: 12px; font-weight: 900; font-size: 16px; text-decoration: none;">계약서 확인 및 서명</a>
      </div>
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
        위 버튼이 작동하지 않으면 아래 링크를 브라우저에 직접 붙여넣으세요.<br/>
        <a href="${signUrl}" style="color: #0284c7; word-break: break-all;">${signUrl}</a>
      </p>
    </div>
  `
}

// SMS message template for contracts
function getContractSMSMessage(vars: Record<string, string>) {
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
    contract_type,
    contract_id,
    recipient_email,
    recipient_phone,
    send_channel = 'email',  // 'email' | 'kakao' | 'both'
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

  const sb = getSupabaseAdmin()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hmseok.com'

  // 계약 정보 조회
  const tableName = contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'
  const { data: contract, error: fetchErr } = await sb
    .from(tableName)
    .select('*, companies:company_id(name)')
    .eq('id', contract_id)
    .single()

  if (fetchErr || !contract) {
    return NextResponse.json({ error: '계약을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 발송 로그 생성
  const { data: log, error: logErr } = await sb
    .from('contract_sending_logs')
    .insert({
      company_id: contract.company_id,
      contract_type,
      contract_id,
      recipient_email: recipient_email || null,
      recipient_phone: recipient_phone || null,
      send_channel,
      status: 'sent',
      created_by: admin.id,
    })
    .select('id, send_token')
    .single()

  if (logErr) {
    return NextResponse.json({ error: '발송 로그 생성 실패: ' + logErr.message }, { status: 500 })
  }

  // 공통 변수
  const signUrl = contract_type === 'jiip'
    ? `${siteUrl}/jiip/${contract_id}/sign`
    : `${siteUrl}/invest/general/${contract_id}/sign`

  const companyName = (contract as any).companies?.name || '회사'
  const investorName = contract.investor_name || '투자자'
  const investAmount = Number(contract.invest_amount || 0).toLocaleString()
  const contractLabel = contract_type === 'jiip' ? '위수탁(지입) 계약' : '일반 투자 계약'
  const contractPeriod = `${contract.contract_start_date || '-'} ~ ${contract.contract_end_date || '-'}`

  const templateVars = {
    investorName,
    companyName,
    contractLabel,
    investAmount,
    contractPeriod,
    signUrl,
  }

  let emailResult: { success: boolean; error?: string } = { success: false, error: '' }
  let kakaoResult: { success: boolean; error?: string; method?: string } = { success: false, error: '' }

  // 이메일 발송
  if (send_channel === 'email' || send_channel === 'both') {
    console.log(`[contracts send-email] 이메일 발송 시작: ${recipient_email}`)
    emailResult = await sendEmail({
      to: recipient_email,
      subject: `[${companyName}] ${contractLabel} 서명 요청`,
      html: getContractEmailHTML(
        companyName,
        investorName,
        investAmount,
        contractLabel,
        contractPeriod,
        signUrl
      ),
    })
    console.log(`[contracts send-email] 이메일 결과:`, emailResult)

    // 이메일 발송 로깅 (best-effort)
    if (emailResult.success) {
      logMessageSend({
        companyId: contract.company_id,
        templateKey: 'contract_sign_request',
        channel: 'email',
        recipient: recipient_email,
        recipientName: investorName,
        subject: `[${companyName}] ${contractLabel} 서명 요청`,
        body: templateVars.signUrl,
        status: 'sent',
        resultCode: emailResult.resultCode,
        relatedType: contract_type,
        relatedId: contract_id,
        sentBy: admin.id,
      }).catch((err) => {
        console.error(`[contracts send-email] 이메일 로그 기록 실패:`, err)
      })
    } else {
      logMessageSend({
        companyId: contract.company_id,
        templateKey: 'contract_sign_request',
        channel: 'email',
        recipient: recipient_email,
        recipientName: investorName,
        subject: `[${companyName}] ${contractLabel} 서명 요청`,
        body: templateVars.signUrl,
        status: 'failed',
        errorDetail: emailResult.error,
        relatedType: contract_type,
        relatedId: contract_id,
        sentBy: admin.id,
      }).catch((err) => {
        console.error(`[contracts send-email] 이메일 로그 기록 실패:`, err)
      })
    }
  }

  // 카카오 알림톡 발송
  if (send_channel === 'kakao' || send_channel === 'both') {
    console.log(`[contracts send-email] 카카오 발송 시작: ${recipient_phone}`)
    const smsMessage = getContractSMSMessage(templateVars)
    kakaoResult = await sendKakaoAlimtalk({
      phone: recipient_phone,
      templateCode: 'CONTRACT_SIGN',
      templateVars,
      smsMessage,
      smsTitle: '[회사명] 계약서 서명',
      buttons: [
        {
          name: '계약서 확인 및 서명',
          linkType: 'WL',
          linkTypeName: '웹링크',
          linkMo: signUrl,
          linkPc: signUrl,
        },
      ],
    })
    console.log(`[contracts send-email] 카카오 결과:`, kakaoResult)

    // 카카오 발송 로깅 (best-effort)
    const kakaoMethod = (kakaoResult as any).method || 'kakao'
    if (kakaoResult.success) {
      logMessageSend({
        companyId: contract.company_id,
        templateKey: 'contract_sign_request',
        channel: kakaoMethod === 'sms' ? 'sms' : 'kakao',
        recipient: recipient_phone,
        recipientName: investorName,
        subject: '계약서 서명 요청',
        body: smsMessage,
        status: 'sent',
        resultCode: kakaoResult.resultCode,
        relatedType: contract_type,
        relatedId: contract_id,
        sentBy: admin.id,
      }).catch((err) => {
        console.error(`[contracts send-email] 카카오 로그 기록 실패:`, err)
      })
    } else {
      logMessageSend({
        companyId: contract.company_id,
        templateKey: 'contract_sign_request',
        channel: 'kakao',
        recipient: recipient_phone,
        recipientName: investorName,
        subject: '계약서 서명 요청',
        body: smsMessage,
        status: 'failed',
        errorDetail: kakaoResult.error,
        relatedType: contract_type,
        relatedId: contract_id,
        sentBy: admin.id,
      }).catch((err) => {
        console.error(`[contracts send-email] 카카오 로그 기록 실패:`, err)
      })
    }
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

  // 실패 시 로그 업데이트
  if (!anySuccess) {
    await sb.from('contract_sending_logs')
      .update({ status: 'failed', notes: errors.join(' | ') })
      .eq('id', log.id)
  }

  // SMS fallback 발송 시 로그에 메모
  const kakaoMethod = (kakaoResult as any).method
  if (kakaoResult.success && kakaoMethod === 'sms') {
    await sb.from('contract_sending_logs')
      .update({ notes: '카카오 알림톡 실패 → SMS 대체 발송' })
      .eq('id', log.id)
  }

  return NextResponse.json({
    success: true,
    log_id: log.id,
    emailSent: emailResult.success,
    kakaoSent: kakaoResult.success,
    smsFallback: kakaoMethod === 'sms',
    errors: errors.length > 0 ? errors : undefined,
    signUrl,
  })
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

  const { data, error } = await getSupabaseAdmin()
    .from('contract_sending_logs')
    .select('*, creator:created_by(employee_name)')
    .eq('contract_type', contractType)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
