import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// ═══════════════════════════════════════════════════════════════════
// 배차 보드 통합 데이터 API
//   GET /api/operations/fleet
//
// 응답:
//   stats         — 5단계 카운트 (가용/대여/입고예정/정비세차/탁송)
//   cars          — 차량 그리드 (status별 그룹화 가능, 위치 포함)
//   returning_today — 오늘 회수 예정 (vehicle_operations.type=return)
//   transport_today — 오늘 탁송 일정 (transport_requests)
//   locations     — 위치 코드 라벨 매핑 (드롭다운/표출용)
// ═══════════════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

// ─── status 분류 헬퍼 ────────────────────────────────────────
//   cars.status 값 → 5단계 분류
const STATUS_GROUP: Record<string, 'available' | 'rented' | 'preparing' | 'offline'> = {
  active:       'available',
  available:    'available',
  rented:       'rented',
  dispatched:   'rented',
  in_transit:   'rented',
  washing:      'preparing',
  maintenance:  'preparing',
  repair:       'preparing',
  inspection:   'preparing',
  accident:     'offline',
  longterm:     'offline',
}

function statusGroup(s: string | null | undefined): 'available' | 'rented' | 'preparing' | 'offline' {
  if (!s) return 'available'
  return STATUS_GROUP[s] || 'available'
}

// ─── GET ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    // ── 1. 차량 + 위치 코드 라벨 JOIN ──
    const cars = await prisma.$queryRaw<any[]>`
      SELECT c.id, c.number, c.brand, c.model, c.trim, c.year,
             c.status, c.location, c.location_code,
             c.mileage, c.image_url,
             lc.label   AS location_label,
             lc.address AS location_address,
             lc.category AS location_category
        FROM cars c
        LEFT JOIN location_codes lc ON lc.code = c.location_code
       ORDER BY c.status, c.number
    `

    // ── 2. 오늘 회수 예정 (vehicle_operations) ──
    const returning_today = await prisma.$queryRaw<any[]>`
      SELECT vo.id, vo.car_id, vo.scheduled_date, vo.scheduled_time,
             vo.location, vo.location_address,
             vo.status, vo.driver_name, vo.handler_name,
             c.number AS car_number, c.brand, c.model
        FROM vehicle_operations vo
        LEFT JOIN cars c ON c.id COLLATE utf8mb4_unicode_ci = vo.car_id COLLATE utf8mb4_unicode_ci
       WHERE vo.operation_type = 'return'
         AND vo.scheduled_date = CURDATE()
         AND vo.status NOT IN ('completed', 'cancelled')
       ORDER BY vo.scheduled_time
    `

    // ── 3. 오늘 탁송 일정 + stops summary ──
    let transport_today: any[] = []
    try {
      transport_today = await prisma.$queryRaw<any[]>`
        SELECT r.id, r.service_type, r.trip_type, r.route_summary, r.status,
               r.scheduled_at, r.driver_name, r.driver_phone, r.driver_type,
               r.photo_required, r.photo_received,
               (SELECT GROUP_CONCAT(
                  CONCAT_WS('|',
                    s.stop_order, s.stop_type,
                    COALESCE(lc.label, s.location_name, s.address, '?'),
                    COALESCE(s.contact_phone, ''),
                    COALESCE(s.car_pickup_external, cp.number, ''),
                    COALESCE(s.car_dropoff_external, cd.number, '')
                  )
                  ORDER BY s.stop_order SEPARATOR '||'
                )
                FROM transport_stops s
                LEFT JOIN location_codes lc ON lc.code = s.location_code
                LEFT JOIN cars cp ON cp.id COLLATE utf8mb4_unicode_ci = s.car_pickup_id COLLATE utf8mb4_unicode_ci
                LEFT JOIN cars cd ON cd.id COLLATE utf8mb4_unicode_ci = s.car_dropoff_id COLLATE utf8mb4_unicode_ci
                WHERE s.request_id = r.id) AS stops_summary
          FROM transport_requests r
         WHERE r.deleted_at IS NULL
           AND (DATE(r.scheduled_at) = CURDATE()
                OR r.status IN ('requested', 'assigned', 'in_progress'))
         ORDER BY
           CASE r.status
             WHEN 'in_progress' THEN 1
             WHEN 'assigned' THEN 2
             WHEN 'requested' THEN 3
             ELSE 4
           END,
           r.scheduled_at
         LIMIT 50
      `
    } catch (e: any) {
      // 테이블 미생성 시 graceful
      console.warn('[fleet] transport_today fetch fail (테이블 미생성?):', e.message)
    }

    // ── 4. 활성 위치 코드 (드롭다운/매핑용) ──
    let locations: any[] = []
    try {
      locations = await prisma.$queryRaw<any[]>`
        SELECT id, code, label, address, phone, category, sort_order
          FROM location_codes
         WHERE active = 1
         ORDER BY sort_order, label
      `
    } catch (e: any) {
      console.warn('[fleet] locations fetch fail (테이블 미생성?):', e.message)
    }

    // ── 5. stats 산출 ──
    const returningCarIds = new Set(returning_today.map((r: any) => String(r.car_id)))
    const stats = {
      available: 0,
      rented: 0,
      returning_today: returning_today.length,
      preparing: 0,
      offline: 0,
      transport_active: transport_today.filter((r: any) => r.status !== 'completed' && r.status !== 'cancelled').length,
    }
    for (const c of cars) {
      const g = statusGroup(c.status)
      stats[g]++
    }

    // ── 6. 차량에 group/배지 정보 부착 ──
    const enrichedCars = cars.map((c: any) => ({
      ...c,
      group: statusGroup(c.status),
      is_returning_today: returningCarIds.has(String(c.id)),
    }))

    return NextResponse.json({
      data: {
        stats,
        cars: serialize(enrichedCars),
        returning_today: serialize(returning_today),
        transport_today: serialize(transport_today),
        locations: serialize(locations),
      },
      error: null,
    })
  } catch (e: any) {
    console.error('[GET /api/operations/fleet]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
