import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const bcrypt = require('bcryptjs')
const crypto = require('crypto')

// ============================================
// 초대 수락 처리
// 1. 초대 토큰 검증
// 2. 비밀번호 해싱 + profile 생성/업데이트
// 3. 페이지 권한 자동 생성
// 4. 초대 상태 accepted로 변경
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, name, phone, password } = body

    if (!token || !name || !password) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 })
    }

    // 1. 초대 정보 조회
    const invites = await prisma.$queryRaw<any[]>`
      SELECT id, email, company_id, role, position_id, department_id, status, expires_at, page_permissions
      FROM member_invitations WHERE token = ${token} LIMIT 1
    `

    if (invites.length === 0) {
      return NextResponse.json({ error: '유효하지 않은 초대입니다.' }, { status: 404 })
    }

    const invite = invites[0]

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 초대입니다.' }, { status: 400 })
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 초대입니다.' }, { status: 410 })
    }

    // 2. 비밀번호 해싱
    const passwordHash = await bcrypt.hash(password, 12)

    // 3. 이메일로 기존 프로필 확인
    const existingProfiles = await prisma.$queryRaw<any[]>`
      SELECT id FROM profiles WHERE email = ${invite.email} LIMIT 1
    `

    let userId: string

    if (existingProfiles.length > 0) {
      // 기존 프로필 업데이트 (비밀번호 + 역할 + 부서/직급)
      userId = existingProfiles[0].id
      await prisma.$executeRaw`
        UPDATE profiles SET
          role = ${invite.role || 'user'},
          position = ${invite.position_id || null},
          department = ${invite.department_id || null},
          name = ${name},
          phone = ${phone || null},
          password_hash = ${passwordHash},
          is_active = 1,
          is_approved = 1
        WHERE id = ${userId}
      `
    } else {
      // 신규 프로필 생성 (비밀번호 포함)
      userId = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO profiles
        (id, email, role, position, department, name, phone, password_hash, is_active, is_approved, created_at)
        VALUES (${userId}, ${invite.email}, ${invite.role || 'user'}, ${invite.position_id || null}, ${invite.department_id || null}, ${name}, ${phone || null}, ${passwordHash}, 1, 1, NOW())
      `
    }

  // 4. 페이지 권한 자동 생성 (초대 시 설정된 권한이 있는 경우)
  try {
    const pagePerms = typeof invite.page_permissions === 'string'
      ? JSON.parse(invite.page_permissions)
      : (invite.page_permissions as any[] || [])

    if (Array.isArray(pagePerms) && pagePerms.length > 0) {
      const permsToInsert = pagePerms
        .filter((p: any) => p.can_view || p.can_create || p.can_edit || p.can_delete)
        .map((p: any) => ({
          user_id: userId,
          page_path: p.page_path,
          can_view: p.can_view ? 1 : 0,
          can_create: p.can_create ? 1 : 0,
          can_edit: p.can_edit ? 1 : 0,
          can_delete: p.can_delete ? 1 : 0,
          data_scope: p.data_scope || 'all',
        }))

      if (permsToInsert.length > 0) {
        for (const perm of permsToInsert) {
          const permId = crypto.randomUUID()
          await prisma.$executeRaw`
            INSERT INTO user_page_permissions
            (id, user_id, page_path, can_view, can_create, can_edit, can_delete, data_scope, created_at)
            VALUES (${permId}, ${perm.user_id}, ${perm.page_path}, ${perm.can_view}, ${perm.can_create}, ${perm.can_edit}, ${perm.can_delete}, ${perm.data_scope}, NOW())
          `
        }
      }
    }
  } catch (e) {
    console.error('페이지 권한 생성 실패 (무시):', e)
  }

    // 5. 초대 상태 업데이트
    await prisma.$executeRaw`
      UPDATE member_invitations SET
        status = 'accepted',
        accepted_at = NOW(),
        accepted_by = ${userId}
      WHERE id = ${invite.id}
    `

    return NextResponse.json({ success: true, email: invite.email })
  } catch (error: any) {
    console.error('초대 수락 오류:', error?.message || error)
    return NextResponse.json(
      { error: '초대 수락 중 오류가 발생했습니다.', detail: error?.message },
      { status: 500 }
    )
  }
}
