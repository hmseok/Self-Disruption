import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/transactions/contract-match
 *
 * 미확정 거래를 general_investments(투자자) / jiip_contracts(지입 차주) 계약과
 * 이름+금액+계좌+지급일 기준 4차원 점수로 매칭 후보 반환.
 *
 * dispatch-match가 "차량번호 → fmi_rentals" 매칭이라면,
 * contract-match는 "투자자/지입 차주 이름 → 계약" 매칭.
 *
 * Body:
 * {
 *   transactions: Array<{
 *     id?: any, date: string, amount: number,
 *     memo?: string, description?: string, client_name?: string, type?: 'income'|'expense'
 *   }>
 * }
 *
 * Response:
 * {
 *   matches: Array<{
 *     tx_id, tx_memo,
 *     contract: { id, type: 'invest'|'jiip', investor_name, invest_amount?, admin_fee?, interest_rate?, account_number? } | null,
 *     confidence: number,           // 0~1
 *     suggested_category: string,   // '이자비용(대출/투자)'|'지입 관리비/수수료'|'투자원금 입금'|'지입 수익배분금(출금)' ...
 *     suggested_related_type: 'invest' | 'jiip' | null,
 *     reasons: string[]             // 근거 (이름, 금액, 계좌, 날짜)
 *   }>
 * }
 */

function normalize(s: string | null | undefined): string {
  return String(s || '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase()
}

function nameScore(text: string, name: string): number {
  const a = normalize(text)
  const b = normalize(name)
  if (!a || !b) return 0
  if (a.includes(b)) return 1.0
  // 부분 일치: 2글자 이상 포함 시 부분 점수
  if (b.length >= 2 && a.includes(b.slice(0, 2))) return 0.5
  return 0
}

function amountScore(tx: number, target: number): number {
  if (!target || target <= 0) return 0
  const diff = Math.abs(tx - target) / target
  if (diff < 0.02) return 1.0
  if (diff < 0.05) return 0.7
  if (diff < 0.15) return 0.4
  return 0
}

function dateScore(txDate: string, paymentDay: number): number {
  if (!txDate || !paymentDay) return 0
  const d = new Date(txDate)
  if (isNaN(d.getTime())) return 0
  const day = d.getDate()
  const delta = Math.min(Math.abs(day - paymentDay), 31 - Math.abs(day - paymentDay))
  if (delta <= 1) return 1.0
  if (delta <= 3) return 0.7
  if (delta <= 7) return 0.3
  return 0
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await req.json()
    const txs: any[] = Array.isArray(body.transactions) ? body.transactions : []
    if (txs.length === 0) return NextResponse.json({ error: 'transactions 필수' }, { status: 400 })

    // 계약 마스터 로드 (active만 — classify/route.ts와 동일 규칙)
    const [investRowsRaw, jiipRowsRaw] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT id, investor_name, invest_amount, interest_rate, account_number, account_holder, payment_day, status FROM general_investments`,
      prisma.$queryRaw<any[]>`SELECT id, investor_name, admin_fee, account_number, account_holder, payout_day, status FROM jiip_contracts`,
    ])
    const filterActive = (arr: any[]) => arr.filter((r: any) => !r.status || r.status === 'active')
    const investRows = filterActive(investRowsRaw || [])
    const jiipRows = filterActive(jiipRowsRaw || [])

    type Target = {
      id: string
      type: 'invest' | 'jiip'
      name: string
      expectedAmount: number    // 월 이자 or 월 관리비
      principalAmount?: number  // invest: 원금
      accountDigits: string
      accountHolder: string
      paymentDay: number
    }

    const targets: Target[] = []
    for (const r of (investRows || [])) {
      const mi = Math.round((Number(r.invest_amount) || 0) * (Number(r.interest_rate) || 0) / 100 / 12)
      targets.push({
        id: String(r.id), type: 'invest', name: r.investor_name || '',
        expectedAmount: mi, principalAmount: Number(r.invest_amount) || 0,
        accountDigits: String(r.account_number || '').replace(/\D/g, ''),
        accountHolder: r.account_holder || '',
        paymentDay: Number(r.payment_day) || 0,
      })
    }
    for (const r of (jiipRows || [])) {
      targets.push({
        id: String(r.id), type: 'jiip', name: r.investor_name || '',
        expectedAmount: Number(r.admin_fee) || 0,
        accountDigits: String(r.account_number || '').replace(/\D/g, ''),
        accountHolder: r.account_holder || '',
        paymentDay: Number(r.payout_day) || 0,
      })
    }

    const matches: any[] = []
    for (const tx of txs) {
      const memoText = `${tx.memo || ''} ${tx.description || ''}`
      const searchText = `${memoText} ${tx.client_name || ''}`.toLowerCase()
      const txAmount = Math.abs(Number(tx.amount || 0))
      const txDate = tx.date || ''
      const txDigits = (tx.description || '').replace(/\D/g, '')
      const isIncome = tx.type === 'income'

      let best: { target: Target; score: number; reasons: string[] } | null = null

      for (const t of targets) {
        if (!t.name) continue
        const reasons: string[] = []
        let score = 0

        // 1) 이름 매칭 — client_name OR description/memo 모두 체크
        const nsClient = nameScore(tx.client_name || '', t.name)
        const nsMemo = nameScore(memoText, t.name)
        const nsMax = Math.max(nsClient, nsMemo)
        if (nsMax > 0) {
          score += nsMax * 0.5
          reasons.push(`이름 매칭 (${t.name}, ${Math.round(nsMax * 100)}%)`)
        } else {
          continue // 이름 매칭 없으면 후보에서 제외
        }

        // 2) 금액 매칭 — 월 이자/관리비 + invest 원금(입금)
        const amtScoreMonthly = amountScore(txAmount, t.expectedAmount)
        if (amtScoreMonthly > 0) {
          score += amtScoreMonthly * 0.2
          reasons.push(`월 예상금액 근접 (${Math.round(amtScoreMonthly * 100)}%)`)
        }
        if (t.type === 'invest' && t.principalAmount && isIncome) {
          const ps = amountScore(txAmount, t.principalAmount)
          if (ps > 0) {
            score += ps * 0.2
            reasons.push(`투자원금 입금 근접 (${Math.round(ps * 100)}%)`)
          }
        }

        // 3) 계좌번호 매칭 — 가장 강력
        if (t.accountDigits.length >= 4 && txDigits.includes(t.accountDigits)) {
          score += 0.3
          reasons.push('계좌번호 일치')
        }

        // 4) 지급일 매칭
        const ds = dateScore(txDate, t.paymentDay)
        if (ds > 0) {
          score += ds * 0.1
          reasons.push(`지급일 근접 (±${t.paymentDay}일)`)
        }

        // 5) 키워드 보너스
        if (t.type === 'invest' && /투자|이자|원금/.test(searchText)) {
          score += 0.1
          reasons.push('키워드 (투자/이자/원금)')
        }
        if (t.type === 'jiip' && /지입|관리비|수수료/.test(searchText)) {
          score += 0.1
          reasons.push('키워드 (지입/관리비/수수료)')
        }

        if (!best || score > best.score) {
          best = { target: t, score, reasons }
        }
      }

      // suggested_category — 타입 + 방향 기준
      let suggestedCategory: string | null = null
      if (best) {
        if (best.target.type === 'invest') {
          // 원금 근접 + 입금 = 투자원금 입금; 월 이자 근접 + 출금 = 이자비용
          if (isIncome && best.target.principalAmount && amountScore(txAmount, best.target.principalAmount) > 0.4) {
            suggestedCategory = '투자원금 입금'
          } else if (!isIncome) {
            suggestedCategory = '이자비용(대출/투자)'
          } else {
            suggestedCategory = '이자/잡이익'
          }
        } else if (best.target.type === 'jiip') {
          if (isIncome) suggestedCategory = '지입 관리비/수수료'
          else suggestedCategory = '지입 수익배분금(출금)'
        }
      }

      matches.push({
        tx_id: tx.id,
        tx_memo: memoText.slice(0, 120),
        contract: best && best.score >= 0.3 ? {
          id: best.target.id,
          type: best.target.type,
          investor_name: best.target.name,
          invest_amount: best.target.principalAmount || null,
          expected_amount: best.target.expectedAmount,
          account_holder: best.target.accountHolder,
        } : null,
        confidence: best ? Math.min(1, best.score) : 0,
        suggested_category: suggestedCategory,
        suggested_related_type: best && best.score >= 0.3 ? best.target.type : null,
        reasons: best ? best.reasons : [],
      })
    }

    return NextResponse.json({
      success: true,
      total: matches.length,
      matched: matches.filter((m) => m.contract).length,
      matches,
    })
  } catch (e: any) {
    console.error('[contract-match] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
