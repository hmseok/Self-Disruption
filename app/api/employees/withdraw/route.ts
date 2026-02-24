import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// 직원 탈퇴 API
// - profile 비활성화 + 회사 연결 해제
// - Supabase Auth 사용자 삭제 (선택)
// - master/god_admin만 가능
// ============================================

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  try {
    // 1. 요청자 인증 확인 (Authorization 헤더에서 JWT 추출)
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()

    // JWT에서 사용자 정보 가져오기
    const { data: { user: authUser }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !authUser) {
      return NextResponse.json({ error: '유효하지 않은 인증입니다.' }, { status: 401 })
    }

    // 2. 요청자 권한 확인
    const { data: requester } = await sb
      .from('profiles')
      .select('id, role, company_id')
      .eq('id', authUser.id)
      .single()

    if (!requester || !['god_admin', 'master'].includes(requester.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    // 3. 요청 파싱
    const body = await request.json()
    const { employee_id, delete_auth } = body

    if (!employee_id) {
      return NextResponse.json({ error: '직원 ID가 필요합니다.' }, { status: 400 })
    }

    // 4. 대상 직원 조회
    const { data: target, error: targetErr } = await sb
      .from('profiles')
      .select('id, email, role, company_id, employee_name')
      .eq('id', employee_id)
      .single()

    if (targetErr || !target) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 5. 권한 검증
    // - 자기 자신은 탈퇴 불가
    if (target.id === requester.id) {
      return NextResponse.json({ error: '자기 자신은 탈퇴시킬 수 없습니다.' }, { status: 400 })
    }
    // - god_admin은 다른 god_admin 탈퇴 불가
    if (target.role === 'god_admin') {
      return NextResponse.json({ error: 'GOD ADMIN은 탈퇴시킬 수 없습니다.' }, { status: 403 })
    }
    // - master는 자기 회사 직원만
    if (requester.role === 'master' && target.company_id !== requester.company_id) {
      return NextResponse.json({ error: '다른 회사의 직원은 탈퇴시킬 수 없습니다.' }, { status: 403 })
    }

    // 6. profile 비활성화 + 회사/직급/부서 연결 해제
    const { error: updateErr } = await sb
      .from('profiles')
      .update({
        is_active: false,
        company_id: null,
        position_id: null,
        department_id: null,
        role: 'user',
        withdrawn_at: new Date().toISOString(),
        withdrawn_by: requester.id,
      })
      .eq('id', employee_id)

    if (updateErr) {
      console.error('직원 탈퇴 profile 업데이트 실패:', updateErr)
      return NextResponse.json({ error: 'profile 업데이트 실패: ' + updateErr.message }, { status: 500 })
    }

    // 7. Auth 사용자 완전 삭제 (옵션)
    if (delete_auth) {
      const { error: authDeleteErr } = await sb.auth.admin.deleteUser(employee_id)
      if (authDeleteErr) {
        console.error('Auth 사용자 삭제 실패 (profile은 이미 비활성화됨):', authDeleteErr)
        // Auth 삭제 실패해도 profile 비활성화는 유지
      }
    }

    // 8. 해당 직원의 관련 초대도 canceled 처리
    await sb
      .from('member_invitations')
      .update({ status: 'canceled' })
      .eq('email', target.email)
      .eq('status', 'pending')

    return NextResponse.json({
      success: true,
      message: `${target.employee_name || target.email} 직원이 탈퇴 처리되었습니다.`,
      deleted_auth: !!delete_auth,
    })
  } catch (error: any) {
    console.error('직원 탈퇴 처리 오류:', error)
    return NextResponse.json({ error: '서버 오류: ' + error.message }, { status: 500 })
  }
}
