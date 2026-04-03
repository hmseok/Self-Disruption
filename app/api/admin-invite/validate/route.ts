import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ============================================
// 초대 코드 검증 API (공개 — 회원가입 시 사용, Prisma 버전)
// POST { code: "XXXX-XXXX" } → { valid: true/false }
// ============================================

export async function POST(request: NextRequest) {
  const { code } = await request.json()
  if (!code) return NextResponse.json({ valid: false, error: '코드를 입력하세요.' })

  const now = new Date().toISOString()
  const codes = await prisma.$queryRaw<any[]>`
    SELECT id, description, expires_at FROM admin_invite_codes
    WHERE code = ${code.trim().toUpperCase()}
    AND (used_by IS NULL OR used_by = '')
    AND expires_at > ${now}
    LIMIT 1
  `

  if (codes.length === 0) {
    return NextResponse.json({ valid: false, error: '유효하지 않거나 만료된 초대 코드입니다.' })
  }

  return NextResponse.json({ valid: true, description: codes[0].description })
}
