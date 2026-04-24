import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * POST /api/finance/sms/link-cards
 * card_sms_transactions → corporate_cards 일괄 자동 연결
 * 카드사 + 끝4자리로 매칭
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // 미연결 SMS 거래 로드
    const unlinked = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, card_company, card_last4, merchant, amount, transaction_date, raw_message
      FROM card_sms_transactions
      WHERE card_id IS NULL
    `)

    // 모든 법인카드 로드
    const cards = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, card_number, card_company, card_name, holder_name
      FROM corporate_cards
    `)

    let linked = 0
    let created = 0
    const errors: string[] = []

    for (const sms of unlinked) {
      try {
        const last4 = sms.card_last4 || ''
        const company = normalize(sms.card_company || '')

        if (!last4) continue

        // 카드 매칭: 카드번호 끝4자리 + 카드사
        const matched = cards.find((c: any) => {
          const cardLast4 = (c.card_number || '').slice(-4)
          const cardCompany = normalize(c.card_company || c.card_name || '')
          return cardLast4 === last4 && (
            cardCompany.includes(company) || company.includes(cardCompany) || !company
          )
        })

        if (matched) {
          // card_sms_transactions.card_id 업데이트
          await prisma.$executeRawUnsafe(
            `UPDATE card_sms_transactions SET card_id = ?, updated_at = NOW() WHERE id = ?`,
            matched.id, sms.id
          )

          // transactions 테이블에 거래 생성 (중복 방지)
          const existCheck = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM transactions
             WHERE imported_from = 'sms'
               AND transaction_date = ?
               AND amount = ?
               AND description = ?
             LIMIT 1`,
            sms.transaction_date, Number(sms.amount), sms.merchant || ''
          )

          if (existCheck.length === 0) {
            const txId = crypto.randomUUID()
            await prisma.$executeRawUnsafe(
              `INSERT INTO transactions (id, transaction_date, type, amount, description, client_name,
               card_company, imported_from, created_at, updated_at)
               VALUES (?, ?, 'expense', ?, ?, ?, ?, 'sms', NOW(), NOW())`,
              txId,
              sms.transaction_date,
              Number(sms.amount),
              sms.merchant || '',
              matched.holder_name || '',
              sms.card_company || '',
            )
            created++
          }

          linked++
        }
      } catch (err: any) {
        errors.push(`SMS ${sms.id}: ${err.message}`)
      }
    }

    return NextResponse.json({
      data: serialize({ total: unlinked.length, linked, transactionsCreated: created, errors: errors.slice(0, 5) }),
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/finance/sms/link-cards]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').replace(/카드$/,'').toLowerCase()
}
