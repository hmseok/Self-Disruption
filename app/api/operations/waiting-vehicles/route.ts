import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/operations/waiting-vehicles — PR-C2b-1 (2026-05-16) / PR-X (2026-05-23)
 *
 * 「대기차량」 조회 — 사고 대차로 배차 가능한 보유 차량.
 *
 * PR-X (2026-05-23) — 단일 출처화 (사용자 보고: 엑셀의 대기/배차중과 안 맞음)
 *   배경: 빌려타 535건 import 가 fmi_rentals 만 채우고 cars.status 는 안 건드림.
 *   → cars.status 의 'rented' 가 실제 배차와 어긋남 (5 vs 실제 8).
 *
 *   해결: 「배차중」을 cars.status 가 아니라 fmi_rentals 진행상태에서 도출.
 *     · rented   = 진행 중(dispatched) fmi_rental 보유 차량  ← 단일 출처
 *     · returned = cars.status='returned' (정비·점검) 이며 배차중 아님
 *     · available= 그 외 (배차 가능)
 *   import / 대량작업으로 cars.status 가 어긋나도 다시 틀어지지 않음.
 *
 * 데이터 소스:
 *   cars 테이블 — 차량 마스터 (번호/모델/정비상태)
 *   fmi_rentals — status='dispatched' 인 vehicle_id = 현재 배차중
 *
 * 모듈 책임 (CLAUDE.md Rule 21): operations 자기 모듈. 읽기 전용.
 *
 * Query:
 *   ?status=available|rented|returned|active|all   (default: available = 대기)
 *      active 는 available 과 동일 취급 (배차 모달 호환)
 *   ?q=검색어 (차량번호/브랜드/모델/트림)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type DerivedStatus = 'available' | 'rented' | 'returned'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) {
      return NextResponse.json({ success: false, data: [], error: '인증 필요' }, { status: 401 })
    }

    const url = new URL(request.url)
    const statusInput = url.searchParams.get('status') || 'available'
    const q = (url.searchParams.get('q') || '').trim()

    // 1) cars 마스터 조회 (검색어 있으면 Prisma 단계에서 필터)
    const carWhere: Record<string, unknown> = {}
    if (q) {
      carWhere.OR = [
        { number: { contains: q } },
        { brand: { contains: q } },
        { model: { contains: q } },
        { trim: { contains: q } },
      ]
    }
    const cars = await prisma.car.findMany({
      where: carWhere,
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
      take: 1000,
    }).catch((e: unknown) => {
      console.warn('[waiting-vehicles] cars query failed:', (e as Error)?.message?.slice(0, 200))
      return []
    })

    // 2) 진행 중(배차완료) fmi_rental 의 차량 id 집합 — 「배차중」 단일 출처
    let dispatchedIds = new Set<string>()
    try {
      const rows = await prisma.$queryRaw<Array<{ vehicle_id: string | null }>>`
        SELECT DISTINCT vehicle_id
          FROM fmi_rentals
         WHERE status = 'dispatched' AND vehicle_id IS NOT NULL`
      dispatchedIds = new Set(
        rows.map((r) => (r.vehicle_id == null ? '' : String(r.vehicle_id))).filter(Boolean)
      )
    } catch (e: unknown) {
      // Rule 23 graceful fallback — fmi_rentals 조회 실패 시 cars.status 그대로 사용
      console.warn('[waiting-vehicles] dispatched query failed:', (e as Error)?.message?.slice(0, 200))
    }
    const dispatchOk = dispatchedIds.size > 0

    // 3) 도출 상태 계산
    const derive = (carStatus: string | null, id: string): DerivedStatus => {
      if (dispatchedIds.has(id)) return 'rented'                // 배차중 (fmi_rentals 기준)
      if (carStatus === 'returned') return 'returned'           // 정비·점검
      // fmi_rentals 조회 실패 시에는 cars.status 의 'rented' 도 존중
      if (!dispatchOk && carStatus === 'rented') return 'rented'
      return 'available'
    }
    const enriched = cars.map((c) => ({
      id: c.id,
      number: c.number,
      brand: c.brand,
      model: c.model,
      trim: c.trim,
      year: c.year,
      image_url: c.image_url,
      status: derive(c.status, c.id),
      location: c.location,
      mileage: c.mileage,
    }))

    // 4) 도출 상태 기준 필터 — 'active' 는 available 과 동일 취급
    const wantStatus =
      statusInput === 'all' ? null
      : statusInput === 'active' ? 'available'
      : (['available', 'rented', 'returned'].includes(statusInput) ? statusInput : 'available')
    const filtered = wantStatus
      ? enriched.filter((c) => c.status === wantStatus)
      : enriched

    // 정렬: 상태 → 차량번호
    filtered.sort((a, b) =>
      a.status.localeCompare(b.status) ||
      String(a.number || '').localeCompare(String(b.number || ''))
    )

    // 상태별 카운트 (전체 기준 — UI 요약 strip 용)
    const counts: Record<string, number> = {}
    for (const c of enriched) counts[c.status] = (counts[c.status] || 0) + 1

    return NextResponse.json({
      success: true,
      data: filtered,
      meta: {
        fetched_at: new Date().toISOString(),
        total: filtered.length,
        counts,
        filter: { status: statusInput, q },
        source: '배차중=fmi_rentals.status=dispatched 도출 / 정비=cars.status=returned (PR-X 2026-05-23)',
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
