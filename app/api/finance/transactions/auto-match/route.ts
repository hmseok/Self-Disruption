import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

/**
 * POST /api/finance/transactions/auto-match
 * 3-Dimension 자동매칭: 금액(0.45) + 날짜(0.30) + 이름(0.25)
 * Body: { threshold?: number, autoConfirm?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const threshold = body.threshold || 0.50
    const autoConfirmThreshold = 0.75

    // 1. 미매칭 거래 로드
    const unmatched = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, transaction_date, type, amount, description, client_name, bank_name, card_company
      FROM transactions
      WHERE (related_type IS NULL OR related_id IS NULL)
        AND deleted_at IS NULL
      ORDER BY transaction_date DESC
      LIMIT 2000
    `)

    // 2. 정산 지급내역 로드 (매칭 대상)
    const settlements = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, settlement_month, contract_id, contract_type, recipient_name,
             due_amount, bank_name, account_number, status
      FROM settlement_ledger
      WHERE status = 'pending'
    `)

    // 3. 계약 정보 로드 (매칭 대상)
    const contracts = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, 'jiip' AS ctype, client_name, monthly_amount, contract_start, contract_end
      FROM jiip_contracts WHERE status = 'active'
      UNION ALL
      SELECT id, 'invest' AS ctype, investor_name AS client_name, monthly_return AS monthly_amount, start_date AS contract_start, end_date AS contract_end
      FROM general_investments WHERE status = 'active'
      UNION ALL
      SELECT id, 'loan_out' AS ctype, borrower_name AS client_name, monthly_interest AS monthly_amount, start_date AS contract_start, end_date AS contract_end
      FROM loans_out WHERE status != 'closed'
    `)

    // 매칭 결과
    const results: any[] = []
    const matched: any[] = []

    for (const tx of unmatched) {
      const txAmount = Math.abs(Number(tx.amount || 0))
      const txDate = tx.transaction_date ? new Date(tx.transaction_date) : null
      const txName = normalize(tx.client_name || tx.description || '')

      if (txAmount === 0 || !txDate) continue

      let bestMatch: any = null
      let bestScore = 0

      // 3a. 정산 대상 매칭
      for (const s of settlements) {
        const due = Math.abs(Number(s.due_amount || 0))
        if (due === 0) continue

        const amountScore = calcAmountScore(txAmount, due)
        const nameScore = calcNameScore(txName, normalize(s.recipient_name || ''))

        // 정산월 기준 날짜: 다음달 1일 ~ 다음다음달 말일
        const [sy, sm] = (s.settlement_month || '2025-01').split('-').map(Number)
        const expectedDate = new Date(sy, sm, 15) // 다음달 15일 기준
        const dateScore = calcDateScore(txDate, expectedDate)

        const total = amountScore * 0.45 + dateScore * 0.30 + nameScore * 0.25

        if (total > bestScore && total >= threshold) {
          bestScore = total
          bestMatch = {
            type: 'settlement',
            id: s.id,
            name: s.recipient_name,
            amount: due,
            month: s.settlement_month,
            contractType: s.contract_type,
          }
        }
      }

      // 3b. 계약 대상 매칭
      for (const c of contracts) {
        const monthlyAmount = Math.abs(Number(c.monthly_amount || 0))
        if (monthlyAmount === 0) continue

        const amountScore = calcAmountScore(txAmount, monthlyAmount)
        const nameScore = calcNameScore(txName, normalize(c.client_name || ''))

        // 매월 거래 예상이므로 가장 가까운 월 1일 기준 날짜 점수
        const txMonth = new Date(txDate.getFullYear(), txDate.getMonth(), 1)
        const dateScore = txDate.getDate() <= 15 ? 0.8 : 0.5 // 월 전반 선호

        const total = amountScore * 0.45 + dateScore * 0.30 + nameScore * 0.25

        if (total > bestScore && total >= threshold) {
          bestScore = total
          bestMatch = {
            type: 'contract',
            id: c.id,
            name: c.client_name,
            amount: monthlyAmount,
            contractType: c.ctype,
          }
        }
      }

      if (bestMatch) {
        const result = {
          transactionId: tx.id,
          txDate: tx.transaction_date,
          txAmount,
          txName: tx.client_name || tx.description,
          match: bestMatch,
          score: Math.round(bestScore * 100),
          autoConfirm: bestScore >= autoConfirmThreshold,
        }
        results.push(result)

        // 자동확인(0.75+)이면서 autoConfirm 모드이면 즉시 업데이트
        if (body.autoConfirm && bestScore >= autoConfirmThreshold) {
          if (bestMatch.type === 'settlement') {
            await prisma.$executeRawUnsafe(
              `UPDATE transactions SET related_type = ?, related_id = ?, updated_at = NOW() WHERE id = ?`,
              bestMatch.contractType || 'settlement',
              bestMatch.id,
              tx.id
            )
            await prisma.$executeRawUnsafe(
              `UPDATE settlement_ledger SET status = 'matched', matched_at = NOW(),
               matched_tx_ids = JSON_ARRAY(?), paid_amount = ?, updated_at = NOW()
               WHERE id = ? AND status = 'pending'`,
              tx.id, txAmount, bestMatch.id
            )
          } else {
            await prisma.$executeRawUnsafe(
              `UPDATE transactions SET related_type = ?, related_id = ?, updated_at = NOW() WHERE id = ?`,
              bestMatch.contractType,
              bestMatch.id,
              tx.id
            )
          }
          matched.push(result)
        }
      }
    }

    return NextResponse.json({
      data: serialize({
        total: unmatched.length,
        candidates: results.length,
        autoConfirmed: matched.length,
        results: results.slice(0, 500),
      }),
      error: null,
    })
  } catch (e: any) {
    console.error('[POST /api/finance/transactions/auto-match]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── 매칭 점수 함수 ─────────────────────────────────────

function normalize(s: string): string {
  return (s || '').replace(/\s+/g, '').replace(/[()（）\-_]/g, '').toLowerCase()
}

function calcAmountScore(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  const diff = Math.abs(a - b) / Math.max(a, b)
  if (diff === 0) return 1.0
  if (diff <= 0.01) return 0.9
  if (diff <= 0.05) return 0.7
  if (diff <= 0.10) return 0.3
  return 0
}

function calcDateScore(a: Date, b: Date): number {
  const diffMs = Math.abs(a.getTime() - b.getTime())
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays <= 0.5) return 1.0
  if (diffDays <= 1) return 0.8
  if (diffDays <= 3) return 0.5
  if (diffDays <= 7) return 0.3
  if (diffDays <= 14) return 0.1
  return 0
}

function calcNameScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1.0
  if (a.includes(b) || b.includes(a)) return 0.7
  // 2글자 이상 공통 부분 문자열
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  let maxCommon = 0
  for (let i = 0; i < shorter.length; i++) {
    for (let j = i + 2; j <= shorter.length; j++) {
      if (longer.includes(shorter.slice(i, j))) maxCommon = Math.max(maxCommon, j - i)
    }
  }
  if (maxCommon >= 3) return 0.5
  if (maxCommon >= 2) return 0.3
  return 0
}
