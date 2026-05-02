// 1회용: 영수증 데이터 점검
import mysql from 'mysql2/promise'
const c = await mysql.createConnection({
  host: '34.47.105.219', port: 3306,
  user: 'root', password: 'Q3J{g@K7UkTxSkm%',
  database: 'fmi_op',
})

console.log('── 3월 영수증 32건 (시간순) ──')
const [rows] = await c.query(`
  SELECT id, expense_date, merchant, item_name, category, amount, card_number
    FROM expense_receipts
   WHERE expense_date BETWEEN '2026-03-01' AND '2026-03-31'
   ORDER BY expense_date, id
`)
rows.forEach((r, i) => {
  const amt = Number(r.amount)
  const flag = amt <= 0 ? '⚠️ ' : (Math.abs(amt) > 1_000_000 ? '⚠️큰값' : '   ')
  console.log(`${flag} ${String(i+1).padStart(2)}. ${r.expense_date}  ${String(r.merchant).padEnd(15)} ${String(r.category).padEnd(6)} ${String(amt).padStart(10)}원  [${r.item_name || '-'}]`)
})

console.log('\n── 의심 케이스 ──')
const [neg] = await c.query(`SELECT COUNT(*) AS n FROM expense_receipts WHERE amount <= 0`)
console.log('amount <= 0 건수:', neg[0].n)

const [dups] = await c.query(`
  SELECT expense_date, merchant, amount, COUNT(*) AS n
    FROM expense_receipts
   WHERE expense_date BETWEEN '2026-03-01' AND '2026-03-31'
   GROUP BY expense_date, merchant, amount
  HAVING COUNT(*) > 1
`)
console.log('중복(같은 날짜+가맹점+금액):', dups.length, '쌍')
dups.forEach(d => console.log(`  ${d.expense_date} ${d.merchant} ${d.amount}원 × ${d.n}`))

// 가승인/취소 짝 의심: 같은 날짜+가맹점에 +/- 짝
console.log('\n── 가승인↔취소 짝 의심 ──')
const [pairs] = await c.query(`
  SELECT a.expense_date, a.merchant, a.amount AS pos, b.amount AS neg
    FROM expense_receipts a
    JOIN expense_receipts b
      ON a.expense_date = b.expense_date
     AND a.merchant = b.merchant
     AND a.amount > 0 AND b.amount < 0
     AND ABS(a.amount + b.amount) < 1
   WHERE a.expense_date BETWEEN '2026-03-01' AND '2026-03-31'
`)
pairs.forEach(p => console.log(`  ${p.expense_date} ${p.merchant} ${p.pos} ↔ ${p.neg}`))

await c.end()
