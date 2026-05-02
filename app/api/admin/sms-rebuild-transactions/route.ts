import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * POST /api/admin/sms-rebuild-transactions
 *
 * 모든 SMS 기반 transactions 를 삭제하고 card_sms_transactions 기준으로 재생성.
 * → card_sms_transactions 1건 = transactions 1건 보장 (중복 제거).
 *
 * 동작:
 *   1. transactions 중 imported_from IN ('sms', 'sms_bank') AND deleted_at IS NULL → soft-delete
 *   2. card_sms_transactions.transaction_id 모두 NULL 로 reset
 *   3. card_sms_transactions parse_status='parsed' AND amount IS NOT NULL 인 row 마다:
 *      - 새 transactions row INSERT
 *      - card_sms_transactions.transaction_id 갱신
 *
 * 차량 매칭 / 룰 분류는 SKIP — 재생성 후 「🤖 룰 자동 분류」 버튼으로 별도 처리.
 *
 * body:
 *   { dryRun?: boolean = true }
 *
 * 응답:
 *   dryRun: { sms_count, current_tx_count, will_delete, will_create }
 *   apply:  { deleted, created, sms_unchanged }
 */

interface SmsRow {
  id: string
  card_issuer: string | null
  card_alias: string | null
  holder_name: string | null
  transaction_type: string
  transaction_at: Date | null
  received_at: Date
  amount: string | null
  merchant: string | null
}

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun !== false

    // 1) 현황 파악
    const smsCountRes = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM card_sms_transactions
      WHERE parse_status = 'parsed' AND amount IS NOT NULL
    `
    const smsCount = Number(smsCountRes[0]?.c || 0)

    const txCountRes = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM transactions
      WHERE deleted_at IS NULL AND imported_from IN ('sms', 'sms_bank')
    `
    const currentTxCount = Number(txCountRes[0]?.c || 0)

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        sms_count: smsCount,
        current_tx_count: currentTxCount,
        will_delete: currentTxCount,
        will_create: smsCount,
        delta: smsCount - currentTxCount,
        message: `SMS ${smsCount}건 기준으로 재생성 — 현재 ${currentTxCount}건 → ${smsCount}건 (1:1)`,
      })
    }

    // 2) APPLY
    // (a) 기존 SMS 기반 transactions soft-delete
    const deletedRes = await prisma.$executeRaw`
      UPDATE transactions
      SET deleted_at = NOW()
      WHERE deleted_at IS NULL AND imported_from IN ('sms', 'sms_bank')
    `
    const deleted = Number(deletedRes)

    // (b) card_sms_transactions.transaction_id 리셋
    await prisma.$executeRaw`
      UPDATE card_sms_transactions
      SET transaction_id = NULL
      WHERE parse_status = 'parsed'
    `

    // (c) SMS 한 건씩 transactions 재생성
    const smsRows = await prisma.$queryRaw<SmsRow[]>`
      SELECT id, card_issuer, card_alias, holder_name, transaction_type,
             transaction_at, received_at, amount, merchant
      FROM card_sms_transactions
      WHERE parse_status = 'parsed' AND amount IS NOT NULL
      ORDER BY received_at ASC
    `

    let created = 0
    for (const s of smsRows) {
      try {
        const txId = randomUUID()
        const txDate = s.transaction_at || s.received_at
        const txType = (s.transaction_type === 'deposit' || s.transaction_type === 'canceled')
          ? 'income' : 'expense'
        const description = s.merchant || s.card_issuer || ''
        // imported_from: card_issuer 가 _BANK 끝나면 sms_bank, 아니면 sms
        const issuer = s.card_issuer || ''
        const importedFrom = /BANK$/i.test(issuer) ? 'sms_bank' : 'sms'

        await prisma.$executeRaw`
          INSERT INTO transactions (
            id, transaction_date, type, amount, description, client_name,
            card_company, imported_from, status, created_at, updated_at
          ) VALUES (
            ${txId}, ${txDate}, ${txType}, ${s.amount},
            ${description}, ${s.holder_name},
            ${issuer}, ${importedFrom}, 'completed', NOW(), NOW()
          )
        `
        await prisma.$executeRaw`
          UPDATE card_sms_transactions SET transaction_id = ${txId} WHERE id = ${s.id}
        `
        created++
      } catch (e: any) {
        console.warn('[sms-rebuild] 단건 실패:', s.id, e?.message?.slice(0, 200))
      }
    }

    return NextResponse.json(serialize({
      dryRun: false,
      deleted,
      created,
      sms_count: smsCount,
      message: `완료: ${deleted}건 삭제 → ${created}건 재생성 (SMS 1:1 매칭). 차량/카테고리 분류는 「🤖 룰 자동 분류」 클릭.`,
    }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 })
  }
}
