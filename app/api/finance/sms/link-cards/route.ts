import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

// ═══════════════════════════════════════════════════════════
// SMS → 법인카드/은행 자동 연결 + 거래 생성 (PHASE 2)
//
// POST /api/finance/sms/link-cards
// 1) 미연결 SMS 조회 (card_id IS NULL, parse_status='parsed')
// 2) corporate_cards.card_alias 매칭 → card_id 연결
// 3) bank_account_mappings.account_alias 매칭 (은행 SMS)
// 4) transactions 테이블에 자동 적재 (transaction_id IS NULL)
// ═══════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // ── 1. 미연결 SMS + 미생성 거래 조회 ──────────────────
  const unlinked = await prisma.$queryRaw<any[]>`
    SELECT id, card_issuer, card_alias, holder_name, transaction_type,
           transaction_at, amount, merchant, installment
    FROM card_sms_transactions
    WHERE parse_status = 'parsed'
      AND (card_id IS NULL OR transaction_id IS NULL)
  `

  // ── 2. 법인카드 + 은행계좌 매핑 로드 ──────────────────
  const cards = await prisma.$queryRaw<Array<{ id: string; card_alias: string; assigned_car_id: string | null }>>`
    SELECT id, card_alias, assigned_car_id FROM corporate_cards WHERE card_alias IS NOT NULL
  `

  let bankAccounts: Array<{ id: string; account_alias: string; assigned_car_id: string | null; purpose: string | null }> = []
  try {
    bankAccounts = await prisma.$queryRaw`
      SELECT id, account_alias, assigned_car_id, purpose FROM bank_account_mappings WHERE account_alias IS NOT NULL
    `
  } catch { /* 테이블 미존재 시 무시 */ }

  let cardLinked = 0
  let bankLinked = 0
  let txCreated = 0

  for (const sms of unlinked) {
    const alias = sms.card_alias || ''
    if (!alias) continue

    let cardId: string | null = null
    let carId: string | null = null

    // ── 카드 매칭 ──
    if (!sms.card_id) {
      const matched = cards.find(c => c.card_alias === alias)
      if (matched) {
        cardId = matched.id
        carId = matched.assigned_car_id
        await prisma.$executeRaw`
          UPDATE card_sms_transactions SET card_id = ${cardId} WHERE id = ${sms.id}
        `
        cardLinked++
      }
    }

    // ── 은행 매칭 (카드 미매칭 + 은행 issuer) ──
    if (!cardId && (sms.card_issuer || '').includes('BANK')) {
      const matched = bankAccounts.find(b => b.account_alias === alias)
      if (matched) {
        carId = matched.assigned_car_id
        bankLinked++
      }
    }

    // ── 거래 자동 생성 (미생성 건만) ──
    if (!sms.transaction_id && sms.amount) {
      try {
        const txType = (sms.transaction_type === 'deposit') ? 'income' : 'expense'
        const txId = randomUUID()
        const txDate = sms.transaction_at || new Date()

        await prisma.$executeRaw`
          INSERT INTO transactions (
            id, transaction_date, type, amount, description, client_name,
            card_company, imported_from, related_type, related_id,
            status, created_at, updated_at
          ) VALUES (
            ${txId}, ${txDate}, ${txType}, ${Number(sms.amount)},
            ${sms.merchant || sms.card_issuer || ''}, ${sms.holder_name || ''},
            ${sms.card_issuer || ''}, 'sms',
            ${carId ? 'car' : null}, ${carId},
            'completed', NOW(), NOW()
          )
        `
        await prisma.$executeRaw`
          UPDATE card_sms_transactions SET transaction_id = ${txId} WHERE id = ${sms.id}
        `
        txCreated++
      } catch { /* 중복 등 무시 */ }
    }
  }

  return NextResponse.json({
    ok: true,
    total: unlinked.length,
    cardLinked,
    bankLinked,
    transactionsCreated: txCreated,
  })
}
