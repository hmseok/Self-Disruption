import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// POST /api/migrate/create-tables — 누락 테이블 생성 (admin 전용, 1회성)
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM profiles WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  const results: string[] = []
  const errors: string[] = []

  // ========== 1. car_costs 테이블 ==========
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS car_costs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        car_id CHAR(36) NULL,
        category VARCHAR(100) NOT NULL,
        item_name VARCHAR(200) NOT NULL,
        amount BIGINT NOT NULL DEFAULT 0,
        notes TEXT NULL,
        sort_order INT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_car_id (car_id),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    results.push('✅ car_costs 테이블 생성/확인 완료')
  } catch (e: any) {
    errors.push(`❌ car_costs: ${e.message}`)
  }

  // ========== 2. vehicle_operations 테이블 ==========
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS vehicle_operations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        contract_id CHAR(36) NULL,
        car_id CHAR(36) NULL,
        customer_id CHAR(36) NULL,
        operation_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
        scheduled_date DATE NOT NULL,
        scheduled_time TIME NULL,
        actual_date DATE NULL,
        actual_time TIME NULL,
        completed_at DATETIME NULL,
        location VARCHAR(500) NULL,
        location_address VARCHAR(500) NULL,
        handler_id CHAR(36) NULL,
        handler_name VARCHAR(100) NULL,
        driver_name VARCHAR(100) NULL,
        driver_phone VARCHAR(30) NULL,
        mileage_at_op INT NULL,
        fuel_level VARCHAR(50) NULL,
        exterior_condition TEXT NULL,
        interior_condition TEXT NULL,
        checklist JSON NULL,
        photos JSON NULL,
        customer_signature_url TEXT NULL,
        handler_signature_url TEXT NULL,
        delivery_fee DECIMAL(12,0) NULL DEFAULT 0,
        additional_cost DECIMAL(12,0) NULL DEFAULT 0,
        damage_found TINYINT(1) NULL DEFAULT 0,
        damage_description TEXT NULL,
        excess_mileage INT NULL,
        settlement_amount DECIMAL(12,0) NULL DEFAULT 0,
        notes TEXT NULL,
        created_by CHAR(36) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        dispatch_type VARCHAR(50) NULL,
        dispatch_category VARCHAR(100) NULL,
        insurance_company_billing VARCHAR(200) NULL,
        insurance_claim_no VARCHAR(100) NULL,
        insurance_daily_rate DECIMAL(12,0) NULL DEFAULT 0,
        fault_ratio INT NULL,
        replacement_start_date DATE NULL,
        replacement_end_date DATE NULL,
        actual_return_date DATE NULL,
        insurance_billing_status VARCHAR(50) NULL,
        insurance_billed_amount DECIMAL(12,0) NULL DEFAULT 0,
        insurance_paid_amount DECIMAL(12,0) NULL DEFAULT 0,
        insurance_billing_date DATE NULL,
        insurance_payment_date DATE NULL,
        customer_charge DECIMAL(12,0) NULL DEFAULT 0,
        repair_shop_name VARCHAR(200) NULL,
        damaged_car_id CHAR(36) NULL,
        INDEX idx_car_id (car_id),
        INDEX idx_contract_id (contract_id),
        INDEX idx_operation_type (operation_type),
        INDEX idx_status (status),
        INDEX idx_scheduled_date (scheduled_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    results.push('✅ vehicle_operations 테이블 생성/확인 완료')
  } catch (e: any) {
    errors.push(`❌ vehicle_operations: ${e.message}`)
  }

  // ========== 3. accident_records 테이블 ==========
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS accident_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        car_id CHAR(36) NULL,
        contract_id CHAR(36) NULL,
        customer_id CHAR(36) NULL,
        accident_date DATE NOT NULL,
        accident_time TIME NULL,
        accident_location TEXT NULL,
        accident_type VARCHAR(100) NOT NULL DEFAULT 'collision',
        fault_ratio INT NULL,
        description TEXT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'reported',
        driver_name VARCHAR(100) NULL,
        driver_phone VARCHAR(30) NULL,
        driver_relation VARCHAR(50) NULL,
        counterpart_name VARCHAR(100) NULL,
        counterpart_phone VARCHAR(30) NULL,
        counterpart_vehicle VARCHAR(100) NULL,
        counterpart_insurance VARCHAR(100) NULL,
        insurance_company VARCHAR(100) NULL,
        insurance_claim_no VARCHAR(100) NULL,
        insurance_filed_at DATETIME NULL,
        insurance_status VARCHAR(50) NULL DEFAULT 'none',
        police_reported TINYINT(1) NULL DEFAULT 0,
        police_report_no VARCHAR(100) NULL,
        repair_shop_name VARCHAR(200) NULL,
        repair_start_date DATE NULL,
        repair_end_date DATE NULL,
        mileage_at_accident INT NULL,
        estimated_repair_cost DECIMAL(12,0) NULL DEFAULT 0,
        actual_repair_cost DECIMAL(12,0) NULL DEFAULT 0,
        insurance_payout DECIMAL(12,0) NULL DEFAULT 0,
        customer_deductible DECIMAL(12,0) NULL DEFAULT 0,
        company_cost DECIMAL(12,0) NULL DEFAULT 0,
        loss_of_revenue DECIMAL(12,0) NULL DEFAULT 0,
        diminished_value DECIMAL(12,0) NULL DEFAULT 0,
        towing_cost DECIMAL(12,0) NULL DEFAULT 0,
        rental_cost DECIMAL(12,0) NULL DEFAULT 0,
        total_loss DECIMAL(12,0) NULL DEFAULT 0,
        vehicle_condition TEXT NULL,
        photos JSON NULL,
        documents JSON NULL,
        notes TEXT NULL,
        handler_id CHAR(36) NULL,
        created_by CHAR(36) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        source VARCHAR(50) NULL,
        jandi_raw TEXT NULL,
        jandi_topic VARCHAR(200) NULL,
        workflow_stage VARCHAR(50) NULL,
        workflow_checklist JSON NULL,
        replacement_car_number VARCHAR(50) NULL,
        delivery_location TEXT NULL,
        delivery_date VARCHAR(50) NULL,
        return_date VARCHAR(50) NULL,
        transport_company VARCHAR(200) NULL,
        billing_amount DECIMAL(12,0) NULL DEFAULT 0,
        payment_received DECIMAL(12,0) NULL DEFAULT 0,
        payment_date VARCHAR(50) NULL,
        assigned_to VARCHAR(100) NULL,
        assigned_at DATETIME NULL,
        INDEX idx_car_id (car_id),
        INDEX idx_contract_id (contract_id),
        INDEX idx_accident_date (accident_date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    results.push('✅ accident_records 테이블 생성/확인 완료')
  } catch (e: any) {
    errors.push(`❌ accident_records: ${e.message}`)
  }

  return NextResponse.json({
    message: `테이블 생성 완료: ${results.length}건 성공, ${errors.length}건 에러`,
    results,
    errors,
  })
}
