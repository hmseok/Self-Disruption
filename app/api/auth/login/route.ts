import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'fmi_dev_secret_change_in_production'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    // 프로필 조회
    const profiles = await prisma.$queryRaw<any[]>`
      SELECT id, email, name, role, is_active, is_approved, password_hash
      FROM profiles
      WHERE email = ${email}
      LIMIT 1
    `
    const profile = profiles[0]

    if (!profile) {
      return NextResponse.json({ error: '이메일 또는 비밀번호를 확인해주세요.' }, { status: 401 })
    }

    if (!profile.is_active) {
      return NextResponse.json({ error: '비활성화된 계정입니다.' }, { status: 403 })
    }

    // 비밀번호 검증
    if (!profile.password_hash) {
      return NextResponse.json({ error: '비밀번호가 설정되지 않은 계정입니다. 관리자에게 문의하세요.' }, { status: 401 })
    }

    const hashStr = typeof profile.password_hash === 'string'
      ? profile.password_hash
      : profile.password_hash.toString()

    const isValid = await bcrypt.compare(password, hashStr)
    if (!isValid) {
      return NextResponse.json({ error: '이메일 또는 비밀번호를 확인해주세요.' }, { status: 401 })
    }

    // JWT 발급 (30일 유효)
    const token = jwt.sign(
      {
        sub: profile.id,
        email: profile.email,
        role: profile.role,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    )

    const user = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      is_active: profile.is_active,
      is_approved: profile.is_approved,
    }

    return NextResponse.json({ token, user })
  } catch (error: any) {
    console.error('Login error:', error?.message || error)
    return NextResponse.json({ error: '로그인 중 오류가 발생했습니다.', detail: error?.message }, { status: 500 })
  }
}
