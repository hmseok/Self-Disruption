import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.sub || payload.user_id || null
  } catch { return null }
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const userId = getUserIdFromToken(token)
  if (!userId) return null
  // TODO: Phase 5 - Replace with Firebase Auth verification
  const profiles = await prisma.$queryRaw<any[]>`SELECT * FROM profiles WHERE id = ${userId} LIMIT 1`
  const profile = profiles[0]
  return profile ? { id: userId, ...profile } : null
}

// GET: 내 프로필 정보 조회
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // 법인카드 목록 조회
  const cards = await prisma.$queryRaw<any[]>`
    SELECT * FROM user_corporate_cards WHERE user_id = ${user.id}
    ORDER BY is_default DESC, created_at DESC
  `

  return NextResponse.json({
    profile: {
      id: user.id,
      email: user.email,
      employee_name: user.employee_name,
      phone: user.phone,
      role: user.role,
    },
    cards: cards || [],
  })
}

// PATCH: 내 프로필 정보 수정
export async function PATCH(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { employee_name, phone } = body

  if (employee_name === undefined && phone === undefined) {
    return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 })
  }

  try {
    if (employee_name !== undefined && phone !== undefined) {
      await prisma.$executeRaw`UPDATE profiles SET employee_name = ${employee_name}, phone = ${phone} WHERE id = ${user.id}`
    } else if (employee_name !== undefined) {
      await prisma.$executeRaw`UPDATE profiles SET employee_name = ${employee_name} WHERE id = ${user.id}`
    } else {
      await prisma.$executeRaw`UPDATE profiles SET phone = ${phone} WHERE id = ${user.id}`
    }
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  }
}
