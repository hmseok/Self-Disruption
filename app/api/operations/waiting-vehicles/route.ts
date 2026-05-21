import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/operations/waiting-vehicles — PR-C2b-1 (2026-05-16)
 *
 * 「대기차량」 조회 — 사고 대차로 배차 가능한 보유 차량.
 *
 * 사용자 명시 (2026-05-16):
 *   「배차 시에는 대기차량을 선택하여 대차요청건과 연결되어야 하고」
 *   「배차 운영이 들어가면 대기차량도 확인되겠죠」
 *
 * 데이터 소스 (Researcher 조사 확정):
 *   fmi_vehicles 테이블 — status 컬럼
 *     available    사용 가능 (대기) — 배차 가능
 *     rented       대여 중 (fmi_rentals 배정됨)
 *     maintenance  정비 중
 *     washing      세차 중
 *     repair       수리 중
 *     inspection   검사 중
 *
 * 모듈 책임 (CLAUDE.md Rule 21): operations 자기 모듈.
 * 읽기 전용 — DB write 없음.
 *
 * Query:
 *   ?status=available|rented|...|all   (default: available)
 *   ?q=검색어 (차량번호/차종/브랜드)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_STATUS = ['available', 'rented', 'maintenance', 'washing', 'repair', 'inspection']

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) {
      return NextResponse.json({ success: false, data: [], error: '인증 필요' }, { status: 401 })
    }

    const url = new URL(request.url)
    const statusInput = url.searchParams.get('status') || 'available'
    const q = (url.searchParams.get('q') || '').trim()

    // status 화이트리스트 — 'all' 또는 허용값만
    const statusFilter =
      statusInput === 'all' ? null
      : ALLOWED_STATUS.includes(statusInput) ? statusInput
      : 'available'

    const where: Record<string, unknown> = {}
    if (statusFilter) where.status = statusFilter
    if (q) {
      where.OR = [
        { car_number: { contains: q } },
        { car_type: { contains: q } },
        { car_brand: { contains: q } },
        { car_model: { contains: q } },
      ]
    }

    const rows = await prisma.fmiVehicle.findMany({
      where,
      select: {
        id: true,
        car_number: true,
        car_type: true,
        car_brand: true,
        car_model: true,
        car_year: true,
        car_color: true,
        status: true,
        ownership_type: true,
        rental_company: true,
        current_location: true,
        mileage: true,
        notes: true,
      },
      orderBy: [{ status: 'asc' }, { car_number: 'asc' }],
      take: 500,
    }).catch((e: unknown) => {
      // Rule 23 graceful fallback — 테이블 미적용 / 조회 실패
      console.warn('[waiting-vehicles GET] query failed:', (e as Error)?.message?.slice(0, 200))
      return []
    })

    // 상태별 카운트 (UI 요약 strip 용)
    const counts: Record<string, number> = {}
    for (const r of rows) {
      counts[r.status] = (counts[r.status] || 0) + 1
    }

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        total: rows.length,
        counts,
        filter: { status: statusInput, q },
      },
    })
  } catch (e: unknown) {
    console.error('[waiting-vehicles GET]', e)
    return NextResponse.json(
      { success: false, data: [], error: (e as Error)?.message || 'error' },
      { status: 500 }
    )
  }
}
