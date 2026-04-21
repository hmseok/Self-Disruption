// 2026-04-21 #46 투자자/지입 상세 페이지 누락 컬럼 추가
// - jiip_contracts: 9개 컬럼
// - general_investments: 8개 컬럼
//
// 사용:
//   export $(grep DATABASE_URL .env.local | xargs) && \
//     node scripts/migrate_investor_fields_2026_04_21.mjs [--dry-run]

import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL required'); process.exit(1) }

const DRY = process.argv.includes('--dry-run')
const banner = (s) => console.log('\n' + '='.repeat(70) + '\n' + s + '\n' + '='.repeat(70))

// ─── URL 수동 파싱 (decodeURIComponent 우회 — 비밀번호 % @ 허용) ──
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

banner('#46 투자자/지입 상세 페이지 — 누락 컬럼 추가')

// ─── 컬럼 존재 여부 헬퍼 ──────────────────────────────
async function columnExists(table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) as cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
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

// ─── jiip_contracts 9개 컬럼 ──────────────────────────────
console.log('\n[jiip_contracts]')
const jiipFields = [
  ['investor_phone',      'VARCHAR(32) NULL'],
  ['investor_email',      'VARCHAR(128) NULL'],
  ['investor_address',    'VARCHAR(255) NULL'],
  ['investor_reg_number', 'VARCHAR(32) NULL'],
  ['invest_amount',       'DECIMAL(12,0) NULL'],
  ['tax_type',            'VARCHAR(32) NULL'],
  ['memo',                'TEXT NULL'],
  ['mortgage_setup',      'TINYINT(1) NOT NULL DEFAULT 0'],
  ['signed_file_url',     'VARCHAR(512) NULL'],
]
let jiipAdded = 0
for (const [col, def] of jiipFields) {
  if (await addColumnIfMissing('jiip_contracts', col, def)) jiipAdded++
}

// ─── general_investments 8개 컬럼 ──────────────────────────
console.log('\n[general_investments]')
const invFields = [
  ['investor_phone',      'VARCHAR(32) NULL'],
  ['investor_email',      'VARCHAR(128) NULL'],
  ['investor_address',    'VARCHAR(255) NULL'],
  ['investor_reg_number', 'VARCHAR(32) NULL'],
  ['tax_type',            'VARCHAR(32) NULL'],
  ['memo',                'TEXT NULL'],
  ['grace_period_months', 'INT NULL'],
  ['car_number',          'VARCHAR(32) NULL'],
]
let invAdded = 0
for (const [col, def] of invFields) {
  if (await addColumnIfMissing('general_investments', col, def)) invAdded++
}

// ─── notes → memo 마이그레이션 (레거시 호환) ────────────────
if (!DRY && (jiipAdded > 0 || invAdded > 0)) {
  console.log('\n[notes → memo 레거시 복사]')
  try {
    const [r1] = await conn.query(
      `UPDATE jiip_contracts SET memo = notes
       WHERE memo IS NULL AND notes IS NOT NULL AND notes != ''`
    )
    console.log(`  jiip_contracts: ${r1.affectedRows} rows`)
  } catch (e) { console.warn('  jiip_contracts memo copy skipped:', e.message) }
  try {
    const [r2] = await conn.query(
      `UPDATE general_investments SET memo = notes
       WHERE memo IS NULL AND notes IS NOT NULL AND notes != ''`
    )
    console.log(`  general_investments: ${r2.affectedRows} rows`)
  } catch (e) { console.warn('  general_investments memo copy skipped:', e.message) }
}

banner(DRY
  ? `⏭️  DRY RUN 완료 — jiip +${jiipAdded}, inv +${invAdded} 예정`
  : `✅ 완료 — jiip +${jiipAdded}, inv +${invAdded} 컬럼 추가`)

await conn.end()
