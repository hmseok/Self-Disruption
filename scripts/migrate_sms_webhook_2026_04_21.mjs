// 2026-04-21 SMS 웹훅 Phase 1 마이그레이션
// - card_sms_transactions 테이블 생성
//
// 사용:
//   DATABASE_URL='mysql://...' node scripts/migrate_sms_webhook_2026_04_21.mjs [--dry-run]

import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL required'); process.exit(1) }

const DRY = process.argv.includes('--dry-run')
const banner = (s) => console.log('\n' + '='.repeat(70) + '\n' + s + '\n' + '='.repeat(70))

const u = new URL(url)
const conn = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 3306),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''),
  connectTimeout: 30000, multipleStatements: false,
})

banner('SMS 웹훅 Phase 1 — card_sms_transactions 테이블 생성')

// ── 존재 확인 ──────────────────────────────
const [existing] = await conn.query(
  `SELECT COUNT(*) as cnt FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'card_sms_transactions'`
)
if (existing[0].cnt > 0) {
  console.log('✅ card_sms_transactions 이미 존재 — 건너뜀')
  await conn.end()
  process.exit(0)
}

const SQL = `
CREATE TABLE card_sms_transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NULL,

  raw_text TEXT NOT NULL,
  raw_hash VARCHAR(64) NOT NULL UNIQUE,
  sender VARCHAR(32) NULL,
  received_at DATETIME NOT NULL,

  parse_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  parse_error TEXT NULL,
  card_issuer VARCHAR(16) NULL,
  card_alias VARCHAR(64) NULL,
  holder_name VARCHAR(64) NULL,
  transaction_type VARCHAR(16) NOT NULL DEFAULT 'approved',
  transaction_at DATETIME NULL,
  amount DECIMAL(15,0) NULL,
  merchant VARCHAR(255) NULL,
  installment VARCHAR(32) NULL,

  transaction_id CHAR(36) NULL,
  card_id CHAR(36) NULL,
  canceled_sms_id CHAR(36) NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_sms_company (company_id),
  INDEX idx_sms_parse_status (parse_status),
  INDEX idx_sms_issuer (card_issuer),
  INDEX idx_sms_tx_at (transaction_at),
  INDEX idx_sms_card (card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`.trim()

console.log('[SQL]\n' + SQL)
if (DRY) {
  console.log('\n⏭️  DRY RUN — 실제 실행 안 함')
  await conn.end()
  process.exit(0)
}

await conn.query(SQL)
console.log('\n✅ card_sms_transactions 테이블 생성 완료')

await conn.end()
