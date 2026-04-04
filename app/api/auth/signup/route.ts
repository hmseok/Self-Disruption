import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, invite_token } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
    }

    // 이미 존재하는 이메일 확인
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM profiles WHERE email = ${email} LIMIT 1
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 })
    }

    // 초대 토큰 검증 (있는 경우)
    let inviteData: any = null
    if (invite_token) {
      const invitations = await prisma.$queryRaw<any[]>`
        SELECT * FROM member_invitations
        WHERE token = ${invite_token}
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `
      if (invitations.length === 0) {
        return NextResponse.json({ error: '유효하지 않거나 만료된 초대 링크입니다.' }, { status: 400 })
      }
      inviteData = invitations[0]
    }

    // 비밀번호 해시
    const password_hash = await bcrypt.hash(password, 12)
    const id = crypto.randomUUID()
    const role = inviteData?.role || 'member'
    const is_approved = inviteData ? true : false

    // 프로필 생성
    await prisma.$executeRaw`
      INSERT INTO profiles (id, email, name, role, is_active, is_approved, password_hash, created_at, updated_at)
      VALUES (${id}, ${email}, ${name || null}, ${role}, true, ${is_approved}, ${password_hash}, NOW(), NOW())
    `

    // 초대 토큰 사용 처리
    if (inviteData) {
      await prisma.$executeRaw`
        UPDATE member_invitations SET used_at = NOW() WHERE id = ${inviteData.id}
      `
    }

    // JWT 발급
    const token = jwt.sign(
      {
        sub: id,
        email,
        role,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    )

    const user = {
      id,
      email,
      name: name || null,
      role,
      is_active: true,
      is_approved,
    }

    return NextResponse.json({ token, user }, { status: 201 })
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json({ error: '회원가입 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
