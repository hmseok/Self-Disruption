#!/usr/bin/env node
/**
 * 데이터 마이그레이션 검증 스크립트 (Supabase JS SDK 버전)
 *
 * Supabase REST API(HTTPS)와 Google Cloud SQL MySQL의
 * 테이블 row 수와 주요 컬럼 값을 비교하여 데이터 손실 여부를 확인합니다.
 *
 * 실행 방법:
 *   node 03_verify.js
 */

const { createClient } = require('@supabase/supabase-js')
const mysql = require('mysql2/promise')

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
  connectTimeout: 30000,
  ssl: { rejectUnauthorized: false },
}

// ============================================================
// 검증할 테이블 목록
// ============================================================
const VERIFY_TABLES = [
  // 대차 핵심
  'fmi_vehicles', 'fmi_accidents', 'fmi_rentals', 'fmi_claims',
  'fmi_settlements', 'fmi_payments', 'fmi_rental_timeline',
  'fmi_insurance_companies', 'fmi_daily_rates',
  // 기존 ERP
  'cars', 'customers', 'quotes', 'contracts', 'profiles',
  // 재무
  'transactions', 'corporate_cards', 'expense_receipts',
  'transaction_flags', 'corporate_cards', 'card_limit_settings',
  // 인사
  'freelancers', 'payslips', 'employee_salaries',
  // 차량운영
  'vehicle_operations', 'accident_records', 'insurance_contracts', 'car_costs',
  // 설정/코드
  'code_master', 'common_codes', 'system_modules', 'message_templates',
  'positions', 'departments',
  // 기준표
  'vehicle_model_codes', 'vehicle_standard_codes', 'depreciation_rates',
  'inspection_schedule_table', 'insurance_rate_table',
  // Codef
  'codef_connections', 'codef_sync_logs',
  // 기타
  'classification_queue', 'business_rules',
]

// ============================================================
// 샘플 데이터 비교 대상
// ============================================================
const SAMPLE_CHECKS = {
  customers:  { fields: ['id', 'name', 'phone'] },
  cars:       { fields: ['id', 'plate_number'] },
  profiles:   { fields: ['id', 'email', 'role'] },
  code_master: { fields: ['id', 'code_group', 'code_value'] },
}

// ============================================================
// Supabase에서 row count 가져오기 (실제 SELECT 방식 — 마이그레이션과 동일)
// ============================================================
async function getSupabaseCount(supabase, table) {
  const PAGE_SIZE = 1000
  let total = 0
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      if (error.message?.includes('Could not find the table') ||
          error.code === 'PGRST106' || error.code === 'PGRST200' ||
          error.message?.includes('does not exist')) {
        return null  // 테이블 없음
      }
      throw new Error(error.message)
    }

    if (!data || data.length === 0) break
    total += data.length
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return total
}

// ============================================================
// Supabase에서 HEAD count (실제 테이블 전체 행 수, RLS 무관)
// ============================================================
async function getSupabaseHeadCount(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) return null
  return count ?? 0
}

// ============================================================
// MySQL에서 row count 가져오기
// ============================================================
async function getMysqlCount(myConn, table) {
  try {
    const [rows] = await myConn.execute(`SELECT COUNT(*) AS cnt FROM \`${table}\``)
    return Number(rows[0].cnt)
  } catch (err) {
    if (err.message?.includes("doesn't exist") || err.message?.includes('Table')) {
      return null  // 테이블 없음
    }
    throw err
  }
}

// ============================================================
// 메인 검증 함수
// ============================================================
async function verify() {
  console.log('🔍 FMI ERP 데이터 마이그레이션 검증')
  console.log('='.repeat(70))

  // Supabase 클라이언트
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  })

  // 연결 테스트
  console.log('📡 Supabase REST API 연결 테스트...')
  const { error: pingErr } = await supabase.from('profiles').select('id').limit(1)
  if (pingErr && pingErr.code !== 'PGRST116') {
    console.error(`❌ Supabase 연결 실패: ${pingErr.message}`)
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

  const results = []
  let totalPassed = 0
  let totalFailed = 0
  let totalSkipped = 0

  // 중복 제거
  const uniqueTables = [...new Set(VERIFY_TABLES)]

  // ── 1. Row Count 비교 ──────────────────────────────────────
  console.log('='.repeat(70))
  console.log(`${'테이블명'.padEnd(35)} ${'Supabase'.padStart(10)} ${'MySQL'.padStart(10)} ${'결과'.padStart(10)}`)
  console.log('-'.repeat(70))

  for (const table of uniqueTables) {
    try {
      const [sbCount, myCount] = await Promise.all([
        getSupabaseCount(supabase, table),
        getMysqlCount(myConn, table),
      ])

      if (sbCount === null) {
        console.log(`⬜ ${table.padEnd(33)} ${'없음'.padStart(10)} ${String(myCount ?? 'N/A').padStart(10)} ${'스킵'.padStart(10)}`)
        results.push({ table, sbCount: null, myCount, passed: false, skipped: true })
        totalSkipped++
        continue
      }

      // HEAD count (RLS 무관한 실제 DB 행 수) — 불일치 진단용
      const headCount = await getSupabaseHeadCount(supabase, table)

      const diff = sbCount - (myCount ?? 0)
      const status = diff === 0 ? '✅ PASS' : diff > 0 ? '❌ 부족' : '⚠ 초과'
      const icon = diff === 0 ? '✅' : diff > 0 ? '❌' : '⚠ '

      // HEAD count와 SELECT count가 다르면 RLS/뷰 필터링 의심
      const rlsNote = (headCount !== null && headCount !== sbCount)
        ? `  ⚠ DB실제=${headCount} (REST API=${sbCount} — RLS/뷰 필터 의심)`
        : ''

      console.log(
        `${icon} ${table.padEnd(33)} ${String(sbCount).padStart(10)} ${String(myCount ?? 0).padStart(10)} ${status.padStart(10)}` +
        (diff !== 0 ? `  (차이: ${diff > 0 ? '+' : ''}${diff})` : '') +
        rlsNote
      )

      results.push({ table, sbCount, myCount, diff, passed: diff === 0 })
      if (diff === 0) totalPassed++
      else totalFailed++

    } catch (err) {
      console.log(`⚠  ${table.padEnd(33)} ${'ERROR'.padStart(10)} ${'ERROR'.padStart(10)}  ${err.message.substring(0, 25)}`)
      totalFailed++
    }
  }

  console.log('='.repeat(70))

  // ── 2. 샘플 데이터 비교 ───────────────────────────────────
  console.log('\n📋 샘플 데이터 검증 (첫 5개 행)\n')
  console.log('='.repeat(70))

  for (const [table, cfg] of Object.entries(SAMPLE_CHECKS)) {
    try {
      // Supabase에서 샘플 가져오기
      const { data: sbRows, error: sbErr } = await supabase
        .from(table)
        .select(cfg.fields.join(', '))
        .order('created_at', { ascending: true })
        .limit(5)

      if (sbErr || !sbRows) {
        console.log(`  ⬜ ${table}: Supabase 데이터 없음`)
        continue
      }

      // MySQL에서 샘플 가져오기
      const [myRows] = await myConn.execute(
        `SELECT ${cfg.fields.map(f => `\`${f}\``).join(', ')} FROM \`${table}\` ORDER BY created_at LIMIT 5`
      )

      if (sbRows.length === 0 && myRows.length === 0) {
        console.log(`  ✅ ${table}: 양쪽 모두 빈 테이블`)
        continue
      }

      let mismatch = false
      for (let i = 0; i < sbRows.length; i++) {
        for (const field of cfg.fields) {
          const sbVal = String(sbRows[i]?.[field] ?? '').toLowerCase()
          const myVal = String(myRows[i]?.[field] ?? '').toLowerCase()
          if (sbVal !== myVal) {
            console.log(`  ❌ ${table}.${field} [row ${i+1}] 불일치:`)
            console.log(`     Supabase: ${sbVal}`)
            console.log(`     MySQL:    ${myVal}`)
            mismatch = true
          }
        }
      }

      if (!mismatch) {
        console.log(`  ✅ ${table}: 샘플 ${sbRows.length}개 일치`)
      }

    } catch (err) {
      console.log(`  ⚠  ${table}: ${err.message.substring(0, 60)}`)
    }
  }

  // ── 3. 최종 요약 ──────────────────────────────────────────
  const failedTables = results.filter(r => !r.passed && !r.skipped)

  console.log('\n' + '='.repeat(70))
  console.log('📊 검증 결과 요약')
  console.log('='.repeat(70))
  console.log(`  총 검증 테이블 : ${uniqueTables.length}개`)
  console.log(`  ✅ 정상 (일치)  : ${totalPassed}개`)
  console.log(`  ❌ 이상 (차이)  : ${totalFailed}개`)
  console.log(`  ⬜ 스킵 (없음)  : ${totalSkipped}개`)

  if (failedTables.length > 0) {
    console.log('\n❌ row 수 불일치 테이블:')
    for (const r of failedTables) {
      console.log(`   - ${r.table}: Supabase=${r.sbCount}, MySQL=${r.myCount ?? 0}, 차이=${r.diff}`)
    }
    console.log('\n💡 해당 테이블 재이전:')
    failedTables.forEach(r =>
      console.log(`   node 06_migrate_supabase_sdk.js --table=${r.table}`)
    )
  }

  if (totalFailed === 0) {
    console.log('\n🎉 모든 테이블 데이터가 완전히 이전되었습니다!')
    console.log('   다음 단계: node 02_mysql_post_fix.sql 실행 후 Phase 2 Prisma 설정')
  }

  console.log('='.repeat(70))

  await myConn.end()
}

verify().catch(err => {
  console.error('❌ 검증 스크립트 오류:', err.message)
  process.exit(1)
})
