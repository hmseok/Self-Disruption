#!/usr/bin/env node
/**
 * 증분 동기화 스크립트 (마이그레이션 전환 기간 중 사용)
 *
 * 마이그레이션 완료 후 전환(cutover) 시점까지
 * Supabase에서 새로 추가/변경된 데이터를 MySQL로 동기화합니다.
 *
 * 실행 방법:
 *   node 04_incremental_sync.js [--dry-run]
 *
 * --dry-run: 실제 쓰기 없이 변경 예정 데이터만 출력
 *
 * 권장 실행 주기: cron으로 1시간마다 실행
 *   0 * * * * node /path/to/04_incremental_sync.js >> /var/log/fmi_sync.log 2>&1
 */

const { Client: PgClient } = require('pg');
const mysql = require('mysql2/promise');

const DRY_RUN = process.argv.includes('--dry-run');

const pgConfig = {
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
};

const mysqlConfig = {
  host: process.env.MYSQL_HOST || '34.47.105.219',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'fmi_op',
};

// ============================================================
// 증분 동기화 대상 테이블 (updated_at 컬럼이 있는 테이블)
// ============================================================
const SYNC_TABLES = [
  // [테이블명, 기준 시간 컬럼, 식별자 컬럼]
  ['fmi_vehicles',      'updated_at', 'id'],
  ['fmi_accidents',     'updated_at', 'id'],
  ['fmi_rentals',       'updated_at', 'id'],
  ['fmi_claims',        'updated_at', 'id'],
  ['fmi_payments',      'updated_at', 'id'],
  ['fmi_settlements',   'created_at', 'id'],  // updated_at 없음
  ['fmi_rental_timeline', 'created_at', 'id'], // append-only
  ['customers',         'updated_at', 'id'],
  ['cars',              'updated_at', 'id'],
  ['quotes',            'updated_at', 'id'],
  ['contracts',         'updated_at', 'id'],
  ['transactions',      'created_at', 'id'],
  ['openbanking_accounts',    'created_at', 'id'],
  ['openbanking_transactions', 'created_at', 'id'],
];

// 마지막 동기화 시간 추적 (파일 기반 간단 구현)
const fs = require('fs');
const SYNC_STATE_FILE = '/tmp/fmi_sync_state.json';

function loadSyncState() {
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSyncState(state) {
  if (!DRY_RUN) {
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
  }
}

async function syncTable(pgConn, myConn, tableName, timeCol, idCol, lastSyncTime) {
  // 마지막 동기화 이후 변경된 row 조회
  const since = lastSyncTime || '2020-01-01T00:00:00Z';
  const pgResult = await pgConn.query(
    `SELECT * FROM public."${tableName}" WHERE ${timeCol} > $1 ORDER BY ${timeCol} LIMIT 1000`,
    [since]
  );

  if (pgResult.rows.length === 0) return 0;

  let synced = 0;

  for (const row of pgResult.rows) {
    // PostgreSQL row → MySQL INSERT ON DUPLICATE KEY UPDATE
    const fields = Object.keys(row);
    const values = fields.map(f => {
      const v = row[f];
      if (v === null) return null;
      if (typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
      if (Array.isArray(v)) return JSON.stringify(v);
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v;
    });

    const placeholders = fields.map(() => '?').join(', ');
    const updateClause = fields
      .filter(f => f !== idCol)
      .map(f => `\`${f}\` = VALUES(\`${f}\`)`)
      .join(', ');

    const sql = `INSERT INTO \`${tableName}\` (${fields.map(f => `\`${f}\``).join(', ')})
                 VALUES (${placeholders})
                 ON DUPLICATE KEY UPDATE ${updateClause}`;

    if (!DRY_RUN) {
      await myConn.execute(sql, values);
    }
    synced++;
  }

  return synced;
}

async function main() {
  console.log(`[${new Date().toISOString()}] 증분 동기화 시작 ${DRY_RUN ? '(DRY RUN)' : ''}`);

  const state = loadSyncState();
  const newState = { ...state };
  const syncStartTime = new Date().toISOString();

  let pgConn, myConn;
  let totalSynced = 0;

  try {
    pgConn = new PgClient(pgConfig);
    await pgConn.connect();
    myConn = await mysql.createConnection(mysqlConfig);

    for (const [table, timeCol, idCol] of SYNC_TABLES) {
      const lastSync = state[table];
      try {
        const count = await syncTable(pgConn, myConn, table, timeCol, idCol, lastSync);
        if (count > 0) {
          console.log(`  ✅ ${table}: ${count}건 동기화`);
          totalSynced += count;
        }
        newState[table] = syncStartTime;
      } catch (err) {
        console.error(`  ❌ ${table}: ${err.message}`);
      }
    }

    saveSyncState(newState);
    console.log(`[${new Date().toISOString()}] 완료: 총 ${totalSynced}건 동기화됨`);

  } finally {
    if (pgConn) await pgConn.end();
    if (myConn) await myConn.end();
  }
}

main().catch(err => {
  console.error('❌ 동기화 오류:', err);
  process.exit(1);
});
