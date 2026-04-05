import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// Supabase 설정
const SUPABASE_URL = 'https://uiyiwgkpchnvuvpsjfxv.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

async function supabaseFetch(table: string, select = '*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Supabase ${table} fetch failed: ${res.status}`)
  return res.json()
}

// POST /api/migrate/sync-supabase — Supabase → MySQL 데이터 동기화 (admin 전용, 1회성)
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM employees WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  if (!SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'SUPABASE_ANON_KEY 환경변수 필요' }, { status: 500 })
  }

  const results: string[] = []
  const errors: string[] = []

  // ========== 1. cars 데이터 동기화 ==========
  try {
    const sbCars = await supabaseFetch('cars', '*')
    results.push(`📥 Supabase cars: ${sbCars.length}건 로드`)

    // MySQL에서 기존 차량 조회 (number로 매칭)
    const mysqlCars = await prisma.$queryRaw<any[]>`SELECT id, number FROM cars`
    const carMap = new Map(mysqlCars.map((c: any) => [c.number, c.id]))

    let updated = 0, skipped = 0
    for (const sc of sbCars) {
      const mysqlId = carMap.get(sc.number)
      if (!mysqlId) {
        results.push(`⏭️ 차량 ${sc.number} — MySQL에 없음 (스킵)`)
        skipped++
        continue
      }

      try {
        await prisma.$executeRawUnsafe(`
          UPDATE cars SET
            fuel_type = ?,
            vin = ?,
            mileage = ?,
            purchase_price = ?,
            total_cost = ?,
            is_used = ?,
            is_commercial = ?,
            purchase_mileage = ?,
            ownership_type = ?,
            registration_date = ?,
            inspection_end_date = ?,
            vehicle_age_expiry = ?,
            acq_date = ?,
            location = ?,
            owner_name = ?,
            owner_phone = ?,
            owner_bank = ?,
            owner_account = ?,
            owner_account_holder = ?,
            consignment_fee = ?,
            consignment_start = ?,
            consignment_end = ?,
            insurance_by = ?,
            consignment_contract_url = ?,
            owner_memo = ?,
            registration_tax = ?,
            bond_amount = ?,
            delivery_fee = ?,
            plate_fee = ?,
            agency_fee = ?,
            other_initial_cost = ?,
            initial_cost_memo = ?,
            notes = ?,
            capacity = ?,
            displacement = ?
          WHERE id = ?
        `,
          sc.fuel_type || null,
          sc.vin || null,
          sc.mileage || 0,
          sc.purchase_price || 0,
          sc.total_cost || 0,
          sc.is_used ? 1 : 0,
          sc.is_commercial ? 1 : 0,
          sc.purchase_mileage || 0,
          sc.ownership_type || 'company',
          sc.registration_date || null,
          sc.inspection_end_date || null,
          sc.vehicle_age_expiry || null,
          sc.acq_date || null,
          sc.location || null,
          sc.owner_name || null,
          sc.owner_phone || null,
          sc.owner_bank || null,
          sc.owner_account || null,
          sc.owner_account_holder || null,
          sc.consignment_fee || 0,
          sc.consignment_start || null,
          sc.consignment_end || null,
          sc.insurance_by || 'company',
          sc.consignment_contract_url || null,
          sc.owner_memo || null,
          sc.registration_tax || 0,
          sc.bond_amount || 0,
          sc.delivery_fee || 0,
          sc.plate_fee || 0,
          sc.agency_fee || 0,
          sc.other_initial_cost || 0,
          sc.initial_cost_memo || null,
          sc.notes || null,
          sc.capacity ? String(sc.capacity) : null,
          sc.displacement ? String(sc.displacement) : null,
          mysqlId
        )
        updated++
      } catch (e: any) {
        errors.push(`❌ 차량 ${sc.number}: ${e.message}`)
      }
    }
    results.push(`✅ cars 동기화: ${updated}건 업데이트, ${skipped}건 스킵`)
  } catch (e: any) {
    errors.push(`❌ cars 동기화 실패: ${e.message}`)
  }

  // ========== 2. insurance_contracts 데이터 동기화 ==========
  try {
    const sbInsurance = await supabaseFetch('insurance_contracts', '*')
    results.push(`📥 Supabase insurance_contracts: ${sbInsurance.length}건 로드`)

    // Supabase car_id(bigint) → MySQL car_id(uuid) 매핑을 위해
    // Supabase cars의 id→number 매핑 필요
    const sbCars = await supabaseFetch('cars', 'id,number')
    const sbIdToNumber = new Map(sbCars.map((c: any) => [String(c.id), c.number]))
    const mysqlCars = await prisma.$queryRaw<any[]>`SELECT id, number FROM cars`
    const numberToMysqlId = new Map(mysqlCars.map((c: any) => [c.number, c.id]))

    let inserted = 0
    for (const si of sbInsurance) {
      const carNumber = sbIdToNumber.get(String(si.car_id))
      const mysqlCarId = carNumber ? numberToMysqlId.get(carNumber) : null

      try {
        // UUID 생성
        const [uuidResult] = await prisma.$queryRaw<any[]>`SELECT UUID() as id`
        const newId = uuidResult.id

        await prisma.$executeRawUnsafe(`
          INSERT INTO insurance_contracts (id, car_id, insurance_company, policy_number, coverage_type, start_date, end_date, premium, deductible, status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE insurance_company = VALUES(insurance_company)
        `,
          newId,
          mysqlCarId || null,
          si.insurance_company || null,
          si.policy_number || null,
          si.coverage_type || null,
          si.start_date || null,
          si.end_date || null,
          si.premium || 0,
          si.deductible || 0,
          si.status || 'active',
          si.notes || null
        )
        inserted++
      } catch (e: any) {
        errors.push(`❌ 보험 ${si.policy_number}: ${e.message}`)
      }
    }
    results.push(`✅ insurance_contracts 동기화: ${inserted}건 삽입`)
  } catch (e: any) {
    errors.push(`❌ insurance_contracts 동기화 실패: ${e.message}`)
  }

  // ========== 3. car_costs 데이터 확인/동기화 ==========
  try {
    const sbCosts = await supabaseFetch('car_costs', '*')
    const [mysqlCount] = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as cnt FROM car_costs`
    results.push(`📊 car_costs — Supabase: ${sbCosts.length}건, MySQL: ${mysqlCount?.cnt || 0}건`)

    if (Number(mysqlCount?.cnt || 0) === 0 && sbCosts.length > 0) {
      results.push(`⚠️ car_costs MySQL에 데이터 없음 — 별도 동기화 필요`)
    }
  } catch (e: any) {
    results.push(`⚠️ car_costs 확인 실패: ${e.message}`)
  }

  // ========== 4. vehicle_operations 데이터 확인 ==========
  try {
    const [mysqlCount] = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as cnt FROM vehicle_operations`
    results.push(`📊 vehicle_operations — MySQL: ${mysqlCount?.cnt || 0}건 (Supabase: 404건)`)
  } catch (e: any) {
    results.push(`⚠️ vehicle_operations 확인 실패: ${e.message}`)
  }

  // ========== 5. accident_records 데이터 확인 ==========
  try {
    const [mysqlCount] = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as cnt FROM accident_records`
    results.push(`📊 accident_records — MySQL: ${mysqlCount?.cnt || 0}건 (Supabase: 15건)`)
  } catch (e: any) {
    results.push(`⚠️ accident_records 확인 실패: ${e.message}`)
  }

  return NextResponse.json({
    message: `동기화 완료: ${results.length}건 처리, ${errors.length}건 에러`,
    results,
    errors,
  })
}
