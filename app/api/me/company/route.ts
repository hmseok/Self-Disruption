import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { getCompanyOfProfile } from '@/lib/company-context'

// ═══════════════════════════════════════════════════════════════
// PR-MULTI-BRAND P3+a — 현재 사용자의 회사 키
// 설계: _docs/HR-OPERATIONS.md § 9.5 (옵션 C)
// ───────────────────────────────────────────────────────────────
// 클라이언트가 「내 회사」 확인할 때 호출.
//   응답: { company: 'FMI' | 'RIDE' }
// 인증 필수 — JWT 검증 통과한 사용자의 profiles.company_id 기준.
// ═══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const company = await getCompanyOfProfile(user.id)
    return NextResponse.json({ company })
  } catch (e) {
    // 폴백 — 조회 실패해도 클라이언트는 동작해야 함
    return NextResponse.json({ company: 'FMI', error: String(e) }, { status: 200 })
  }
}
