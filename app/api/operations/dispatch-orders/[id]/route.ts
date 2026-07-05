import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/operations/dispatch-orders/[id]
 *
 * GET    — 단일 조회 (ride_accidents JOIN)
 * PATCH  — 수정 (status / consultation / expected dates / assigned_to)
 * DELETE — 삭제 (status='cancelled' 로 soft delete, 실 DELETE 는 admin 검토 필요)
 *
 * 변경 가능 필드 (UI 입력 가능):
 *   - consultation_note (TEXT)
 *   - customer_request (TEXT)
 *   - expected_dispatch_date (DATE 'YYYY-MM-DD')
 *   - expected_return_date (DATE 'YYYY-MM-DD')
 *   - status (ENUM)
 *   - assigned_to (VARCHAR)
 *
 * 변경 불가 (immutable):
 *   - id, ride_accident_id, fmi_rental_id (confirm API 만)
 *   - created_at, created_by
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_STATUS = ['new', 'consulting', 'scheduled', 'dispatched', 'done', 'cancelled']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT
         o.*,
         a.accident_date, a.accident_location,
         a.driver_name AS acc_driver_name,
         a.driver_phone AS acc_driver_phone,
         a.insurance_company AS acc_insurance_company,
         a.insurance_claim_no AS acc_claim_no,
         a.workflow_stage  AS acc_stage,
         a.car_id          AS acc_car_id,
         a.created_at      AS acc_created_at
       FROM operations_dispatch_orders o
       LEFT JOIN ride_accidents a ON a.id = o.ride_accident_id
       WHERE o.id = ?
       LIMIT 1`,
      id,
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    return NextResponse.json({ data: rows[0] })
  } catch (e: any) {
    console.error('[dispatch-orders GET id]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const {
      consultation_note,
      customer_request,
      delivery_json,
      expected_dispatch_date,
      expected_return_date,
      status,
      assigned_to,
    } = body || {}

    // 변경 set 동적 구성 — 안전한 컬럼 화이트리스트
    const sets: string[] = []
    const vals: any[] = []

    if (consultation_note !== undefined) {
      sets.push('consultation_note = ?'); vals.push(consultation_note || null)
    }
    if (customer_request !== undefined) {
      sets.push('customer_request = ?'); vals.push(customer_request || null)
    }
    if (delivery_json !== undefined) {
      sets.push('delivery_json = ?'); vals.push(delivery_json || null)  // JSON 문자열 (탁송 지시 구조)
    }
    if (expected_dispatch_date !== undefined) {
      sets.push('expected_dispatch_date = ?'); vals.push(expected_dispatch_date || null)
    }
    if (expected_return_date !== undefined) {
      sets.push('expected_return_date = ?'); vals.push(expected_return_date || null)
    }
    if (status !== undefined) {
      if (!ALLOWED_STATUS.includes(status)) {
        return NextResponse.json({ error: `status 허용값: ${ALLOWED_STATUS.join(', ')}` }, { status: 400 })
      }
      sets.push('status = ?'); vals.push(status)
    }
    if (assigned_to !== undefined) {
      sets.push('assigned_to = ?'); vals.push(assigned_to || null)
    }

    // PR-QUOTE (V8) — 상담 단계 견적 필드. 컬럼 미적용 DB 는 아래 1054 fallback 처리.
    const quoteSets: string[] = []
    const quoteVals: any[] = []
    const q = body || {}
    if (q.claim_type !== undefined) { quoteSets.push('claim_type = ?'); quoteVals.push(q.claim_type || null) }
    if (q.insurance_claim_no !== undefined) { quoteSets.push('insurance_claim_no = ?'); quoteVals.push(q.insurance_claim_no || null) }
    if (q.fault_rate !== undefined) { quoteSets.push('fault_rate = ?'); quoteVals.push(q.fault_rate === null || q.fault_rate === '' ? null : Number(q.fault_rate)) }
    if (q.claim_rate !== undefined) { quoteSets.push('claim_rate = ?'); quoteVals.push(q.claim_rate === null || q.claim_rate === '' ? null : Number(q.claim_rate)) }
    if (q.quote_vehicle_category !== undefined) { quoteSets.push('quote_vehicle_category = ?'); quoteVals.push(q.quote_vehicle_category || null) }
    if (q.quote_days !== undefined) { quoteSets.push('quote_days = ?'); quoteVals.push(q.quote_days === null || q.quote_days === '' ? null : Number(q.quote_days)) }
    if (q.quote_amount !== undefined) { quoteSets.push('quote_amount = ?'); quoteVals.push(q.quote_amount === null || q.quote_amount === '' ? null : Number(q.quote_amount)) }

    if (sets.length === 0 && quoteSets.length === 0) {
      return NextResponse.json({ error: '변경 필드 없음' }, { status: 400 })
    }

    // updated_by 자동 추가
    sets.push('updated_by = ?'); vals.push(user.id || null)

    const runUpdate = async (withQuote: boolean) => {
      const s = withQuote ? [...quoteSets, ...sets] : sets
      const v = withQuote ? [...quoteVals, ...vals, id] : [...vals, id]
      const sql = `UPDATE operations_dispatch_orders SET ${s.join(', ')} WHERE id = ?`
      return prisma.$executeRawUnsafe(sql, ...v)
    }

    let migrationPending = false
    let result: any
    try {
      result = await runUpdate(quoteSets.length > 0)
    } catch (e: any) {
      // V8 미적용 DB — 견적 필드 빼고 재시도 (규칙 23 graceful fallback)
      if (quoteSets.length > 0 && /Unknown column/i.test(e?.message || '')) {
        migrationPending = true
        result = await runUpdate(false)
      } else {
        throw e
      }
    }

    return NextResponse.json({
      ok: true,
      id,
      affected: Number(result),
      _migration_pending: migrationPending || undefined,
      message: migrationPending
        ? '기본 필드만 저장 — 견적 필드는 V8 마이그레이션 적용 후 저장됩니다'
        : (result > 0 ? 'dispatch_order 수정 완료' : 'id 매칭 row 없음'),
    })
  } catch (e: any) {
    console.error('[dispatch-orders PATCH id]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })

    // Soft delete — status='cancelled' (실 DELETE 는 admin 검토 후 별도 API)
    const result = await prisma.$executeRawUnsafe(
      `UPDATE operations_dispatch_orders
          SET status = 'cancelled', updated_by = ?
        WHERE id = ?
          AND status NOT IN ('dispatched', 'done')`,
      user.id || null,
      id,
    )

    if (Number(result) === 0) {
      return NextResponse.json({
        error: '취소 불가 — 이미 dispatched/done 상태이거나 id 매칭 X',
      }, { status: 409 })
    }

    return NextResponse.json({
      ok: true,
      id,
      message: 'dispatch_order 취소 처리 완료',
    })
  } catch (e: any) {
    console.error('[dispatch-orders DELETE id]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
