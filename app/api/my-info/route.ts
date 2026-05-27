import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// GET: 내 프로필 정보 조회
//   hotfix (2026-05-27): verifyUser 가 employee_name/phone 미반환 → 직접 SELECT.
//   profiles 테이블 컬럼: name (NOT employee_name).
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // profiles 직접 조회 — name / phone 까지 가져옴
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, email, name, phone, role FROM profiles WHERE id = ${user.id} LIMIT 1
  `
  const p = rows[0] || { id: user.id, email: user.email, name: null, phone: null, role: user.role }

  // 법인카드 목록 조회
  const cards = await prisma.$queryRaw<any[]>`
    SELECT * FROM user_corporate_cards WHERE user_id = ${user.id}
    ORDER BY is_default DESC, created_at DESC
  `

  return NextResponse.json({
    profile: {
      id: p.id,
      email: p.email,
      // employee_name 키는 backward-compat — 실제 값은 profiles.name 컬럼.
      employee_name: p.name || '',
      phone: p.phone || '',
      role: p.role,
    },
    cards: cards || [],
  })
}

// PATCH: 내 프로필 정보 수정
//   hotfix (2026-05-27): profiles 컬럼은 'name' (employee_name 컬럼 없음).
//   클라이언트 body 의 employee_name 은 'name' 컬럼으로 매핑.
export async function PATCH(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  // employee_name (legacy 키) → name 으로 매핑
  const profileName = body.employee_name !== undefined ? body.employee_name : body.name
  const phone = body.phone

  if (profileName === undefined && phone === undefined) {
    return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 })
  }

  try {
    if (profileName !== undefined && phone !== undefined) {
      await prisma.$executeRaw`UPDATE profiles SET name = ${profileName}, phone = ${phone} WHERE id = ${user.id}`
    } else if (profileName !== undefined) {
      await prisma.$executeRaw`UPDATE profiles SET name = ${profileName} WHERE id = ${user.id}`
    } else {
      await prisma.$executeRaw`UPDATE profiles SET phone = ${phone} WHERE id = ${user.id}`
    }
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[my-info PATCH] UPDATE 실패:', error?.message || error)
    return NextResponse.json({ error: '수정 실패: ' + (error?.message || '') }, { status: 500 })
  }
}
