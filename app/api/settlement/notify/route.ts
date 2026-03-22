import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, sendEmail, logMessageSend } from '../../../utils/messaging'

// ============================================
// 정산 알림 발송 API
// POST → 수신자별 통합 메시지 발송 (SMS/이메일)
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
    .from('profiles').select('role, company_id').eq('id', user.id).single()
  if (!profile || !['admin', 'admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id }
}

// 새 형식: 수신자별 통합 메시지
type NotifyRecipient = {
  name: string
  phone: string
  email: string
  message: string
  totalAmount: number
  items: {
    type: 'jiip' | 'invest'
    relatedId: string
    amount: number
    dueDate: string
  }[]
}

// 이전 형식 호환
type NotifyItem = {
  type: 'jiip' | 'invest'
  relatedId: string
  name: string
  amount: number
  dueDate: string
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const body = await request.json()
    const { channel = 'sms', company_id } = body as {
      channel: 'sms' | 'email'
      company_id: string
    }

    if (!company_id) {
      return NextResponse.json({ error: 'company_id 필수' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const results: { name: string; success: boolean; error?: string }[] = []

    // ── 새 형식: recipients 배열 (수신자별 통합 메시지) ──
    if (body.recipients && Array.isArray(body.recipients)) {
      const recipients = body.recipients as NotifyRecipient[]

      for (const r of recipients) {
        try {
          const recipient = channel === 'sms' ? r.phone : r.email
          if (!recipient) {
            results.push({ name: r.name, success: false, error: `${channel === 'sms' ? '전화번호' : '이메일'} 없음` })
            continue
          }

          let sendResult: { success: boolean; error?: string; resultCode?: string }

          if (channel === 'sms') {
            sendResult = await sendSMS({
              phone: recipient,
              message: r.message,
              title: `정산 안내 - ${r.name}님`,
            })
          } else {
            sendResult = await sendEmail({
              to: recipient,
              subject: `[정산 안내] ${r.name}님 정산 내역`,
              text: r.message,
            })
          }

          // 발송 로그
          await logMessageSend({
            companyId: company_id,
            templateKey: 'settlement_notify',
            channel,
            recipient,
            recipientName: r.name,
            subject: `정산 안내 - ${r.name}님`,
            body: r.message,
            status: sendResult.success ? 'sent' : 'failed',
            resultCode: sendResult.resultCode,
            errorDetail: sendResult.error,
            relatedType: r.items[0]?.type || 'settlement',
            relatedId: r.items[0]?.relatedId,
            sentBy: admin.id,
          })

          results.push({
            name: r.name,
            success: sendResult.success,
            error: sendResult.error,
          })
        } catch (err: any) {
          results.push({ name: r.name, success: false, error: err.message })
        }
      }
    }
    // ── 이전 형식 호환: items 배열 ──
    else if (body.items && Array.isArray(body.items)) {
      const items = body.items as NotifyItem[]
      const { data: company } = await sb.from('companies').select('name').eq('id', company_id).single()
      const companyName = company?.name || '회사'

      for (const item of items) {
        try {
          const tableName = item.type === 'jiip' ? 'jiip_contracts' : 'general_investments'
          const { data: contract } = await sb
            .from(tableName)
            .select('*')
            .eq('id', item.relatedId)
            .single()

          if (!contract) {
            results.push({ name: item.name, success: false, error: '계약 정보 없음' })
            continue
          }

          const phone = contract.investor_phone || contract.phone || ''
          const email = contract.investor_email || contract.email || ''
          const recipient = channel === 'sms' ? phone : email

          if (!recipient) {
            results.push({ name: item.name, success: false, error: `${channel === 'sms' ? '전화번호' : '이메일'} 없음` })
            continue
          }

          const typeLabel = item.type === 'jiip' ? '지입 정산금' : '투자 이자'
          const message = `[${companyName}] 정산 안내\n${item.name}님, 정산 안내드립니다.\n구분: ${typeLabel}\n정산금액: ${Number(item.amount).toLocaleString()}원\n지급예정일: ${item.dueDate}\n감사합니다.`

          let sendResult: { success: boolean; error?: string; resultCode?: string }
          if (channel === 'sms') {
            sendResult = await sendSMS({ phone: recipient, message, title: `정산 안내 - ${item.name}님` })
          } else {
            sendResult = await sendEmail({ to: recipient, subject: `[정산 안내] ${item.name}님`, text: message })
          }

          await logMessageSend({
            companyId: company_id,
            templateKey: 'settlement_notify',
            channel,
            recipient,
            recipientName: item.name,
            body: message,
            status: sendResult.success ? 'sent' : 'failed',
            resultCode: sendResult.resultCode,
            errorDetail: sendResult.error,
            relatedType: item.type,
            relatedId: item.relatedId,
            sentBy: admin.id,
          })

          results.push({
            name: item.name,
            success: sendResult.success,
            error: sendResult.error,
          })
        } catch (err: any) {
          results.push({ name: item.name, success: false, error: err.message })
        }
      }
    } else {
      return NextResponse.json({ error: 'recipients 또는 items 배열 필수' }, { status: 400 })
    }

    const sent = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      success: true,
      total: results.length,
      sent,
      failed,
      results,
    })
  } catch (err: any) {
    console.error('[settlement/notify] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
