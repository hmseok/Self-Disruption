#!/usr/bin/env node
/**
 * Node.js 기반 데이터 마이그레이션 스크립트
 * pgloader 없이 Supabase → Cloud SQL MySQL 전체 데이터 이전
 *
 * 실행 방법:
 *   cd scripts/migrate
 *   npm install pg mysql2
 *   node 05_migrate_node.js
 *
 * 옵션:
 *   node 05_migrate_node.js --table=fmi_vehicles   (특정 테이블만)
 *   node 05_migrate_node.js --dry-run              (연결 테스트만)
 */

const { Client: PgClient } = require('pg')
const mysql = require('mysql2/promise')

// ============================================================
// 연결 설정 — URL 인코딩 없이 파라미터로 직접 지정
// ============================================================
const PG_CONFIG = {
  host: 'aws-0-ap-northeast-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.uiyiwgkpchnvuvpsjfxv',
  password: '!SUKHOMIN3231',   // 특수문자 그대로 (URL 인코딩 불필요)
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
}

const MYSQL_CONFIG = {
  host: '34.47.105.219',
  port: 3306,
  user: 'root',
  password: 'Q3J{g@K7UkTxSkm%',  // 특수문자 그대로
  database: 'fmi_op',
  multipleStatements: true,
  connectTimeout: 30000,
  ssl: { rejectUnauthorized: false }
}

const BATCH_SIZE = 500   // 한 번에 처리할 row 수
const DRY_RUN = process.argv.includes('--dry-run')
const ONLY_TABLE = process.argv.find(a => a.startsWith('--table='))?.split('=')[1]

// ============================================================
// PostgreSQL → MySQL 타입 변환
// ============================================================
function convertValue(value, pgType) {
  if (value === null || value === undefined) return null

  // Boolean
  if (pgType === 'bool') return value ? 1 : 0

  // JSON / JSONB
  if (pgType === 'json' || pgType === 'jsonb') {
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  // PostgreSQL 배열 (text[], int4[] 등)
  if (pgType.startsWith('_') || Array.isArray(value)) {
    return JSON.stringify(Array.isArray(value) ? value : [value])
  }

  // UUID → 문자열
  if (pgType === 'uuid') return String(value)

  // Date → MySQL DATETIME 형식
  if (value instanceof Date) {
    return value.toISOString().replace('T', ' ').replace('Z', '').substring(0, 23)
  }

  // numeric/decimal
  if (pgType === 'numeric' || pgType === 'float4' || pgType === 'float8') {
    return value === null ? null : parseFloat(value)
  }

  return value
}

// ============================================================
// PostgreSQL 테이블 목록 조회
// ============================================================
async function getTableList(pgConn) {
  const result = await pgConn.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
    ORDER BY tablename
  `)
  return result.rows.map(r => r.tablename)
}

// ============================================================
// 테이블 컬럼 정보 조회
// ============================================================
async function getColumns(pgConn, tableName) {
  const result = await pgConn.query(`
    SELECT
      column_name,
      udt_name AS pg_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName])
  return result.rows
}

// ============================================================
// MySQL CREATE TABLE 생성 (PostgreSQL 스키마 기반)
// ============================================================
function pgTypeToMySQL(pgType, columnDefault) {
  const typeMap = {
    'uuid':        'VARCHAR(36)',
    'text':        'LONGTEXT',
    'varchar':     'VARCHAR(255)',
    'bpchar':      'VARCHAR(255)',
    'int4':        'INT',
    'int8':        'BIGINT',
    'int2':        'SMALLINT',
    'float4':      'FLOAT',
    'float8':      'DOUBLE',
    'numeric':     'DECIMAL(20,6)',
    'bool':        'TINYINT(1)',
    'json':        'LONGTEXT',
    'jsonb':       'LONGTEXT',
    'date':        'DATE',
    'time':        'TIME',
    'timestamp':   'DATETIME(6)',
    'timestamptz': 'DATETIME(6)',
    'interval':    'VARCHAR(50)',
  }

  // 배열 타입 (_text, _int4 등)
  if (pgType.startsWith('_')) return 'LONGTEXT'

  return typeMap[pgType] || 'LONGTEXT'
}

async function createMySQLTable(myConn, tableName, columns) {
  const colDefs = columns.map(col => {
    const mysqlType = pgTypeToMySQL(col.pg_type, col.column_default)
    const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'
    const defaultVal = col.column_default?.includes('gen_random_uuid')
      ? "DEFAULT (UUID())"
      : col.column_default?.includes('now()')
      ? "DEFAULT CURRENT_TIMESTAMP(6)"
      : ''
    return `  \`${col.column_name}\` ${mysqlType} ${nullable} ${defaultVal}`.trimEnd()
  }).join(',\n')

  // PRIMARY KEY 찾기
  const pkCol = columns.find(c =>
    c.column_default?.includes('gen_random_uuid') || c.column_name === 'id'
  )

  const pkDef = pkCol ? `,\n  PRIMARY KEY (\`${pkCol.column_name}\`)` : ''

  const sql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n${colDefs}${pkDef}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`

  try {
    await myConn.execute(sql)
  } catch (err) {
    // 테이블이 이미 있으면 무시
    if (!err.message.includes('already exists')) {
      console.warn(`  ⚠ CREATE TABLE ${tableName}: ${err.message.substring(0, 80)}`)
    }
  }
}

// ============================================================
// 단일 테이블 마이그레이션
// ============================================================
async function migrateTable(pgConn, myConn, tableName) {
  // 컬럼 정보 조회
  const columns = await getColumns(pgConn, tableName)
  if (columns.length === 0) {
    console.log(`  ⬜ ${tableName}: 컬럼 없음, 건너뜀`)
    return 0
  }

  // MySQL 테이블 생성
  if (!DRY_RUN) {
    await createMySQLTable(myConn, tableName, columns)
  }

  // 전체 row 수 확인
  const countResult = await pgConn.query(`SELECT COUNT(*) AS cnt FROM public."${tableName}"`)
  const totalRows = parseInt(countResult.rows[0].cnt)

  if (totalRows === 0) {
    console.log(`  ✅ ${tableName}: 0건 (빈 테이블)`)
    return 0
  }

  if (DRY_RUN) {
    console.log(`  🔍 ${tableName}: ${totalRows}건 이전 예정`)
    return totalRows
  }

  // 기존 데이터 삭제 (재실행 시 중복 방지)
  await myConn.execute(`DELETE FROM \`${tableName}\``)

  // 배치 단위로 데이터 이전
  const colNames = columns.map(c => c.column_name)
  const colTypes = Object.fromEntries(columns.map(c => [c.column_name, c.pg_type]))
  let offset = 0
  let inserted = 0

  while (offset < totalRows) {
    const pgRows = await pgConn.query(
      `SELECT * FROM public."${tableName}" ORDER BY ${colNames.includes('created_at') ? 'created_at' : colNames[0]} LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    )

    if (pgRows.rows.length === 0) break

    // MySQL INSERT
    const placeholders = colNames.map(() => '?').join(', ')
    const insertSQL = `INSERT IGNORE INTO \`${tableName}\` (${colNames.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`

    for (const row of pgRows.rows) {
      const values = colNames.map(col => convertValue(row[col], colTypes[col]))
      try {
        await myConn.execute(insertSQL, values)
        inserted++
      } catch (err) {
        // 개별 row 오류는 기록하고 계속 진행
        if (!err.message.includes('Duplicate')) {
          console.warn(`    ⚠ row 삽입 오류 (${tableName}): ${err.message.substring(0, 60)}`)
        }
      }
    }

    offset += pgRows.rows.length
    process.stdout.write(`\r  ⏳ ${tableName}: ${inserted}/${totalRows}`)
  }

  process.stdout.write(`\r  ✅ ${tableName}: ${inserted}/${totalRows}건 완료\n`)
  return inserted
}

// ============================================================
// 메인 실행
// ============================================================
async function main() {
  console.log('🚀 FMI ERP 데이터 마이그레이션 시작')
  console.log(`   모드: ${DRY_RUN ? 'DRY RUN (테스트)' : '실제 실행'}`)
  if (ONLY_TABLE) console.log(`   대상: ${ONLY_TABLE} 테이블만`)
  console.log('='.repeat(60))

  let pgConn, myConn

  try {
    // 연결
    console.log('\n📡 Supabase 연결 중...')
    pgConn = new PgClient(PG_CONFIG)
    await pgConn.connect()
    console.log('✅ Supabase 연결 성공')

    console.log('📡 Cloud SQL MySQL 연결 중...')
    myConn = await mysql.createConnection(MYSQL_CONFIG)
    console.log('✅ Cloud SQL 연결 성공\n')

    if (DRY_RUN) {
      console.log('✅ 연결 테스트 완료! --dry-run 없이 실행하면 실제 마이그레이션이 시작됩니다.\n')
      return
    }

    // MySQL FK 체크 비활성화
    await myConn.execute('SET FOREIGN_KEY_CHECKS = 0')
    await myConn.execute('SET UNIQUE_CHECKS = 0')
    await myConn.execute("SET SESSION sql_mode = 'NO_AUTO_VALUE_ON_ZERO'")

    // 테이블 목록
    let tables = await getTableList(pgConn)
    if (ONLY_TABLE) {
      tables = tables.filter(t => t === ONLY_TABLE)
      if (tables.length === 0) {
        console.error(`❌ 테이블 '${ONLY_TABLE}'을 찾을 수 없습니다.`)
        return
      }
    }

    console.log(`📋 총 ${tables.length}개 테이블 마이그레이션 시작\n`)

    let totalInserted = 0
    let failedTables = []
    const startTime = Date.now()

    for (const table of tables) {
      try {
        const count = await migrateTable(pgConn, myConn, table)
        totalInserted += count
      } catch (err) {
        console.error(`\n  ❌ ${table}: ${err.message}`)
        failedTables.push(table)
      }
    }

    // FK 체크 복원
    await myConn.execute('SET FOREIGN_KEY_CHECKS = 1')
    await myConn.execute('SET UNIQUE_CHECKS = 1')

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    console.log('\n' + '='.repeat(60))
    console.log(`🎉 마이그레이션 완료!`)
    console.log(`   총 이전 건수: ${totalInserted.toLocaleString()}건`)
    console.log(`   소요 시간:    ${Math.floor(elapsed/60)}분 ${elapsed%60}초`)
    console.log(`   성공 테이블:  ${tables.length - failedTables.length}개`)

    if (failedTables.length > 0) {
      console.log(`\n⚠ 실패 테이블 (${failedTables.length}개):`)
      failedTables.forEach(t => console.log(`   - ${t}`))
      console.log('\n💡 개별 재실행: node 05_migrate_node.js --table=테이블명')
    }

    console.log('\n📌 다음 단계:')
    console.log('   1. node 03_verify.js          ← 데이터 검증')
    console.log('   2. mysql ... < 02_mysql_post_fix.sql  ← JSON/트리거 후처리')

  } finally {
    if (pgConn) await pgConn.end()
    if (myConn) await myConn.end()
  }
}

main().catch(err => {
  console.error('\n❌ 치명적 오류:', err.message)
  process.exit(1)
})
