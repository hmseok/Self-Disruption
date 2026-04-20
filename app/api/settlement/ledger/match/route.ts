import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/settlement/ledger/match
 * Body: { month?: 'YYYY-MM' }
 *
 * pending 상태의 ledger에 대해 transactions를 스캔하여 자동 매칭.
 * 매칭 기준:
 *   - transaction.type='expense' AND transaction.related_type IN ('jiip','invest') AND related_id=contract_id
 *   - 또는 recipient_name이 client_name/description에 포함 (폴백)
 *   - transaction_date이 settlement_month 다음 달 이내
 *   - amount가 due_amount의 ±5% 이내
 *
 * 매칭 성공 시 status='matched', matched_at, matched_tx_ids 설정.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const month: string | undefined = body.month

    const pendingSql = month
      ? `SELECT * FROM settlement_ledger WHERE status='pending' AND settlement_month=? ORDER BY settlement_month`
      : `SELECT * FROM settlement_ledger WHERE status='pending' ORDER BY settlement_month`
    const pendingArgs = month ? [month] : []
    const pending = await prisma.$queryRawUnsafe<any[]>(pendingSql, ...pendingArgs)

    const matched: any[] = []
    const now = new Date()

    for (const row of pending) {
      const due = Number(row.due_amount || 0)
      if (due <= 0) continue

      // settlement_month의 다음 달부터 그 다음 달까지 (ex. 2026-03 → 2026-04 ~ 2026-05)
      const [sy, sm] = row.settlement_month.split('-').map(Number)
      const searchStart = new Date(sy, sm, 1) // 다음 달 1일
      const searchEnd = new Date(sy, sm + 2, 0) // 다음다음달 말일

      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      const tolerance = Math.max(1000, Math.floor(due * 0.05))

      // loan_out은 회사가 받는 이자(income), 나머지는 회사가 지급(expense)
      const txType = row.contract_type === 'loan_out' ? 'income' : 'expense'

      // 1) related_id 정확 매칭
      const exact = await prisma.$queryRaw<any[]>`
        SELECT id, transaction_date, amount, client_name, description
          FROM transactions
         WHERE type=${txType}
           AND related_type=${row.contract_type}
           AND related_id=${row.contract_id}
           AND transaction_date >= ${fmt(searchStart)}
           AND transaction_date <= ${fmt(searchEnd)}
           AND ABS(amount - ${due}) <= ${tolerance}
           AND deleted_at IS NULL
         ORDER BY transaction_date
         LIMIT 5
      `

      let txIds: string[] = exact.map(r => r.id)

      // 2) 이름 폴백 매칭 (정확 매칭 없을 때만)
      if (txIds.length === 0 && row.recipient_name) {
        const fuzzy = await prisma.$queryRaw<any[]>`
          SELECT id, transaction_date, amount, client_name, description
            FROM transactions
           WHERE type=${txType}
             AND (client_name LIKE ${'%' + row.recipient_name + '%'}
                  OR description LIKE ${'%' + row.recipient_name + '%'})
             AND transaction_date >= ${fmt(searchStart)}
             AND transaction_date <= ${fmt(searchEnd)}
             AND ABS(amount - ${due}) <= ${tolerance}
             AND deleted_at IS NULL
           ORDER BY transaction_date
           LIMIT 5
        `
        txIds = fuzzy.map(r => r.id)
      }

      if (txIds.length > 0) {
        const paidAmount = txIds.length === 1 ? due : due // 일단 due로 간주
        await prisma.$executeRaw`
          UPDATE settlement_ledger
             SET status='matched', matched_at=${now},
                 matched_tx_ids=${JSON.stringify(txIds)},
                 paid_amount=${paidAmount},
                 updated_at=${now}
           WHERE id=${row.id}
        `
        matched.push({ id: row.id, name: row.recipient_name, month: row.settlement_month, due, txIds })
      }
    }

    return NextResponse.json({
      data: { matched: matched.length, details: matched, totalScanned: pending.length },
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/settlement/ledger/match]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
