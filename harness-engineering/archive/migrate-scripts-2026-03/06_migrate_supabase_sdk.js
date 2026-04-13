#!/usr/bin/env node
/**
 * Supabase JS SDK 기반 마이그레이션 (IPv6 문제 우회)
 *
 * PostgreSQL 직접 연결(IPv6) 대신 Supabase REST API(HTTPS)로 데이터를 읽어
 * Cloud SQL MySQL에 삽입합니다.
 *
 * 실행:
 *   node 06_migrate_supabase_sdk.js            ← 전체 이전
 *   node 06_migrate_supabase_sdk.js --dry-run  ← 연결 테스트만
 *   node 06_migrate_supabase_sdk.js --table=fmi_vehicles  ← 특정 테이블만
 */

const { createClient } = require('@supabase/supabase-js')
const mysql = require('mysql2/promise')
const { randomUUID } = require('crypto')

// ============================================================
// 연결 설정
// ============================================================
const SUPABASE_URL = 'https://uiyiwgkpchnvuvpsjfxv.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpeWl3Z2twY2hudnV2cHNqZnh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY2OTA0OCwiZXhwIjoyMDg1MjQ1MDQ4fQ.wrYL2q5Mvcna6ZGlmAOHELWMMNWGoVyGztITMeF83lA'

const MYSQL_CONFIG = {
  host: '34.47.105.219',
  port: 3306,
  user: 'root',
  password: 'Q3J{g@K7UkTxSkm%',
  database: 'fmi_op',
  multipleStatements: true,
  connectTimeout: 30000,
  ssl: { rejectUnauthorized: false },
  timezone: '+00:00',
}

const PAGE_SIZE = 1000  // Supabase REST API 최대 1000건/요청
const DRY_RUN = process.argv.includes('--dry-run')
const ONLY_TABLE = process.argv.find(a => a.startsWith('--table='))?.split('=')[1]

// ============================================================
// 이전할 테이블 목록 (순서 중요: 부모→자식)
// ============================================================
const TABLES = [
  // 설정/코드 (의존성 없음)
  'code_master', 'common_codes', 'system_modules',
  'message_templates', 'admin_invite_codes',

  // 사용자/조직
  'profiles', 'positions', 'departments',
  'user_page_permissions', 'employees', 'freelancers',

  // 차량
  'cars', 'fmi_vehicles', 'fmi_insurance_companies', 'fmi_daily_rates',
  'new_car_prices', 'vehicle_model_codes', 'vehicle_standard_codes',

  // 고객/견적/계약
  'customers', 'quotes', 'contracts',
  'short_term_quotes', 'short_term_rates', 'short_term_rental_contracts',
  'jiip_contracts', 'pricing_worksheets',

  // 대차 핵심 (순서: accidents → rentals → claims → settlements)
  'fmi_accidents', 'fmi_rentals', 'fmi_claims',
  'fmi_settlements', 'fmi_payments', 'fmi_rental_timeline',

  // 재무
  'transactions', 'transaction_flags', 'corporate_cards',
  'user_corporate_cards', 'card_assignment_history', 'card_limit_settings',
  'expense_receipts', 'investments', 'general_investments',
  'investment_deposits', 'loans', 'financial_products',

  // 인사/급여
  'payslips', 'employee_salaries', 'salary_adjustments',
  'freelancer_payments', 'meal_expense_monthly', 'tax_filing_records',

  // 차량 운영
  'vehicle_operations', 'vehicle_schedules', 'vehicle_status_log',
  'maintenance_records', 'inspection_records', 'accident_records',
  'insurance_contracts', 'car_costs', 'car_docs',

  // 정산/수금
  'settlement_shares', 'customer_payments',
  'customer_tax_invoices', 'payment_schedules', 'expected_payment_schedules',

  // 메시지/알림
  'message_send_logs', 'contract_sending_logs',
  'customer_notes', 'customer_signatures',

  // 계약서
  'contract_documents', 'contract_terms', 'contract_term_articles',
  'contract_status_history', 'contract_special_terms',
  'quote_lifecycle_events', 'quote_share_tokens', 'quote_shares',

  // 오픈뱅킹 / Codef
  'openbanking_accounts', 'openbanking_transactions',
  'codef_connections', 'codef_sync_logs',

  // 기타
  'classification_queue', 'assignment_rules', 'assignment_log',
  'handler_capacity', 'depreciation_rates', 'depreciation_history',
  'inspection_schedule_table', 'inspection_cost_table',
  'inspection_penalty_table', 'maintenance_cost_table',
  'registration_cost_table', 'emission_standard_table',
  'finance_rate_table', 'insurance_rate_table',
  'insurance_base_premium', 'insurance_own_vehicle_rate',
  'insurance_vehicle_group', 'lotte_reference_rates',
  'lotte_rentcar_db', 'market_comparisons',
  'depreciation_adjustments', 'depreciation_db',
  'vehicle_trims', 'business_rules', 'business_docs',
]

// ============================================================
// 값 변환: JS 타입 → MySQL 호환
// ============================================================
function toMySQL(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value instanceof Date) {
    return value.toISOString().replace('T', ' ').replace('Z', '').substring(0, 23)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  // YYYY-MM 형식 부분 날짜 → MySQL DATETIME 호환(YYYY-MM-01)으로 변환
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim())) {
    return `${value.trim()}-01 00:00:00`
  }
  return value
}

// ============================================================
// 테이블 전체 데이터 읽기 (페이지네이션)
// ============================================================
async function fetchAllRows(supabase, table) {
  // 1단계: id 목록 수집 (select * 보다 용량이 작아 안정적)
  const allIds = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      if (error.code === '42P01' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('Could not find the table') ||
        error.code === 'PGRST106' || error.code === 'PGRST200') {
        return null  // 존재하지 않는 테이블 → 건너뜀
      }
      throw new Error(`Supabase 읽기 오류 (${table}): ${error.message}`)
    }

    if (!data || data.length === 0) break
    for (const row of data) {
      allIds.push(row.id)  // null id도 포함
    }
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  if (allIds.length === 0) return []

  // 2단계: id 기반 전체 컬럼 조회 (대용량 컬럼이 있어도 1건씩 안전하게)
  const BATCH = 100  // .in() 쿼리 최대 안전 크기
  const rows = []

  // null id 행은 별도로 처리 (순서 기반 조회)
  const nullIdCount = allIds.filter(id => id == null).length
  const validIds = allIds.filter(id => id != null)

  // 유효한 id 배치 조회
  for (let i = 0; i < validIds.length; i += BATCH) {
    const batch = validIds.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .in('id', batch)

    if (error) throw new Error(`Supabase 배치 읽기 오류 (${table}): ${error.message}`)
    if (data) rows.push(...data)
  }

  // null id 행: offset 기반으로 가져오기
  if (nullIdCount > 0) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .is('id', null)
      .range(0, nullIdCount - 1)

    if (!error && data) rows.push(...data)
  }

  return rows
}

// ============================================================
// MySQL 테이블에 데이터 삽입
// ============================================================
async function insertRows(myConn, table, rows) {
  if (rows.length === 0) return 0

  const columns = Object.keys(rows[0])
  const colList = columns.map(c => `\`${c}\``).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const updateClause = columns
    .filter(c => c !== 'id')
    .map(c => `\`${c}\` = VALUES(\`${c}\`)`)
    .join(', ')

  const sql = updateClause.length > 0
    ? `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`
    : `INSERT IGNORE INTO \`${table}\` (${colList}) VALUES (${placeholders})`

  let inserted = 0
  let nullIdCount = 0
  for (const row of rows) {
    // id가 null이면 UUID 자동 생성 (PostgreSQL에서는 id NULL 허용 가능)
    if (row.id === null || row.id === undefined) {
      row.id = randomUUID()
      nullIdCount++
    }
    const values = columns.map(col => toMySQL(row[col]))
    try {
      await myConn.execute(sql, values)
      inserted++
    } catch (err) {
      if (!err.message.includes('Duplicate entry')) {
        if (inserted === 0 && err.message.includes("Unknown column")) {
          throw err  // 첫 row부터 실패면 테이블 구조 문제
        }
        // 삽입 실패 행 상세 출력
        const rowId = row.id ?? '(null)'
        process.stderr.write(`  ⚠ row 삽입 실패 id=${rowId}: ${err.message.substring(0, 120)}\n`)
      }
    }
  }
  if (nullIdCount > 0) {
    process.stdout.write(`  (⚠ id=NULL ${nullIdCount}건 → UUID 자동 생성)\n`)
  }
  return inserted
}

// ============================================================
// MySQL에 테이블 동적 생성 (첫 row 기반)
// ============================================================
async function ensureTable(myConn, table, sampleRow) {
  const columns = Object.entries(sampleRow).map(([col, val]) => {
    let type = 'LONGTEXT'
    if (col === 'id') type = 'VARCHAR(36)'
    else if (typeof val === 'boolean') type = 'TINYINT(1)'
    else if (typeof val === 'number' && Number.isInteger(val)) type = 'BIGINT'
    else if (typeof val === 'number') type = 'DOUBLE'
    else if (typeof val === 'object' && val !== null) type = 'LONGTEXT'
    else if (col.endsWith('_at') || col.endsWith('_date')) type = 'DATETIME(6)'
    else if (col === 'id' || col.endsWith('_id')) type = 'VARCHAR(36)'
    // PRIMARY KEY(id)는 반드시 NOT NULL 이어야 함
    const nullable = col === 'id' ? 'NOT NULL' : 'NULL'
    return `  \`${col}\` ${type} ${nullable}`
  })

  const sql = `CREATE TABLE IF NOT EXISTS \`${table}\` (
${columns.join(',\n')},
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`

  try {
    await myConn.execute(sql)
  } catch (err) {
    if (!err.message.includes('already exists')) {
      throw err
    }
  }
}

// ============================================================
// 메인
// ============================================================
async function main() {
  console.log('🚀 FMI ERP 마이그레이션 (Supabase REST API → Cloud SQL)')
  console.log(`   모드: ${DRY_RUN ? 'DRY RUN' : '실제 실행'}`)
  if (ONLY_TABLE) console.log(`   대상: ${ONLY_TABLE} 테이블만`)
  console.log('='.repeat(60))

  // Supabase 클라이언트 (service role — RLS 우회)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  })

  // 연결 테스트
  console.log('\n📡 Supabase REST API 연결 테스트...')
  const { data: testData, error: testErr } = await supabase
    .from('profiles')
    .select('id')
    .limit(1)

  if (testErr && testErr.code !== 'PGRST116') {
    console.error(`❌ Supabase 연결 실패: ${testErr.message}`)
    process.exit(1)
  }
  console.log('✅ Supabase 연결 성공')

  console.log('📡 Cloud SQL MySQL 연결 중...')
  let myConn
  try {
    myConn = await mysql.createConnection(MYSQL_CONFIG)
    await myConn.execute('SELECT 1')
    console.log('✅ Cloud SQL 연결 성공\n')
  } catch (err) {
    console.error(`❌ MySQL 연결 실패: ${err.message}`)
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log('✅ 양쪽 연결 성공! 실제 마이그레이션을 시작하려면 --dry-run 없이 실행하세요.')
    await myConn.end()
    return
  }

  // ── 알려진 컬럼 타입 불일치 사전 수정 ──
  const columnFixes = [
    // expiry_date: YYYY-MM 형식 문자열 → DATETIME 대신 VARCHAR로
    "ALTER TABLE `corporate_cards` MODIFY COLUMN `expiry_date` VARCHAR(20) NULL",
    // value: 숫자로 추론됐지만 실제 텍스트 포함 → LONGTEXT로
    "ALTER TABLE `business_rules` MODIFY COLUMN `value` LONGTEXT NULL",
  ]
  for (const stmt of columnFixes) {
    try {
      await myConn.execute(stmt)
    } catch (e) {
      // 테이블이 아직 없거나 이미 올바른 타입이면 무시
    }
  }

  // 마이그레이션 시작
  await myConn.execute('SET FOREIGN_KEY_CHECKS = 0')
  await myConn.execute('SET UNIQUE_CHECKS = 0')

  const targetTables = ONLY_TABLE ? [ONLY_TABLE] : TABLES
  let totalInserted = 0
  let skipped = 0
  let failed = []
  const startTime = Date.now()

  for (const table of targetTables) {
    try {
      process.stdout.write(`⏳ ${table} 읽는 중...`)
      const rows = await fetchAllRows(supabase, table)

      if (rows === null) {
        process.stdout.write(`\r⬜ ${table}: 없는 테이블, 건너뜀\n`)
        skipped++
        continue
      }

      if (rows.length === 0) {
        process.stdout.write(`\r✅ ${table}: 0건 (빈 테이블)\n`)
        continue
      }

      // 테이블이 MySQL에 없으면 자동 생성
      await ensureTable(myConn, table, rows[0])

      // 기존 데이터 비우기
      await myConn.execute(`DELETE FROM \`${table}\``)

      // 삽입
      const count = await insertRows(myConn, table, rows)
      totalInserted += count
      process.stdout.write(`\r✅ ${table}: ${count}건\n`)

    } catch (err) {
      process.stdout.write(`\r❌ ${table}: ${err.message.substring(0, 60)}\n`)
      failed.push({ table, error: err.message })
    }
  }

  await myConn.execute('SET FOREIGN_KEY_CHECKS = 1')
  await myConn.execute('SET UNIQUE_CHECKS = 1')
  await myConn.end()

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log('\n' + '='.repeat(60))
  console.log(`🎉 완료! 총 ${totalInserted.toLocaleString()}건, ${Math.floor(elapsed/60)}분 ${elapsed%60}초`)
  if (skipped > 0) console.log(`⬜ 건너뜀: ${skipped}개 테이블`)
  if (failed.length > 0) {
    console.log(`\n❌ 실패 (${failed.length}개):`)
    failed.forEach(f => console.log(`   - ${f.table}: ${f.error.substring(0, 80)}`))
    console.log('\n💡 재실행: node 06_migrate_supabase_sdk.js --table=테이블명')
  }
  console.log('\n📌 다음: node 03_verify.js 로 데이터 검증')
}

main().catch(err => {
  console.error('\n❌ 오류:', err.message)
  process.exit(1)
})
