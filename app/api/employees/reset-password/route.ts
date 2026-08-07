// ═══════════════════════════════════════════════════════════════
// POST /api/employees/reset-password — 직원 비밀번호 초기화 (2026-08-07)
//   관리자(admin/master)가 직원 계정의 임시 비밀번호를 발급.
//   응답으로 임시 비밀번호를 1회 반환 → 관리자가 직원에게 전달, 직원은 로그인 후 변경.
//   ※ 관리자 자신 / 다른 admin 계정은 대상 불가 (오남용 방지)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'

/** 사람이 읽고 옮겨적기 쉬운 임시 비밀번호 (혼동 문자 제외) */
function makeTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'   // I, O 제외
  const lower = 'abcdefghijkmnpqrstuvwxyz'   // l, o 제외
  const digit = '23456789'                    // 0, 1 제외
  const all = upper + lower + digit
  const pick = (s: string) => s[randomInt(s.length)]
  // 영문 대/소문자 + 숫자 각 1자 보장 + 나머지 랜덤 (총 10자)
  const chars = [pick(upper), pick(lower), pick(digit), pick(digit)]
  while (chars.length < 10) chars.push(pick(all))
  // 셔플
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    if (!['admin', 'master'].includes(user.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const { employee_id } = await request.json()
    if (!employee_id) return NextResponse.json({ error: '직원 ID가 필요합니다.' }, { status: 400 })
    if (employee_id === user.id) {
      return NextResponse.json({ error: '본인 계정은 이 기능으로 초기화할 수 없습니다. 로그인 후 비밀번호를 변경해주세요.' }, { status: 400 })
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, email, employee_name, role FROM profiles WHERE id = ${employee_id} LIMIT 1
    `
    const target = rows[0]
    if (!target) return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    if (target.role === 'admin' && user.role !== 'master') {
      return NextResponse.json({ error: '관리자 계정은 최고관리자만 초기화할 수 있습니다.' }, { status: 403 })
    }

    const tempPassword = makeTempPassword()
    const hash = await bcrypt.hash(tempPassword, 12)
    await prisma.$executeRaw`
      UPDATE profiles SET password_hash = ${hash}, must_change_password = 1, updated_at = NOW() WHERE id = ${employee_id}
    `

    console.log(`[reset-password] ${user.id} → ${target.email} 초기화`)

    return NextResponse.json({
      ok: true,
      email: target.email,
      name: target.employee_name,
      temp_password: tempPassword,
    })
  } catch (e) {
    console.error('[reset-password] 실패:', e)
    return NextResponse.json({ error: '비밀번호 초기화에 실패했습니다.' }, { status: 500 })
  }
}
