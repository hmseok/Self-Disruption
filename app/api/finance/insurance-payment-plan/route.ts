import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * /api/finance/insurance-payment-plan
 *
 * 차량별 보험금 분납계획서 CRUD (PR-UX9, 2026-05-09).
 *
 * GET — 활성 분납계획서 목록 (?vehicle_id 또는 ?insurance_company 필터)
 * POST — 신규 분납계획 등록 (단건 또는 일괄 — body.items 배열)
 * PUT  — 수정 (body.id 필수)
 * DELETE — ?id=xxx 삭제 (또는 status='cancelled')
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const vehicleId = searchParams.get('vehicle_id')
    const company = searchParams.get('insurance_company')
    const statusFilter = searchParams.get('status') || 'active'

    let sql = `
      SELECT ipp.*, c.number AS car_number, c.brand, c.model
        FROM insurance_payment_plan ipp
        LEFT JOIN cars c ON c.id = ipp.vehicle_id
       WHERE 1=1
    `
    const params: any[] = []
    if (statusFilter !== 'all') { sql += ` AND ipp.status = ?`; params.push(statusFilter) }
    if (vehicleId) { sql += ` AND ipp.vehicle_id = ?`; params.push(vehicleId) }
    if (company)   { sql += ` AND ipp.insurance_company = ?`; params.push(company) }
    sql += ` ORDER BY ipp.period_start DESC, c.number ASC LIMIT 1000`

    let rows: any[] = []
    try {
      rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)
    } catch (e: any) {
      // 테이블 미적용 — 빈 배열 + migration 안내
      return NextResponse.json({
        items: [], total: 0,
        _migration_pending: true,
        message: 'insurance_payment_plan 테이블 미적용 — migrations/2026-05-09_insurance_payment_plan.sql 실행 필요',
      })
    }

    return NextResponse.json({
      items: rows.map(r => ({
        ...r,
        monthly_premium: Number(r.monthly_premium || 0),
        total_premium: Number(r.total_premium || 0),
      })),
      total: rows.length,
    })
  } catch (e: any) {
    console.error('[insurance-payment-plan GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const items: Array<any> = Array.isArray(body.items) ? body.items : [body]

    let inserted = 0
    const errors: string[] = []

    for (const it of items) {
      try {
        const id = it.id || randomUUID()
        const vehicleId = String(it.vehicle_id || '')
        const company = String(it.insurance_company || '')
        const policyNo = it.policy_no ? String(it.policy_no) : null
        const periodStart = String(it.period_start || '').slice(0, 10)
        const periodEnd = String(it.period_end || '').slice(0, 10)
        const monthlyPremium = Number(it.monthly_premium || 0)
        const totalPremium = Number(it.total_premium || 0)
        const installmentCount = Number(it.installment_count || 12)
        const paymentDay = it.payment_day ? Number(it.payment_day) : null
        const status = String(it.status || 'active')
        const note = it.note ? String(it.note) : null

        if (!vehicleId || !company || !periodStart || !periodEnd) {
          errors.push(`필수 필드 누락 (vehicle_id/insurance_company/period_start/period_end)`)
          continue
        }
        if (monthlyPremium <= 0) {
          errors.push(`monthly_premium 양수 필요`)
          continue
        }

        await prisma.$executeRawUnsafe(
          `INSERT INTO insurance_payment_plan
             (id, vehicle_id, insurance_company, policy_no, period_start, period_end,
              monthly_premium, total_premium, installment_count, payment_day, status, note,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             insurance_company = VALUES(insurance_company),
             policy_no = VALUES(policy_no),
             period_start = VALUES(period_start),
             period_end = VALUES(period_end),
             monthly_premium = VALUES(monthly_premium),
             total_premium = VALUES(total_premium),
             installment_count = VALUES(installment_count),
             payment_day = VALUES(payment_day),
             status = VALUES(status),
             note = VALUES(note),
             updated_at = NOW()`,
          id, vehicleId, company, policyNo, periodStart, periodEnd,
          monthlyPremium, totalPremium, installmentCount, paymentDay, status, note,
        )
        inserted++
      } catch (e: any) {
        errors.push(e?.message?.slice(0, 200) || String(e))
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      inserted,
      errors,
      message: `${inserted}건 등록${errors.length > 0 ? ` (실패 ${errors.length}건)` : ''}`,
    })
  } catch (e: any) {
    console.error('[insurance-payment-plan POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const hardDelete = searchParams.get('hard') === '1'
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    if (hardDelete) {
      await prisma.$executeRawUnsafe(`DELETE FROM insurance_payment_plan WHERE id = ?`, id)
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE insurance_payment_plan SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
        id,
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[insurance-payment-plan DELETE]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
