import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const SUPABASE_URL = 'https://uiyiwgkpchnvuvpsjfxv.supabase.co'
let SUPABASE_KEY = ''

async function supabaseFetch(table: string, select = '*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Supabase ${table} fetch failed: ${res.status}`)
  return res.json()
}

// POST /api/migrate/sync-remaining — car_costs, vehicle_operations, accident_records 동기화
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM profiles WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  let body: any = {}
  try { body = await request.json() } catch {}
  SUPABASE_KEY = body.supabase_key || process.env.SUPABASE_ANON_KEY || ''
  if (!SUPABASE_KEY) {
    return NextResponse.json({ error: 'supabase_key 필요' }, { status: 400 })
  }

  const results: string[] = []
  const errors: string[] = []

  // Supabase car_id(bigint) → MySQL car_id(UUID) 매핑
  const sbCars = await supabaseFetch('cars', 'id,number')
  const sbIdToNumber = new Map(sbCars.map((c: any) => [String(c.id), c.number]))
  const mysqlCars = await prisma.$queryRaw<any[]>`SELECT id, number FROM cars`
  const numberToMysqlId = new Map(mysqlCars.map((c: any) => [c.number, c.id]))

  // Supabase customer_id(bigint) → MySQL customer_id(UUID) 매핑
  let sbCustomerIdToMysqlId = new Map<string, string>()
  try {
    const sbCustomers = await supabaseFetch('customers', 'id,name,phone')
    const mysqlCustomers = await prisma.$queryRaw<any[]>`SELECT id, name, phone FROM customers`
    // phone으로 매칭 시도
    const phoneToMysqlId = new Map(mysqlCustomers.map((c: any) => [c.phone, c.id]))
    const nameToMysqlId = new Map(mysqlCustomers.map((c: any) => [c.name, c.id]))
    for (const sc of sbCustomers) {
      const mysqlId = phoneToMysqlId.get(sc.phone) || nameToMysqlId.get(sc.name)
      if (mysqlId) sbCustomerIdToMysqlId.set(String(sc.id), mysqlId)
    }
    results.push(`📊 고객 매핑: ${sbCustomerIdToMysqlId.size}/${sbCustomers.length}건`)
  } catch (e: any) {
    results.push(`⚠️ 고객 매핑 실패: ${e.message}`)
  }

  // Supabase contract_id(uuid) → MySQL contract_id(UUID) — 동일 UUID 사용 가정
  // (Supabase contracts.id가 uuid이므로 직접 사용 가능)

  function mapCarId(sbCarId: any): string | null {
    const carNumber = sbIdToNumber.get(String(sbCarId))
    return carNumber ? (numberToMysqlId.get(carNumber) || null) : null
  }

  function mapCustomerId(sbCustomerId: any): string | null {
    return sbCustomerIdToMysqlId.get(String(sbCustomerId)) || null
  }

  // ========== 1. car_costs 동기화 (74건) ==========
  try {
    const sbCosts = await supabaseFetch('car_costs', '*')
    results.push(`📥 Supabase car_costs: ${sbCosts.length}건 로드`)

    let inserted = 0
    for (const sc of sbCosts) {
      try {
        const mysqlCarId = mapCarId(sc.car_id)
        await prisma.$executeRawUnsafe(`
          INSERT INTO car_costs (car_id, category, item_name, amount, notes, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          mysqlCarId,
          sc.category || 'etc',
          sc.item_name || '',
          sc.amount || 0,
          sc.notes || null,
          sc.sort_order || 0,
          sc.created_at ? new Date(sc.created_at) : new Date(),
          sc.updated_at ? new Date(sc.updated_at) : new Date()
        )
        inserted++
      } catch (e: any) {
        errors.push(`❌ car_costs ${sc.id}: ${e.message}`)
      }
    }
    results.push(`✅ car_costs 동기화: ${inserted}건 삽입`)
  } catch (e: any) {
    errors.push(`❌ car_costs 동기화 실패: ${e.message}`)
  }

  // ========== 2. vehicle_operations 동기화 (404건) ==========
  try {
    const sbOps = await supabaseFetch('vehicle_operations', '*')
    results.push(`📥 Supabase vehicle_operations: ${sbOps.length}건 로드`)

    let inserted = 0
    for (const so of sbOps) {
      try {
        const mysqlCarId = mapCarId(so.car_id)
        const mysqlCustomerId = mapCustomerId(so.customer_id)

        await prisma.$executeRawUnsafe(`
          INSERT INTO vehicle_operations (
            contract_id, car_id, customer_id, operation_type, status,
            scheduled_date, scheduled_time, actual_date, actual_time, completed_at,
            location, location_address, handler_id, handler_name,
            driver_name, driver_phone, mileage_at_op, fuel_level,
            exterior_condition, interior_condition, checklist, photos,
            customer_signature_url, handler_signature_url,
            delivery_fee, additional_cost, damage_found, damage_description,
            excess_mileage, settlement_amount, notes, created_by,
            created_at, updated_at,
            dispatch_type, dispatch_category,
            insurance_company_billing, insurance_claim_no, insurance_daily_rate,
            fault_ratio, replacement_start_date, replacement_end_date,
            actual_return_date, insurance_billing_status,
            insurance_billed_amount, insurance_paid_amount,
            insurance_billing_date, insurance_payment_date,
            customer_charge, repair_shop_name, damaged_car_id
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?, ?
          )
        `,
          so.contract_id || null,
          mysqlCarId,
          mysqlCustomerId,
          so.operation_type || 'delivery',
          so.status || 'scheduled',
          so.scheduled_date || null,
          so.scheduled_time || null,
          so.actual_date || null,
          so.actual_time || null,
          so.completed_at ? new Date(so.completed_at) : null,
          so.location || null,
          so.location_address || null,
          so.handler_id || null,
          so.handler_name || null,
          so.driver_name || null,
          so.driver_phone || null,
          so.mileage_at_op || null,
          so.fuel_level || null,
          so.exterior_condition || null,
          so.interior_condition || null,
          so.checklist ? JSON.stringify(so.checklist) : null,
          so.photos ? JSON.stringify(so.photos) : null,
          so.customer_signature_url || null,
          so.handler_signature_url || null,
          so.delivery_fee || 0,
          so.additional_cost || 0,
          so.damage_found ? 1 : 0,
          so.damage_description || null,
          so.excess_mileage || null,
          so.settlement_amount || 0,
          so.notes || null,
          so.created_by || null,
          so.created_at ? new Date(so.created_at) : new Date(),
          so.updated_at ? new Date(so.updated_at) : new Date(),
          so.dispatch_type || null,
          so.dispatch_category || null,
          so.insurance_company_billing || null,
          so.insurance_claim_no || null,
          so.insurance_daily_rate || 0,
          so.fault_ratio || null,
          so.replacement_start_date || null,
          so.replacement_end_date || null,
          so.actual_return_date || null,
          so.insurance_billing_status || null,
          so.insurance_billed_amount || 0,
          so.insurance_paid_amount || 0,
          so.insurance_billing_date || null,
          so.insurance_payment_date || null,
          so.customer_charge || 0,
          so.repair_shop_name || null,
          so.damaged_car_id ? mapCarId(so.damaged_car_id) : null
        )
        inserted++
      } catch (e: any) {
        errors.push(`❌ vehicle_op ${so.id}: ${e.message}`)
      }
    }
    results.push(`✅ vehicle_operations 동기화: ${inserted}건 삽입`)
  } catch (e: any) {
    errors.push(`❌ vehicle_operations 동기화 실패: ${e.message}`)
  }

  // ========== 3. accident_records 동기화 (15건) ==========
  try {
    const sbAccidents = await supabaseFetch('accident_records', '*')
    results.push(`📥 Supabase accident_records: ${sbAccidents.length}건 로드`)

    let inserted = 0
    for (const sa of sbAccidents) {
      try {
        const mysqlCarId = mapCarId(sa.car_id)
        const mysqlCustomerId = mapCustomerId(sa.customer_id)

        await prisma.$executeRawUnsafe(`
          INSERT INTO accident_records (
            car_id, contract_id, customer_id,
            accident_date, accident_time, accident_location, accident_type,
            fault_ratio, description, status,
            driver_name, driver_phone, driver_relation,
            counterpart_name, counterpart_phone, counterpart_vehicle, counterpart_insurance,
            insurance_company, insurance_claim_no, insurance_filed_at, insurance_status,
            police_reported, police_report_no,
            repair_shop_name, repair_start_date, repair_end_date,
            mileage_at_accident, estimated_repair_cost, actual_repair_cost,
            insurance_payout, customer_deductible, company_cost,
            loss_of_revenue, diminished_value, towing_cost, rental_cost, total_loss,
            vehicle_condition, photos, documents, notes,
            handler_id, created_by, created_at, updated_at,
            source, jandi_raw, jandi_topic,
            workflow_stage, workflow_checklist,
            replacement_car_number, delivery_location, delivery_date, return_date,
            transport_company, billing_amount, payment_received, payment_date,
            assigned_to, assigned_at
          ) VALUES (
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?
          )
        `,
          mysqlCarId,
          sa.contract_id || null,
          mysqlCustomerId,
          sa.accident_date || null,
          sa.accident_time || null,
          sa.accident_location || null,
          sa.accident_type || 'collision',
          sa.fault_ratio || null,
          sa.description || null,
          sa.status || 'reported',
          sa.driver_name || null,
          sa.driver_phone || null,
          sa.driver_relation || null,
          sa.counterpart_name || null,
          sa.counterpart_phone || null,
          sa.counterpart_vehicle || null,
          sa.counterpart_insurance || null,
          sa.insurance_company || null,
          sa.insurance_claim_no || null,
          sa.insurance_filed_at ? new Date(sa.insurance_filed_at) : null,
          sa.insurance_status || 'none',
          sa.police_reported ? 1 : 0,
          sa.police_report_no || null,
          sa.repair_shop_name || null,
          sa.repair_start_date || null,
          sa.repair_end_date || null,
          sa.mileage_at_accident || null,
          sa.estimated_repair_cost || 0,
          sa.actual_repair_cost || 0,
          sa.insurance_payout || 0,
          sa.customer_deductible || 0,
          sa.company_cost || 0,
          sa.loss_of_revenue || 0,
          sa.diminished_value || 0,
          sa.towing_cost || 0,
          sa.rental_cost || 0,
          sa.total_loss || 0,
          sa.vehicle_condition || null,
          sa.photos ? JSON.stringify(sa.photos) : null,
          sa.documents ? JSON.stringify(sa.documents) : null,
          sa.notes || null,
          sa.handler_id || null,
          sa.created_by || null,
          sa.created_at ? new Date(sa.created_at) : new Date(),
          sa.updated_at ? new Date(sa.updated_at) : new Date(),
          sa.source || null,
          sa.jandi_raw || null,
          sa.jandi_topic || null,
          sa.workflow_stage || null,
          sa.workflow_checklist ? JSON.stringify(sa.workflow_checklist) : null,
          sa.replacement_car_number || null,
          sa.delivery_location || null,
          sa.delivery_date || null,
          sa.return_date || null,
          sa.transport_company || null,
          sa.billing_amount || 0,
          sa.payment_received || 0,
          sa.payment_date || null,
          sa.assigned_to || null,
          sa.assigned_at ? new Date(sa.assigned_at) : null
        )
        inserted++
      } catch (e: any) {
        errors.push(`❌ accident ${sa.id}: ${e.message}`)
      }
    }
    results.push(`✅ accident_records 동기화: ${inserted}건 삽입`)
  } catch (e: any) {
    errors.push(`❌ accident_records 동기화 실패: ${e.message}`)
  }

  return NextResponse.json({
    message: `동기화 완료: ${results.length}건 처리, ${errors.length}건 에러`,
    results,
    errors,
  })
}
