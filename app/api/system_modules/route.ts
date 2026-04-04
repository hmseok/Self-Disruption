import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// GET /api/system_modules — 시스템 모듈 목록
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    try {
      const data = await prisma.$queryRaw<any[]>`
        SELECT * FROM system_modules ORDER BY sort_order ASC, name ASC
      `
      return NextResponse.json({ data: serialize(data), error: null })
    } catch (e: any) {
      // 테이블 미존재 시 빈 배열 반환
      if (e.message?.includes("doesn't exist")) {
        return NextResponse.json({ data: [], error: null })
      }
      throw e
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
