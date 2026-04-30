import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════════
// 탁송 요청 API (transport_requests + transport_stops)
//
//   GET    /api/transport-requests           목록 (필터: status/from/to/today)
//   GET    /api/transport-requests?id=...    단건 + stops
//   POST   /api/transport-requests           신규 (request + stops 동시 생성)
//   PATCH  /api/transport-requests?id=...    수정 (마스터 + stops replace)
//   PATCH  /api/transport-requests?id=...&action=status  상태 전환 + 자동화
//   DELETE /api/transport-requests?id=...    soft delete (작성자/admin)
//
// 자동화:
//   · started_at 설정 → 차량들 cars.status = 'in_transit', vehicle_status_log 기록
//   · completed_at 설정 → 마지막 stop의 dropoff 차량 → cars.location_code/detail 갱신
//                       → cars.status = 'active' (또는 reason 별 'maintenance' 등)
// ═══════════════════════════════════════════════════════════════════

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ))
}

const ALLOWED_REQ_FIELDS = [
  'service_type', 'trip_type', 'route_summary',
  'scheduled_at', 'started_at', 'completed_at',
  'driver_type', 'driver_id', 'driver_name', 'driver_phone',
  'photo_required', 'photo_target_phone', 'photo_received', 'photo_received_at',
  'estimated_fee', 'actual_fee', 'fee_paid', 'fee_transaction_id',
  'status', 'related_type', 'related_id', 'raw_text', 'notes',
]

const ALLOWED_SERVICE = ['accident_repair', 'dispatch', 'return', 'maint_in', 'maint_out', 'sale', 'general']
const ALLOWED_TRIP = ['one_way', 'round_trip']
const ALLOWED_STATUS = ['requested', 'assigned', 'in_progress', 'completed', 'cancelled']

function toMySqlDt(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${mi}:${s}`
  } catch { return null }
}

// ─── GET ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const id = sp.get('id')

  try {
    if (id) {
      // 단건 + stops + 차량 정보
      const reqRows = await prisma.$queryRaw<any[]>`
        SELECT * FROM transport_requests
        WHERE id = ${id} AND deleted_at IS NULL
        LIMIT 1
      `
      if (reqRows.length === 0) {
        return NextResponse.json({ data: null, error: null })
      }
      const stops = await prisma.$queryRaw<any[]>`
        SELECT s.*,
               cp.number AS pickup_car_number,
               CONCAT_WS(' ', cp.brand, cp.model) AS pickup_car_model,
               cd.number AS dropoff_car_number,
               CONCAT_WS(' ', cd.brand, cd.model) AS dropoff_car_model,
               lc.label  AS location_label,
               lc.address AS location_default_address
          FROM transport_stops s
          LEFT JOIN cars cp ON cp.id COLLATE utf8mb4_unicode_ci = s.car_pickup_id COLLATE utf8mb4_unicode_ci
          LEFT JOIN cars cd ON cd.id COLLATE utf8mb4_unicode_ci = s.car_dropoff_id COLLATE utf8mb4_unicode_ci
          LEFT JOIN location_codes lc ON lc.code = s.location_code
         WHERE s.request_id = ${id}
         ORDER BY s.stop_order
      `
      return NextResponse.json({ data: serialize({ ...reqRows[0], stops }), error: null })
    }

    // 목록 — 필터
    const status = sp.get('status') || ''
    const from = sp.get('from') || ''
    const to = sp.get('to') || ''
    const today = sp.get('today') === 'true'

    const conditions: string[] = ['deleted_at IS NULL']
    const params: any[] = []
    if (status) {
      const sList = status.split(',').filter(Boolean)
      if (sList.length === 1) { conditions.push('status = ?'); params.push(sList[0]) }
      else if (sList.length > 1) {
        conditions.push(`status IN (${sList.map(() => '?').join(',')})`)
        params.push(...sList)
      }
    }
    if (today) conditions.push('DATE(scheduled_at) = CURDATE()')
    else {
      if (from) { conditions.push('scheduled_at >= ?'); params.push(from) }
      if (to)   { conditions.push('scheduled_at <= ?'); params.push(to) }
    }

    const whereSql = conditions.join(' AND ')
    const sql = `
      SELECT r.*,
             (SELECT COUNT(*) FROM transport_stops s WHERE s.request_id = r.id) AS stop_count,
             (SELECT GROUP_CONCAT(
                CONCAT_WS('|', s.stop_order, s.stop_type, COALESCE(lc.label, s.location_name, ''))
                ORDER BY s.stop_order SEPARATOR '||'
              )
              FROM transport_stops s
              LEFT JOIN location_codes lc ON lc.code = s.location_code
              WHERE s.request_id = r.id) AS stops_summary
        FROM transport_requests r
       WHERE ${whereSql}
       ORDER BY r.scheduled_at DESC, r.created_at DESC
       LIMIT 200
    `
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
    return NextResponse.json({ data: serialize(rows), error: null })
  } catch (e: any) {
    console.error('[GET /api/transport-requests]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await req.json()
    const id = randomUUID()

    const service_type = ALLOWED_SERVICE.includes(body.service_type) ? body.service_type : 'general'
    const trip_type = ALLOWED_TRIP.includes(body.trip_type) ? body.trip_type : 'one_way'
    const status = ALLOWED_STATUS.includes(body.status) ? body.status : 'requested'

    // route_summary 자동 생성 (stops 있으면)
    let routeSummary = body.route_summary || null
    const stops: any[] = Array.isArray(body.stops) ? body.stops : []
    if (!routeSummary && stops.length > 0) {
      routeSummary = stops
        .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0))
        .map(s => s.location_label || s.location_name || s.address || '?')
        .join('→')
    }

    await prisma.$executeRaw`
      INSERT INTO transport_requests (
        id, service_type, trip_type, route_summary,
        scheduled_at, started_at, completed_at,
        driver_type, driver_id, driver_name, driver_phone,
        photo_required, photo_target_phone, photo_received, photo_received_at,
        estimated_fee, actual_fee, fee_paid, fee_transaction_id,
        status, related_type, related_id,
        raw_text, notes, created_by
      ) VALUES (
        ${id}, ${service_type}, ${trip_type}, ${routeSummary},
        ${toMySqlDt(body.scheduled_at)}, ${toMySqlDt(body.started_at)}, ${toMySqlDt(body.completed_at)},
        ${body.driver_type || null}, ${body.driver_id || null}, ${body.driver_name || null}, ${body.driver_phone || null},
        ${body.photo_required ? 1 : 0}, ${body.photo_target_phone || null}, ${body.photo_received ? 1 : 0}, ${toMySqlDt(body.photo_received_at)},
        ${body.estimated_fee != null ? Number(body.estimated_fee) : null},
        ${body.actual_fee != null ? Number(body.actual_fee) : null},
        ${body.fee_paid ? 1 : 0}, ${body.fee_transaction_id || null},
        ${status}, ${body.related_type || null}, ${body.related_id || null},
        ${body.raw_text || null}, ${body.notes || null}, ${user.id || null}
      )
    `

    // stops 일괄 insert
    for (const s of stops) {
      await prisma.$executeRaw`
        INSERT INTO transport_stops (
          id, request_id, stop_order, stop_type,
          location_code, location_name, address,
          contact_name, contact_phone,
          car_pickup_id, car_pickup_external,
          car_dropoff_id, car_dropoff_external,
          arrival_planned, arrival_actual, notes
        ) VALUES (
          ${randomUUID()}, ${id},
          ${Number(s.stop_order) || 1},
          ${s.stop_type || 'waypoint'},
          ${s.location_code || null}, ${s.location_name || null}, ${s.address || null},
          ${s.contact_name || null}, ${s.contact_phone || null},
          ${s.car_pickup_id || null}, ${s.car_pickup_external || null},
          ${s.car_dropoff_id || null}, ${s.car_dropoff_external || null},
          ${toMySqlDt(s.arrival_planned)}, ${toMySqlDt(s.arrival_actual)},
          ${s.notes || null}
        )
      `
    }

    return NextResponse.json({ data: { id }, error: null }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/transport-requests]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── PATCH ───────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  const action = req.nextUrl.searchParams.get('action') // 'status' 등 특수 액션
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  try {
    const body = await req.json()

    // ── 액션: 상태 전환 + 자동화 ──
    if (action === 'status') {
      const newStatus = body.status
      if (!ALLOWED_STATUS.includes(newStatus)) {
        return NextResponse.json({ error: 'status 값 오류' }, { status: 400 })
      }

      // 현재 request + 모든 stops 조회
      const cur = await prisma.$queryRaw<any[]>`
        SELECT * FROM transport_requests WHERE id = ${id} LIMIT 1
      `
      if (cur.length === 0) return NextResponse.json({ error: '요청 없음' }, { status: 404 })
      const req0 = cur[0]
      const stops = await prisma.$queryRaw<any[]>`
        SELECT * FROM transport_stops WHERE request_id = ${id} ORDER BY stop_order
      `

      const now = new Date()
      const startedAt = newStatus === 'in_progress' && !req0.started_at ? now : req0.started_at
      const completedAt = newStatus === 'completed' && !req0.completed_at ? now : req0.completed_at

      await prisma.$executeRaw`
        UPDATE transport_requests SET
          status = ${newStatus},
          started_at = ${startedAt},
          completed_at = ${completedAt},
          updated_at = NOW()
        WHERE id = ${id}
      `

      // ── 자동화: in_progress → 차량(들) status='in_transit' ──
      if (newStatus === 'in_progress') {
        const carIds = new Set<string>()
        for (const s of stops) {
          if (s.car_pickup_id) carIds.add(s.car_pickup_id)
          if (s.car_dropoff_id) carIds.add(s.car_dropoff_id)
        }
        for (const carId of carIds) {
          try {
            // 기존 status 조회 (log용)
            const carRows = await prisma.$queryRaw<any[]>`
              SELECT status FROM cars WHERE id = ${carId} LIMIT 1
            `
            const oldStatus = carRows[0]?.status || null
            await prisma.$executeRaw`
              UPDATE cars SET status = 'in_transit', updated_at = NOW() WHERE id = ${carId}
            `
            await prisma.$executeRaw`
              INSERT INTO vehicle_status_log (id, car_id, old_status, new_status, related_type, related_id, changed_by)
              VALUES (${randomUUID()}, ${carId}, ${oldStatus}, 'in_transit', 'transport', ${id}, ${user.id || null})
            `
          } catch (logErr) {
            console.warn('[transport-requests status=in_progress] car update', carId, logErr)
          }
        }
      }

      // ── 자동화: completed → 마지막 stop의 dropoff 차량 위치/상태 갱신 ──
      if (newStatus === 'completed') {
        const lastStop = stops[stops.length - 1]
        if (lastStop) {
          // dropoff 차량 = 도착지에서 내린 차량
          const dropoffCarId = lastStop.car_dropoff_id
          if (dropoffCarId) {
            try {
              const carRows = await prisma.$queryRaw<any[]>`
                SELECT status FROM cars WHERE id = ${dropoffCarId} LIMIT 1
              `
              const oldStatus = carRows[0]?.status || null
              // service_type 별 종료 상태
              const finalStatus = (() => {
                switch (req0.service_type) {
                  case 'maint_in':        return 'maintenance'
                  case 'accident_repair': return 'repair'
                  case 'sale':            return 'longterm'
                  default:                return 'active'
                }
              })()
              await prisma.$executeRaw`
                UPDATE cars SET
                  status = ${finalStatus},
                  location_code = ${lastStop.location_code || null},
                  location = ${lastStop.location_name || lastStop.address || null},
                  updated_at = NOW()
                WHERE id = ${dropoffCarId}
              `
              await prisma.$executeRaw`
                INSERT INTO vehicle_status_log (id, car_id, old_status, new_status, related_type, related_id, changed_by)
                VALUES (${randomUUID()}, ${dropoffCarId}, ${oldStatus}, ${finalStatus}, 'transport', ${id}, ${user.id || null})
              `
            } catch (logErr) {
              console.warn('[transport-requests status=completed] car update', dropoffCarId, logErr)
            }
          }
        }
      }

      // ── 자동화: cancelled → 차량 status 'active' 원복 (안전 모드) ──
      if (newStatus === 'cancelled' && req0.status === 'in_progress') {
        const carIds = new Set<string>()
        for (const s of stops) {
          if (s.car_pickup_id) carIds.add(s.car_pickup_id)
          if (s.car_dropoff_id) carIds.add(s.car_dropoff_id)
        }
        for (const carId of carIds) {
          try {
            await prisma.$executeRaw`
              UPDATE cars SET status = 'active', updated_at = NOW() WHERE id = ${carId} AND status = 'in_transit'
            `
          } catch {}
        }
      }

      return NextResponse.json({ data: { id, status: newStatus }, error: null })
    }

    // ── 일반 PATCH ──
    const sets: string[] = []
    const params: any[] = []
    for (const k of ALLOWED_REQ_FIELDS) {
      if (body[k] === undefined) continue
      let v = body[k]
      if (k === 'service_type' && !ALLOWED_SERVICE.includes(v)) continue
      if (k === 'trip_type' && !ALLOWED_TRIP.includes(v)) continue
      if (k === 'status' && !ALLOWED_STATUS.includes(v)) continue
      if (['scheduled_at', 'started_at', 'completed_at', 'photo_received_at'].includes(k)) {
        v = toMySqlDt(v)
      }
      if (['photo_required', 'photo_received', 'fee_paid'].includes(k)) v = v ? 1 : 0
      if (['estimated_fee', 'actual_fee'].includes(k) && v != null) v = Number(v)
      sets.push(`${k} = ?`)
      params.push(v)
    }

    if (sets.length > 0) {
      params.push(id)
      const sql = `UPDATE transport_requests SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`
      await prisma.$executeRawUnsafe(sql, ...params)
    }

    // stops replace (있으면 — 전체 갈아끼움)
    if (Array.isArray(body.stops)) {
      await prisma.$executeRaw`DELETE FROM transport_stops WHERE request_id = ${id}`
      for (const s of body.stops) {
        await prisma.$executeRaw`
          INSERT INTO transport_stops (
            id, request_id, stop_order, stop_type,
            location_code, location_name, address,
            contact_name, contact_phone,
            car_pickup_id, car_pickup_external,
            car_dropoff_id, car_dropoff_external,
            arrival_planned, arrival_actual, notes
          ) VALUES (
            ${randomUUID()}, ${id},
            ${Number(s.stop_order) || 1},
            ${s.stop_type || 'waypoint'},
            ${s.location_code || null}, ${s.location_name || null}, ${s.address || null},
            ${s.contact_name || null}, ${s.contact_phone || null},
            ${s.car_pickup_id || null}, ${s.car_pickup_external || null},
            ${s.car_dropoff_id || null}, ${s.car_dropoff_external || null},
            ${toMySqlDt(s.arrival_planned)}, ${toMySqlDt(s.arrival_actual)},
            ${s.notes || null}
          )
        `
      }
    }

    return NextResponse.json({ data: { id }, error: null })
  } catch (e: any) {
    console.error('[PATCH /api/transport-requests]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── DELETE (soft) ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT created_by FROM transport_requests WHERE id = ${id} LIMIT 1
    `
    if (rows.length === 0) return NextResponse.json({ error: '없음' }, { status: 404 })
    const isOwner = rows[0].created_by === user.id
    if (!isOwner && user.role !== 'admin') {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    await prisma.$executeRaw`
      UPDATE transport_requests SET deleted_at = NOW() WHERE id = ${id}
    `
    return NextResponse.json({ data: { id, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
