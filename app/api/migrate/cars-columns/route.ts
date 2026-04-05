import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

// POST /api/migrate/cars-columns — cars 테이블 누락 컬럼 추가 (admin 전용, 1회성)
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // admin만 실행 가능
  const profile = await prisma.$queryRaw<any[]>`SELECT role FROM employees WHERE id = ${user.id} LIMIT 1`
  if (!profile[0] || profile[0].role !== 'admin') {
    return NextResponse.json({ error: '관리자만 실행 가능' }, { status: 403 })
  }

  const results: string[] = []
  const errors: string[] = []

  // 추가할 컬럼 정의 (이미 존재하면 스킵)
  const columns: [string, string][] = [
    // 기본 차량 정보
    ['fuel', 'VARCHAR(30) NULL'],
    ['vin', 'VARCHAR(50) NULL'],
    ['mileage', 'INT NULL DEFAULT 0'],
    ['purchase_price', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['total_cost', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['is_used', 'TINYINT(1) NULL DEFAULT 0'],
    ['is_commercial', 'TINYINT(1) NULL DEFAULT 0'],
    ['purchase_mileage', 'INT NULL DEFAULT 0'],
    ['ownership_type', "VARCHAR(30) NULL DEFAULT 'company'"],
    ['company_id', 'CHAR(36) NULL'],
    // 등록 정보
    ['registration_date', 'DATE NULL'],
    ['displacement', 'INT NULL'],
    ['capacity', 'INT NULL'],
    ['color', 'VARCHAR(30) NULL'],
    ['mission', 'VARCHAR(20) NULL'],
    ['registration_image_url', 'TEXT NULL'],
    ['location', 'VARCHAR(200) NULL'],
    // 검사/차령
    ['inspection_end_date', 'DATE NULL'],
    ['vehicle_age_expiry', 'DATE NULL'],
    // 취득 비용
    ['acq_date', 'DATE NULL'],
    ['registration_tax', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['bond_amount', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['delivery_fee', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['plate_fee', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['agency_fee', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['other_initial_cost', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['initial_cost_memo', 'TEXT NULL'],
    // 소유자 정보 (지입/임대)
    ['owner_name', 'VARCHAR(50) NULL'],
    ['owner_phone', 'VARCHAR(20) NULL'],
    ['owner_bank', 'VARCHAR(50) NULL'],
    ['owner_account', 'VARCHAR(50) NULL'],
    ['owner_account_holder', 'VARCHAR(50) NULL'],
    ['consignment_fee', 'DECIMAL(12,0) NULL DEFAULT 0'],
    ['consignment_start', 'DATE NULL'],
    ['consignment_end', 'DATE NULL'],
    ['insurance_by', "VARCHAR(20) NULL DEFAULT 'company'"],
    ['consignment_contract_url', 'TEXT NULL'],
    ['owner_memo', 'TEXT NULL'],
    // 기타
    ['notes', 'TEXT NULL'],
    ['fuel_type', 'VARCHAR(30) NULL'],
  ]

  for (const [colName, colDef] of columns) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE cars ADD COLUMN \`${colName}\` ${colDef}`)
      results.push(`✅ ${colName} 추가 완료`)
    } catch (e: any) {
      if (e.message?.includes('Duplicate column')) {
        results.push(`⏭️ ${colName} 이미 존재`)
      } else {
        errors.push(`❌ ${colName}: ${e.message}`)
      }
    }
  }

  // insurance_contracts 테이블 생성 (없으면)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS insurance_contracts (
        id CHAR(36) PRIMARY KEY,
        car_id CHAR(36) NULL,
        company_id CHAR(36) NULL,
        insurance_company VARCHAR(100) NULL,
        policy_number VARCHAR(100) NULL,
        coverage_type VARCHAR(50) NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        premium DECIMAL(12,0) NULL DEFAULT 0,
        deductible DECIMAL(12,0) NULL DEFAULT 0,
        status VARCHAR(30) NULL DEFAULT 'active',
        notes TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_car_id (car_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    results.push('✅ insurance_contracts 테이블 생성/확인 완료')
  } catch (e: any) {
    errors.push(`❌ insurance_contracts: ${e.message}`)
  }

  // vehicle_standard_codes 테이블 생성 (없으면)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS vehicle_standard_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand VARCHAR(50) NULL,
        model_name VARCHAR(100) NULL,
        trim_name VARCHAR(200) NULL,
        year INT NULL,
        fuel VARCHAR(30) NULL,
        price DECIMAL(12,0) NULL DEFAULT 0,
        displacement INT NULL,
        category VARCHAR(50) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_brand (brand),
        INDEX idx_model (model_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    results.push('✅ vehicle_standard_codes 테이블 생성/확인 완료')
  } catch (e: any) {
    errors.push(`❌ vehicle_standard_codes: ${e.message}`)
  }

  return NextResponse.json({
    message: `마이그레이션 완료: ${results.length}건 성공, ${errors.length}건 에러`,
    results,
    errors,
  })
}
