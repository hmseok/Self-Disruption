// ═══════════════════════════════════════════════════════════════
// /api/tire/portal/[token] — 거래처 전용 포털 API (공개, 토큰 스코프)
//   GET             거래처·배송지·신청내역·사이즈 옵션
//   POST action:'order'    신청 (사이즈 3구분/카탈로그 선택)
//   POST action:'address'  배송지 추가 / 'address-default' 기본 지정 / 'address-delete'
// 토큰이 곧 인증 — 링크 소지자만 접근 (2026-08-07)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const N = (v: unknown) => Number(v) || 0
const S = (v: unknown, max: number) => String(v || '').trim().slice(0, max)

async function getCustomer(token: string) {
  if (!/^[A-Za-z0-9]{6,24}$/.test(token)) return null
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, name, phone FROM tire_customers WHERE token = ? AND status = 'active'`, token)
  return rows[0] || null
}

const FULFILL_LABEL: Record<string, string> = {
  received: '접수됨', confirmed: '확정', ordered: '주문완료', shipping: '배송중', done: '완료',
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const customer = await getCustomer(token)
  if (!customer) return NextResponse.json({ error: '유효하지 않은 링크입니다' }, { status: 404 })

  const [addresses, orders] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT id, label, address, contact_name, contact_phone, is_default
       FROM tire_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at`, customer.id),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT id, sale_date, item_name, spec, qty, amount, car_number, status, fulfill_status, created_at
       FROM tire_sales WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`, customer.id),
  ])

  return NextResponse.json({
    customer: { name: customer.name },
    addresses: addresses.map(a => ({ ...a, is_default: Number(a.is_default) })),
    orders: orders.map(o => ({
      ...o, qty: N(o.qty), amount: N(o.amount),
      statusLabel: FULFILL_LABEL[o.fulfill_status || ''] ||
        (o.status === 'requested' ? '접수됨' : o.status === 'paid' ? '완료' : '확정'),
      amountConfirmed: o.status !== 'requested',
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const customer = await getCustomer(token)
  if (!customer) return NextResponse.json({ error: '유효하지 않은 링크입니다' }, { status: 404 })

  const b = await req.json()
  const action = b.action || 'order'

  // ── 배송지 관리 ──
  if (action === 'address') {
    const address = S(b.address, 300)
    if (!address) return NextResponse.json({ error: '주소를 입력해주세요' }, { status: 400 })
    const id = randomUUID()
    const cnt = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) c FROM tire_addresses WHERE customer_id = ?`, customer.id)
    await prisma.$executeRawUnsafe(
      `INSERT INTO tire_addresses (id, customer_id, label, address, contact_name, contact_phone, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, customer.id, S(b.label, 100) || null, address,
      S(b.contact_name, 50) || null, S(b.contact_phone, 30) || null,
      N(cnt[0].c) === 0 ? 1 : 0)
    return NextResponse.json({ ok: true, id })
  }
  if (action === 'address-default') {
    await prisma.$executeRawUnsafe(`UPDATE tire_addresses SET is_default = 0 WHERE customer_id = ?`, customer.id)
    await prisma.$executeRawUnsafe(`UPDATE tire_addresses SET is_default = 1 WHERE id = ? AND customer_id = ?`, S(b.id, 36), customer.id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'address-delete') {
    await prisma.$executeRawUnsafe(`DELETE FROM tire_addresses WHERE id = ? AND customer_id = ?`, S(b.id, 36), customer.id)
    return NextResponse.json({ ok: true })
  }

  // ── 주문 신청 ──
  if (action === 'order') {
    const qty = Math.min(Math.max(1, N(b.qty) || 1), 20)
    let itemName = S(b.item_name, 200)
    let spec = S(b.spec, 100)
    let unitPrice = 0
    let catalogId: string | null = null
    if (b.catalog_id) {
      const cat = await prisma.$queryRawUnsafe<any[]>(
        `SELECT brand, model, spec, sale_price FROM tire_catalog WHERE id = ? AND active = 1`, S(b.catalog_id, 36))
      if (cat[0]) {
        itemName = `${cat[0].brand} ${cat[0].model}`
        spec = cat[0].spec
        unitPrice = N(cat[0].sale_price)
        catalogId = S(b.catalog_id, 36)
      }
    }
    if (!itemName) return NextResponse.json({ error: '타이어를 선택해주세요' }, { status: 400 })

    // 배송지: 저장된 것 선택
    let deliveryAddress: string | null = null
    if (b.address_id) {
      const a = await prisma.$queryRawUnsafe<any[]>(
        `SELECT label, address FROM tire_addresses WHERE id = ? AND customer_id = ?`, S(b.address_id, 36), customer.id)
      if (a[0]) deliveryAddress = `${a[0].label ? a[0].label + ' — ' : ''}${a[0].address}`
    }

    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO tire_sales (id, sale_date, customer_id, customer_name, customer_phone, car_number, delivery_address, item_name, spec, catalog_id, qty, unit_price, amount, status, fulfill_status, source, memo)
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', 'received', 'portal', ?)`,
      id, customer.id, customer.name, customer.phone || null,
      S(b.car_number, 30) || null, deliveryAddress,
      itemName, spec || null, catalogId, qty, unitPrice, unitPrice * qty,
      S(b.memo, 500) || null)
    return NextResponse.json({ ok: true, id })
  }

  return NextResponse.json({ error: '지원하지 않는 요청' }, { status: 400 })
}
