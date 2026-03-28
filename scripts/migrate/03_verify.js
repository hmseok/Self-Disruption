#!/usr/bin/env node
/**
 * 데이터 마이그레이션 검증 스크립트
 *
 * Supabase PostgreSQL과 Google Cloud SQL MySQL 양쪽의
 * 테이블 row 수와 주요 컬럼 값을 비교하여 데이터 손실 여부를 확인합니다.
 *
 * 실행 방법:
 *   npm install pg mysql2
 *   node 03_verify.js
 *
 * 환경변수 필요:
 *   SUPABASE_DB_URL=postgresql://postgres.REF:PW@host:5432/postgres
 *   MYSQL_HOST=127.0.0.1
 *   MYSQL_PORT=3307
 *   MYSQL_USER=fmi_erp_user
 *   MYSQL_PASSWORD=YOUR_PASSWORD
 *   MYSQL_DATABASE=fmi_erp
 */

const { Client: PgClient } = require('pg');
const mysql = require('mysql2/promise');

// ============================================================
// 환경변수 또는 직접 설정
// ============================================================
const config = {
  supabase: {
    connectionString: process.env.SUPABASE_DB_URL ||
      'postgresql://postgres.FILL_ME:FILL_ME@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  },
  mysql: {
    // Cloud SQL Proxy: 127.0.0.1:3307
    // Public IP 직접: 34.47.105.219:3306
    host: process.env.MYSQL_HOST || '34.47.105.219',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'fmi_erp_user',
    password: process.env.MYSQL_PASSWORD || 'FILL_ME',
    database: process.env.MYSQL_DATABASE || 'fmi_op',
  }
};

// ============================================================
// 검증할 테이블 목록 (비즈니스 핵심 테이블 우선)
// ============================================================
const VERIFY_TABLES = [
  // 대차 핵심
  'fmi_vehicles',
  'fmi_accidents',
  'fmi_rentals',
  'fmi_claims',
  'fmi_settlements',
  'fmi_payments',
  'fmi_rental_timeline',
  'fmi_insurance_companies',
  // 기존 ERP
  'cars',
  'customers',
  'quotes',
  'contracts',
  'employees',
  'profiles',
  // 재무
  'transactions',
  'corporate_cards',
  'expense_receipts',
  // 오픈뱅킹
  'openbanking_accounts',
  'openbanking_transactions',
  // Codef
  'codef_connections',
  'codef_sync_logs',
  // 설정
  'code_master',
  'common_codes',
  'system_modules',
  'message_templates',
];

// ============================================================
// 샘플 데이터 비교 대상 (테이블별 주요 컬럼)
// ============================================================
const SAMPLE_CHECKS = {
  fmi_vehicles: { orderBy: 'created_at', fields: ['id', 'car_number', 'status', 'ownership_type'] },
  fmi_accidents: { orderBy: 'created_at', fields: ['id', 'cafe24_id', 'status', 'customer_name'] },
  fmi_rentals: { orderBy: 'created_at', fields: ['id', 'rental_no', 'status', 'customer_name'] },
  fmi_claims: { orderBy: 'created_at', fields: ['id', 'claim_no', 'status', 'insurance_company'] },
  customers: { orderBy: 'created_at', fields: ['id', 'name', 'phone'] },
  cars: { orderBy: 'created_at', fields: ['id', 'plate_number'] },
  profiles: { orderBy: 'created_at', fields: ['id', 'email', 'role'] },
};

// ============================================================
// 메인 검증 함수
// ============================================================
async function verify() {
  console.log('🔍 FMI ERP 데이터 마이그레이션 검증 시작\n');
  console.log('='.repeat(70));

  let pgConn, myConn;
  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalMissing = 0;

  try {
    // DB 연결
    console.log('📡 Supabase PostgreSQL 연결 중...');
    pgConn = new PgClient({ connectionString: config.supabase.connectionString, ssl: config.supabase.ssl });
    await pgConn.connect();
    console.log('✅ Supabase 연결 성공\n');

    console.log('📡 Google Cloud SQL MySQL 연결 중...');
    myConn = await mysql.createConnection(config.mysql);
    console.log('✅ Cloud SQL MySQL 연결 성공\n');
    console.log('='.repeat(70));
    console.log(`${'테이블명'.padEnd(35)} ${'PG행수'.padStart(8)} ${'MY행수'.padStart(8)} ${'결과'.padStart(10)}`);
    console.log('-'.repeat(70));

    // 1. Row Count 비교
    for (const table of VERIFY_TABLES) {
      try {
        // PostgreSQL row count
        const pgResult = await pgConn.query(
          `SELECT COUNT(*) AS cnt FROM public."${table}"`
        );
        const pgCount = parseInt(pgResult.rows[0].cnt);

        // MySQL row count
        const [myResult] = await myConn.execute(
          `SELECT COUNT(*) AS cnt FROM \`${table}\``
        );
        const myCount = myResult[0].cnt;

        const diff = pgCount - myCount;
        const status = diff === 0 ? '✅ PASS' : diff > 0 ? '❌ FAIL' : '⚠ 초과';
        const icon = diff === 0 ? '✅' : '❌';

        console.log(
          `${icon} ${table.padEnd(33)} ${String(pgCount).padStart(8)} ${String(myCount).padStart(8)} ${status.padStart(10)}` +
          (diff !== 0 ? ` (차이: ${diff > 0 ? '+' : ''}${pgCount - myCount})` : '')
        );

        results.push({ table, pgCount, myCount, diff, passed: diff === 0 });
        if (diff === 0) totalPassed++;
        else totalFailed++;

      } catch (err) {
        if (err.message?.includes('does not exist') || err.message?.includes("Table") ) {
          console.log(`⬜ ${table.padEnd(33)} ${'N/A'.padStart(8)} ${'N/A'.padStart(8)} ${'누락'.padStart(10)}`);
          results.push({ table, pgCount: null, myCount: null, diff: null, passed: false, missing: true });
          totalMissing++;
        } else {
          console.log(`⚠  ${table.padEnd(33)} ${'ERROR'.padStart(8)} ${'ERROR'.padStart(8)} ${err.message.substring(0, 20)}`);
          totalFailed++;
        }
      }
    }

    console.log('='.repeat(70));

    // 2. 샘플 데이터 비교
    console.log('\n📋 샘플 데이터 검증 (첫 5개 행)\n');
    console.log('='.repeat(70));

    for (const [table, config_] of Object.entries(SAMPLE_CHECKS)) {
      try {
        const pgSample = await pgConn.query(
          `SELECT ${config_.fields.join(', ')} FROM public."${table}" ORDER BY ${config_.orderBy} LIMIT 5`
        );

        const [mySample] = await myConn.execute(
          `SELECT ${config_.fields.join(', ')} FROM \`${table}\` ORDER BY ${config_.orderBy} LIMIT 5`
        );

        let sampleMatch = true;
        for (let i = 0; i < pgSample.rows.length; i++) {
          for (const field of config_.fields) {
            const pgVal = String(pgSample.rows[i]?.[field] ?? '');
            const myVal = String(mySample[i]?.[field] ?? '');
            // UUID 비교 (대소문자 무시)
            if (pgVal.toLowerCase() !== myVal.toLowerCase()) {
              console.log(`  ❌ ${table}.${field} 불일치:`);
              console.log(`     PG: ${pgVal}`);
              console.log(`     MY: ${myVal}`);
              sampleMatch = false;
            }
          }
        }

        if (sampleMatch) {
          console.log(`  ✅ ${table}: 샘플 ${pgSample.rows.length}개 일치`);
        }
      } catch (err) {
        if (!err.message?.includes('does not exist') && !err.message?.includes('Table')) {
          console.log(`  ⚠  ${table}: ${err.message.substring(0, 60)}`);
        }
      }
    }

    // 3. 최종 결과 요약
    const failedTables = results.filter(r => !r.passed && !r.missing);
    const missingTables = results.filter(r => r.missing);

    console.log('\n' + '='.repeat(70));
    console.log('📊 검증 결과 요약');
    console.log('='.repeat(70));
    console.log(`  총 검증 테이블: ${VERIFY_TABLES.length}개`);
    console.log(`  ✅ 정상 (row 수 일치): ${totalPassed}개`);
    console.log(`  ❌ 이상 (row 수 차이): ${totalFailed}개`);
    console.log(`  ⬜ 누락 (MySQL에 없음): ${totalMissing}개`);

    if (failedTables.length > 0) {
      console.log('\n❌ row 수 불일치 테이블:');
      for (const r of failedTables) {
        console.log(`   - ${r.table}: PG=${r.pgCount}, MY=${r.myCount}, 차이=${r.pgCount - r.myCount}`);
      }
      console.log('\n💡 해결방법:');
      console.log('   1. pgloader 로그 확인: tail -100 /tmp/pgloader.log');
      console.log('   2. 해당 테이블만 재이전: pgloader 설정에서 ONLY TABLE 지정 후 재실행');
    }

    if (missingTables.length > 0) {
      console.log('\n⬜ MySQL에 없는 테이블 (수동 생성 필요):');
      for (const r of missingTables) {
        console.log(`   - ${r.table}`);
      }
    }

    if (totalFailed === 0 && totalMissing === 0) {
      console.log('\n🎉 모든 테이블 데이터가 완전히 이전되었습니다!');
      console.log('   다음 단계: Phase 2 Prisma 설정을 진행하세요.');
    }

    console.log('='.repeat(70));

  } finally {
    if (pgConn) await pgConn.end();
    if (myConn) await myConn.end();
  }
}

// 실행
verify().catch(err => {
  console.error('❌ 검증 스크립트 오류:', err.message);
  process.exit(1);
});
