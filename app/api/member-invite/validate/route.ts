import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 초대 토큰 검증 (공개 API - 인증 불필요)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 })
  }

  const { data: invite, error } = await getSupabaseAdmin()
    .from('member_invitations')
    .select(`
      id, email, role, status, expires_at,
      company:company_id(name),
      position:position_id(name),
      department:department_id(name)
    `)
    .eq('token', token)
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: '유효하지 않은 초대입니다.', reason: 'invalid' }, { status: 404 })
  }

  if (invite.status === 'accepted') {
    return NextResponse.json({ error: '이미 사용된 초대입니다.', reason: 'used' }, { status: 410 })
  }

  if (invite.status === 'canceled') {
    return NextResponse.json({ error: '취소된 초대입니다.', reason: 'canceled' }, { status: 410 })
  }

  if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: '만료된 초대입니다.', reason: 'expired' }, { status: 410 })
  }

  return NextResponse.json(invite)
}
