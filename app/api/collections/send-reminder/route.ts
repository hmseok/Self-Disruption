import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWithTemplate } from '../../../utils/messaging'

// ============================================
// 납부 안내 일괄 발송 API
// POST → 선택된 스케줄에 대해 SMS/이메일 발송
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
  if (!profile || !['god_admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const body = await request.json()
    const {
      schedule_ids,
      channel = 'sms',          // 'sms' | 'email'
      template_key = 'payment_reminder',
    } = body

    if (!schedule_ids || !Array.isArray(schedule_ids) || schedule_ids.length === 0) {
      return NextResponse.json({ error: 'schedule_ids 배열 필수' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // 1. 스케줄 + 계약 정보 조회
    const { data: schedules, error: fetchErr } = await sb
      .from('expected_payment_schedules')
      .select('*')
      .in('id', schedule_ids)

    if (fetchErr || !schedules || schedules.length === 0) {
      return NextResponse.json({ error: '스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 2. 회사명 조회
    const companyId = schedules[0].company_id
    const { data: company } = await sb.from('companies').select('name').eq('id', companyId).single()
    const companyName = company?.name || '회사'

    // 3. 각 스케줄에 대해 계약 정보 조회 + 발송
    const results: { scheduleId: string; success: boolean; error?: string }[] = []

    for (const sched of schedules) {
      try {
        // 계약 정보 (이름, 전화번호, 이메일)
        const tableName = sched.contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'
        const { data: contract } = await sb
          .from(tableName)
          .select('*')
          .eq('id', sched.contract_id)
          .single()

        if (!contract) {
          results.push({ scheduleId: sched.id, success: false, error: '계약 정보 없음' })
          continue
        }

        const customerName = sched.contract_type === 'jiip'
          ? contract.investor_name
          : contract.investor_name
        const phone = contract.investor_phone || contract.phone || ''
        const email = contract.investor_email || contract.email || ''
        const recipient = channel === 'sms' ? phone : email

        if (!recipient) {
          results.push({ scheduleId: sched.id, success: false, error: `${channel === 'sms' ? '전화번호' : '이메일'} 없음` })
          continue
        }

        // 연체일 계산
        const today = new Date()
        const dueDate = new Date(sched.payment_date)
        const overdueDays = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))

        // 템플릿 변수
        const variables: Record<string, string> = {
          company_name: companyName,
          customer_name: customerName,
          payment_amount: Number(sched.expected_amount).toLocaleString(),
          due_date: sched.payment_date,
          overdue_days: String(overdueDays),
          payment_url: '',  // 납부 URL이 있으면 추가
          contact_phone: '',
        }

        // 연체 건은 overdue 템플릿 사용
        const actualTemplateKey = overdueDays > 0 ? 'payment_overdue' : template_key

        const sendResult = await sendWithTemplate({
          companyId,
          templateKey: actualTemplateKey,
          channel: channel as 'sms' | 'email',
          recipient,
          recipientName: customerName,
          variables,
          relatedType: sched.contract_type,
          relatedId: sched.contract_id,
          sentBy: admin.id,
        })

        results.push({
          scheduleId: sched.id,
          success: sendResult.success,
          error: sendResult.error,
        })
      } catch (err: any) {
        results.push({ scheduleId: sched.id, success: false, error: err.message })
      }
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
    console.error('[collections/send-reminder] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
