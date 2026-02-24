import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 초대 수락 처리 (가입 완료 후 호출)
// - profile 생성 (company_id, position_id, department_id 연결)
// - 초대 상태 accepted로 변경
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, user_id, name, phone } = body

  if (!token || !user_id || !name) {
    return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // 1. 초대 정보 조회
  const { data: invite, error: inviteErr } = await sb
    .from('member_invitations')
    .select('id, email, company_id, role, position_id, department_id, status, expires_at')
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

  // 2. profile이 이미 있는지 확인 (handle_new_user 트리거가 먼저 만들었을 수 있음)
  const { data: existingProfile } = await sb
    .from('profiles')
    .select('id')
    .eq('id', user_id)
    .single()

  if (existingProfile) {
    // 이미 있으면 업데이트
    const { error: updateErr } = await sb
      .from('profiles')
      .update({
        company_id: invite.company_id,
        role: invite.role,
        position_id: invite.position_id,
        department_id: invite.department_id,
        employee_name: name,
        phone: phone || null,
        is_active: true,
      })
      .eq('id', user_id)

    if (updateErr) {
      return NextResponse.json({ error: 'profile 업데이트 실패: ' + updateErr.message }, { status: 500 })
    }
  } else {
    // 없으면 생성
    const { error: insertErr } = await sb
      .from('profiles')
      .insert({
        id: user_id,
        email: invite.email,
        company_id: invite.company_id,
        role: invite.role,
        position_id: invite.position_id,
        department_id: invite.department_id,
        employee_name: name,
        phone: phone || null,
        is_active: true,
      })

    if (insertErr) {
      return NextResponse.json({ error: 'profile 생성 실패: ' + insertErr.message }, { status: 500 })
    }
  }

  // 3. 초대 상태 업데이트
  await sb
    .from('member_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: user_id,
    })
    .eq('id', invite.id)

  return NextResponse.json({ success: true, company_id: invite.company_id })
}
