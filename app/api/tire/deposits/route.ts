// ═══════════════════════════════════════════════════════════════
// /api/tire/deposits — 타이어 KB 통장(441501-01-516551) 입금 내역 (2026-08-07)
//   GET ?days=90  장부에서 해당 계좌 입금 거래 + 청구서 매칭 상태
//   매칭은 /api/tire/invoices PATCH(action:'paid', deposit_tx_id)로 수행
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

const N = (v: unknown) => Number(v) || 0
const TIRE_ACCOUNT_DIGITS = '44150101516551'

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = Math.min(N(req.nextUrl.searchParams.get('days')) || 90, 3650)

  // 계좌 식별: transactions.account_last4 (끝 4자리) + 국민은행
  const last4 = TIRE_ACCOUNT_DIGITS.slice(-4)
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, transaction_date, type, amount, description, category, bank_name, account_last4
    FROM transactions
    WHERE deleted_at IS NULL
      AND transaction_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
      AND REPLACE(REPLACE(COALESCE(account_last4,''),'-',''),'*','') = ?
      AND (bank_name IS NULL OR bank_name LIKE '%국민%' OR bank_name LIKE '%KB%')
    ORDER BY transaction_date DESC LIMIT 500`, days, last4)

  // 이미 청구서에 매칭된 거래
  const matched = await prisma.$queryRawUnsafe<any[]>(
    `SELECT deposit_tx_id, invoice_no FROM tire_invoices WHERE deposit_tx_id IS NOT NULL`)
  const matchedMap = new Map(matched.map(m => [m.deposit_tx_id, m.invoice_no]))

  // 입금 대기 청구서 (매칭 후보)
  const waiting = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, invoice_no, customer_name, total, issued_at FROM tire_invoices WHERE status='issued' ORDER BY issued_at DESC`)

  return NextResponse.json({
    rows: rows.map(r => ({ ...r, amount: N(r.amount), matched_invoice: matchedMap.get(r.id) || null })),
    waiting: waiting.map(w => ({ ...w, total: N(w.total) })),
  })
}
