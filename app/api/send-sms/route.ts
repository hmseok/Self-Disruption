import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { sendSMS, logMessageSend } from '../../utils/messaging'

// ============================================
// 청구서 SMS 발송 API (Aligo)
// POST /api/send-sms
// ============================================

export async function POST(request: NextRequest) {
  try {
    const currentUser = await verifyUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }

    const body = await request.json()
    const { phone, message, title, relatedType, relatedId, recipientName } = body

    if (!phone || !message) {
      return NextResponse.json({ error: '전화번호와 메시지는 필수입니다.' }, { status: 400 })
    }

    // Aligo API로 SMS 발송
    const result = await sendSMS({ phone, message, title })

    // 발송 로그 기록
    await logMessageSend({
      channel: 'sms',
      recipient: phone,
      recipientName: recipientName || '',
      subject: title || '청구서 안내',
      body: message,
      status: result.success ? 'sent' : 'failed',
      resultCode: result.resultCode,
      errorDetail: result.error,
      relatedType: relatedType || 'invoice',
      relatedId: relatedId || '',
      sentBy: currentUser.id,
    })

    if (result.success) {
      return NextResponse.json({ success: true, message: '문자 발송 완료' })
    } else {
      return NextResponse.json(
        { success: false, error: result.error || 'SMS 발송 실패' },
        { status: 500 }
      )
    }
  } catch (err: any) {
    console.error('[send-sms] 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
