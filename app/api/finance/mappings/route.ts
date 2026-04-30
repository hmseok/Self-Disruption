import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// BigInt / Decimal 객체 → 문자열로 정규화 (NextResponse.json 직렬화 실패 방지)
function serialize<T>(d: T): T {
  return JSON.parse(JSON.stringify(d, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// ═══════════════════════════════════════════════════════════
// 카드/통장 → 차량 매핑 관리 API (PHASE 2)
//
// GET  /api/finance/mappings          전체 매핑 목록 (카드+은행)
// POST /api/finance/mappings          매핑 추가/수정
// DELETE /api/finance/mappings?id=... 매핑 삭제
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
  // 법인카드 목록 (차량 정보 JOIN) — 확장 메타 포함, COLLATE 강제
  let cards: any[] = []
  try {
    cards = await prisma.$queryRaw<any[]>`
      SELECT c.id, c.card_number, c.card_alias, c.card_issuer, c.holder_name,
             c.assigned_car_id, c.assigned_employee_id, c.status,
             c.card_type, c.card_holder_type, c.valid_thru, c.issued_at, c.expires_at,
             c.payment_bank, c.payment_account, c.payment_day, c.monthly_limit,
             c.previous_card_number, c.department, c.memo,
             car.number AS car_number, CONCAT_WS(' ', car.brand, car.model) AS car_model
      FROM corporate_cards c
      LEFT JOIN cars car ON c.assigned_car_id COLLATE utf8mb4_unicode_ci = car.id COLLATE utf8mb4_unicode_ci
      ORDER BY c.created_at DESC
    `
  } catch (e: any) {
    console.error('[mappings GET] cards JOIN 실패, fallback:', e.message)
    cards = await prisma.$queryRaw<any[]>`
      SELECT id, card_number, card_alias, card_issuer, holder_name,
             assigned_car_id, assigned_employee_id, status,
             card_type, card_holder_type, valid_thru, issued_at, expires_at,
             payment_bank, payment_account, payment_day, monthly_limit,
             previous_card_number, department, memo,
             NULL AS car_number, NULL AS car_model
      FROM corporate_cards
      ORDER BY created_at DESC
    `
  }

  // 은행계좌 매핑 (차량 정보 JOIN)
  // ※ bank_account_mappings.assigned_car_id 와 cars.id 의 collation 이 다를 수 있어
  //    JOIN 비교에 COLLATE 강제 (utf8mb4_unicode_ci 통일)
  let bankAccounts: any[] = []
  try {
    bankAccounts = await prisma.$queryRaw<any[]>`
      SELECT b.id, b.account_alias, b.bank_issuer, b.bank_name, b.account_holder,
             b.assigned_car_id, b.purpose, b.memo, b.status,
             car.number AS car_number, CONCAT_WS(' ', car.brand, car.model) AS car_model
      FROM bank_account_mappings b
      LEFT JOIN cars car ON b.assigned_car_id COLLATE utf8mb4_unicode_ci = car.id COLLATE utf8mb4_unicode_ci
      ORDER BY b.created_at DESC
    `
  } catch (e: any) {
    console.error('[mappings GET] bankAccounts 쿼리 실패:', e.message)
    // 폴백: JOIN 없이 단순 SELECT
    try {
      bankAccounts = await prisma.$queryRaw<any[]>`
        SELECT id, account_alias, bank_issuer, bank_name, account_holder,
               assigned_car_id, purpose, memo, status,
               NULL AS car_number, NULL AS car_model
        FROM bank_account_mappings
        ORDER BY created_at DESC
      `
    } catch (e2) { /* 테이블 미존재 */ }
  }

  // 차량 목록 (드롭다운용)
  const cars = await prisma.$queryRaw<any[]>`
    SELECT id, number, brand, model FROM cars WHERE status != 'deleted' ORDER BY number
  `

  // SMS에서 감지된 카드/은행 목록 (미등록 카드 찾기용)
  const smsAliases = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT card_alias, card_issuer
    FROM card_sms_transactions
    WHERE parse_status = 'parsed' AND card_alias IS NOT NULL
    ORDER BY card_issuer, card_alias
  `

  return NextResponse.json(serialize({
    cards,
    bankAccounts,
    cars,
    smsAliases,
  }))
  } catch (e: any) {
    console.error('[mappings GET] 실패:', e)
    return NextResponse.json({ error: e.message || '조회 실패', cards: [], bankAccounts: [], cars: [], smsAliases: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
  const body = await req.json()
  const { type, id, card_alias, card_issuer, holder_name, assigned_car_id,
          assigned_employee_id, status, card_type, card_holder_type,
          card_number, valid_thru, issued_at, expires_at,
          payment_bank, payment_account, payment_day, monthly_limit,
          previous_card_number, department, memo: cardMemo,
          account_alias, bank_issuer, bank_name, account_holder, purpose, memo } = body

  if (type === 'card') {
    if (id) {
      // 수정 — 전체 메타필드
      await prisma.$executeRaw`
        UPDATE corporate_cards SET
          card_number = ${card_number || null},
          card_alias = ${card_alias || null},
          card_issuer = ${card_issuer || null},
          holder_name = ${holder_name || null},
          assigned_car_id = ${assigned_car_id || null},
          assigned_employee_id = ${assigned_employee_id || null},
          status = ${status || 'active'},
          card_type = ${card_type || null},
          card_holder_type = ${card_holder_type || null},
          valid_thru = ${valid_thru || null},
          issued_at = ${issued_at || null},
          expires_at = ${expires_at || null},
          payment_bank = ${payment_bank || null},
          payment_account = ${payment_account || null},
          payment_day = ${payment_day || null},
          monthly_limit = ${monthly_limit || null},
          previous_card_number = ${previous_card_number || null},
          department = ${department || null},
          memo = ${cardMemo || null},
          updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      // 새 카드 등록 — 전체 필드
      await prisma.$executeRaw`
        INSERT INTO corporate_cards (
          id, card_number, card_alias, card_issuer, holder_name,
          assigned_car_id, assigned_employee_id, status, card_type, card_holder_type,
          valid_thru, issued_at, expires_at,
          payment_bank, payment_account, payment_day, monthly_limit,
          previous_card_number, department, memo,
          created_at, updated_at
        ) VALUES (
          ${randomUUID()}, ${card_number || null}, ${card_alias}, ${card_issuer || null}, ${holder_name || null},
          ${assigned_car_id || null}, ${assigned_employee_id || null}, ${status || 'active'},
          ${card_type || '법인신용'}, ${card_holder_type || '무기명'},
          ${valid_thru || null}, ${issued_at || null}, ${expires_at || null},
          ${payment_bank || null}, ${payment_account || null}, ${payment_day || null}, ${monthly_limit || null},
          ${previous_card_number || null}, ${department || null}, ${cardMemo || null},
          NOW(), NOW()
        )
      `
    }
    // ── 자동 backfill: 같은 alias 의 기존 SMS + transactions 일괄 갱신 ──
    //   매핑이 SMS 들어온 후 등록되어도 자동 연결되도록 (사용자 부담 X)
    let backfilledSms = 0
    let backfilledTx = 0
    if (card_alias) {
      // 1) 현재 카드의 id 조회 (UPSERT 후)
      let cardId: string = id || ''
      if (!cardId) {
        const found = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM corporate_cards WHERE card_alias = ${card_alias} LIMIT 1
        `
        if (found.length > 0) cardId = found[0].id
      }

      if (cardId) {
        // 2) SMS row 의 card_id 갱신 (NULL 인 것만)
        const smsRes = await prisma.$executeRaw`
          UPDATE card_sms_transactions
          SET card_id = ${cardId}, updated_at = NOW()
          WHERE card_alias = ${card_alias} AND card_id IS NULL
        `
        backfilledSms = Number(smsRes)

        // 3) 차량 매핑된 카드면 transactions.related_id 갱신 (현재 매칭 없는 것만)
        if (assigned_car_id) {
          try {
            const txRes = await prisma.$executeRawUnsafe(`
              UPDATE transactions t
              INNER JOIN card_sms_transactions s ON s.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
              SET t.related_type = 'car', t.related_id = ?, t.updated_at = NOW()
              WHERE s.card_alias = ?
                AND (t.related_type IS NULL OR t.related_id IS NULL)
                AND t.deleted_at IS NULL
            `, assigned_car_id, card_alias)
            backfilledTx = Number(txRes)
          } catch (e: any) {
            console.warn('[mappings backfill tx]', e.message)
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      backfill: { sms: backfilledSms, tx: backfilledTx },
    })
  } else if (type === 'bank') {
    if (id) {
      await prisma.$executeRaw`
        UPDATE bank_account_mappings SET
          account_alias = ${account_alias || null},
          bank_issuer = ${bank_issuer || null},
          bank_name = ${bank_name || null},
          account_holder = ${account_holder || null},
          assigned_car_id = ${assigned_car_id || null},
          purpose = ${purpose || null},
          memo = ${memo || null},
          updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      // UPSERT: 같은 별칭이 있으면 자동 업데이트 (중복 에러 방지)
      await prisma.$executeRaw`
        INSERT INTO bank_account_mappings (id, account_alias, bank_issuer, bank_name, account_holder, assigned_car_id, purpose, memo, status, created_at, updated_at)
        VALUES (${randomUUID()}, ${account_alias}, ${bank_issuer || ''}, ${bank_name || null}, ${account_holder || null}, ${assigned_car_id || null}, ${purpose || null}, ${memo || null}, 'active', NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          bank_issuer = VALUES(bank_issuer),
          bank_name = VALUES(bank_name),
          account_holder = VALUES(account_holder),
          assigned_car_id = VALUES(assigned_car_id),
          purpose = VALUES(purpose),
          memo = VALUES(memo),
          updated_at = NOW()
      `
    }

    // ── 은행 자동 backfill: 같은 account_alias 의 기존 SMS transactions 갱신 ──
    let bankBackfilledTx = 0
    if (account_alias && assigned_car_id) {
      try {
        const txRes = await prisma.$executeRawUnsafe(`
          UPDATE transactions t
          INNER JOIN card_sms_transactions s ON s.transaction_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci
          SET t.related_type = 'car', t.related_id = ?, t.updated_at = NOW()
          WHERE s.card_alias = ?
            AND (t.related_type IS NULL OR t.related_id IS NULL)
            AND t.deleted_at IS NULL
        `, assigned_car_id, account_alias)
        bankBackfilledTx = Number(txRes)
      } catch (e: any) {
        console.warn('[mappings bank backfill]', e.message)
      }
    }

    return NextResponse.json({
      ok: true,
      backfill: { sms: 0, tx: bankBackfilledTx },
    })
  }

  return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[mappings POST] 실패:', e)
    return NextResponse.json({ error: e.message || '저장 실패' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  const type = req.nextUrl.searchParams.get('type')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (type === 'bank') {
    await prisma.$executeRaw`DELETE FROM bank_account_mappings WHERE id = ${id}`
  } else {
    await prisma.$executeRaw`DELETE FROM corporate_cards WHERE id = ${id}`
  }

  return NextResponse.json({ ok: true })
}
