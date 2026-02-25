import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendSMS, sendEmail, sendKakaoAlimtalk, logMessageSend,
  sendWithTemplate, buildEmailHTML, buildInfoTableHTML,
} from '../../../utils/messaging'

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

  const sb = getSupabaseAdmin()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hmseok.com'

  // 계약 정보 조회
  const tableName = contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'
  const { data: contract, error: fetchErr } = await sb
    .from(tableName)
    .select('*')
    .eq('id', contract_id)
    .single()

  if (fetchErr || !contract) {
    console.error('[contracts send-email] 계약 조회 실패:', { tableName, contract_id, fetchErr })
    return NextResponse.json({ error: `계약을 찾을 수 없습니다. (${fetchErr?.message || 'no data'})` }, { status: 404 })
  }

  // 회사명 별도 조회
  let companyNameFromDb = '회사'
  if (contract.company_id) {
    const { data: companyData } = await sb.from('companies').select('name').eq('id', contract.company_id).single()
    if (companyData?.name) companyNameFromDb = companyData.name
  }

  // 발송 로그 생성
  const { data: log, error: logErr } = await sb
    .from('contract_sending_logs')
    .insert({
      company_id: contract.company_id, contract_type, contract_id,
      recipient_email: recipient_email || null,
      recipient_phone: recipient_phone || null,
      send_channel, status: 'sent', created_by: admin.id,
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

  const companyName = companyNameFromDb
  const investorName = contract.investor_name || '투자자'
  const investAmount = Number(contract.invest_amount || 0).toLocaleString()
  const contractLabel = contract_type === 'jiip' ? '위수탁(지입) 계약' : '일반 투자 계약'
  const contractPeriod = `${contract.contract_start_date || '-'} ~ ${contract.contract_end_date || '-'}`

  const templateVars: Record<string, string> = {
    company_name: companyName,
    customer_name: investorName,
    contract_label: contractLabel,
    invest_amount: investAmount,
    contract_period: contractPeriod,
    sign_url: signUrl,
    // 폴백용 키 (기존 하드코딩 호환)
    companyName, investorName, contractLabel, investAmount, contractPeriod, signUrl,
  }

  let emailResult: { success: boolean; error?: string; resultCode?: string } = { success: false, error: '' }
  let kakaoResult: { success: boolean; error?: string; method?: string; resultCode?: string } = { success: false, error: '' }

  // ── 이메일 발송 ──
  if (send_channel === 'email' || send_channel === 'both') {
    console.log(`[contracts send-email] 이메일 발송 시작: ${recipient_email}`)

    // DB 템플릿 시도
    const templateResult = await sendWithTemplate({
      companyId: contract.company_id,
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
      // 폴백: 하드코딩 HTML
      console.log('[contracts send-email] DB 템플릿 실패, 폴백:', templateResult.error)
      emailResult = await sendEmail({
        to: recipient_email,
        subject: `[${companyName}] ${contractLabel} 서명 요청`,
        html: getContractEmailFallback({ companyName, investorName, investAmount, contractLabel, contractPeriod, signUrl }),
      })
      logMessageSend({
        companyId: contract.company_id, templateKey: 'contract_sign_request', channel: 'email',
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

    // SMS DB 템플릿 시도 (카카오 폴백 시 사용)
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

    // 로깅
    const kakaoMethod = (kakaoResult as any).method || 'kakao'
    logMessageSend({
      companyId: contract.company_id, templateKey: 'contract_sign_request',
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
    await sb.from('contract_sending_logs')
      .update({ status: 'failed', notes: errors.join(' | ') })
      .eq('id', log.id)
  }

  const kakaoMethod = (kakaoResult as any).method
  if (kakaoResult.success && kakaoMethod === 'sms') {
    await sb.from('contract_sending_logs')
      .update({ notes: '카카오 알림톡 실패 → SMS 대체 발송' })
      .eq('id', log.id)
  }

  return NextResponse.json({
    success: true, log_id: log.id,
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
