import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/operations/dispatch-orders — PR-OPS-REDESIGN Phase 1
 *
 * 차량운영 「접수/오더」 — RideAccidents.workflow_stage='replacement_requested' 인
 * 대차요청 사고에 대한 상담 + 예상 일정 관리.
 *
 * GET ?stage=new|consulting|scheduled|dispatched|done|cancelled (optional)
 *     - operations_dispatch_orders + ride_accidents 조인
 *     - Rule 23 graceful fallback: 테이블 미적용 시 빈 배열
 *
 * POST { ride_accident_id, consultation_note?, customer_request?,
 *        expected_dispatch_date?, expected_return_date?, assigned_to? }
 *     - 신설 (status='new' default)
 *     - 동일 ride_accident_id 의 active dispatch_order 있으면 차단 (app 레벨 UNIQUE)
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const url = new URL(request.url)
    const stageInput = url.searchParams.get('stage') // optional filter
    const ALLOWED_STAGES = ['new', 'consulting', 'scheduled', 'dispatched', 'done', 'cancelled']
    const stage = stageInput && ALLOWED_STAGES.includes(stageInput) ? stageInput : null
    const limit = Math.min(Number(url.searchParams.get('limit') || 500), 1000)
    // 2026-05-26 hotfix: cafe24 키 직접 필터 (BigInt mismatch / limit 누락 회피)
    const cafe24Idno = url.searchParams.get('cafe24_otpt_idno')
    const cafe24Mddt = url.searchParams.get('cafe24_otpt_mddt')
    const cafe24Srno = url.searchParams.get('cafe24_otpt_srno')
    const rideAccIdInput = url.searchParams.get('ride_accident_id')

    // ride_accidents 가 INT id, operations_dispatch_orders.ride_accident_id INT
    // graceful fallback: 테이블 미적용 시 빈 배열
    // P2.1c-1: cafe24_otpt_* 컬럼이 있을 수도, 없을 수도 (마이그 미적용 케이스)
    // Try with new columns; if fail, fallback.
    const baseSqlWithCafe24 = `SELECT
         o.id, o.ride_accident_id, o.consultation_note, o.customer_request,
         o.expected_dispatch_date, o.expected_return_date,
         o.status, o.assigned_to, o.fmi_rental_id,
         o.created_at, o.updated_at, o.created_by, o.updated_by,
         o.cafe24_otpt_idno, o.cafe24_otpt_mddt, o.cafe24_otpt_srno,
         a.id              AS acc_id,
         a.accident_date   AS acc_date,
         a.accident_location AS acc_location,
         a.driver_name     AS acc_driver_name,
         a.driver_phone    AS acc_driver_phone,
         a.insurance_company AS acc_insurance_company,
         a.insurance_claim_no AS acc_claim_no,
         a.workflow_stage  AS acc_stage,
         a.car_id          AS acc_car_id,
         a.created_at      AS acc_created_at
       FROM operations_dispatch_orders o
       LEFT JOIN ride_accidents a ON a.id = o.ride_accident_id`
    const baseSqlLegacy = `SELECT
         o.id, o.ride_accident_id, o.consultation_note, o.customer_request,
         o.expected_dispatch_date, o.expected_return_date,
         o.status, o.assigned_to, o.fmi_rental_id,
         o.created_at, o.updated_at, o.created_by, o.updated_by,
         a.id              AS acc_id,
         a.accident_date   AS acc_date,
         a.accident_location AS acc_location,
         a.driver_name     AS acc_driver_name,
         a.driver_phone    AS acc_driver_phone,
         a.insurance_company AS acc_insurance_company,
         a.insurance_claim_no AS acc_claim_no,
         a.workflow_stage  AS acc_stage,
         a.car_id          AS acc_car_id,
         a.created_at      AS acc_created_at
       FROM operations_dispatch_orders o
       LEFT JOIN ride_accidents a ON a.id = o.ride_accident_id`
    const baseSql = baseSqlWithCafe24
    // 2026-05-26 hotfix: cafe24 / ride_accident_id 직접 필터 (페이지 fetchOrder 정합성)
    const wheres: string[] = []
    const params: unknown[] = []
    if (stage) { wheres.push('o.status = ?'); params.push(stage) }
    if (cafe24Idno) { wheres.push('o.cafe24_otpt_idno = ?'); params.push(cafe24Idno) }
    if (cafe24Mddt) { wheres.push('o.cafe24_otpt_mddt = ?'); params.push(cafe24Mddt) }
    if (cafe24Srno) { wheres.push('o.cafe24_otpt_srno = ?'); params.push(parseInt(cafe24Srno, 10)) }
    if (rideAccIdInput) { wheres.push('o.ride_accident_id = ?'); params.push(parseInt(rideAccIdInput, 10)) }
    const whereClause = wheres.length ? ` WHERE ${wheres.join(' AND ')}` : ''
    const sql = `${baseSql}${whereClause} ORDER BY o.created_at DESC LIMIT ${limit}`
    const rows = await prisma.$queryRawUnsafe<Array<any>>(sql, ...params).catch(async (e: any) => {
      // P2.1c-1: cafe24_otpt_* 미적용 시 fallback
      if (e?.message?.includes("Unknown column 'o.cafe24_otpt_")) {
        // cafe24 키 필터는 불가 — stage / ride_accident_id 만 남김
        const fallbackWheres: string[] = []
        const fallbackParams: unknown[] = []
        if (stage) { fallbackWheres.push('o.status = ?'); fallbackParams.push(stage) }
        if (rideAccIdInput) { fallbackWheres.push('o.ride_accident_id = ?'); fallbackParams.push(parseInt(rideAccIdInput, 10)) }
        const fbClause = fallbackWheres.length ? ` WHERE ${fallbackWheres.join(' AND ')}` : ''
        const fallbackSql = `${baseSqlLegacy}${fbClause} ORDER BY o.created_at DESC LIMIT ${limit}`
        return await prisma.$queryRawUnsafe<Array<any>>(fallbackSql, ...fallbackParams).catch(() => [])
      }
      console.warn('[dispatch-orders GET] table not yet migrated:', e?.message?.slice(0, 200))
      return []
    })

    // 2026-05-26 hotfix: BigInt 직렬화 안전화 (ride_accident_id 등 INT 컬럼이
    //   prisma raw 에서 간헐적으로 BigInt 로 와서 client `===` 비교 mismatch 유발)
    const safeData = JSON.parse(JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))
    return NextResponse.json({
      data: safeData,
      total: safeData.length,
      _migration_pending: safeData.length === 0 ? false : undefined,
    })
  } catch (e: any) {
    console.error('[dispatch-orders GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const {
      ride_accident_id,
      consultation_note,
      customer_request,
      expected_dispatch_date,
      expected_return_date,
      assigned_to,
      status: statusInput,
      // P2.1c-1: cafe24 키 (사고접수 상세에서 「대차로 진행」 시 같이 send)
      cafe24_otpt_idno,
      cafe24_otpt_mddt,
      cafe24_otpt_srno,
    } = body || {}

    const rideAccId = Number(ride_accident_id)
    if (!rideAccId || Number.isNaN(rideAccId)) {
      return NextResponse.json({ error: 'ride_accident_id 필수 (INT)' }, { status: 400 })
    }

    // app 레벨 UNIQUE: 같은 ride_accident_id 에 active dispatch_order 있으면 차단
    const dup = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT id FROM operations_dispatch_orders
        WHERE ride_accident_id = ?
          AND status NOT IN ('cancelled', 'done')
        LIMIT 1`,
      rideAccId,
    ).catch(() => [])

    if (dup.length > 0) {
      return NextResponse.json({
        error: '이미 진행 중인 dispatch_order 가 있습니다',
        existing_id: dup[0].id,
      }, { status: 409 })
    }

    const newId = randomUUID()
    const status = ['new', 'consulting', 'scheduled', 'dispatched', 'done', 'cancelled']
      .includes(statusInput) ? statusInput : 'new'

    // P2.1c-1: cafe24_otpt_* 컬럼 (마이그 미적용 시 graceful — try/catch)
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO operations_dispatch_orders
           (id, ride_accident_id, consultation_note, customer_request,
            expected_dispatch_date, expected_return_date,
            status, assigned_to, created_by, updated_by,
            cafe24_otpt_idno, cafe24_otpt_mddt, cafe24_otpt_srno)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId,
        rideAccId,
        consultation_note || null,
        customer_request || null,
        expected_dispatch_date || null,
        expected_return_date || null,
        status,
        assigned_to || null,
        user.id || null,
        user.id || null,
        cafe24_otpt_idno || null,
        cafe24_otpt_mddt || null,
        cafe24_otpt_srno || null,
      )
    } catch (e: any) {
      // 마이그 미적용 (cafe24_otpt_* 컬럼 없음) — fallback to old INSERT
      if (e?.message?.includes("Unknown column 'cafe24_otpt_")) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO operations_dispatch_orders
             (id, ride_accident_id, consultation_note, customer_request,
              expected_dispatch_date, expected_return_date,
              status, assigned_to, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          newId,
          rideAccId,
          consultation_note || null,
          customer_request || null,
          expected_dispatch_date || null,
          expected_return_date || null,
          status,
          assigned_to || null,
          user.id || null,
          user.id || null,
        )
      } else {
        throw e
      }
    }

    return NextResponse.json({
      ok: true,
      id: newId,
      ride_accident_id: rideAccId,
      status,
      message: 'dispatch_order 신설 완료',
    })
  } catch (e: any) {
    console.error('[dispatch-orders POST]', e)
    // 마이그레이션 미적용 케이스 진단
    if (e?.message?.includes("doesn't exist") || e?.message?.includes('Unknown table')) {
      return NextResponse.json({
        error: 'operations_dispatch_orders 테이블 미적용 — 마이그레이션 SQL 실행 필요',
        _migration_pending: true,
        sql_file: 'migrations/2026-05-11_operations_dispatch_orders.sql',
      }, { status: 503 })
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
