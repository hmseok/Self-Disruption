// ═══════════════════════════════════════════════════════════════
// POST /api/auth/change-password — 본인 비밀번호 변경 (2026-08-07)
//   임시 비밀번호로 로그인한 경우(must_change_password=1) 변경 전까지 업무 화면 진입 차단.
//   본인만 가능 — 현재 비밀번호 확인 후 새 비밀번호로 교체하고 플래그 해제.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const { current_password, new_password } = await request.json()
    if (!current_password || !new_password) {
      return NextResponse.json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' }, { status: 400 })
    }
    if (String(new_password).length < 8) {
      return NextResponse.json({ error: '새 비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
    }
    if (!/[A-Za-z]/.test(new_password) || !/[0-9]/.test(new_password)) {
      return NextResponse.json({ error: '새 비밀번호는 영문과 숫자를 함께 포함해야 합니다.' }, { status: 400 })
    }
    if (current_password === new_password) {
      return NextResponse.json({ error: '현재 비밀번호와 다른 비밀번호를 사용해주세요.' }, { status: 400 })
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, password_hash FROM profiles WHERE id = ${user.id} LIMIT 1
    `
    const profile = rows[0]
    if (!profile?.password_hash) {
      return NextResponse.json({ error: '계정 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const hashStr = typeof profile.password_hash === 'string'
      ? profile.password_hash
      : profile.password_hash.toString()
    const ok = await bcrypt.compare(String(current_password), hashStr)
    if (!ok) return NextResponse.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, { status: 401 })

    const newHash = await bcrypt.hash(String(new_password), 12)
    await prisma.$executeRaw`
      UPDATE profiles SET password_hash = ${newHash}, must_change_password = 0, updated_at = NOW()
      WHERE id = ${user.id}
    `

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[change-password] 실패:', e)
    return NextResponse.json({ error: '비밀번호 변경에 실패했습니다.' }, { status: 500 })
  }
}
