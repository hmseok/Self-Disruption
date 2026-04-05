import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import {
  sendSMS, sendEmail, sendKakaoAlimtalk, logMessageSend,
  sendWithTemplate, renderTemplate, buildEmailHTML, buildInfoTableHTML,
} from '../../utils/messaging'

// ============================================
// 멤버 초대 API (Prisma 버전)
// POST   → 초대 생성 + 이메일/카카오/SMS 발송
// GET    → 초대 목록 조회
// DELETE → 초대 취소 (status='canceled')
// ============================================

// MySQL DATETIME 형식 변환 (ISO → 'YYYY-MM-DD HH:MM:SS')
function toMySQLDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

async function verifyAdmin(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user || !['admin', 'master'].includes(user.role)) return null
  return { id: user.id, role: user.role }
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
  let kakaoResult: { success: boolean; error?: string; method?: string; resultCode?: string } = { success: false }

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
      email, position_id, department_id, role = 'user',
      send_channel = 'email',
      recipient_phone = '',
      page_permissions = [],
    } = body

    console.log('[member-invite POST] 요청:', {
      email, send_channel,
      recipient_phone: recipient_phone ? recipient_phone.substring(0, 7) + '***' : '(없음)',
      role, resend: !!body.resend,
    })

    if (!email) {
      return NextResponse.json({ error: '이메일이 필요합니다.' }, { status: 400 })
    }
    if (['kakao', 'sms', 'both'].includes(send_channel) && !recipient_phone) {
      return NextResponse.json({ error: '카카오/SMS 발송 시 전화번호가 필요합니다.' }, { status: 400 })
    }

    // Note: company_id validation removed as company_id is no longer in profiles table
    if (role === 'admin' && admin.role !== 'admin') {
      return NextResponse.json({ error: '관리자 초대는 플랫폼 관리자만 가능합니다.' }, { status: 403 })
    }

    // 단독 ERP: companies 테이블 조회 시도, 없으면 기본값
    let company_id = 'fmi-single'
    let companyName = '주식회사 에프엠아이'
    try {
      const fmiCompanies = await prisma.$queryRaw<any[]>`SELECT id, name FROM companies LIMIT 1`
      if (fmiCompanies.length > 0) {
        company_id = fmiCompanies[0].id
        companyName = fmiCompanies[0].name || companyName
      }
    } catch {
      // companies 테이블 미존재 시 기본값 사용
    }

    // 이미 가입된 이메일 확인
    const existingProfile = await prisma.$queryRaw<any[]>`
      SELECT id FROM profiles WHERE email = ${email} LIMIT 1
    `
    if (existingProfile.length > 0) {
      return NextResponse.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 })
    }

    // 중복 pending 초대 확인
    const pendingInvites = await prisma.$queryRaw<any[]>`
      SELECT id, token, expires_at FROM member_invitations
      WHERE email = ${email} AND status = 'pending' AND expires_at > ${toMySQLDatetime(new Date())}
      LIMIT 1
    `
    const pendingInvite = pendingInvites.length > 0 ? pendingInvites[0] : null

    if (pendingInvite && !body.resend) {
      return NextResponse.json({
        error: '이미 대기 중인 초대가 있습니다. 재발송하려면 초대 목록에서 "재발송" 버튼을 눌러주세요.',
        existing_id: pendingInvite.id,
      }, { status: 409 })
    }


    const roleLabel = role === 'admin' ? '관리자' : '직원'

    // 직급/부서명 조회
    let positionName = ''
    let departmentName = ''
    if (position_id) {
      const positions = await prisma.$queryRaw<any[]>`
        SELECT name FROM positions WHERE id = ${position_id} LIMIT 1
      `
      positionName = positions.length > 0 ? positions[0].name : ''
    }
    if (department_id) {
      const departments = await prisma.$queryRaw<any[]>`
        SELECT name FROM departments WHERE id = ${department_id} LIMIT 1
      `
      departmentName = departments.length > 0 ? departments[0].name : ''
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
    const crypto = require('crypto')
    const expiresAt = toMySQLDatetime(new Date(Date.now() + 72 * 60 * 60 * 1000))
    const invitationToken = crypto.randomBytes(16).toString('hex')
    const invitationId = crypto.randomUUID()

    await prisma.$executeRaw`
      INSERT INTO member_invitations
      (id, email, company_id, position_id, department_id, role, invited_by, expires_at, page_permissions, token, status, created_at)
      VALUES (
        ${invitationId}, ${email}, ${company_id},
        ${position_id || null}, ${department_id || null},
        ${role}, ${admin.id}, ${expiresAt},
        ${JSON.stringify(page_permissions || [])},
        ${invitationToken}, 'pending', NOW()
      )
    `

    const invitation = { id: invitationId, token: invitationToken }

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
    const companyId = searchParams.get('company_id')
    const statusFilter = searchParams.get('status')

    // 단독 ERP: company_id 없어도 전체 조회 가능
    let query = `SELECT id, email, token, role, status, created_at, expires_at, accepted_at, invited_by, position_id, department_id FROM member_invitations`
    const params: any[] = []

    if (statusFilter) {
      query += ` WHERE status = ?`
      params.push(statusFilter)
    }
    query += ` ORDER BY created_at DESC`

    let data: any[] = []
    try {
      data = await prisma.$queryRawUnsafe<any[]>(query, ...params)
    } catch (e: any) {
      // member_invitations 테이블 미존재 시 빈 배열 반환
      if (e.message?.includes("doesn't exist")) {
        return NextResponse.json({ data: [], total: 0 })
      }
      throw e
    }

    // 수동 조인
    const positionIds = [...new Set((data || []).map((inv: any) => inv.position_id).filter(Boolean))]
    const departmentIds = [...new Set((data || []).map((inv: any) => inv.department_id).filter(Boolean))]
    const inviterIds = [...new Set((data || []).map((inv: any) => inv.invited_by).filter(Boolean))]

    let positionMap: Record<string, any> = {}
    let departmentMap: Record<string, any> = {}
    let inviterMap: Record<string, string> = {}

    if (positionIds.length > 0) {
      const positions = await prisma.$queryRaw<any[]>`
        SELECT id, name FROM positions WHERE id IN (${positionIds.join(',')})
      `
      if (positions) positionMap = Object.fromEntries(positions.map((p: any) => [p.id, { id: p.id, name: p.name }]))
    }
    if (departmentIds.length > 0) {
      const departments = await prisma.$queryRaw<any[]>`
        SELECT id, name FROM departments WHERE id IN (${departmentIds.join(',')})
      `
      if (departments) departmentMap = Object.fromEntries(departments.map((d: any) => [d.id, { id: d.id, name: d.name }]))
    }
    if (inviterIds.length > 0) {
      const inviters = await prisma.$queryRaw<any[]>`
        SELECT id, employee_name FROM profiles WHERE id IN (${inviterIds.join(',')})
      `
      if (inviters) inviterMap = Object.fromEntries(inviters.map((p: any) => [p.id, p.employee_name || '']))
    }

    const enrichedData = (data || []).map((inv: any) => ({
      ...inv,
      position: inv.position_id ? positionMap[inv.position_id] || null : null,
      department: inv.department_id ? departmentMap[inv.department_id] || null : null,
      inviter: inv.invited_by ? { employee_name: inviterMap[inv.invited_by] || '' } : null,
    }))

    // 만료 처리
    const now = new Date()
    const expired = enrichedData.filter((inv: any) => inv.status === 'pending' && new Date(inv.expires_at) < now)
    if (expired.length > 0) {
      await prisma.$executeRaw`
        UPDATE member_invitations SET status = 'expired' WHERE id IN (${expired.map((e: any) => e.id).join(',')})
      `
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

  const invites = await prisma.$queryRaw<any[]>`
    SELECT company_id, status FROM member_invitations WHERE id = ${inviteId} LIMIT 1
  `
  const invite = invites.length > 0 ? invites[0] : null

  if (!invite) return NextResponse.json({ error: '초대를 찾을 수 없습니다.' }, { status: 404 })

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: '대기 중인 초대만 취소할 수 있습니다.' }, { status: 400 })
  }

  await prisma.$executeRaw`
    UPDATE member_invitations SET status = 'canceled' WHERE id = ${inviteId}
  `
  return NextResponse.json({ success: true })
}
