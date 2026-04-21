// 2026-04-21 #22 loans 역추적 지원 컬럼 추가
// - source_transaction_ids: JSON       (역추적 소스 트랜잭션 ID 배열)
// - auto_generated:         TINYINT(1) (자동 생성 플래그, 롤백 식별용)
// - ai_confidence:          DECIMAL(3,2) (0.00 ~ 1.00)
// - backtrace_at:           DATETIME   (역추적 실행 시각)
//
// 사용:
//   export $(grep DATABASE_URL .env.local | xargs) && \
//     node scripts/migrate_loans_backtrace_2026_04_21.mjs [--dry-run]

import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL required'); process.exit(1) }

const DRY = process.argv.includes('--dry-run')
const banner = (s) => console.log('\n' + '='.repeat(70) + '\n' + s + '\n' + '='.repeat(70))

// ─── URL 수동 파싱 (비밀번호 % @ 허용) ──
const m = url.match(/^mysql:\/\/(.+)@([^:\/@]+)(?::(\d+))?\/(.+?)(?:\?.*)?$/)
if (!m) {
  console.error('❌ DATABASE_URL 형식 오류 (mysql://user:pass@host:port/db 기대)')
  process.exit(1)
}
const [, userPass, host, port, database] = m
const colonIdx = userPass.indexOf(':')
const user = colonIdx === -1 ? userPass : userPass.substring(0, colonIdx)
const password = colonIdx === -1 ? '' : userPass.substring(colonIdx + 1)

const conn = await mysql.createConnection({
  host,
  port: Number(port || 3306),
  user,
  password,
  database,
  connectTimeout: 30000,
  multipleStatements: false,
})

banner('#22 loans 역추적 지원 컬럼 추가')

async function columnExists(table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) as cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  )
  return rows[0].cnt > 0
}

async function indexExists(table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) as cnt FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  )
  return rows[0].cnt > 0
}

async function addColumnIfMissing(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`  ✓ ${table}.${column} — 이미 존재`)
    return false
  }
  const sql = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
  if (DRY) {
    console.log(`  ⏭️  [DRY] ${sql}`)
  } else {
    await conn.query(sql)
    console.log(`  + ${table}.${column} ${definition}`)
  }
  return true
}

async function addIndexIfMissing(table, indexName, columns) {
  if (await indexExists(table, indexName)) {
    console.log(`  ✓ index ${table}.${indexName} — 이미 존재`)
    return false
  }
  const sql = `CREATE INDEX \`${indexName}\` ON \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')})`
  if (DRY) {
    console.log(`  ⏭️  [DRY] ${sql}`)
  } else {
    await conn.query(sql)
    console.log(`  + index ${table}.${indexName} (${columns.join(', ')})`)
  }
  return true
}

console.log('\n[loans]')
const loansFields = [
  ['source_transaction_ids', 'JSON NULL'],
  ['auto_generated',         'TINYINT(1) NOT NULL DEFAULT 0'],
  ['ai_confidence',          'DECIMAL(3,2) NULL'],
  ['backtrace_at',           'DATETIME NULL'],
]
let added = 0
for (const [col, def] of loansFields) {
  if (await addColumnIfMissing('loans', col, def)) added++
}

// 롤백 성능용 인덱스
let indexAdded = 0
if (await addIndexIfMissing('loans', 'idx_loans_auto_backtrace', ['auto_generated', 'backtrace_at'])) indexAdded++

banner(DRY
  ? `⏭️  DRY RUN 완료 — +${added} 컬럼, +${indexAdded} 인덱스 예정`
  : `✅ 완료 — +${added} 컬럼, +${indexAdded} 인덱스 추가`)

await conn.end()
