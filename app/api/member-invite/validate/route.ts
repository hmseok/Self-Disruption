import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 초대 토큰 검증 (공개 API - 인증 불필요)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 })
  }

  const invites = await prisma.$queryRaw<any[]>`
    SELECT
      mi.id, mi.email, mi.role, mi.status, mi.expires_at, mi.company_id, mi.position_id, mi.department_id
    FROM member_invitations mi
    WHERE mi.token = ${token}
    LIMIT 1
  `

  if (invites.length === 0) {
    return NextResponse.json({ error: '유효하지 않은 초대입니다.', reason: 'invalid' }, { status: 404 })
  }

  const invite = invites[0]

  if (invite.status === 'accepted') {
    return NextResponse.json({ error: '이미 사용된 초대입니다.', reason: 'used' }, { status: 410 })
  }

  if (invite.status === 'canceled') {
    return NextResponse.json({ error: '취소된 초대입니다.', reason: 'canceled' }, { status: 410 })
  }

  if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: '만료된 초대입니다.', reason: 'expired' }, { status: 410 })
  }

  // Fetch company, position, department names
  const companies = await prisma.$queryRaw<any[]>`SELECT name FROM companies WHERE id = ${invite.company_id} LIMIT 1`
  const positions = invite.position_id ? await prisma.$queryRaw<any[]>`SELECT name FROM positions WHERE id = ${invite.position_id} LIMIT 1` : []
  const departments = invite.department_id ? await prisma.$queryRaw<any[]>`SELECT name FROM departments WHERE id = ${invite.department_id} LIMIT 1` : []

  const result = {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    expires_at: invite.expires_at,
    company: companies.length > 0 ? { name: companies[0].name } : null,
    position: positions.length > 0 ? { name: positions[0].name } : null,
    department: departments.length > 0 ? { name: departments[0].name } : null,
  }

  return NextResponse.json(result)
}
