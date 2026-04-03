import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

type MessageChannel = 'sms' | 'kakao' | 'email' | 'push'
interface SendSMSParams { phone: string; message: string; title?: string }
interface SendKakaoAlimtalkParams { phone: string; templateCode: string; templateVars: Record<string, string>; smsMessage: string; smsTitle?: string; buttons?: any[] }
interface SendEmailParams { to: string; subject: string; html?: string; text?: string }
interface LogMessageSendParams { companyId?: string; templateKey?: string; channel: MessageChannel; recipient: string; recipientName?: string; subject?: string; body: string; status: 'pending' | 'sent' | 'failed' | 'delivered'; resultCode?: string; resultMessage?: string; errorDetail?: string; relatedType?: string; relatedId?: string; sentBy?: string }
interface SendWithTemplateParams { companyId: string; templateKey: string; channel: MessageChannel; recipient: string; recipientName?: string; variables: Record<string, string>; relatedType?: string; relatedId?: string; sentBy?: string }
export interface SendResult { success: boolean; method?: 'sms' | 'kakao' | 'email'; resultCode?: string; error?: string }
interface TemplateRenderResult { success: boolean; subject?: string; body: string; error?: string }

export async function sendSMS(params: SendSMSParams): Promise<SendResult> {
  const { phone, message, title } = params
  const apiKey = process.env.ALIGO_API_KEY
  const userId = process.env.ALIGO_USER_ID
  const sender = process.env.ALIGO_SENDER_PHONE
  if (!apiKey || !userId || !sender) return { success: false, error: 'Aligo SMS 키 미설정' }
  try {
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    const msgBytes = Buffer.byteLength(message, 'utf8')
    const isLMS = msgBytes > 90
    const formData = new URLSearchParams()
    formData.append('key', apiKey); formData.append('userid', userId); formData.append('sender', sender)
    formData.append('receiver', cleanPhone); formData.append('msg', message); formData.append('msg_type', isLMS ? 'LMS' : 'SMS')
    if (isLMS && title) formData.append('title', title)
    const res = await fetch('https://apis.aligo.in/send/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString() })
    const result = await res.json()
    return result.result_code === '1' ? { success: true, method: 'sms', resultCode: result.result_code } : { success: false, error: `[${result.result_code}] ${result.message}` }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function sendKakaoAlimtalk(params: SendKakaoAlimtalkParams): Promise<SendResult> {
  const { phone, templateCode, templateVars, smsMessage, smsTitle, buttons } = params
  const apiKey = process.env.ALIGO_API_KEY; const userId = process.env.ALIGO_USER_ID
  const senderKey = process.env.ALIGO_SENDER_KEY; const senderPhone = process.env.ALIGO_SENDER_PHONE
  if (!apiKey || !userId || !senderKey) return sendSMS({ phone, message: smsMessage, title: smsTitle })
  try {
    let kakaoMessage = smsMessage
    Object.entries(templateVars).forEach(([k, v]) => { kakaoMessage = kakaoMessage.replace(new RegExp(`#{${k}}`, 'g'), v) })
    const formData = new URLSearchParams()
    formData.append('apikey', apiKey!); formData.append('userid', userId!); formData.append('senderkey', senderKey!)
    formData.append('tpl_code', templateCode); formData.append('sender', senderPhone || '01000000000')
    formData.append('receiver_1', phone.replace(/[^0-9]/g, '')); formData.append('subject_1', '알림톡'); formData.append('message_1', kakaoMessage)
    const btnConfig = buttons || [{ name: '확인', linkType: 'WL', linkTypeName: '웹링크', linkMo: templateVars.signUrl || templateVars.invite_url || '', linkPc: templateVars.signUrl || templateVars.invite_url || '' }]
    formData.append('button_1', JSON.stringify({ button: btnConfig })); formData.append('failover', 'Y'); formData.append('fmessage_1', smsMessage)
    const res = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString() })
    const result = await res.json()
    return result.code === 0 ? { success: true, method: 'kakao', resultCode: String(result.code) } : sendSMS({ phone, message: smsMessage, title: smsTitle })
  } catch { return sendSMS({ phone, message: smsMessage, title: smsTitle }) }
}

export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const { to, subject, html, text } = params
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@self-disruption.com'
  if (!apiKey) return { success: false, error: 'RESEND_API_KEY 미설정' }
  if (!html && !text) return { success: false, error: 'HTML 또는 TEXT 본문 필요' }
  try {
    const resend = new Resend(apiKey)
    const result = await resend.emails.send({ from: `Self-Disruption <${fromEmail}>`, to, subject, ...(html ? { html } : { text: text! }) }) as any
    return result.id ? { success: true, method: 'email', resultCode: result.id } : { success: false, error: result.error?.message || 'Email 발송 실패' }
  } catch (err: any) { return { success: false, error: err.message } }
}

export async function logMessageSend(params: LogMessageSendParams): Promise<boolean> {
  try {
    await (prisma as any).messageSendLog.create({ data: {
      company_id: params.companyId || null, template_key: params.templateKey || null,
      channel: params.channel, recipient: params.recipient, recipient_name: params.recipientName || null,
      subject: params.subject || null, body: params.body, status: params.status,
      result_code: params.resultCode || null, result_message: params.resultMessage || null,
      error_detail: params.errorDetail || null, related_type: params.relatedType || null,
      related_id: params.relatedId || null, sent_by: params.sentBy || null, sent_at: new Date(),
    }})
    return true
  } catch (err: any) { console.error('[logMessageSend]', err.message); return false }
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  Object.entries(vars).forEach(([k, v]) => { result = result.replaceAll(`{{${k}}}`, v || '') })
  return result
}

export async function sendWithTemplate(params: SendWithTemplateParams): Promise<SendResult> {
  const { companyId, templateKey, channel, recipient, recipientName, variables, relatedType, relatedId, sentBy } = params
  try {
    let template = await (prisma as any).messageTemplate.findFirst({ where: { template_key: templateKey, channel, company_id: companyId, is_active: true } })
    if (!template) template = await (prisma as any).messageTemplate.findFirst({ where: { template_key: templateKey, channel, company_id: null, is_active: true } })
    if (!template) {
      const error = `템플릿 없음 (${templateKey}/${channel})`
      await logMessageSend({ companyId, templateKey, channel, recipient, recipientName, body: '', status: 'failed', errorDetail: error, relatedType, relatedId, sentBy })
      return { success: false, error }
    }
    const renderedBody = renderTemplate(template.body, variables)
    const renderedSubject = template.subject ? renderTemplate(template.subject, variables) : undefined
    let sendResult: SendResult = { success: false }
    if (channel === 'email') {
      sendResult = await sendEmail({ to: recipient, subject: renderedSubject || '알림', html: template.html_template ? renderTemplate(template.html_template, variables) : undefined, text: renderedBody })
    } else if (channel === 'sms') {
      sendResult = await sendSMS({ phone: recipient, message: renderedBody, title: renderedSubject })
    } else if (channel === 'kakao') {
      sendResult = await sendKakaoAlimtalk({ phone: recipient, templateCode: template.kakao_template_code || 'DEFAULT', templateVars: variables, smsMessage: renderedBody, smsTitle: renderedSubject, buttons: template.kakao_button_json || undefined })
    }
    await logMessageSend({ companyId, templateKey, channel, recipient, recipientName, subject: renderedSubject, body: renderedBody, status: sendResult.success ? 'sent' : 'failed', resultCode: sendResult.resultCode, errorDetail: sendResult.error, relatedType, relatedId, sentBy })
    return sendResult
  } catch (err: any) {
    await logMessageSend({ companyId, templateKey, channel, recipient, recipientName, body: '', status: 'failed', errorDetail: err.message, relatedType, relatedId, sentBy })
    return { success: false, error: err.message }
  }
}

export function buildEmailHTML(params: { heading: string; subtitle?: string; bodyContent?: string; ctaText?: string; ctaUrl?: string; footerText?: string }): string {
  const { heading, subtitle, bodyContent, ctaText, ctaUrl, footerText } = params
  return `<div style="font-family:'Apple SD Gothic Neo',-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:16px;">
    <div style="text-align:center;margin-bottom:24px;"><div style="display:inline-block;background:#1B3A5C;color:white;font-size:11px;font-weight:900;padding:4px 12px;border-radius:6px;letter-spacing:1px;">SELF-DISRUPTION</div></div>
    <h2 style="color:#0f172a;margin:0 0 8px;text-align:center;">${heading}</h2>
    ${subtitle ? `<p style="color:#64748b;font-size:14px;margin:0 0 24px;text-align:center;">${subtitle}</p>` : ''}
    ${bodyContent ? `<div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;">${bodyContent}</div>` : ''}
    ${ctaText && ctaUrl ? `<div style="text-align:center;margin-bottom:24px;"><a href="${ctaUrl}" style="display:inline-block;background:#1B3A5C;color:white;padding:14px 48px;border-radius:12px;font-weight:900;font-size:16px;text-decoration:none;">${ctaText}</a></div>` : ''}
    ${footerText ? `<p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0;">${footerText}</p>` : ''}
  </div>`
}

export function buildInfoTableHTML(rows: { label: string; value: string; highlight?: boolean }[]): string {
  return `<table style="width:100%;font-size:14px;color:#334155;">${rows.filter(r=>r.value).map(r=>`<tr><td style="padding:6px 0;color:#94a3b8;">${r.label}</td><td style="padding:6px 0;font-weight:700;${r.highlight?' color:#ef4444;':''}">${r.value}</td></tr>`).join('')}</table>`
}

export type { SendSMSParams, SendKakaoAlimtalkParams, SendEmailParams, LogMessageSendParams, SendWithTemplateParams, TemplateRenderResult, MessageChannel }
