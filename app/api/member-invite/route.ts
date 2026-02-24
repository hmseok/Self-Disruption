import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// ============================================
// 멤버 초대 API
// POST   → 초대 생성 + Resend 이메일 발송
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

// POST: 초대 생성 + 이메일 발송
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const { email, company_id, position_id, department_id, role = 'user' } = body

  if (!email || !company_id) {
    return NextResponse.json({ error: '이메일과 회사 ID가 필요합니다.' }, { status: 400 })
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

  // 중복 pending 초대 확인
  const { data: pendingInvite } = await sb
    .from('member_invitations')
    .select('id')
    .eq('email', email)
    .eq('company_id', company_id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (pendingInvite) {
    return NextResponse.json({ error: '이미 대기 중인 초대가 있습니다.' }, { status: 409 })
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
    })
    .select('id, token')
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // 이메일 발송
  let emailSent = false
  let emailError = ''
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@self-disruption.com'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hmseok.com'

  if (apiKey) {
    try {
      const resend = new Resend(apiKey)
      const inviteUrl = `${siteUrl}/invite/${invitation.token}`
      const expiresDate = new Date(expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      const companyName = company?.name || '회사'
      const roleLabel = role === 'master' ? '관리자' : '직원'

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
    }
  } else {
    emailError = 'RESEND_API_KEY가 설정되지 않았습니다.'
  }

  return NextResponse.json({
    success: true,
    id: invitation.id,
    token: invitation.token,
    expires_at: expiresAt,
    emailSent,
    emailError: emailError || undefined,
    inviteUrl: `${siteUrl}/invite/${invitation.token}`,
  })
}

// GET: 초대 목록 조회
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id') || admin.company_id
  const status = searchParams.get('status')

  // master는 자기 회사만
  if (admin.role === 'master' && companyId !== admin.company_id) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  let query = getSupabaseAdmin()
    .from('member_invitations')
    .select(`
      id, email, token, role, status, created_at, expires_at, accepted_at,
      position:position_id(id, name),
      department:department_id(id, name),
      inviter:invited_by(employee_name)
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 만료된 pending 초대를 자동으로 expired로 표시
  const now = new Date().toISOString()
  const expired = (data || []).filter(
    (inv: any) => inv.status === 'pending' && inv.expires_at < now
  )
  if (expired.length > 0) {
    await getSupabaseAdmin()
      .from('member_invitations')
      .update({ status: 'expired' })
      .in('id', expired.map((e: any) => e.id))
    // 로컬 데이터도 업데이트
    expired.forEach((e: any) => { e.status = 'expired' })
  }

  return NextResponse.json({ data, total: data?.length || 0 })
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
