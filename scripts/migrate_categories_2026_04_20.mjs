// 2026-04-20 카테고리 전면 개편 마이그레이션
// - corporate_cards.assigned_car_id 컬럼 추가 (차량 매칭 FK)
// - transactions.category 일괄 rename (구 → 신)
// - 원금상환 → 투자자 이름 있는 건 "투자원금 환급" 으로 재분류
//
// 사용:
//   DATABASE_URL='mysql://...' node scripts/migrate_categories_2026_04_20.mjs [--dry-run]

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

// 구 → 신 카테고리 매핑
const RENAME = {
  '접대비': '기업업무추진비',
  '쇼핑/온라인구매': '소모품비',
  '소모품/사무용품': '소모품비',
  '소모품': '소모품비',
  '식대': '복리후생비',
  '식대/소모품': '복리후생비',
  '복리후생(식대)': '복리후생비',
  '도서/신문': '도서인쇄비',
  '광고/마케팅': '광고선전비',
  '수수료/카드수수료': '지급수수료',
  '💳 수수료/카드': '지급수수료',
  '차량구입비': '차량취득비',
  '보증금(지출)': '보증금 예치',
  '세무서기장료': '세무대행료',
  '이자/잡이익': '이자수익',
  '이자비용(대출/투자)': '이자비용(대출)',
  '📦 기타 지출': '기타',
  '수입': '기타수입',
  '매각/처분수입': '매각/처분수익',
  '렌트/운송수입': '기타운송수익',   // 수동 재분류 기본값
  '원금상환': '대출원금상환',         // 투자자 매칭 분기는 아래 별도 처리
  '차량할부/리스료': '차량 운용리스료',
  '지입지급': '지입 수익배분금(출금)',
  '주차/통행료': '주차비',
  '카드결제': '카드대금상환',
  '카드대금납부': '카드대금상환',
  '카드자동집금': '결제대행 입금',
  '결제대행입금': '결제대행 입금',
  // DRY-RUN에서 추가 발견
  '보험료': '보험료(일반)',
  '세금공과': '세금/공과금',
  '차량정비': '정비/수리비',
  '숙박비': '여비교통비',
}

async function q(sql, params = []) {
  const [rows] = await conn.query(sql, params)
  return rows
}

async function exec(sql, params = []) {
  if (DRY) { console.log(`[DRY] ${sql.replace(/\s+/g, ' ').slice(0, 200)} …`, params); return { affectedRows: 0 } }
  const [res] = await conn.execute(sql, params)
  return res
}

try {
  banner(`마이그레이션 시작 ${DRY ? '(DRY-RUN)' : '(APPLY)'} — ${new Date().toISOString()}`)

  // ─────────────────────────────────────────────
  // STEP 1. corporate_cards.assigned_car_id 추가
  // ─────────────────────────────────────────────
  banner('STEP 1. corporate_cards.assigned_car_id 컬럼 추가')
  const cols = await q(`SHOW COLUMNS FROM corporate_cards LIKE 'assigned_car_id'`)
  if (cols.length > 0) {
    console.log('이미 존재 — skip')
  } else {
    const sql = `ALTER TABLE corporate_cards ADD COLUMN assigned_car_id CHAR(36) NULL AFTER assigned_employee_id, ADD INDEX idx_corp_cards_car (assigned_car_id)`
    const res = await exec(sql)
    console.log(`ALTER TABLE 완료: ${JSON.stringify(res)}`)
  }

  // ─────────────────────────────────────────────
  // STEP 2. 카테고리 일괄 rename
  // ─────────────────────────────────────────────
  banner('STEP 2. transactions.category rename')
  for (const [oldCat, newCat] of Object.entries(RENAME)) {
    const before = await q(`SELECT COUNT(*) AS cnt FROM transactions WHERE category = ? AND deleted_at IS NULL`, [oldCat])
    const cnt = before[0].cnt
    if (cnt === 0) { console.log(`  skip: '${oldCat}' (0건)`); continue }
    const res = await exec(`UPDATE transactions SET category = ? WHERE category = ? AND deleted_at IS NULL`, [newCat, oldCat])
    console.log(`  '${oldCat}' → '${newCat}': ${cnt}건 대상 / affected ${res.affectedRows}`)
  }

  // ─────────────────────────────────────────────
  // STEP 3. 원금상환 → 투자자 이름 있으면 투자원금 환급 (사전 rename 완료 → 이제 '대출원금상환' 인 상태)
  //         투자자 이름은 general_investments.investor_name 과 일치 확인
  // ─────────────────────────────────────────────
  banner('STEP 3. 대출원금상환 중 투자자 매칭 → 투자원금 환급으로 재분류')
  // 투자자 이름 목록 (deleted_at 유무 자동 감지)
  let investorNames = []
  try {
    const cols = await q(`SHOW COLUMNS FROM general_investments LIKE 'deleted_at'`)
    const hasDeleted = cols.length > 0
    const sql = hasDeleted
      ? `SELECT DISTINCT investor_name FROM general_investments WHERE deleted_at IS NULL AND investor_name IS NOT NULL`
      : `SELECT DISTINCT investor_name FROM general_investments WHERE investor_name IS NOT NULL`
    investorNames = await q(sql)
  } catch (e) {
    console.log(`  general_investments 조회 실패: ${e.message}`)
  }
  const nameSet = new Set(investorNames.map(r => (r.investor_name || '').trim()).filter(Boolean))
  console.log(`  투자자 이름 ${nameSet.size}명 로드`)

  // 대출원금상환 대상
  const targetRows = await q(`
    SELECT id, client_name, description, amount
    FROM transactions
    WHERE category = '대출원금상환' AND deleted_at IS NULL
  `)
  let refundedCount = 0
  for (const r of targetRows) {
    const cn = (r.client_name || '').trim()
    // 투자자 이름이 client_name 에 포함되는지 (부분 일치)
    let matched = false
    for (const inv of nameSet) {
      if (!inv) continue
      if (cn.includes(inv) || inv.includes(cn)) { matched = true; break }
    }
    if (matched) {
      await exec(`UPDATE transactions SET category = '투자원금 환급', related_type = 'invest' WHERE id = ? AND deleted_at IS NULL`, [r.id])
      refundedCount++
    }
  }
  console.log(`  재분류 ${refundedCount}건 / 전체 대출원금상환 ${targetRows.length}건`)

  // ─────────────────────────────────────────────
  // STEP 4. 통행료 분리 (주차비 중 description 에 '통행' 포함)
  // ─────────────────────────────────────────────
  banner('STEP 4. 주차비 중 통행료 분리')
  const toll = await exec(`
    UPDATE transactions SET category = '통행료'
    WHERE category = '주차비' AND deleted_at IS NULL
      AND (description LIKE '%통행%' OR description LIKE '%고속%' OR description LIKE '%하이패스%' OR client_name LIKE '%도로공사%')
  `)
  console.log(`  주차비 → 통행료 재분류: ${toll.affectedRows || 0}건`)

  // ─────────────────────────────────────────────
  // STEP 5. 전기차충전비 분리 (유류비 중 description 이 전기차충전)
  // ─────────────────────────────────────────────
  banner('STEP 5. 유류비 중 전기차충전비 분리')
  const ev = await exec(`
    UPDATE transactions SET category = '전기차충전비'
    WHERE category IN ('유류비', '카드결제') AND deleted_at IS NULL
      AND (client_name LIKE '%차지비%' OR client_name LIKE '%플러그링크%' OR client_name LIKE '%전기차충전%' OR description LIKE '%전기차충전%')
  `)
  console.log(`  → 전기차충전비 재분류: ${ev.affectedRows || 0}건`)

  // ─────────────────────────────────────────────
  // STEP 6. SaaS 분리 (카드결제 중 client_name 이 구글클라우드 등)
  // ─────────────────────────────────────────────
  banner('STEP 6. SaaS/시스템이용료 분리')
  const saas = await exec(`
    UPDATE transactions SET category = 'SaaS/시스템이용료'
    WHERE category IN ('카드대금상환', '카드결제', '기타') AND deleted_at IS NULL
      AND (client_name LIKE '%구글클라우드%' OR client_name LIKE '%Google Cloud%' OR client_name LIKE '%AWS%' OR client_name LIKE '%네이버클라우드%')
  `)
  console.log(`  → SaaS 재분류: ${saas.affectedRows || 0}건`)

  // ─────────────────────────────────────────────
  // STEP 7. 최종 검증
  // ─────────────────────────────────────────────
  banner('STEP 7. 최종 카테고리 분포')
  const final = await q(`
    SELECT COALESCE(category, '(NULL)') AS category, COUNT(*) AS cnt
    FROM transactions
    WHERE deleted_at IS NULL
    GROUP BY category
    ORDER BY cnt DESC
  `)
  for (const r of final) console.log(`  ${r.category.padEnd(25)} | ${String(r.cnt).padStart(4)}건`)

  banner(DRY ? '✅ DRY-RUN 완료 (변경 없음)' : '✅ 마이그레이션 적용 완료')

} catch (e) {
  console.error('ERROR:', e.message, e.stack)
  process.exit(1)
} finally {
  await conn.end()
}
