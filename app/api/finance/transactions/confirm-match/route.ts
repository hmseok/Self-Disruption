import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * POST /api/finance/transactions/confirm-match
 * 매칭 확인 (단건 또는 일괄)
 * Body: { matches: Array<{ transactionId, matchType, matchId, contractType? }> }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json()
    const { matches } = body

    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return NextResponse.json({ error: '매칭 항목이 없습니다' }, { status: 400 })
    }
    if (matches.length > 500) {
      return NextResponse.json({ error: '한 번에 최대 500건까지 매칭 가능합니다' }, { status: 400 })
    }

    let confirmed = 0
    const errors: string[] = []

    for (const m of matches) {
      try {
        const { transactionId, matchType, matchId, contractType } = m

        // 거래에 related_type/related_id 설정
        const relType = contractType || matchType || 'settlement'
        await prisma.$executeRawUnsafe(
          `UPDATE transactions SET related_type = ?, related_id = ?, updated_at = NOW() WHERE id = ?`,
          relType, matchId, transactionId
        )

        // settlement 매칭이면 settlement_ledger도 업데이트
        if (matchType === 'settlement') {
          // 기존 matched_tx_ids에 추가
          const ledger = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, matched_tx_ids FROM settlement_ledger WHERE id = ?`, matchId
          )
          if (ledger.length > 0) {
            let existingIds: string[] = []
            try {
              existingIds = JSON.parse(ledger[0].matched_tx_ids || '[]')
            } catch { existingIds = [] }

            if (!existingIds.includes(transactionId)) {
              existingIds.push(transactionId)
            }

            await prisma.$executeRawUnsafe(
              `UPDATE settlement_ledger
               SET status = 'matched', matched_at = NOW(),
                   matched_tx_ids = ?, updated_at = NOW()
               WHERE id = ?`,
              JSON.stringify(existingIds), matchId
            )
          }
        }

        confirmed++
      } catch (err: any) {
        errors.push(`${m.transactionId}: ${err.message}`)
      }
    }

    return NextResponse.json({
      data: serialize({ confirmed, errors: errors.slice(0, 5) }),
      error: errors.length > 0 ? `${errors.length}건 오류` : null,
    })
  } catch (e: any) {
    console.error('[POST /api/finance/transactions/confirm-match]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
