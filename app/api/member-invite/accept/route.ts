import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 초대 수락 처리 (전체를 서버에서 처리)
// 1. Admin API로 Auth 사용자 생성 (인증메일 발송 없음)
// 2. profile 생성/업데이트 (company_id, position_id, department_id 연결)
// 3. 초대 상태 accepted로 변경
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, name, phone, password } = body

  if (!token || !name || !password) {
    return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // 1. 초대 정보 조회
  const { data: invite, error: inviteErr } = await sb
    .from('member_invitations')
    .select('id, email, company_id, role, position_id, department_id, status, expires_at, page_permissions')
    .eq('token', token)
    .single()

  if (inviteErr || !invite) {
    return NextResponse.json({ error: '유효하지 않은 초대입니다.' }, { status: 404 })
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: '이미 처리된 초대입니다.' }, { status: 400 })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: '만료된 초대입니다.' }, { status: 410 })
  }

  // 2. Admin API로 Auth 사용자 생성 (인증메일 발송 없음, 즉시 확인됨)
  // ★ 메타데이터에 회사/역할 정보를 포함하여 handle_new_user 트리거에서 올바르게 처리
  const { data: authData, error: authError } = await sb.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,  // 이메일 인증 완료 상태로 생성
    user_metadata: {
      name,
      full_name: name,
      phone,
      invite_token: token,
      invite_company_id: invite.company_id,
      role: invite.role,
      position_id: invite.position_id || null,
      department_id: invite.department_id || null,
    },
  })

  if (authError) {
    // 이미 가입된 이메일인 경우
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      return NextResponse.json({
        error: '이미 가입된 이메일입니다. 로그인 페이지에서 로그인해주세요.',
        code: 'ALREADY_REGISTERED',
      }, { status: 409 })
    }
    console.error('Auth 사용자 생성 실패:', authError.message)
    return NextResponse.json({ error: '계정 생성 실패: ' + authError.message }, { status: 500 })
  }

  const userId = authData.user.id

  // 3. profile이 이미 있는지 확인 (handle_new_user 트리거가 만들었을 수 있음)
  const { data: existingProfile } = await sb
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  // ★ 트리거가 profile을 이미 생성했을 수 있으므로 재확인 (최대 3회)
  let profileExists = !!existingProfile
  if (!profileExists) {
    // 트리거 처리 대기 후 재확인
    for (let retry = 0; retry < 3; retry++) {
      await new Promise(r => setTimeout(r, 300))
      const { data: retryCheck } = await sb.from('profiles').select('id').eq('id', userId).single()
      if (retryCheck) { profileExists = true; break }
    }
  }

  const profilePayload = {
    email: invite.email,
    company_id: invite.company_id,
    role: invite.role,
    position_id: invite.position_id,
    department_id: invite.department_id,
    employee_name: name,
    phone: phone || null,
    is_active: true,
  }

  if (profileExists) {
    const { error: updateErr } = await sb
      .from('profiles')
      .update(profilePayload)
      .eq('id', userId)

    if (updateErr) {
      console.error('profile 업데이트 실패:', updateErr.message)
      return NextResponse.json({ error: 'profile 업데이트 실패: ' + updateErr.message }, { status: 500 })
    }

    // ★ 업데이트 후 company_id가 실제로 반영되었는지 검증
    const { data: verifyProfile } = await sb.from('profiles').select('company_id').eq('id', userId).single()
    if (!verifyProfile?.company_id) {
      console.error('profile company_id 반영 실패! 재시도합니다.', { userId, invite_company_id: invite.company_id })
      // 강제 재시도
      const { error: retryErr } = await sb
        .from('profiles')
        .update({ company_id: invite.company_id, role: invite.role, is_active: true })
        .eq('id', userId)
      if (retryErr) {
        console.error('profile 재시도도 실패:', retryErr.message)
        return NextResponse.json({ error: 'profile 회사 배정 실패. 관리자에게 문의하세요.' }, { status: 500 })
      }
    }
  } else {
    const { error: insertErr } = await sb
      .from('profiles')
      .insert({ id: userId, ...profilePayload })

    if (insertErr) {
      console.error('profile 생성 실패:', insertErr.message)
      return NextResponse.json({ error: 'profile 생성 실패: ' + insertErr.message }, { status: 500 })
    }
  }

  // 4. 페이지 권한 자동 생성 (초대 시 설정된 권한이 있는 경우)
  const pagePerms = invite.page_permissions as any[] || []
  if (pagePerms.length > 0) {
    const permsToInsert = pagePerms
      .filter((p: any) => p.can_view || p.can_create || p.can_edit || p.can_delete)
      .map((p: any) => ({
        company_id: invite.company_id,
        user_id: userId,
        page_path: p.page_path,
        can_view: p.can_view || false,
        can_create: p.can_create || false,
        can_edit: p.can_edit || false,
        can_delete: p.can_delete || false,
        data_scope: p.data_scope || 'all',
      }))

    if (permsToInsert.length > 0) {
      const { error: permErr } = await sb.from('user_page_permissions').insert(permsToInsert)
      if (permErr) {
        console.error('페이지 권한 생성 실패 (무시):', permErr.message)
      }
    }
  }

  // 5. 초대 상태 업데이트
  await sb
    .from('member_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq('id', invite.id)

  return NextResponse.json({ success: true, company_id: invite.company_id, email: invite.email })
}
