import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // DB에서 프로필 조회 시도 (타임아웃 5초)
    let raw: any = null
    try {
      const queryPromise = prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM profiles WHERE id = ? LIMIT 1`,
        user.id
      ).catch((err) => {
        console.warn('profiles/me DB 쿼리 에러:', err?.message)
        return null
      })
      // 5초 타임아웃
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
      const result = await Promise.race([queryPromise, timeoutPromise])
      raw = Array.isArray(result) ? result[0] || null : null
    } catch (dbErr: any) {
      console.warn('profiles/me DB 조회 실패:', dbErr?.message)
    }

    // DB에서 못 찾으면 verifyUser가 반환한 JWT 기반 데이터 사용
    if (!raw) {
      const fallbackProfile = {
        id: user.id,
        email: (user as any).email || '',
        role: (user as any).role || 'user',
        employee_name: (user as any).email?.split('@')[0] || '',
        position: null,
        department: null,
      }
      return NextResponse.json({ data: fallbackProfile, error: null })
    }

    const profile = {
      ...raw,
      position: null,
      department: null,
    }
    return NextResponse.json({ data: serialize(profile), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
