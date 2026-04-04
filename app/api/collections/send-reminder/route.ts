import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { sendWithTemplate } from '../../../utils/messaging'

// ============================================
// 납부 안내 일괄 발송 API
// POST → 선택된 스케줄에 대해 SMS/이메일 발송
// ============================================

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return null
  // TODO: Phase 5 - Replace with Firebase Auth verification
  const profiles = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${userId} LIMIT 1`
  const profile = profiles[0]
  if (!profile || !['admin', 'master'].includes(profile.role)) return null
  return { id: userId, ...profile }
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

    // 1. 스케줄 + 계약 정보 조회
    const idList = schedule_ids.map((id: string) => `'${id}'`).join(',')
    const schedules = await prisma.$queryRaw<any[]>`
      SELECT * FROM expected_payment_schedules WHERE id IN (${idList})
    `

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ error: '스케줄을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 2. 회사명 조회
    const companyId = schedules[0].company_id
    const companies = await prisma.$queryRaw<any[]>`SELECT name FROM companies WHERE id = ${companyId} LIMIT 1`
    const companyName = companies[0]?.name || '회사'

    // 3. 각 스케줄에 대해 계약 정보 조회 + 발송
    const results: { scheduleId: string; success: boolean; error?: string }[] = []

    for (const sched of schedules) {
      try {
        // 계약 정보 (이름, 전화번호, 이메일)
        const tableName = sched.contract_type === 'jiip' ? 'jiip_contracts' : 'general_investments'
        const contracts = await prisma.$queryRaw<any[]>`
          SELECT * FROM ${tableName} WHERE id = ${sched.contract_id} LIMIT 1
        `
        const contract = contracts[0]

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
