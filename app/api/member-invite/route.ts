import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendSMS, sendEmail, sendKakaoAlimtalk, logMessageSend,
  sendWithTemplate, renderTemplate, buildEmailHTML, buildInfoTableHTML,
} from '../../utils/messaging'

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
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')
  if (!token || token === 'undefined' || token === 'null') return null

  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await getSupabaseAdmin()
    .from('profiles')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['god_admin', 'master'].includes(profile.role)) return null
  return { ...user, role: profile.role, company_id: profile.company_id }
}

// ── 폴백용 하드코딩 SMS 템플릿 ──
function getInviteSMSFallback(companyName: string, inviteUrl: string, expiresDate: string) {
  return `[${companyName}] 멤버 초대\n${companyName}에서 새로운 멤버로 초대합니다.\n아래 링크에서 가입을 완료해 주세요.\n${inviteUrl}\n만료: ${expiresDate}`
}

// ── 폴백용 하드코딩 이메일 HTML ──
function getInviteEmailFallback(vars: {
  companyName: string; inviteUrl: string; expiresDate: string;
  departmentName?: string; positionName?: string; roleLabel: string;
}) {
  const rows = [
    { label: '소속 회사', value: vars.companyName },
    ...(vars.departmentName ? [{ label: '부서', value: vars.departmentName }] : []),
    ...(vars.positionName ? [{ label: '직급', value: vars.positionName }] : []),
    { label: '권한', value: vars.roleLabel },
    { label: '만료', value: vars.expiresDate, highlight: true },
  ]
  return buildEmailHTML({
    heading: '멤버 초대',
    subtitle: `<strong style="color: #0369a1;">${vars.companyName}</strong>의 새로운 멤버로 초대되었습니다.`,
    bodyContent: buildInfoTableHTML(rows),
    ctaText: '가입하기',
    ctaUrl: vars.inviteUrl,
  })
}

// ── 초대 발송 로직 (초대/재발송 공통) ──
async function sendInviteMessages(params: {
  send_channel: string
  email: string
  recipient_phone: string
  company_id: string
  companyName: string
  inviteUrl: string
  expiresDate: string
  departmentName: string
  positionName: string
  roleLabel: string
  invitationId: string
  adminId: string
}) {
  const {
    send_channel, email, recipient_phone, company_id,
    companyName, inviteUrl, expiresDate,
    departmentName, positionName, roleLabel,
    invitationId, adminId,
  } = params

  let emailSent = false
  let emailError = ''
  let kakaoResult: { success: boolean; error?: string; method?: string } = { success: false }

  const templateVars: Record<string, string> = {
    company_name: companyName,
    invite_url: inviteUrl,
    expires_date: expiresDate,
    role_label: roleLabel,
    department_name: departmentName || '',
    position_name: positionName || '',
  }

  // ── 이메일 발송 ──
  if (send_channel === 'email' || send_channel === 'both') {
    // DB 템플릿 시도
    const templateResult = await sendWithTemplate({
      companyId: company_id,
      templateKey: 'member_invite',
      channel: 'email',
      recipient: email,
      variables: templateVars,
      relatedType: 'invite',
      relatedId: invitationId,
      sentBy: adminId,
    })

    if (templateResult.success) {
      emailSent = true
    } else {
      // 폴백: 하드코딩 HTML로 발송
      console.log('[member-invite] DB 템플릿 실패, 폴백 발송:', templateResult.error)
      const emailHtml = getInviteEmailFallback({
        companyName, inviteUrl, expiresDate, departmentName, positionName, roleLabel,
      })
      const fallbackResult = await sendEmail({
        to: email,
        subject: `[Self-Disruption] ${companyName}에서 초대합니다`,
        html: emailHtml,
      })
      emailSent = fallbackResult.success
      emailError = fallbackResult.error || ''

      // 폴백 발송도 로깅
      try {
        await logMessageSend({
          companyId: company_id,
          templateKey: 'member_invite',
          channel: 'email',
          recipient: email,
          subject: `[Self-Disruption] ${companyName}에서 초대합니다`,
          body: '(fallback HTML)',
          status: fallbackResult.success ? 'sent' : 'failed',
          resultCode: fallbackResult.resultCode,
          errorDetail: fallbackResult.error,
          relatedType: 'invite',
          relatedId: invitationId,
          sentBy: adminId,
        })
      } catch {}
    }
  }

  // ── 카카오/SMS 발송 ──
  if (['kakao', 'sms', 'both'].includes(send_channel) && recipient_phone) {
    if (send_channel === 'sms') {
      // SMS: DB 템플릿 시도
      const templateResult = await sendWithTemplate({
        companyId: company_id,
        templateKey: 'member_invite',
        channel: 'sms',
        recipient: recipient_phone,
        variables: templateVars,
        relatedType: 'invite',
        relatedId: invitationId,
        sentBy: adminId,
      })

      if (templateResult.success) {
        kakaoResult = { success: true, method: 'sms' }
      } else {
        // 폴백
        console.log('[member-invite] SMS DB 템플릿 실패, 폴백:', templateResult.error)
        const smsMsg = getInviteSMSFallback(companyName, inviteUrl, expiresDate)
        kakaoResult = await sendSMS({ phone: recipient_phone, message: smsMsg, title: `[${companyName}] 멤버 초대` })
        try {
          await logMessageSend({
            companyId: company_id, templateKey: 'member_invite', channel: 'sms',
            recipient: recipient_phone, body: smsMsg,
            status: kakaoResult.success ? 'sent' : 'failed',
            resultCode: kakaoResult.resultCode, errorDetail: kakaoResult.error,
            relatedType: 'invite', relatedId: invitationId, sentBy: adminId,
          })
        } catch {}
      }
    } else {
      // 카카오 알림톡 (기존 로직 유지 - 카카오는 DB 템플릿이 아닌 알리고 전용 템플릿 사용)
      const smsMsg = getInviteSMSFallback(companyName, inviteUrl, expiresDate)
      kakaoResult = await sendKakaoAlimtalk({
        phone: recipient_phone,
        templateCode: 'TI_0001',
        templateVars: { company_name: companyName, invite_url: inviteUrl, expires_date: expiresDate },
        smsMessage: smsMsg,
        smsTitle: `[${companyName}] 멤버 초대`,
        buttons: [{ name: '가입하기', linkType: 'WL', linkTypeName: '웹링크', linkMo: inviteUrl, linkPc: inviteUrl }],
      })
      try {
        await logMessageSend({
          companyId: company_id, templateKey: 'member_invite',
          channel: kakaoResult.method === 'sms' ? 'sms' : 'kakao',
          recipient: recipient_phone, body: smsMsg,
          status: kakaoResult.success ? 'sent' : 'failed',
          resultCode: kakaoResult.resultCode, errorDetail: kakaoResult.error,
          relatedType: 'invite', relatedId: invitationId, sentBy: adminId,
        })
      } catch {}
    }
  }

  return { emailSent, emailError, kakaoResult }
}


// POST: 초대 생성 + 발송 (이메일/카카오/SMS)
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

    const body = await request.json()
    const {
      email, company_id, position_id, department_id, role = 'user',
      send_channel = 'email',
      recipient_phone = '',
      page_permissions = [],
    } = body

    console.log('[member-invite POST] 요청:', {
      email, company_id, send_channel,
      recipient_phone: recipient_phone ? recipient_phone.substring(0, 7) + '***' : '(없음)',
      role, resend: !!body.resend,
    })

    if (!email || !company_id) {
      return NextResponse.json({ error: '이메일과 회사 ID가 필요합니다.' }, { status: 400 })
    }
    if (['kakao', 'sms', 'both'].includes(send_channel) && !recipient_phone) {
      return NextResponse.json({ error: '카카오/SMS 발송 시 전화번호가 필요합니다.' }, { status: 400 })
    }

    if (admin.role === 'master' && admin.company_id !== company_id) {
      return NextResponse.json({ error: '자기 회사에만 초대할 수 있습니다.' }, { status: 403 })
    }
    if (role === 'master' && admin.role !== 'god_admin') {
      return NextResponse.json({ error: '관리자 초대는 플랫폼 관리자만 가능합니다.' }, { status: 403 })
    }

    const sb = getSupabaseAdmin()

    // 이미 가입된 이메일 확인
    const { data: existingProfile } = await sb.from('profiles').select('id').eq('email', email).single()
    if (existingProfile) {
      return NextResponse.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 })
    }

    // 중복 pending 초대 확인
    const { data: pendingInvite } = await sb
      .from('member_invitations')
      .select('id, token, expires_at')
      .eq('email', email).eq('company_id', company_id)
      .eq('status', 'pending').gt('expires_at', new Date().toISOString())
      .single()

    if (pendingInvite && !body.resend) {
      return NextResponse.json({
        error: '이미 대기 중인 초대가 있습니다. 재발송하려면 초대 목록에서 "재발송" 버튼을 눌러주세요.',
        existing_id: pendingInvite.id,
      }, { status: 409 })
    }

    // 회사명 조회
    const { data: company } = await sb.from('companies').select('name').eq('id', company_id).single()
    const companyName = company?.name || '회사'
    const roleLabel = role === 'master' ? '관리자' : '직원'

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

    // ── 재발송 경로 ──
    if (pendingInvite && body.resend) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hmseok.com'
      const inviteUrl = `${siteUrl}/invite/${pendingInvite.token}`
      const expiresDate = new Date(pendingInvite.expires_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

      const result = await sendInviteMessages({
        send_channel, email, recipient_phone, company_id,
        companyName, inviteUrl, expiresDate,
        departmentName, positionName, roleLabel,
        invitationId: pendingInvite.id, adminId: admin.id,
      })

      return NextResponse.json({
        success: true, resent: true, id: pendingInvite.id, token: pendingInvite.token,
        send_channel, emailSent: result.emailSent, emailError: result.emailError || undefined,
        kakaoSent: result.kakaoResult.success, kakaoMethod: result.kakaoResult.method,
        kakaoError: result.kakaoResult.error, smsFallback: result.kakaoResult.method === 'sms',
        inviteUrl,
      })
    }

    // ── 신규 초대 생성 ──
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

    const { data: invitation, error: insertErr } = await sb
      .from('member_invitations')
      .insert({
        email, company_id,
        position_id: position_id || null,
        department_id: department_id || null,
        role, invited_by: admin.id,
        expires_at: expiresAt,
        page_permissions: page_permissions || [],
      })
      .select('id, token')
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hmseok.com'
    const inviteUrl = `${siteUrl}/invite/${invitation.token}`
    const expiresDate = new Date(expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

    const result = await sendInviteMessages({
      send_channel, email, recipient_phone, company_id,
      companyName, inviteUrl, expiresDate,
      departmentName, positionName, roleLabel,
      invitationId: invitation.id, adminId: admin.id,
    })

    return NextResponse.json({
      success: true, id: invitation.id, token: invitation.token, expires_at: expiresAt,
      send_channel, emailSent: result.emailSent, emailError: result.emailError || undefined,
      kakaoSent: result.kakaoResult.success, kakaoMethod: result.kakaoResult.method,
      kakaoError: result.kakaoResult.error, smsFallback: result.kakaoResult.method === 'sms',
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

    if (admin.role === 'master' && companyId !== admin.company_id) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const sb = getSupabaseAdmin()

    let query = sb
      .from('member_invitations')
      .select('id, email, token, role, status, created_at, expires_at, accepted_at, invited_by, position_id, department_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error } = await query

    if (error) {
      console.error('[member-invite GET] query error:', error)
      return NextResponse.json({ error: error.message, detail: error }, { status: 500 })
    }

    // 수동 조인
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

    const enrichedData = (data || []).map((inv: any) => ({
      ...inv,
      position: inv.position_id ? positionMap[inv.position_id] || null : null,
      department: inv.department_id ? departmentMap[inv.department_id] || null : null,
      inviter: inv.invited_by ? { employee_name: inviterMap[inv.invited_by] || '' } : null,
    }))

    // 만료 처리
    const now = new Date().toISOString()
    const expired = enrichedData.filter((inv: any) => inv.status === 'pending' && inv.expires_at < now)
    if (expired.length > 0) {
      await sb.from('member_invitations').update({ status: 'expired' }).in('id', expired.map((e: any) => e.id))
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

  const { data: invite } = await sb
    .from('member_invitations')
    .select('company_id, status')
    .eq('id', inviteId)
    .single()

  if (!invite) return NextResponse.json({ error: '초대를 찾을 수 없습니다.' }, { status: 404 })

  if (admin.role === 'master' && invite.company_id !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: '대기 중인 초대만 취소할 수 있습니다.' }, { status: 400 })
  }

  const { error } = await sb.from('member_invitations').update({ status: 'canceled' }).eq('id', inviteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
