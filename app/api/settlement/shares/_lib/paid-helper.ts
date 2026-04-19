import { prisma } from '@/lib/prisma'

/**
 * settlement_shares의 paid 상태를 토글하고, transactions 원장을 동기화한다.
 *
 * - mark paid  → paid_at = NOW(), items를 파싱하여 transactions INSERT
 * - unmark paid → paid_at = NULL, memo LIKE 'settlement_share:<id>' transactions DELETE
 *
 * @param shareIds 대상 settlement_shares.id 배열
 * @param forceAction 'mark' | 'unmark' | undefined(토글)
 * @returns { shares, transactions_created, transactions_deleted }
 */
export async function syncSharesPaid(
  shareIds: string[],
  forceAction?: 'mark' | 'unmark'
): Promise<{
  shares: any[]
  transactions_created: number
  transactions_deleted: number
}> {
  if (!Array.isArray(shareIds) || shareIds.length === 0) {
    return { shares: [], transactions_created: 0, transactions_deleted: 0 }
  }

  // 현재 paid 상태 읽기 — 토글/반복 안전성 확보
  const placeholders = shareIds.map(() => '?').join(',')
  const currentShares = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, paid_at, items, total_amount, recipient_name, settlement_month, company_id FROM settlement_shares WHERE id IN (${placeholders})`,
    ...shareIds
  )

  let txCreated = 0
  let txDeleted = 0
  const now = new Date()
  const nowMySQL = now.toISOString().slice(0, 19).replace('T', ' ')
  const todayStr = nowMySQL.slice(0, 10)

  for (const share of currentShares) {
    const isPaid = !!share.paid_at
    let action: 'mark' | 'unmark'
    if (forceAction) action = forceAction
    else action = isPaid ? 'unmark' : 'mark'

    if (action === 'mark') {
      if (isPaid) continue // 이미 지급완료 — skip
      await prisma.$executeRaw`
        UPDATE settlement_shares SET paid_at = ${nowMySQL} WHERE id = ${share.id}
      `

      // items 파싱
      let items: any[] = []
      try {
        items = typeof share.items === 'string'
          ? JSON.parse(share.items)
          : Array.isArray(share.items) ? share.items : []
      } catch {}

      const txInserts: any[] = []
      for (const item of items || []) {
        const amount = Number(item.amount || item.breakdown?.netPayout || 0)
        if (!amount || amount <= 0) continue
        const relatedType = item.type === 'jiip' ? 'jiip_share' : item.type === 'invest' ? 'invest' : null
        if (!relatedType) continue
        const relatedId = item.relatedId || item.related_id || null
        const desc = item.type === 'jiip'
          ? `지입정산 ${share.recipient_name} ${item.monthLabel || share.settlement_month}월분`
          : `투자이자 ${share.recipient_name} ${item.monthLabel || share.settlement_month}월분`
        txInserts.push({
          transaction_date: todayStr,
          type: 'expense',
          status: 'completed',
          category: item.type === 'jiip' ? '지입 수익배분금(출금)' : '이자비용(대출/투자)',
          client_name: share.recipient_name,
          description: desc,
          amount,
          payment_method: '이체',
          related_type: relatedType,
          related_id: relatedId,
          memo: `settlement_share:${share.id}`,
        })
      }

      // items가 비어있거나 매칭 불가한 경우 — 총액 1건 생성
      if (txInserts.length === 0 && Number(share.total_amount) > 0) {
        txInserts.push({
          transaction_date: todayStr,
          type: 'expense',
          status: 'completed',
          category: '정산지급',
          client_name: share.recipient_name,
          description: `정산 지급 ${share.recipient_name} ${share.settlement_month}월분`,
          amount: Number(share.total_amount),
          payment_method: '이체',
          related_type: null,
          related_id: null,
          memo: `settlement_share:${share.id}`,
        })
      }

      for (const tx of txInserts) {
        try {
          await prisma.$executeRaw`
            INSERT INTO transactions
            (transaction_date, type, status, category, client_name, description, amount, payment_method, related_type, related_id, memo, created_at)
            VALUES (
              ${tx.transaction_date}, ${tx.type}, ${tx.status}, ${tx.category},
              ${tx.client_name}, ${tx.description}, ${tx.amount}, ${tx.payment_method},
              ${tx.related_type}, ${tx.related_id}, ${tx.memo}, NOW()
            )
          `
          txCreated++
        } catch (e) {
          console.error('[syncSharesPaid] tx insert error:', e)
        }
      }
    } else {
      // unmark
      if (!isPaid) continue
      await prisma.$executeRaw`
        UPDATE settlement_shares SET paid_at = NULL WHERE id = ${share.id}
      `
      const memoPattern = `settlement_share:${share.id}`
      const deleted = await prisma.$executeRaw`
        DELETE FROM transactions WHERE memo = ${memoPattern}
      `
      txDeleted += Number(deleted) || 0
    }
  }

  // 최신 상태 재조회
  const updatedShares = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, paid_at FROM settlement_shares WHERE id IN (${placeholders})`,
    ...shareIds
  )

  return {
    shares: updatedShares,
    transactions_created: txCreated,
    transactions_deleted: txDeleted,
  }
}
