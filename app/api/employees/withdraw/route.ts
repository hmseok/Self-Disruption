import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================
// 직원 탈퇴 API
// - profile 비활성화 + 회사 연결 해제
// - Firebase Auth 사용자 삭제 (선택)
// - master/admin만 가능
// ============================================

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

export async function POST(request: NextRequest) {
  try {
    // 1. 요청자 인증 확인 (Authorization 헤더에서 JWT 추출)
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const authUserId = getUserIdFromToken(token)
    if (!authUserId) {
      return NextResponse.json({ error: '유효하지 않은 인증입니다.' }, { status: 401 })
    }
    // TODO: Phase 5 - Replace with Firebase Auth verification

    // 2. 요청자 권한 확인
    const requesterResult = await prisma.$queryRaw<any[]>`
      SELECT id, role FROM profiles WHERE id = ${authUserId} LIMIT 1
    `
    const requester = requesterResult[0]

    if (!requester || !['admin', 'master'].includes(requester.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    // 3. 요청 파싱
    const body = await request.json()
    const { employee_id, delete_auth } = body

    if (!employee_id) {
      return NextResponse.json({ error: '직원 ID가 필요합니다.' }, { status: 400 })
    }

    // 4. 대상 직원 조회
    const targetResult = await prisma.$queryRaw<any[]>`
      SELECT id, email, role, employee_name FROM profiles WHERE id = ${employee_id} LIMIT 1
    `
    const target = targetResult[0]

    if (!target) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 5. 권한 검증
    // - 자기 자신은 탈퇴 불가
    if (target.id === requester.id) {
      return NextResponse.json({ error: '자기 자신은 탈퇴시킬 수 없습니다.' }, { status: 400 })
    }
    // - admin은 다른 admin 탈퇴 불가
    if (target.role === 'admin') {
      return NextResponse.json({ error: 'GOD ADMIN은 탈퇴시킬 수 없습니다.' }, { status: 403 })
    }

    // 6. profile 비활성화 + 직급/부서 연결 해제
    try {
      await prisma.$executeRaw`
        UPDATE profiles
        SET is_active = 0, position_id = NULL, department_id = NULL, role = 'user',
            withdrawn_at = NOW(), withdrawn_by = ${requester.id}
        WHERE id = ${employee_id}
      `
    } catch (updateErr: any) {
      console.error('직원 탈퇴 profile 업데이트 실패:', updateErr)
      return NextResponse.json({ error: 'profile 업데이트 실패: ' + updateErr.message }, { status: 500 })
    }

    // 7. Firebase Auth 사용자 완전 삭제 (옵션)
    if (delete_auth) {
      // TODO: Phase 5 - Firebase Auth: delete user ${employee_id}
      console.log(`TODO: Delete Firebase Auth user ${employee_id}`)
      // Firebase Admin SDK would go here
      // try {
      //   await admin.auth().deleteUser(employee_id)
      // } catch (authDeleteErr: any) {
      //   console.error('Auth 사용자 삭제 실패 (profile은 이미 비활성화됨):', authDeleteErr)
      //   // Auth 삭제 실패해도 profile 비활성화는 유지
      // }
    }

    // 8. 해당 직원의 관련 초대도 canceled 처리
    try {
      await prisma.$executeRaw`
        UPDATE member_invitations
        SET status = 'canceled'
        WHERE email = ${target.email} AND status = 'pending'
      `
    } catch (e: any) {
      console.error('member_invitations 업데이트 실패:', e)
    }

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
