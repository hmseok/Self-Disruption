import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// ============================================
// 통합 메시징 유틸리티 (SMS / Kakao / Email)
// ============================================

type MessageChannel = 'sms' | 'kakao' | 'email' | 'push'

interface SendSMSParams {
  phone: string
  message: string
  title?: string
}

interface SendKakaoAlimtalkParams {
  phone: string
  templateCode: string
  templateVars: Record<string, string>
  smsMessage: string
  smsTitle?: string
  buttons?: any[]
}

interface SendEmailParams {
  to: string
  subject: string
  html?: string
  text?: string
}

interface LogMessageSendParams {
  companyId: string
  templateKey?: string
  channel: MessageChannel
  recipient: string
  recipientName?: string
  subject?: string
  body: string
  status: 'pending' | 'sent' | 'failed' | 'delivered'
  resultCode?: string
  resultMessage?: string
  errorDetail?: string
  relatedType?: string
  relatedId?: string
  sentBy?: string
}

interface SendWithTemplateParams {
  companyId: string
  templateKey: string
  channel: MessageChannel
  recipient: string
  recipientName?: string
  variables: Record<string, string>
  relatedType?: string
  relatedId?: string
  sentBy?: string
}

interface SendResult {
  success: boolean
  method?: 'sms' | 'kakao' | 'email'
  resultCode?: string
  error?: string
}

interface TemplateRenderResult {
  success: boolean
  subject?: string
  body: string
  error?: string
}

// ============================================
// Supabase Admin 클라이언트 생성
// ============================================
function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Supabase credentials not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ============================================
// 1. SMS 발송 (Aligo API)
// ============================================
export async function sendSMS(params: SendSMSParams): Promise<SendResult> {
  const { phone, message, title } = params
  const apiKey = process.env.ALIGO_API_KEY
  const userId = process.env.ALIGO_USER_ID
  const sender = process.env.ALIGO_SENDER_PHONE

  console.log('[sendSMS] 시작:', {
    phone: phone?.substring(0, 7) + '***',
    msgLen: message?.length,
    msgBytes: Buffer.byteLength(message, 'utf8'),
    configured: !!apiKey && !!userId && !!sender,
  })

  if (!apiKey || !userId || !sender) {
    const error = 'Aligo SMS 키 미설정 (ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER_PHONE)'
    console.error('[sendSMS] 환경변수 누락:', error)
    return { success: false, error }
  }

  try {
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    const msgBytes = Buffer.byteLength(message, 'utf8')
    const isLMS = msgBytes > 90
    const msgType = isLMS ? 'LMS' : 'SMS'

    const formData = new URLSearchParams()
    formData.append('key', apiKey)
    formData.append('userid', userId)
    formData.append('sender', sender)
    formData.append('receiver', cleanPhone)
    formData.append('msg', message)
    formData.append('msg_type', msgType)
    if (isLMS && title) {
      formData.append('title', title)
    }

    console.log('[sendSMS] API 호출:', { receiver: cleanPhone, msg_type: msgType, msgBytes })

    const res = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })

    const result = await res.json()
    console.log('[sendSMS] 응답:', { result_code: result.result_code, message: result.message })

    if (result.result_code === '1') {
      return { success: true, method: 'sms', resultCode: result.result_code }
    } else {
      return {
        success: false,
        error: `[${result.result_code}] ${result.message || 'SMS 발송 실패'}`,
      }
    }
  } catch (err: any) {
    console.error('[sendSMS] 예외:', err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// 2. Kakao 알림톡 발송 (SMS fallback 포함)
// ============================================
export async function sendKakaoAlimtalk(params: SendKakaoAlimtalkParams): Promise<SendResult> {
  const { phone, templateCode, templateVars, smsMessage, smsTitle, buttons } = params
  const apiKey = process.env.ALIGO_API_KEY
  const userId = process.env.ALIGO_USER_ID
  const senderKey = process.env.ALIGO_SENDER_KEY
  const senderPhone = process.env.ALIGO_SENDER_PHONE

  console.log('[sendKakaoAlimtalk] 시작:', {
    phone: phone?.substring(0, 7) + '***',
    templateCode,
    configured: !!apiKey && !!userId && !!senderKey,
  })

  const cleanPhone = phone.replace(/[^0-9]/g, '')

  // senderKey 없으면 Kakao 미연동 → 바로 SMS fallback
  if (!apiKey || !userId || !senderKey) {
    console.log('[sendKakaoAlimtalk] Kakao 키 미설정 → SMS fallback')
    return sendSMS({ phone, message: smsMessage, title: smsTitle })
  }

  try {
    // 템플릿 변수를 메시지에 적용 (#{key} 형식)
    let kakaoMessage = smsMessage
    Object.entries(templateVars).forEach(([key, value]) => {
      kakaoMessage = kakaoMessage.replace(new RegExp(`#{${key}}`, 'g'), value)
    })

    const formData = new URLSearchParams()
    formData.append('apikey', apiKey)
    formData.append('userid', userId)
    formData.append('senderkey', senderKey)
    formData.append('tpl_code', templateCode)
    formData.append('sender', senderPhone || '01000000000')
    formData.append('receiver_1', cleanPhone)
    formData.append('subject_1', '알림톡')
    formData.append('message_1', kakaoMessage)

    // 버튼 설정
    const buttonConfig = buttons || [
      {
        name: '확인',
        linkType: 'WL',
        linkTypeName: '웹링크',
        linkMo: templateVars.signUrl || templateVars.invite_url || '',
        linkPc: templateVars.signUrl || templateVars.invite_url || '',
      },
    ]
    formData.append('button_1', JSON.stringify({ button: buttonConfig }))

    // Kakao 실패 시 SMS fallback 설정
    formData.append('failover', 'Y')
    formData.append('fsubject_1', '알림톡')
    formData.append('fmessage_1', smsMessage)

    console.log('[sendKakaoAlimtalk] API 호출:', { receiver: cleanPhone, tpl_code: templateCode })

    const res = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })

    const result = await res.json()
    console.log('[sendKakaoAlimtalk] 응답:', { code: result.code, message: result.message })

    if (result.code === 0) {
      return { success: true, method: 'kakao', resultCode: String(result.code) }
    } else {
      // Kakao 실패 → SMS fallback 자동 시도
      console.log('[sendKakaoAlimtalk] Kakao 실패 → SMS fallback:', result.message)
      return sendSMS({ phone, message: smsMessage, title: smsTitle })
    }
  } catch (err: any) {
    console.error('[sendKakaoAlimtalk] 예외:', err.message)
    // 네트워크 오류 → SMS fallback
    console.log('[sendKakaoAlimtalk] 예외 발생 → SMS fallback')
    return sendSMS({ phone, message: smsMessage, title: smsTitle })
  }
}

// ============================================
// 3. Email 발송 (Resend)
// ============================================
export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const { to, subject, html, text } = params
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@self-disruption.com'

  console.log('[sendEmail] 시작:', { to, subject, hasHtml: !!html, configured: !!apiKey })

  if (!apiKey) {
    const error = 'RESEND_API_KEY 미설정'
    console.error('[sendEmail] 환경변수 누락:', error)
    return { success: false, error }
  }

  try {
    const resend = new Resend(apiKey)

    const emailData: any = {
      from: `Self-Disruption <${fromEmail}>`,
      to,
      subject,
    }

    if (html) {
      emailData.html = html
    } else if (text) {
      emailData.text = text
    } else {
      return { success: false, error: 'HTML 또는 TEXT 본문이 필요합니다.' }
    }

    console.log('[sendEmail] API 호출:', { from: emailData.from, to })

    const result = await resend.emails.send(emailData)

    console.log('[sendEmail] 응답:', { success: !!result.id, id: result.id })

    if (result.id) {
      return { success: true, method: 'email', resultCode: result.id }
    } else {
      return { success: false, error: result.error?.message || 'Email 발송 실패' }
    }
  } catch (err: any) {
    console.error('[sendEmail] 예외:', err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// 4. 메시지 발송 로그 기록
// ============================================
export async function logMessageSend(params: LogMessageSendParams): Promise<boolean> {
  const {
    companyId,
    templateKey,
    channel,
    recipient,
    recipientName,
    subject,
    body,
    status,
    resultCode,
    resultMessage,
    errorDetail,
    relatedType,
    relatedId,
    sentBy,
  } = params

  console.log('[logMessageSend] 로그 기록:', {
    companyId: companyId?.substring(0, 8) + '***',
    templateKey,
    channel,
    status,
    recipient: recipient?.substring(0, 7) + '***',
  })

  try {
    const sb = getSupabaseAdmin()

    const { error } = await sb.from('message_send_logs').insert({
      company_id: companyId,
      template_key: templateKey,
      channel,
      recipient,
      recipient_name: recipientName,
      subject,
      body,
      status,
      result_code: resultCode,
      result_message: resultMessage,
      error_detail: errorDetail,
      related_type: relatedType,
      related_id: relatedId,
      sent_by: sentBy,
      sent_at: new Date().toISOString(),
    })

    if (error) {
      console.error('[logMessageSend] DB 오류:', error.message)
      return false
    }

    console.log('[logMessageSend] 완료')
    return true
  } catch (err: any) {
    console.error('[logMessageSend] 예외:', err.message)
    return false
  }
}

// ============================================
// 5. 템플릿 변수 치환 ({{var}} 형식)
// ============================================
export function renderTemplate(template: string, vars: Record<string, string>): string {
  console.log('[renderTemplate] 시작:', { varCount: Object.keys(vars).length })

  let result = template
  Object.entries(vars).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`
    result = result.replaceAll(placeholder, value || '')
    console.log(`[renderTemplate] 치환: ${placeholder} → ${value?.substring(0, 20)}...`)
  })

  return result
}

// ============================================
// 6. 고수준 함수: 템플릿 로드 → 렌더링 → 발송 → 로깅
// ============================================
export async function sendWithTemplate(params: SendWithTemplateParams): Promise<SendResult> {
  const {
    companyId,
    templateKey,
    channel,
    recipient,
    recipientName,
    variables,
    relatedType,
    relatedId,
    sentBy,
  } = params

  console.log('[sendWithTemplate] 시작:', {
    companyId: companyId?.substring(0, 8) + '***',
    templateKey,
    channel,
    recipient: recipient?.substring(0, 7) + '***',
  })

  try {
    const sb = getSupabaseAdmin()

    // 1. DB에서 템플릿 로드
    console.log('[sendWithTemplate] 템플릿 조회 중...')
    const { data: template, error: dbError } = await sb
      .from('message_templates')
      .select('*')
      .eq('company_id', companyId)
      .eq('template_key', templateKey)
      .eq('channel', channel)
      .single()

    if (dbError || !template) {
      const error = `템플릿을 찾을 수 없음 (${templateKey}/${channel}): ${dbError?.message || 'Not found'}`
      console.error('[sendWithTemplate] 템플릿 로드 실패:', error)

      await logMessageSend({
        companyId,
        templateKey,
        channel,
        recipient,
        recipientName,
        body: '',
        status: 'failed',
        errorDetail: error,
        relatedType,
        relatedId,
        sentBy,
      })

      return { success: false, error }
    }

    // 2. 템플릿 렌더링
    console.log('[sendWithTemplate] 템플릿 렌더링 중...')
    const renderedBody = renderTemplate(template.body, variables)
    const renderedSubject = template.subject ? renderTemplate(template.subject, variables) : undefined

    // 3. 채널별 발송
    console.log('[sendWithTemplate] 메시지 발송 중...')
    let sendResult: SendResult = { success: false }

    if (channel === 'email') {
      sendResult = await sendEmail({
        to: recipient,
        subject: renderedSubject || '알림',
        html: template.html_template ? renderTemplate(template.html_template, variables) : undefined,
        text: renderedBody,
      })
    } else if (channel === 'sms') {
      sendResult = await sendSMS({
        phone: recipient,
        message: renderedBody,
        title: renderedSubject,
      })
    } else if (channel === 'kakao') {
      const smsMessage = renderTemplate(template.body, variables)
      sendResult = await sendKakaoAlimtalk({
        phone: recipient,
        templateCode: template.kakao_template_code || 'DEFAULT',
        templateVars: variables,
        smsMessage,
        smsTitle: renderedSubject,
        buttons: template.kakao_button_json || undefined,
      })
    } else if (channel === 'push') {
      console.log('[sendWithTemplate] Push 채널은 아직 미구현')
      sendResult = { success: false, error: 'Push 채널은 아직 미구현' }
    }

    // 4. 발송 결과 로깅
    console.log('[sendWithTemplate] 결과 로깅 중...', { success: sendResult.success })
    await logMessageSend({
      companyId,
      templateKey,
      channel,
      recipient,
      recipientName,
      subject: renderedSubject,
      body: renderedBody,
      status: sendResult.success ? 'sent' : 'failed',
      resultCode: sendResult.resultCode,
      errorDetail: sendResult.error,
      relatedType,
      relatedId,
      sentBy,
    })

    return sendResult
  } catch (err: any) {
    console.error('[sendWithTemplate] 예외:', err.message)

    await logMessageSend({
      companyId,
      templateKey,
      channel,
      recipient,
      recipientName,
      body: '',
      status: 'failed',
      errorDetail: err.message,
      relatedType,
      relatedId,
      sentBy,
    })

    return { success: false, error: err.message }
  }
}

// ============================================
// 7. 공통 이메일 HTML 래퍼
// ============================================

/**
 * Self-Disruption 브랜딩이 적용된 이메일 HTML 래퍼
 * @param heading 메인 제목
 * @param subtitle 부제목
 * @param bodyContent 본문 HTML (테이블, 문단 등)
 * @param ctaText CTA 버튼 텍스트
 * @param ctaUrl CTA 버튼 URL
 * @param footerText 하단 안내 텍스트
 */
export function buildEmailHTML(params: {
  heading: string
  subtitle?: string
  bodyContent?: string
  ctaText?: string
  ctaUrl?: string
  footerText?: string
}): string {
  const { heading, subtitle, bodyContent, ctaText, ctaUrl, footerText } = params
  return `
    <div style="font-family: 'Apple SD Gothic Neo', -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: #1B3A5C; color: white; font-size: 11px; font-weight: 900; padding: 4px 12px; border-radius: 6px; letter-spacing: 1px;">SELF-DISRUPTION</div>
      </div>
      <h2 style="color: #0f172a; margin: 0 0 8px; text-align: center;">${heading}</h2>
      ${subtitle ? `<p style="color: #64748b; font-size: 14px; margin: 0 0 24px; text-align: center;">${subtitle}</p>` : ''}
      ${bodyContent ? `<div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">${bodyContent}</div>` : ''}
      ${ctaText && ctaUrl ? `
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${ctaUrl}" style="display: inline-block; background: #1B3A5C; color: white; padding: 14px 48px; border-radius: 12px; font-weight: 900; font-size: 16px; text-decoration: none;">${ctaText}</a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          위 버튼이 작동하지 않으면 아래 링크를 브라우저에 직접 붙여넣으세요.<br/>
          <a href="${ctaUrl}" style="color: #0284c7; word-break: break-all;">${ctaUrl}</a>
        </p>
      ` : ''}
      ${footerText ? `<p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 16px 0 0;">${footerText}</p>` : ''}
    </div>
  `
}

/**
 * 테이블 형태의 정보 HTML 생성
 * @param rows [{label: '소속 회사', value: '셀프디스럽션'}, ...]
 */
export function buildInfoTableHTML(rows: { label: string; value: string; highlight?: boolean }[]): string {
  return `<table style="width: 100%; font-size: 14px; color: #334155;">
    ${rows
      .filter((r) => r.value)
      .map(
        (r) =>
          `<tr><td style="padding: 6px 0; color: #94a3b8;">${r.label}</td><td style="padding: 6px 0; font-weight: 700;${r.highlight ? ' color: #ef4444;' : ''}">${r.value}</td></tr>`
      )
      .join('')}
  </table>`
}

// ============================================
// 내보내기
// ============================================
export {
  SendSMSParams,
  SendKakaoAlimtalkParams,
  SendEmailParams,
  LogMessageSendParams,
  SendWithTemplateParams,
  SendResult,
  TemplateRenderResult,
  MessageChannel,
}
