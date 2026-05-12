/**
 * GET  /api/ride-settlements/[id]/extract-vehicles  — 미등록 차량 후보 분석
 * POST /api/ride-settlements/[id]/extract-vehicles  — 일괄 등록 (ride_contracts INSERT)
 *
 * 흐름:
 *   1. settlement_items 의 (customer_id, car_number, exec_no, cust_name, product)
 *   2. ride_contracts WHERE car_number IN (...) 존재 확인
 *   3. 미등록 차량 → 카페24 pmccarsm enrichment (vin/모델/차주명) 가능 시
 *   4. POST 시 일괄 INSERT (INSERT IGNORE — exec_no UNIQUE)
 *
 * PR-6.11.d
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { cafe24Db } from '@/lib/cafe24-db'
import { randomUUID } from 'crypto'
import type { RowDataPacket } from 'mysql2'

interface ItemRow {
  id: string
  exec_no: string | null
  car_number: string | null
  car_model: string | null
  vin: string | null
  cust_name: string | null
  sub_customer: string | null
  product_name: string | null
  exec_date: string | null
  loan_end_date: string | null
  exec_status: string | null
  monthly_fee: string | null
  matched_cafe24_idno: string | null
}

interface ContractRow {
  car_number: string
  exec_no: string | null
}

interface Cafe24CarRow extends RowDataPacket {
  carsidno: string
  carsnums: string | null
  carsodnm: string | null
  carsusnm: string | null
  carschnm: string | null  // 차대번호 — column 확인 필요 (carschnm 추정)
}

// ─── GET: 미등록 차량 후보 분석 ──────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  try {
    // 1. settlement 의 customer_id 조회
    const [settlement] = await prisma.$queryRaw<{ customer_id: string | null; customer_name_snap: string | null }[]>`
      SELECT customer_id, customer_name_snap FROM ride_settlements WHERE id = ${id} LIMIT 1
    `
    if (!settlement) {
      return NextResponse.json({ success: false, error: 'settlement not-found' }, { status: 404 })
    }

    // 2. items
    const items = await prisma.$queryRaw<ItemRow[]>`
      SELECT id, exec_no, car_number, car_model, vin, cust_name, sub_customer,
             product_name, exec_date, loan_end_date, exec_status, monthly_fee, matched_cafe24_idno
        FROM ride_settlement_items
       WHERE settlement_id = ${id}
         AND car_number IS NOT NULL
    `

    // 3. 차량별 unique
    const byCarNumber = new Map<string, ItemRow>()
    for (const it of items) {
      if (!it.car_number) continue
      if (!byCarNumber.has(it.car_number)) byCarNumber.set(it.car_number, it)
    }
    const carNumbers = Array.from(byCarNumber.keys())

    // 4. ride_contracts 중복 체크
    let existingCars = new Set<string>()
    if (carNumbers.length > 0) {
      const placeholders = carNumbers.map(() => '?').join(',')
      const existing = await prisma.$queryRawUnsafe<ContractRow[]>(
        `SELECT car_number, exec_no FROM ride_contracts WHERE car_number IN (${placeholders})`,
        ...carNumbers
      )
      existingCars = new Set(existing.map(e => e.car_number))
    }

    // 5. 카페24 enrichment (선택 — 차량 검증)
    const cafe24ByCar = new Map<string, Cafe24CarRow>()
    if (carNumbers.length > 0) {
      try {
        const today = new Date()
        const todayStr =
          today.getFullYear().toString() +
          String(today.getMonth() + 1).padStart(2, '0') +
          String(today.getDate()).padStart(2, '0')
        const batchSize = 200
        for (let i = 0; i < carNumbers.length; i += batchSize) {
          const batch = carNumbers.slice(i, i + batchSize)
          const placeholders = batch.map(() => '?').join(',')
          const sql = `
            SELECT carsidno, carsnums, carsodnm, carsusnm
              FROM pmccarsm
             WHERE ? BETWEEN carsfrdt AND carstodt
               AND carsnums IN (${placeholders})
          `
          const rows = await cafe24Db.query<Cafe24CarRow>(sql, [todayStr, ...batch])
          for (const r of rows) {
            if (r.carsnums && !cafe24ByCar.has(r.carsnums)) cafe24ByCar.set(r.carsnums, r)
          }
        }
      } catch (e) {
        console.warn('[extract-vehicles cafe24]', (e as Error).message)
      }
    }

    // 6. 후보 분류
    const candidates: Array<{
      item_id: string
      car_number: string
      exec_no: string | null
      car_model: string | null
      cust_name: string | null
      product_name: string | null
      cafe24_carsidno: string | null
      cafe24_owner: string | null
    }> = []
    let alreadyRegistered = 0
    for (const [car, it] of byCarNumber) {
      if (existingCars.has(car)) {
        alreadyRegistered++
        continue
      }
      const cafe24 = cafe24ByCar.get(car)
      candidates.push({
        item_id: it.id,
        car_number: car,
        exec_no: it.exec_no,
        car_model: it.car_model || cafe24?.carsodnm || null,
        cust_name: it.sub_customer || it.cust_name || cafe24?.carsusnm || null,
        product_name: it.product_name,
        cafe24_carsidno: cafe24?.carsidno || it.matched_cafe24_idno || null,
        cafe24_owner: cafe24?.carsusnm || null,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        settlement_id: id,
        customer_id: settlement.customer_id,
        customer_name: settlement.customer_name_snap,
        total_items: items.length,
        unique_cars: carNumbers.length,
        already_registered: alreadyRegistered,
        candidates_count: candidates.length,
        cafe24_enriched: cafe24ByCar.size,
        candidates: candidates.slice(0, 500),  // limit
      },
      meta: { fetched_at: new Date().toISOString() },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[extract-vehicles GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}

// ─── POST: 일괄 등록 ──────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  const { id } = await params

  let body: { item_ids?: string[] } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }
  const itemIds = Array.isArray(body.item_ids) ? body.item_ids : []
  if (itemIds.length === 0) {
    return NextResponse.json({ success: false, error: 'item_ids 필요' }, { status: 400 })
  }

  // 1. settlement customer_id 조회
  const [settlement] = await prisma.$queryRaw<{ customer_id: string | null }[]>`
    SELECT customer_id FROM ride_settlements WHERE id = ${id} LIMIT 1
  `
  if (!settlement) return NextResponse.json({ success: false, error: 'settlement not-found' }, { status: 404 })

  // 2. items 조회
  const placeholders = itemIds.map(() => '?').join(',')
  const items = await prisma.$queryRawUnsafe<ItemRow[]>(
    `SELECT id, exec_no, car_number, car_model, vin, cust_name, sub_customer,
            product_name, exec_date, loan_end_date, exec_status, monthly_fee
       FROM ride_settlement_items
      WHERE id IN (${placeholders})`,
    ...itemIds
  )

  const userTyped = user as { id: string; name?: string }
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  for (const it of items) {
    try {
      const contractId = randomUUID()
      const result = await prisma.$executeRaw`
        INSERT IGNORE INTO ride_contracts
          (id, customer_id, exec_no, car_number, car_model, vin,
           contractor, contract_product,
           contract_start, contract_end, monthly_fee, status,
           created_by, created_by_name)
        VALUES
          (${contractId}, ${settlement.customer_id}, ${it.exec_no},
           ${it.car_number}, ${it.car_model}, ${it.vin},
           ${it.sub_customer || it.cust_name},
           ${it.product_name},
           ${it.exec_date}, ${it.loan_end_date}, ${it.monthly_fee},
           ${it.exec_status === '마감' || it.exec_status === '해지' ? 'terminated' : 'active'},
           ${userTyped.id}, ${userTyped.name || null})
      `
      if (Number(result) === 1) inserted++
      else skipped++
    } catch (e) {
      errors.push(`${it.car_number || it.exec_no}: ${(e as Error).message}`)
      if (errors.length >= 10) break
    }
  }

  return NextResponse.json({
    success: true,
    result: {
      requested: itemIds.length,
      found: items.length,
      inserted,
      skipped,  // 중복 (exec_no UNIQUE)
      errors: errors.length,
    },
    errors: errors.slice(0, 10),
  })
}
