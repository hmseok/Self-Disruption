// ═══════════════════════════════════════════════════════════════
// /api/tire/invoices — 타이어 청구서 (2026-08-07 신설)
//   GET    목록 (+?id= 단건: 라인·공급자 정보 포함 — 인쇄용)
//   POST   {customer_name?, period_from, period_to, sale_ids[]} 발행
//          → 선택 판매건 invoice_id 연결 + status='billed'
//   PATCH  {id, action:'paid'|'void', deposit_tx_id?}
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { randomUUID } from 'crypto'

const N = (v: unknown) => Number(v) || 0

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const inv = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM tire_invoices WHERE id = ?`, id)
    if (!inv[0]) return NextResponse.json({ error: '청구서를 찾을 수 없습니다' }, { status: 404 })
    const lines = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM tire_sales WHERE invoice_id = ? ORDER BY sale_date, created_at`, id)
    const settings = await prisma.$queryRawUnsafe<any[]>(`SELECT setting_key, setting_value FROM tire_settings`)
    const supplier: Record<string, string> = {}
    for (const s of settings) supplier[s.setting_key] = s.setting_value || ''
    return NextResponse.json({
      invoice: { ...inv[0], total: N(inv[0].total) },
      lines: lines.map(l => ({ ...l, qty: N(l.qty), unit_price: N(l.unit_price), amount: N(l.amount) })),
      supplier,
    })
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM tire_invoices ORDER BY created_at DESC LIMIT 300`)
  return NextResponse.json({ rows: rows.map(r => ({ ...r, total: N(r.total), line_count: N(r.line_count) })) })
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  const saleIds: string[] = Array.isArray(b.sale_ids) ? b.sale_ids : []
  if (saleIds.length === 0) return NextResponse.json({ error: '청구할 판매 건을 선택하세요' }, { status: 400 })

  const ph = saleIds.map(() => '?').join(',')
  const sales = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, amount, invoice_id FROM tire_sales WHERE id IN (${ph})`, ...saleIds)
  const already = sales.filter(s => s.invoice_id)
  if (already.length > 0) return NextResponse.json({ error: `이미 청구된 건이 ${already.length}건 포함되어 있습니다` }, { status: 400 })

  const total = sales.reduce((a, s) => a + N(s.amount), 0)
  // 청구서 번호: TI-YYYYMMDD-NN (당일 순번)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const cntRow = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) cnt FROM tire_invoices WHERE invoice_no LIKE ?`, `TI-${today}-%`)
  const invoiceNo = `TI-${today}-${String(N(cntRow[0]?.cnt) + 1).padStart(2, '0')}`

  const id = randomUUID()
  await prisma.$executeRawUnsafe(
    `INSERT INTO tire_invoices (id, invoice_no, customer_name, period_from, period_to, line_count, total, status, issued_at, memo)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', NOW(), ?)`,
    id, invoiceNo, b.customer_name || null, b.period_from || null, b.period_to || null,
    sales.length, total, b.memo || null)
  await prisma.$executeRawUnsafe(
    `UPDATE tire_sales SET invoice_id = ?, status = 'billed' WHERE id IN (${ph})`, id, ...saleIds)

  return NextResponse.json({ ok: true, id, invoice_no: invoiceNo, total })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  if (!b.id || !b.action) return NextResponse.json({ error: 'id/action 누락' }, { status: 400 })

  if (b.action === 'paid') {
    await prisma.$executeRawUnsafe(
      `UPDATE tire_invoices SET status='paid', paid_at=NOW(), deposit_tx_id=? WHERE id=?`,
      b.deposit_tx_id || null, b.id)
    await prisma.$executeRawUnsafe(`UPDATE tire_sales SET status='paid' WHERE invoice_id=?`, b.id)
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'void') {
    // 취소: 판매건 원복 후 청구서 폐기
    await prisma.$executeRawUnsafe(`UPDATE tire_sales SET invoice_id=NULL, status='unbilled' WHERE invoice_id=?`, b.id)
    await prisma.$executeRawUnsafe(`UPDATE tire_invoices SET status='void' WHERE id=?`, b.id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: '지원하지 않는 action' }, { status: 400 })
}
