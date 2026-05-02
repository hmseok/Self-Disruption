import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/admin/cleanup-test-data
 *
 * 테스트/mock 데이터 정리.
 * 키워드로 매칭되는 SMS + 연결된 transactions 일괄 삭제.
 *
 * 매칭 영역 (keyword 가 있으면 OR 조건):
 *   - card_sms_transactions.holder_name LIKE %keyword%
 *   - card_sms_transactions.raw_text   LIKE %keyword%
 *   - card_sms_transactions.merchant   LIKE %keyword%
 *
 * 동작:
 *   1. 매칭 SMS 의 transaction_id 들 모음
 *   2. transactions soft-delete (deleted_at = NOW)
 *   3. card_sms_transactions hard-delete
 *
 * body:
 *   { keyword: string, dryRun?: boolean = true }
 *
 * 응답:
 *   dryRun: { keyword, sms_count, tx_count, samples }
 *   apply:  { keyword, sms_deleted, tx_deleted }
 */

interface SmsMatch {
  id: string
  transaction_id: string | null
  holder_name: string | null
  raw_text: string
  merchant: string | null
  amount: string | null
}

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const keyword = String(body.keyword || '').trim()
    const dryRun = body.dryRun !== false

    if (!keyword) {
      return NextResponse.json({ error: 'keyword 필수' }, { status: 400 })
    }
    if (keyword.length < 2) {
      return NextResponse.json({ error: 'keyword 는 최소 2글자 이상' }, { status: 400 })
    }

    // 1) 매칭 SMS 조회
    const pattern = `%${keyword}%`
    const matches = await prisma.$queryRaw<SmsMatch[]>`
      SELECT id, transaction_id, holder_name, raw_text, merchant, amount
      FROM card_sms_transactions
      WHERE holder_name LIKE ${pattern}
         OR raw_text LIKE ${pattern}
         OR merchant LIKE ${pattern}
      LIMIT 1000
    `

    const smsCount = matches.length
    const txIds = matches.map(m => m.transaction_id).filter((x): x is string => !!x)

    if (dryRun) {
      return NextResponse.json(serialize({
        dryRun: true,
        keyword,
        sms_count: smsCount,
        tx_count: txIds.length,
        samples: matches.slice(0, 10).map(m => ({
          holder_name: m.holder_name,
          merchant: m.merchant,
          amount: m.amount,
          raw_preview: m.raw_text.slice(0, 80),
        })),
      }))
    }

    // 2) APPLY
    let txDeleted = 0
    if (txIds.length > 0) {
      const placeholders = txIds.map(() => '?').join(',')
      const r = await prisma.$executeRawUnsafe(
        `UPDATE transactions SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        ...txIds
      )
      txDeleted = Number(r)
    }
    let smsDeleted = 0
    if (matches.length > 0) {
      const smsIds = matches.map(m => m.id)
      const placeholders = smsIds.map(() => '?').join(',')
      const r = await prisma.$executeRawUnsafe(
        `DELETE FROM card_sms_transactions WHERE id IN (${placeholders})`,
        ...smsIds
      )
      smsDeleted = Number(r)
    }

    return NextResponse.json(serialize({
      dryRun: false,
      keyword,
      sms_deleted: smsDeleted,
      tx_deleted: txDeleted,
    }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 })
  }
}
