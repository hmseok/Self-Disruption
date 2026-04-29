import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════════
// 보험 CRUD API
//
// GET    /api/insurance               목록
// POST   /api/insurance               신규 등록 (contract + allocations + schedules)
// PATCH  /api/insurance?id=xxx        수정
// DELETE /api/insurance?id=xxx        soft delete (deleted_at)
//
// 차량 분담 매칭 우선순위:
//   1) car_id 직접 지정 (사용자 입력)
//   2) VIN → cars.vin 매칭
//   3) 둘 다 없으면 vin/vehicle_label 만 보존 (사용자 추후 매핑)
// ═══════════════════════════════════════════════════════════════

function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

interface AllocationInput {
  car_id?: string | null
  vin?: string | null
  vehicle_label?: string | null
  premium_amount: number
  ratio?: number | null
  coverage_note?: string | null
}

interface ScheduleInput {
  installment_no: number
  due_date: string  // YYYY-MM-DD
  amount: number
}

interface ContractInput {
  insurance_company: string
  policy_number?: string | null
  design_number?: string | null
  vehicle_class?: string | null
  start_date: string
  end_date: string
  total_premium: number
  contract_type?: 'individual' | 'fleet'
  payment_type?: 'lump' | 'installment'
  installment_count?: number
  document_url?: string | null
  ocr_confidence?: number | null
  memo?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    const carId = searchParams.get('car_id')
    const status = searchParams.get('status')

    // 단건 상세
    if (id) {
      const contract = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM insurance_contracts WHERE id = ? LIMIT 1`,
        id
      )
      if (!contract[0]) return NextResponse.json({ data: null })

      const allocations = await prisma.$queryRawUnsafe<any[]>(
        `SELECT iva.*, c.number AS car_number, CONCAT_WS(' ', c.brand, c.model) AS car_model
           FROM insurance_vehicle_allocations iva
           LEFT JOIN cars c ON c.id = iva.car_id
          WHERE iva.contract_id = ?
          ORDER BY iva.premium_amount DESC`,
        id
      )

      const schedules = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM insurance_payment_schedule
          WHERE contract_id = ?
          ORDER BY installment_no ASC`,
        id
      )

      return NextResponse.json({
        data: serialize({ contract: contract[0], allocations, schedules })
      })
    }

    // 목록
    const conditions: string[] = []
    const params: any[] = []
    if (carId) {
      conditions.push(`id IN (SELECT contract_id FROM insurance_vehicle_allocations WHERE car_id = ?)`)
      params.push(carId)
    }
    if (status) {
      // active: 만기 전, expired: 만기 지남
      const today = new Date().toISOString().slice(0, 10)
      if (status === 'active') { conditions.push(`end_date >= ?`); params.push(today) }
      else if (status === 'expired') { conditions.push(`end_date < ?`); params.push(today) }
    }
    const whereSql = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    const list = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, insurance_company, policy_number, design_number, vehicle_class,
              start_date, end_date, total_premium, contract_type, payment_type,
              installment_count, document_url, created_at,
              (SELECT COUNT(*) FROM insurance_vehicle_allocations WHERE contract_id = ic.id) AS vehicle_count,
              (SELECT due_date FROM insurance_payment_schedule
                 WHERE contract_id = ic.id AND status = 'pending'
                 ORDER BY due_date ASC LIMIT 1) AS next_due_date,
              (SELECT amount FROM insurance_payment_schedule
                 WHERE contract_id = ic.id AND status = 'pending'
                 ORDER BY due_date ASC LIMIT 1) AS next_due_amount
         FROM insurance_contracts ic
         ${whereSql}
         ORDER BY end_date DESC, created_at DESC
         LIMIT 500`,
      ...params
    )

    // 통계
    const today = new Date().toISOString().slice(0, 10)
    const stats = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN end_date >= ? THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN end_date < ? THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN end_date >= ? AND end_date <= DATE_ADD(?, INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS expiring_soon,
         COALESCE(SUM(total_premium), 0) AS total_premium_sum
       FROM insurance_contracts`,
      today, today, today, today
    )

    return NextResponse.json({
      data: serialize(list),
      stats: serialize(stats[0] || {}),
    })
  } catch (e: any) {
    console.error('[GET /api/insurance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { contract, allocations = [], schedules = [] } = body as {
      contract: ContractInput
      allocations: AllocationInput[]
      schedules: ScheduleInput[]
    }

    // ── 검증 ──
    if (!contract?.insurance_company) {
      return NextResponse.json({ error: '보험사 필수' }, { status: 400 })
    }
    if (!contract.start_date || !contract.end_date) {
      return NextResponse.json({ error: '시작일/종료일 필수' }, { status: 400 })
    }
    if (!Number.isFinite(contract.total_premium) || contract.total_premium <= 0) {
      return NextResponse.json({ error: '총 보험료 필수' }, { status: 400 })
    }
    if (allocations.length === 0) {
      return NextResponse.json({ error: '차량 분담 최소 1건 필요' }, { status: 400 })
    }

    // 합계 검증 (1원 오차 허용)
    const allocSum = allocations.reduce((s, a) => s + Number(a.premium_amount || 0), 0)
    if (Math.abs(allocSum - contract.total_premium) > 1) {
      return NextResponse.json({
        error: `차량 분담 합계(${allocSum.toLocaleString()}원)가 총 보험료(${contract.total_premium.toLocaleString()}원)와 일치하지 않습니다`
      }, { status: 400 })
    }

    if (schedules.length > 0) {
      const schSum = schedules.reduce((s, x) => s + Number(x.amount || 0), 0)
      if (Math.abs(schSum - contract.total_premium) > 1) {
        return NextResponse.json({
          error: `납입 스케줄 합계(${schSum.toLocaleString()}원)가 총 보험료(${contract.total_premium.toLocaleString()}원)와 일치하지 않습니다`
        }, { status: 400 })
      }
    }

    const contractId = randomUUID()

    // ── 1. insurance_contracts ──
    await prisma.$executeRawUnsafe(
      `INSERT INTO insurance_contracts (
         id, insurance_company, policy_number, design_number, vehicle_class,
         start_date, end_date, total_premium, contract_type, payment_type,
         installment_count, document_url, ocr_confidence, memo,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      contractId,
      contract.insurance_company,
      contract.policy_number || null,
      contract.design_number || null,
      contract.vehicle_class || null,
      contract.start_date,
      contract.end_date,
      contract.total_premium,
      contract.contract_type || 'individual',
      contract.payment_type || 'lump',
      contract.installment_count || 1,
      contract.document_url || null,
      contract.ocr_confidence ?? null,
      contract.memo || null
    )

    // ── 2. insurance_vehicle_allocations ──
    for (const a of allocations) {
      // car_id 미지정 + VIN 있으면 cars 자동 매칭 시도
      let resolvedCarId = a.car_id || null
      if (!resolvedCarId && a.vin) {
        const matched = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM cars WHERE vin = ? LIMIT 1`, a.vin
        )
        if (matched[0]) resolvedCarId = matched[0].id
      }
      const ratio = a.ratio ?? (Number(a.premium_amount) / Number(contract.total_premium))
      await prisma.$executeRawUnsafe(
        `INSERT INTO insurance_vehicle_allocations (
           id, contract_id, car_id, vin, vehicle_label,
           premium_amount, ratio, coverage_note
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        contractId,
        resolvedCarId,
        a.vin || null,
        a.vehicle_label || null,
        Number(a.premium_amount),
        ratio,
        a.coverage_note || null
      )
    }

    // ── 3. insurance_payment_schedule ──
    for (const s of schedules) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO insurance_payment_schedule (
           id, contract_id, installment_no, due_date, amount, status
         ) VALUES (?, ?, ?, ?, ?, 'pending')`,
        randomUUID(),
        contractId,
        Number(s.installment_no),
        s.due_date,
        Number(s.amount)
      )
    }

    return NextResponse.json({ ok: true, id: contractId })
  } catch (e: any) {
    console.error('[POST /api/insurance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

    const body = await request.json()
    const { contract, allocations, schedules } = body

    // 계약 정보 수정
    if (contract) {
      const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/
      const entries = Object.entries(contract).filter(([k]) => SAFE_COL.test(k))
      if (entries.length > 0) {
        const setClause = entries.map(([k]) => `\`${k}\` = ?`).join(', ')
        const values = entries.map(([, v]) => v as any)
        await prisma.$executeRawUnsafe(
          `UPDATE insurance_contracts SET ${setClause}, updated_at = NOW() WHERE id = ?`,
          ...values, id
        )
      }
    }

    // 분담 / 스케줄은 전체 교체 방식 (안전)
    if (Array.isArray(allocations)) {
      await prisma.$executeRawUnsafe(`DELETE FROM insurance_vehicle_allocations WHERE contract_id = ?`, id)
      for (const a of allocations as AllocationInput[]) {
        let resolvedCarId = a.car_id || null
        if (!resolvedCarId && a.vin) {
          const matched = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM cars WHERE vin = ? LIMIT 1`, a.vin
          )
          if (matched[0]) resolvedCarId = matched[0].id
        }
        await prisma.$executeRawUnsafe(
          `INSERT INTO insurance_vehicle_allocations (id, contract_id, car_id, vin, vehicle_label, premium_amount, ratio, coverage_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(), id, resolvedCarId, a.vin || null, a.vehicle_label || null,
          Number(a.premium_amount), a.ratio ?? null, a.coverage_note || null
        )
      }
    }

    if (Array.isArray(schedules)) {
      // 매칭 안된 스케줄만 삭제 (이미 매칭된 건 보존)
      await prisma.$executeRawUnsafe(
        `DELETE FROM insurance_payment_schedule WHERE contract_id = ? AND status = 'pending'`, id
      )
      for (const s of schedules as ScheduleInput[]) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO insurance_payment_schedule (id, contract_id, installment_no, due_date, amount, status)
           VALUES (?, ?, ?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE due_date = VALUES(due_date), amount = VALUES(amount)`,
          randomUUID(), id, Number(s.installment_no), s.due_date, Number(s.amount)
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[PATCH /api/insurance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

    // hard delete (cascading allocations/schedules도 함께)
    await prisma.$executeRawUnsafe(`DELETE FROM insurance_vehicle_allocations WHERE contract_id = ?`, id)
    await prisma.$executeRawUnsafe(`DELETE FROM insurance_payment_schedule WHERE contract_id = ?`, id)
    await prisma.$executeRawUnsafe(`DELETE FROM insurance_contracts WHERE id = ?`, id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[DELETE /api/insurance]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
