import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// ============================================
// 멤버 초대 API
// POST   → 초대 생성 + 이메일/카카오/SMS 발송
// GET    → 초대 목록 조회
// DELETE → 초대 취소 (status='canceled')
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
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[verifyAdmin] No Bearer token in header')
    return null
  }

  const token = authHeader.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null') {
    console.log('[verifyAdmin] Empty or invalid token:', token?.substring(0, 20))
    return null
  }

  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) {
    console.log('[verifyAdmin] getUser failed:', error?.message || 'no user')
    return null
  }

  const { data: profile } = await getSupabaseAdmin()
    .from('profiles')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['god_admin', 'master'].includes(profile.role)) {
    console.log('[verifyAdmin] Role check failed:', profile?.role, 'user:', user.email)
    return null
  }
  return { ...user, role: profile.role, company_id: profile.company_id }
}

// ── Aligo SMS 발송 ──
async function sendInviteSMS(phone: string, message: string, title?: string) {
  const apiKey = process.env.ALIGO_API_KEY
  const userId = process.env.ALIGO_USER_ID
  const sender = process.env.ALIGO_SENDER_PHONE

  console.log('[Aligo SMS] 발송 시작:', { phone: phone?.substring(0, 7) + '***', msgLen: message?.length, apiKey: !!apiKey, userId: !!userId, sender: !!sender })

  if (!apiKey || !userId || !sender) {
    console.error('[Aligo SMS] 환경변수 미설정:', { apiKey: !!apiKey, userId: !!userId, sender: !!sender })
    return { success: false, error: 'Aligo SMS 키 미설정 (ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER_PHONE)' }
  }

  try {
    const isLMS = Buffer.byteLength(message, 'utf8') > 90
    const formData = new URLSearchParams()
    formData.append('key', apiKey)
    formData.append('userid', userId)
    formData.append('sender', sender)
    formData.append('receiver', phone.replace(/[^0-9]/g, ''))
    formData.append('msg', message)
    formData.append('msg_type', isLMS ? 'LMS' : 'SMS')
    if (isLMS) {
      formData.append('title', title || '[Self-Disruption]')
    }

    console.log('[Aligo SMS] API 호출:', { receiver: phone.replace(/[^0-9]/g, ''), msg_type: isLMS ? 'LMS' : 'SMS', msgBytes: Buffer.byteLength(message, 'utf8') })

    const res = await fetch('https://apis.aligo.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })
    const result = await res.json()
    console.log('[Aligo SMS] 발송 결과:', JSON.stringify(result))
    // result_code: "1" = 성공, "-" 시작 = 실패
    return result.result_code === '1'
      ? { success: true, method: 'sms' }
      : { success: false, error: `[${result.result_code}] ${result.message || 'SMS 발송 실패'}` }
  } catch (err: any) {
    console.error('[Aligo SMS] 예외:', err.message)
    return { success: false, error: err.message }
  }
}

// ── Aligo 카카오 알림톡 (실패 시 SMS fallback) ──
async function sendInviteKakao(phone: string, companyName: string, inviteUrl: string, expiresDate: string) {
  const apiKey = process.env.ALIGO_API_KEY
  const userId = process.env.ALIGO_USER_ID
  const senderKey = process.env.ALIGO_SENDER_KEY
  const cleanPhone = phone.replace(/[^0-9]/g, '')

  const smsMsg = getInviteSMSTemplate(companyName, inviteUrl, expiresDate)

  if (!apiKey || !userId || !senderKey) {
    return sendInviteSMS(phone, smsMsg)
  }

  try {
    const formData = new URLSearchParams()
    formData.append('apikey', apiKey)
    formData.append('userid', userId)
    formData.append('senderkey', senderKey)
    formData.append('tpl_code', 'TI_0001')  // 초대 알림톡 템플릿 코드
    formData.append('sender', process.env.ALIGO_SENDER_PHONE || '')
    formData.append('receiver_1', cleanPhone)
    formData.append('subject_1', '멤버 초대')
    formData.append('message_1', `[멤버 초대]\n\n${companyName}에서 새로운 멤버로 초대합니다.\n\n아래 버튼을 눌러 가입을 완료해 주세요.\n\n만료: ${expiresDate}`)
    formData.append('button_1', JSON.stringify({
      button: [{
        name: '가입하기',
        linkType: 'WL',
        linkTypeName: '웹링크',
        linkMo: inviteUrl,
        linkPc: inviteUrl,
      }]
    }))
    formData.append('failover', 'Y')
    formData.append('fsubject_1', '멤버 초대')
    formData.append('fmessage_1', smsMsg)

    const res = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })
    const result = await res.json()
    if (result.code === 0) {
      return { success: true, method: 'kakao' }
    }
    return sendInviteSMS(phone, smsMsg)
  } catch {
    return sendInviteSMS(phone, smsMsg)
  }
}

function getInviteSMSTemplate(companyName: string, inviteUrl: string, expiresDate: string) {
  return `[${companyName}] 멤버 초대\n${companyName}에서 새로운 멤버로 초대합니다.\n아래 링크에서 가입을 완료해 주세요.\n${inviteUrl}\n만료: ${expiresDate}`
}

// POST: 초대 생성 + 발송 (이메일/카카오/SMS)
export async function POST(request: NextRequest) {
  try {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const {
    email, company_id, position_id, department_id, role = 'user',
    send_channel = 'email',   // 'email' | 'kakao' | 'sms' | 'both'
    recipient_phone = '',
    page_permissions = [],     // 페이지별 권한 배열
  } = body

  // ★ 디버그: 수신된 파라미터 전체 로그
  console.log('[member-invite POST] 요청 파라미터:', {
    email,
    company_id,
    send_channel,
    recipient_phone: recipient_phone ? recipient_phone.substring(0, 7) + '***' : '(없음)',
    role,
    resend: !!body.resend,
  })

  if (!email || !company_id) {
    return NextResponse.json({ error: '이메일과 회사 ID가 필요합니다.' }, { status: 400 })
  }
  if (['kakao', 'sms', 'both'].includes(send_channel) && !recipient_phone) {
    return NextResponse.json({ error: '카카오/SMS 발송 시 전화번호가 필요합니다.' }, { status: 400 })
  }

  // master는 자기 회사만 초대 가능
  if (admin.role === 'master' && admin.company_id !== company_id) {
    return NextResponse.json({ error: '자기 회사에만 초대할 수 있습니다.' }, { status: 403 })
  }

  // master는 master 초대 불가 (god_admin만 가능)
  if (role === 'master' && admin.role !== 'god_admin') {
    return NextResponse.json({ error: '관리자 초대는 플랫폼 관리자만 가능합니다.' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()

  // 이미 가입된 이메일 확인
  const { data: existingProfile } = await sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (existingProfile) {
    return NextResponse.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 })
  }

  // 중복 pending 초대 확인 → resend 모드면 기존 초대로 재발송
  const { data: pendingInvite } = await sb
    .from('member_invitations')
    .select('id, token, expires_at')
    .eq('email', email)
    .eq('company_id', company_id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (pendingInvite && !body.resend) {
    return NextResponse.json({
      error: '이미 대기 중인 초대가 있습니다. 재발송하려면 초대 목록에서 "재발송" 버튼을 눌러주세요.',
      existing_id: pendingInvite.id,
    }, { status: 409 })
  }

  // 기존 초대 재발송인 경우 기존 데이터 사용
  if (pendingInvite && body.resend) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hmseok.com'
    const inviteUrl = `${siteUrl}/invite/${pendingInvite.token}`
    const expiresDate = new Date(pendingInvite.expires_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    // ★ resend 경로에서도 회사명 조회 (company는 아래에서 정의되므로 별도 조회)
    const { data: resendCompany } = await sb.from('companies').select('name').eq('id', company_id).single()
    const companyName = resendCompany?.name || '회사'
    const roleLabel = role === 'master' ? '관리자' : '직원'

    let emailSent = false
    let emailError = ''
    let kakaoResult: { success: boolean; error?: string; method?: string } = { success: false }

    // 이메일 재발송
    if (send_channel === 'email' || send_channel === 'both') {
      const resendApiKey = process.env.RESEND_API_KEY
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@self-disruption.com'
      if (resendApiKey) {
        try {
          const resend = new Resend(resendApiKey)
          await resend.emails.send({
            from: `Self-Disruption <${fromEmail}>`,
            to: email,
            subject: `[Self-Disruption] ${companyName}에서 초대합니다`,
            html: `
              <div style="font-family: 'Apple SD Gothic Neo', -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <div style="display: inline-block; background: #1B3A5C; color: white; font-size: 11px; font-weight: 900; padding: 4px 12px; border-radius: 6px; letter-spacing: 1px;">SELF-DISRUPTION</div>
                </div>
                <h2 style="color: #0f172a; margin: 0 0 8px; text-align: center;">멤버 초대</h2>
                <p style="color: #64748b; font-size: 14px; margin: 0 0 24px; text-align: center;">
                  <strong style="color: #0369a1;">${companyName}</strong>의 새로운 멤버로 초대되었습니다.
                </p>
                <div style="text-align: center; margin-bottom: 24px;">
                  <a href="${inviteUrl}" style="display: inline-block; background: #1B3A5C; color: white; padding: 14px 48px; border-radius: 12px; font-weight: 900; font-size: 16px; text-decoration: none;">가입하기</a>
                </div>
                <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
                  <a href="${inviteUrl}" style="color: #0284c7; word-break: break-all;">${inviteUrl}</a>
                </p>
              </div>
            `,
          })
          emailSent = true
        } catch (err: any) {
          emailError = err.message
          console.error('[member-invite resend] 이메일 실패:', err.message)
        }
      } else {
        emailError = 'RESEND_API_KEY 미설정'
      }
    }

    // 카카오/SMS 재발송
    console.log('[member-invite resend] 발송 채널:', { send_channel, recipient_phone: !!recipient_phone })
    if (['kakao', 'sms', 'both'].includes(send_channel) && recipient_phone) {
      if (send_channel === 'sms') {
        kakaoResult = await sendInviteSMS(recipient_phone, getInviteSMSTemplate(companyName, inviteUrl, expiresDate), `[${companyName}] 멤버 초대`)
      } else {
        kakaoResult = await sendInviteKakao(recipient_phone, companyName, inviteUrl, expiresDate)
      }
      console.log('[member-invite resend] SMS/카카오 결과:', JSON.stringify(kakaoResult))
    }

    return NextResponse.json({
      success: true,
      resent: true,
      id: pendingInvite.id,
      token: pendingInvite.token,
      send_channel,
      emailSent,
      emailError: emailError || undefined,
      kakaoSent: kakaoResult.success,
      kakaoMethod: kakaoResult.method,
      kakaoError: kakaoResult.error,
      smsFallback: kakaoResult.method === 'sms',
      inviteUrl,
    })
  }

  // 회사명 조회
  const { data: company } = await sb
    .from('companies')
    .select('name')
    .eq('id', company_id)
    .single()

  // 직급/부서명 조회
  let positionName = ''
  let departmentName = ''
  if (position_id) {
    const { data: pos } = await sb.from('positions').select('name').eq('id', position_id).single()
    positionName = pos?.name || ''
  }
  if (department_id) {
    const { data: dept } = await sb.from('departments').select('name').eq('id', department_id).single()
    departmentName = dept?.name || ''
  }

  // 초대 생성 (72시간 유효)
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

  const { data: invitation, error: insertErr } = await sb
    .from('member_invitations')
    .insert({
      email,
      company_id,
      position_id: position_id || null,
      department_id: department_id || null,
      role,
      invited_by: admin.id,
      expires_at: expiresAt,
      page_permissions: page_permissions || [],
    })
    .select('id, token')
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // ── 발송 처리 ──
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hmseok.com'
  const inviteUrl = `${siteUrl}/invite/${invitation.token}`
  const expiresDate = new Date(expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const companyName = company?.name || '회사'
  const roleLabel = role === 'master' ? '관리자' : '직원'

  let emailSent = false
  let emailError = ''
  let kakaoResult: { success: boolean; error?: string; method?: string } = { success: false }

  // 이메일 발송 (email 또는 both)
  if (send_channel === 'email' || send_channel === 'both') {
    const resendApiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@self-disruption.com'
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey)
        await resend.emails.send({
          from: `Self-Disruption <${fromEmail}>`,
          to: email,
          subject: `[Self-Disruption] ${companyName}에서 초대합니다`,
          html: `
            <div style="font-family: 'Apple SD Gothic Neo', -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background: #1B3A5C; color: white; font-size: 11px; font-weight: 900; padding: 4px 12px; border-radius: 6px; letter-spacing: 1px;">SELF-DISRUPTION</div>
              </div>
              <h2 style="color: #0f172a; margin: 0 0 8px; text-align: center;">멤버 초대</h2>
              <p style="color: #64748b; font-size: 14px; margin: 0 0 24px; text-align: center;">
                <strong style="color: #0369a1;">${companyName}</strong>의 새로운 멤버로 초대되었습니다.
              </p>
              <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <table style="width: 100%; font-size: 14px; color: #334155;">
                  <tr><td style="padding: 6px 0; color: #94a3b8;">소속 회사</td><td style="padding: 6px 0; font-weight: 700;">${companyName}</td></tr>
                  ${departmentName ? `<tr><td style="padding: 6px 0; color: #94a3b8;">부서</td><td style="padding: 6px 0; font-weight: 700;">${departmentName}</td></tr>` : ''}
                  ${positionName ? `<tr><td style="padding: 6px 0; color: #94a3b8;">직급</td><td style="padding: 6px 0; font-weight: 700;">${positionName}</td></tr>` : ''}
                  <tr><td style="padding: 6px 0; color: #94a3b8;">권한</td><td style="padding: 6px 0; font-weight: 700;">${roleLabel}</td></tr>
                  <tr><td style="padding: 6px 0; color: #94a3b8;">만료</td><td style="padding: 6px 0; color: #ef4444;">${expiresDate}</td></tr>
                </table>
              </div>
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${inviteUrl}" style="display: inline-block; background: #1B3A5C; color: white; padding: 14px 48px; border-radius: 12px; font-weight: 900; font-size: 16px; text-decoration: none;">가입하기</a>
              </div>
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
                위 버튼이 작동하지 않으면 아래 링크를 브라우저에 직접 붙여넣으세요.<br/>
                <a href="${inviteUrl}" style="color: #0284c7; word-break: break-all;">${inviteUrl}</a>
              </p>
            </div>
          `,
        })
        emailSent = true
      } catch (err: any) {
        emailError = err.message
        console.error('[member-invite] 이메일 발송 실패:', err.message)
      }
    } else {
      emailError = 'RESEND_API_KEY 미설정'
      console.error('[member-invite] RESEND_API_KEY 환경변수 없음')
    }
  }

  // 카카오/SMS 발송 (kakao, sms, both)
  console.log('[member-invite] 발송 채널 확인:', { send_channel, recipient_phone: !!recipient_phone, willSendSMS: ['kakao', 'sms', 'both'].includes(send_channel) && !!recipient_phone })
  if (['kakao', 'sms', 'both'].includes(send_channel) && recipient_phone) {
    console.log('[member-invite] 카카오/SMS 발송 시도:', { send_channel, recipient_phone })
    if (send_channel === 'sms') {
      const smsMsg = getInviteSMSTemplate(companyName, inviteUrl, expiresDate)
      kakaoResult = await sendInviteSMS(recipient_phone, smsMsg, `[${companyName}] 멤버 초대`)
    } else {
      kakaoResult = await sendInviteKakao(recipient_phone, companyName, inviteUrl, expiresDate)
    }
    console.log('[member-invite] 카카오/SMS 결과:', JSON.stringify(kakaoResult))
  } else {
    console.log('[member-invite] SMS 발송 건너뜀 - send_channel:', send_channel, 'recipient_phone:', recipient_phone || '(비어있음)')
  }

  return NextResponse.json({
    success: true,
    id: invitation.id,
    token: invitation.token,
    expires_at: expiresAt,
    send_channel,
    emailSent,
    emailError: emailError || undefined,
    kakaoSent: kakaoResult.success,
    kakaoMethod: kakaoResult.method,
    kakaoError: kakaoResult.error,
    smsFallback: kakaoResult.method === 'sms',
    inviteUrl,
  })
  } catch (err: any) {
    console.error('[member-invite POST] Unhandled error:', err.message, err.stack)
    return NextResponse.json({ error: `서버 오류: ${err.message}` }, { status: 500 })
  }
}

// GET: 초대 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('company_id') || admin.company_id
    const statusFilter = searchParams.get('status')

    // master는 자기 회사만
    if (admin.role === 'master' && companyId !== admin.company_id) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const sb = getSupabaseAdmin()

    // 먼저 기본 쿼리 (조인 없이)
    let query = sb
      .from('member_invitations')
      .select('id, email, token, role, status, created_at, expires_at, accepted_at, invited_by, position_id, department_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) {
      console.error('[member-invite GET] query error:', error)
      return NextResponse.json({ error: error.message, detail: error }, { status: 500 })
    }

    // 수동으로 position, department, inviter 조인
    const positionIds = [...new Set((data || []).map((inv: any) => inv.position_id).filter(Boolean))]
    const departmentIds = [...new Set((data || []).map((inv: any) => inv.department_id).filter(Boolean))]
    const inviterIds = [...new Set((data || []).map((inv: any) => inv.invited_by).filter(Boolean))]

    let positionMap: Record<string, any> = {}
    let departmentMap: Record<string, any> = {}
    let inviterMap: Record<string, string> = {}

    if (positionIds.length > 0) {
      const { data: positions } = await sb.from('positions').select('id, name').in('id', positionIds)
      if (positions) positionMap = Object.fromEntries(positions.map((p: any) => [p.id, { id: p.id, name: p.name }]))
    }
    if (departmentIds.length > 0) {
      const { data: departments } = await sb.from('departments').select('id, name').in('id', departmentIds)
      if (departments) departmentMap = Object.fromEntries(departments.map((d: any) => [d.id, { id: d.id, name: d.name }]))
    }
    if (inviterIds.length > 0) {
      const { data: inviters } = await sb.from('profiles').select('id, employee_name').in('id', inviterIds)
      if (inviters) inviterMap = Object.fromEntries(inviters.map((p: any) => [p.id, p.employee_name || '']))
    }

    // 데이터 합침
    const enrichedData = (data || []).map((inv: any) => ({
      ...inv,
      position: inv.position_id ? positionMap[inv.position_id] || null : null,
      department: inv.department_id ? departmentMap[inv.department_id] || null : null,
      inviter: inv.invited_by ? { employee_name: inviterMap[inv.invited_by] || '' } : null,
    }))

    // 만료된 pending 초대를 자동으로 expired로 표시
    const now = new Date().toISOString()
    const expired = enrichedData.filter(
      (inv: any) => inv.status === 'pending' && inv.expires_at < now
    )
    if (expired.length > 0) {
      await sb
        .from('member_invitations')
        .update({ status: 'expired' })
        .in('id', expired.map((e: any) => e.id))
      expired.forEach((e: any) => { e.status = 'expired' })
    }

    return NextResponse.json({ data: enrichedData, total: enrichedData.length })
  } catch (err: any) {
    console.error('[member-invite GET] unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}

// DELETE: 초대 취소
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const inviteId = searchParams.get('id')

  if (!inviteId) return NextResponse.json({ error: '초대 ID가 필요합니다.' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // 초대 조회
  const { data: invite } = await sb
    .from('member_invitations')
    .select('company_id, status')
    .eq('id', inviteId)
    .single()

  if (!invite) return NextResponse.json({ error: '초대를 찾을 수 없습니다.' }, { status: 404 })

  // master는 자기 회사만
  if (admin.role === 'master' && invite.company_id !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: '대기 중인 초대만 취소할 수 있습니다.' }, { status: 400 })
  }

  const { error } = await sb
    .from('member_invitations')
    .update({ status: 'canceled' })
    .eq('id', inviteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
