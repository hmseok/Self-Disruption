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
    // 문자 계좌 마스킹(**168)으로 3자리만 저장된 행도 포함 — 끝자리 일치 허용 (2026-07-08)
    const accountClause = ` AND (account_last4 = '${account}' OR ('${account}' LIKE CONCAT('%', account_last4) AND CHAR_LENGTH(account_last4) >= 3))`
    if (account) {
      // V10 미적용 DB 는 아래 쿼리가 1054 → catch 에서 계좌 조건 없이 재시도
      bankClause += accountClause
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
          bankClause = bankClause.replace(accountClause, '')
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
    // (2026-07-08 재작성 — 오탐 2건 수정)
    //   ① 잔액 없는 행도 합계(net)에는 포함해야 함 — 기존엔 balance IS NOT NULL 필터로
    //      제외되어 그날 이후 기대잔액이 전부 어긋남.
    //   ② 날짜만 있는 데이터(시각 00:00 동일)는 같은 날 안의 순서를 알 수 없음 —
    //      시작일 기준 잔액을 임의 행으로 잡으면 기대값이 음수까지 나오는 오탐.
    //      → 시작 묶음의 모든 잔액을 후보로 시뮬레이션, 끊김이 가장 적은 기준을 채택.
    const chainRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT transaction_date, type, amount, balance_after, client_name, description
         FROM transactions
        WHERE deleted_at IS NULL
          AND (imported_from LIKE 'excel_bank%' OR imported_from = 'sms_bank' OR imported_from = 'codef_bank')
          AND transaction_date >= ? AND transaction_date < DATE_ADD(?, INTERVAL 1 DAY)
          ${bankClause}
        ORDER BY transaction_date ASC
        LIMIT 5000`,
      from, to,
    )
    const withBalance = chainRows.filter((r) => r.balance_after != null && Number(r.balance_after) > 0).length
    // 같은 시각 묶음(은행 일괄처리·날짜만 있는 엑셀)은 순서를 알 수 없어 건별 비교 시 오탐.
    //   → 묶음 단위 검사: 이전 끝잔액 + 묶음 합계(잔액 없는 행 포함) = 묶음 내 어느 잔액과 일치하면 정상.
    const groups: Array<{ ts: string; rows: any[]; net: number; balances: number[] }> = []
    for (const r of chainRows) {
      const ts = String(r.transaction_date)
      if (!groups.length || groups[groups.length - 1].ts !== ts) groups.push({ ts, rows: [], net: 0, balances: [] })
      const g = groups[groups.length - 1]
      g.rows.push(r)
      g.net += r.type === 'income' ? Number(r.amount) : -Number(r.amount)
      if (r.balance_after != null && Number(r.balance_after) > 0) g.balances.push(Number(r.balance_after))
    }
    // 시작 기준 잔액 후보 = 첫 잔액 보유 묶음의 잔액들 → 각각 시뮬레이션 → 끊김 최소 채택
    const startIdx = groups.findIndex((g) => g.balances.length > 0)
    const simulate = (anchor: number) => {
      const bks: any[] = []
      let checkedCnt = 0
      let prevEnd = anchor
      for (let i = startIdx + 1; i < groups.length; i++) {
        const g = groups[i]
        const expected = prevEnd + g.net
        if (g.balances.length === 0) { prevEnd = expected; continue }  // 잔액 없는 묶음 — 검증 불가, 누적만
        checkedCnt++
        const hit = g.balances.some((b) => Math.abs(b - expected) <= 0.5)
        if (hit) {
          prevEnd = expected
        } else {
          const closest = g.balances.reduce((b, c) => (Math.abs(c - expected) < Math.abs(b - expected) ? c : b), g.balances[0])
          if (bks.length < 10) {
            const first = g.rows[0]
            bks.push({
              date: String(first.transaction_date).slice(0, 10),
              client_name: first.client_name || first.description || '',
              expected,
              actual: closest,
              diff: closest - expected,
            })
          }
          prevEnd = closest  // 사슬 재동기화
        }
      }
      return { bks, checkedCnt }
    }
    let breaks: any[] = []
    let checked = 0
    if (startIdx >= 0 && groups.length > startIdx + 1) {
      const candidates = Array.from(new Set(groups[startIdx].balances))
      let best: { bks: any[]; checkedCnt: number } | null = null
      for (const c of candidates) {
        const sim = simulate(c)
        if (!best || sim.bks.length < best.bks.length) best = sim
        if (best.bks.length === 0) break
      }
      breaks = best?.bks || []
      checked = best?.checkedCnt || 0
    }

    return NextResponse.json({
      from, to, bank,
      income_sum: incomeSum,
      expense_sum: expenseSum,
      net: incomeSum - expenseSum,
      count,
      by_source: bySource,
      chain: { with_balance: withBalance, checked, breaks_found: breaks.length >= 10 ? '10+' : breaks.length, breaks },
      error: null,
    })
  } catch (e: any) {
    console.error('[bank-reconcile GET]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
