import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/operations/waiting-vehicles — PR-C2b-1 (2026-05-16, C2b-1.1 cars 기준 수정)
 *
 * 「대기차량」 조회 — 사고 대차로 배차 가능한 보유 차량.
 *
 * 사용자 명시 (2026-05-16):
 *   「배차 시에는 대기차량을 선택하여 대차요청건과 연결되어야 하고」
 *   「cars 페이지 기준으로 하면 되는데」
 *   「카페24 사고의 오더로 대기차량을 매칭하여 배차를 진행하는 것이고
 *    fmi 차량 사고는 사고대차운영차량의 사고나 정비로 운영을 못하고
 *    대기를 못하는 내용」
 *
 * 데이터 소스 (사용자 확정 — cars 페이지 기준):
 *   cars 테이블 — status 컬럼 (실데이터 확인 2026-05-16):
 *     available  배차 가능 (대기) ← 배차 매칭 대상
 *     rented     배차 중
 *     returned   반납됨 (점검·정비 대기)
 *
 *   /cars 페이지 (app/cars/CarList.tsx) 가 사용하는 GET /api/cars 와 동일 테이블.
 *
 * 모듈 책임 (CLAUDE.md Rule 21): operations 자기 모듈.
 * 읽기 전용 — DB write 없음.
 *
 * Query:
 *   ?status=available|rented|returned|all   (default: available = 대기)
 *   ?q=검색어 (차량번호/브랜드/모델/트림)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_STATUS = ['available', 'rented', 'returned']

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
        { number: { contains: q } },
        { brand: { contains: q } },
        { model: { contains: q } },
        { trim: { contains: q } },
      ]
    }

    const rows = await prisma.car.findMany({
      where,
      select: {
        id: true,
        number: true,
        brand: true,
        model: true,
        trim: true,
        year: true,
        image_url: true,
        status: true,
        location: true,
        mileage: true,
      },
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      take: 500,
    }).catch((e: unknown) => {
      // Rule 23 graceful fallback — 조회 실패 시 빈 배열
      console.warn('[waiting-vehicles GET] query failed:', (e as Error)?.message?.slice(0, 200))
      return []
    })

    // 상태별 카운트 (UI 요약 strip 용)
    const counts: Record<string, number> = {}
    for (const r of rows) {
      const s = r.status || 'unknown'
      counts[s] = (counts[s] || 0) + 1
    }

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        total: rows.length,
        counts,
        filter: { status: statusInput, q },
        source: 'cars 테이블 (/cars 페이지와 동일 — 사용자 확정 2026-05-16)',
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
