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
    // PR-HR-11a (2026-05-27, hr 세션) — LEFT JOIN companies 추가, company_key 노출.
    //   메인 PR-MULTI-BRAND P3+b + 본 세션 PR-HR-7 와 동형 패턴 (Rule 14):
    //   /api/profiles 가 company_key 평탄화한 패턴을 /me 에도 적용.
    //   /hr 페이지 회사 토글 권한 분기 (FMI/RIDE) 가 본인 company_key 필요.
    //   graceful fallback (Rule 23): JOIN 실패 시 단순 SELECT * 폴백.
    let raw: any = null
    try {
      const queryPromise = prisma.$queryRawUnsafe<any[]>(
        `SELECT p.*, c.company_key AS _company_key, c.name AS _company_name
           FROM profiles p
           LEFT JOIN companies c ON c.id = p.company_id
          WHERE p.id = ? LIMIT 1`,
        user.id
      ).catch(async (err) => {
        console.warn('profiles/me JOIN 실패, 단순 SELECT 폴백:', err?.message)
        // 폴백: companies 컬럼 미적용 환경 → 단순 SELECT (company_key 없음)
        return prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM profiles WHERE id = ? LIMIT 1`, user.id
        ).catch(() => null)
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
        company: null,
        company_key: null,
      }
      return NextResponse.json({ data: fallbackProfile, error: null })
    }

    // PR-HR-11a — companies 객체 + company_key 평탄화
    const company = raw._company_key ? { id: raw.company_id, key: raw._company_key, name: raw._company_name } : null
    const { _company_key, _company_name, ...rest } = raw
    const profile = {
      ...rest,
      position: null,
      department: null,
      company,
      company_key: _company_key || null,  // page.tsx 직접 분기용
    }
    return NextResponse.json({ data: serialize(profile), error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
