// ═══════════════════════════════════════════════════════════════
// /api/tire/sales — 타이어 판매내역 CRUD (2026-08-07 신설)
//   GET    ?from&to&status&q     목록 + 요약
//   POST   {sale}                등록 (일자·고객·품목·수량·단가)
//   PATCH  {id, ...fields}       수정 (차량번호·고객 보강 포함)
//   DELETE ?id                   삭제
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { randomUUID } from 'crypto'

const N = (v: unknown) => Number(v) || 0

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const status = sp.get('status')
  const q = sp.get('q')

  const conds: string[] = []
  const args: unknown[] = []
  if (from) { conds.push('sale_date >= ?'); args.push(from) }
  if (to) { conds.push('sale_date <= ?'); args.push(to) }
  if (status) { conds.push('status = ?'); args.push(status) }
  if (q) {
    conds.push('(customer_name LIKE ? OR car_number LIKE ? OR item_name LIKE ? OR spec LIKE ?)')
    const like = `%${q}%`
    args.push(like, like, like, like)
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM tire_sales ${where} ORDER BY sale_date DESC, created_at DESC LIMIT 1000`, ...args)
  const summary = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) cnt, COALESCE(SUM(amount),0) total,
       COALESCE(SUM(CASE WHEN status='unbilled' THEN amount ELSE 0 END),0) unbilled,
       COALESCE(SUM(CASE WHEN status='billed' THEN amount ELSE 0 END),0) billed,
       COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) paid,
       COALESCE(SUM(purchase_cost),0) cost
     FROM tire_sales ${where}`, ...args)

  return NextResponse.json({
    rows: rows.map(r => ({ ...r, qty: N(r.qty), unit_price: N(r.unit_price), amount: N(r.amount), purchase_cost: r.purchase_cost == null ? null : N(r.purchase_cost) })),
    summary: {
      cnt: N(summary[0]?.cnt), total: N(summary[0]?.total),
      unbilled: N(summary[0]?.unbilled), billed: N(summary[0]?.billed), paid: N(summary[0]?.paid),
      cost: N(summary[0]?.cost),
    },
  })
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  if (!b.sale_date) return NextResponse.json({ error: '판매일은 필수입니다' }, { status: 400 })
  const qty = Math.max(1, N(b.qty) || 1)
  const unitPrice = N(b.unit_price)
  const amount = b.amount != null && N(b.amount) > 0 ? N(b.amount) : qty * unitPrice
  const id = randomUUID()
  await prisma.$executeRawUnsafe(
    `INSERT INTO tire_sales (id, sale_date, customer_name, customer_phone, car_number, delivery_address, item_name, spec, qty, unit_price, amount, purchase_cost, source, memo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, b.sale_date, b.customer_name || null, b.customer_phone || null, b.car_number || null, b.delivery_address || null,
    b.item_name || null, b.spec || null, qty, unitPrice, amount,
    b.purchase_cost != null && b.purchase_cost !== '' ? N(b.purchase_cost) : null,
    b.source || 'manual', b.memo || null)
  return NextResponse.json({ ok: true, id })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })

  const ALLOWED = ['sale_date', 'customer_name', 'customer_phone', 'car_number', 'delivery_address', 'item_name', 'spec', 'qty', 'unit_price', 'amount', 'purchase_cost', 'status', 'memo']
  const sets: string[] = []
  const args: unknown[] = []
  for (const k of ALLOWED) {
    if (k in b) { sets.push(`${k} = ?`); args.push(b[k] === '' ? null : b[k]) }
  }
  if (!sets.length) return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })
  args.push(b.id)
  await prisma.$executeRawUnsafe(`UPDATE tire_sales SET ${sets.join(', ')} WHERE id = ?`, ...args)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })
  // 청구서에 묶인 건은 삭제 금지 — 청구서에서 먼저 제외
  const row = await prisma.$queryRawUnsafe<any[]>(`SELECT invoice_id FROM tire_sales WHERE id = ?`, id)
  if (row[0]?.invoice_id) return NextResponse.json({ error: '청구서에 포함된 건입니다. 청구서를 먼저 취소하세요.' }, { status: 400 })
  await prisma.$executeRawUnsafe(`DELETE FROM tire_sales WHERE id = ?`, id)
  return NextResponse.json({ ok: true })
}
