import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/finance/bank-reconcile?from=YYYY-MM-DD&to=YYYY-MM-DD&bank=all|woori|kb
 *
 * 잔액 맞춰보기 (PR-RECONCILE, 2026-07-07 — 사용자 명시 「자료가 맞나 의심」):
 *   경리 정석 = 기간 입출금 합계와 은행 실제 잔액 증감을 대조.
 *   시스템은 구간의 입금합·출금합·순증감을 계산해 주고,
 *   화면에서 사용자가 넣은 (끝잔액 - 시작잔액) 과 비교해 일치/차이를 판정.
 *
 * 대상: 통장 계열 (excel_bank% / sms_bank / codef_bank) — 외주정산(excel_partner)은
 *   실제 통장 흐름이 아니므로 제외.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const sp = request.nextUrl.searchParams
    const from = String(sp.get('from') || '').slice(0, 10)
    const to = String(sp.get('to') || '').slice(0, 10)
    const bank = String(sp.get('bank') || 'all')
    // PR-ACCOUNT (V10) — 계좌 끝4자리 지정 시 그 계좌만 (사슬 검사 정확도 최상)
    const account = String(sp.get('account') || '').replace(/\D/g, '').slice(-4)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: '기간(from/to)을 지정하세요' }, { status: 400 })
    }

    let bankClause =
      bank === 'woori' ? `AND (bank_name LIKE '%우리%' OR card_company LIKE '%WOORI%')`
      : bank === 'kb' ? `AND (bank_name LIKE '%국민%' OR card_company LIKE '%KB%')`
      : ''
    if (account) {
      // V10 미적용 DB 는 아래 쿼리가 1054 → catch 에서 계좌 조건 없이 재시도
      bankClause += ` AND account_last4 = '${account}'`
    }

    const sumSql = (clause: string) =>
      `SELECT imported_from,
              SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income_sum,
              SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense_sum,
              COUNT(*) AS cnt
         FROM transactions
        WHERE deleted_at IS NULL
          AND (imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank' OR imported_from = 'codef_bank')
          AND transaction_date >= ? AND transaction_date < DATE_ADD(?, INTERVAL 1 DAY)
          ${clause}
        GROUP BY imported_from`
    const rows = await prisma.$queryRawUnsafe<Array<any>>(sumSql(bankClause), from, to)
      .catch(async (e: any) => {
        if (account && /Unknown column/i.test(e?.message || '')) {
          bankClause = bankClause.replace(` AND account_last4 = '${account}'`, '')
          return prisma.$queryRawUnsafe<Array<any>>(sumSql(bankClause), from, to)
        }
        throw e
      })

    let incomeSum = 0, expenseSum = 0, count = 0
    const bySource: Record<string, { income: number; expense: number; cnt: number }> = {}
    for (const r of rows) {
      const inc = Number(r.income_sum || 0)
      const exp = Number(r.expense_sum || 0)
      incomeSum += inc; expenseSum += exp; count += Number(r.cnt || 0)
      bySource[String(r.imported_from)] = { income: inc, expense: exp, cnt: Number(r.cnt || 0) }
    }

    // ── 잔액 사슬 자동 검증 (사용자 아이디어: 문자에 잔액이 찍혀 오니 자체 누락확인) ──
    //   잔액이 기록된 거래를 시간순으로 놓고 「이전 잔액 ± 입출금 = 다음 잔액」 이 이어지는지 검사.
    //   끊긴 지점 = 그 사이에 누락 또는 중복이 있다는 뜻 (위치까지 특정).
    //   ※ 같은 은행에 계좌가 여러 개면 사슬이 섞일 수 있어 은행 선택 시 가장 정확.
    const chainRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT transaction_date, type, amount, balance_after, client_name, description
         FROM transactions
        WHERE deleted_at IS NULL
          AND (imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank' OR imported_from = 'codef_bank')
          AND balance_after IS NOT NULL AND balance_after > 0
          AND transaction_date >= ? AND transaction_date < DATE_ADD(?, INTERVAL 1 DAY)
          ${bankClause}
        ORDER BY transaction_date ASC
        LIMIT 3000`,
      from, to,
    )
    const breaks: any[] = []
    let checked = 0
    for (let i = 1; i < chainRows.length; i++) {
      const prev = chainRows[i - 1]
      const cur = chainRows[i]
      const expected = Number(prev.balance_after) + (cur.type === 'income' ? Number(cur.amount) : -Number(cur.amount))
      checked++
      if (Math.abs(expected - Number(cur.balance_after)) > 0.5) {
        if (breaks.length < 10) {
          breaks.push({
            date: String(cur.transaction_date).slice(0, 10),
            client_name: cur.client_name || cur.description || '',
            expected,
            actual: Number(cur.balance_after),
            diff: Number(cur.balance_after) - expected,
          })
        }
      }
    }

    return NextResponse.json({
      from, to, bank,
      income_sum: incomeSum,
      expense_sum: expenseSum,
      net: incomeSum - expenseSum,
      count,
      by_source: bySource,
      chain: { with_balance: chainRows.length, checked, breaks_found: breaks.length >= 10 ? '10+' : breaks.length, breaks },
      error: null,
    })
  } catch (e: any) {
    console.error('[bank-reconcile GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
