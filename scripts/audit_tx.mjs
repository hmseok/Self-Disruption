// 기존 거래 내역 감사 — mysql2 직접 사용 (Prisma 바이너리 이슈 회피)
// 목적: 실제 통장/카드 데이터에서 카테고리 갭을 발견
//
// 사용:
//   DATABASE_URL='mysql://...' node scripts/audit_tx.mjs

import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL required')
  process.exit(1)
}

const u = new URL(url)
const conn = await mysql.createConnection({
  host: u.hostname,
  port: Number(u.port || 3306),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''),
  connectTimeout: 30000,
})

const banner = (s) => console.log('\n' + '='.repeat(70) + '\n' + s + '\n' + '='.repeat(70))
const q = async (sql, params = []) => { const [rows] = await conn.query(sql, params); return rows }
const fmt = (n) => n == null ? '-' : Number(n).toLocaleString()

try {
  banner('1. 카테고리 분포 TOP 50 (category × type)')
  const r1 = await q(`
    SELECT COALESCE(category, '(NULL)') AS category, type,
           COUNT(*) AS cnt,
           ROUND(SUM(amount), 0) AS sum_amount
    FROM transactions
    WHERE deleted_at IS NULL
    GROUP BY category, type
    ORDER BY cnt DESC
    LIMIT 50
  `)
  for (const r of r1) console.log(`${(r.category || '').padEnd(20)} | ${String(r.type || '').padEnd(8)} | ${String(r.cnt).padStart(5)}건 | ${fmt(r.sum_amount).padStart(14)}원`)

  banner('2. 미분류/기타 거래 TOP 40 (client × description)')
  const r2 = await q(`
    SELECT client_name, description, type, payment_method,
           COUNT(*) AS cnt,
           ROUND(SUM(amount), 0) AS sum_amount
    FROM transactions
    WHERE deleted_at IS NULL
      AND (category IS NULL OR category = '' OR category = '미분류' OR category = '기타')
    GROUP BY client_name, description, type, payment_method
    ORDER BY cnt DESC
    LIMIT 40
  `)
  for (const r of r2) console.log(`[${r.type}/${r.payment_method || '-'}] ${(r.client_name || '(?)').slice(0, 20).padEnd(20)} | ${(r.description || '').slice(0, 30).padEnd(30)} | ${String(r.cnt).padStart(4)}건 | ${fmt(r.sum_amount).padStart(12)}원`)

  banner('3. 카드 거래 client TOP 40')
  const r3 = await q(`
    SELECT client_name, category,
           COUNT(*) AS cnt,
           ROUND(SUM(amount), 0) AS sum_amount
    FROM transactions
    WHERE deleted_at IS NULL
      AND (payment_method = 'card' OR payment_method LIKE '%카드%' OR payment_method = 'Card' OR payment_method = '카드')
    GROUP BY client_name, category
    ORDER BY cnt DESC
    LIMIT 40
  `)
  for (const r of r3) console.log(`${(r.client_name || '(?)').slice(0, 25).padEnd(25)} | ${(r.category || '(null)').padEnd(18)} | ${String(r.cnt).padStart(4)}건 | ${fmt(r.sum_amount).padStart(12)}원`)

  banner('4. 통장 수입 client TOP 30')
  const r4 = await q(`
    SELECT client_name, category,
           COUNT(*) AS cnt,
           ROUND(SUM(amount), 0) AS sum_amount
    FROM transactions
    WHERE deleted_at IS NULL
      AND type = 'income'
      AND (payment_method IS NULL OR (payment_method NOT LIKE '%card%' AND payment_method NOT LIKE '%카드%'))
    GROUP BY client_name, category
    ORDER BY sum_amount DESC
    LIMIT 30
  `)
  for (const r of r4) console.log(`${(r.client_name || '(?)').slice(0, 25).padEnd(25)} | ${(r.category || '(null)').padEnd(18)} | ${String(r.cnt).padStart(4)}건 | ${fmt(r.sum_amount).padStart(14)}원`)

  banner('5. 통장 지출 client TOP 30')
  const r5 = await q(`
    SELECT client_name, category,
           COUNT(*) AS cnt,
           ROUND(SUM(amount), 0) AS sum_amount
    FROM transactions
    WHERE deleted_at IS NULL
      AND type = 'expense'
      AND (payment_method IS NULL OR (payment_method NOT LIKE '%card%' AND payment_method NOT LIKE '%카드%'))
    GROUP BY client_name, category
    ORDER BY sum_amount DESC
    LIMIT 30
  `)
  for (const r of r5) console.log(`${(r.client_name || '(?)').slice(0, 25).padEnd(25)} | ${(r.category || '(null)').padEnd(18)} | ${String(r.cnt).padStart(4)}건 | ${fmt(r.sum_amount).padStart(14)}원`)

  banner('6. 전체 규모 요약 (type별)')
  const r6 = await q(`
    SELECT type,
           COUNT(*) AS cnt,
           SUM(CASE WHEN category IS NULL OR category = '' OR category = '미분류' OR category = '기타' THEN 1 ELSE 0 END) AS unclassified,
           ROUND(SUM(amount), 0) AS total_amount
    FROM transactions
    WHERE deleted_at IS NULL
    GROUP BY type
  `)
  for (const r of r6) console.log(`${String(r.type).padEnd(8)} | ${String(r.cnt).padStart(6)}건 | 미분류 ${String(r.unclassified).padStart(4)} | ${fmt(r.total_amount).padStart(14)}원`)

  banner('7. related_type 분포')
  const r7 = await q(`SELECT related_type, COUNT(*) AS cnt FROM transactions WHERE deleted_at IS NULL GROUP BY related_type ORDER BY cnt DESC`)
  for (const r of r7) console.log(`${(r.related_type || '(NULL)').padEnd(20)} | ${String(r.cnt).padStart(6)}건`)

  banner('8. corporate_cards 스키마')
  const r8 = await q(`SHOW COLUMNS FROM corporate_cards`)
  for (const r of r8) console.log(`${String(r.Field).padEnd(25)} | ${String(r.Type).padEnd(20)} | ${r.Null} | ${r.Key}`)

  banner('9. payment_method 분포')
  const r9 = await q(`SELECT payment_method, COUNT(*) AS cnt FROM transactions WHERE deleted_at IS NULL GROUP BY payment_method ORDER BY cnt DESC LIMIT 20`)
  for (const r of r9) console.log(`${(r.payment_method || '(NULL)').padEnd(20)} | ${String(r.cnt).padStart(6)}건`)

} catch (e) {
  console.error('ERROR:', e.message, e.stack)
  process.exit(1)
} finally {
  await conn.end()
}
