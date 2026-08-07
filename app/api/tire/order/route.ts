// ═══════════════════════════════════════════════════════════════
// /api/tire/order — ERP에서 블랙서클 발주 (2026-08-07)
//   GET  ?sale_id=   발주 전 확인 — 현재 시세·재고·배송옵션 (읽기 전용)
//   POST {sale_id, delivery_select, qty?}  장바구니 담기 + 판매건 '주문완료' 기록
//        결제 확정은 블랙서클 화면에서 사람이 누름 (오발주 방지)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { bcSession, bcQuote, bcAddToCart, DELIVERY_LABEL } from '@/lib/blackcircle'

export const maxDuration = 120

const N = (v: unknown) => Number(v) || 0

/** 판매건 → 카탈로그 품목 (catalog_id 우선, 없으면 품명+규격 매칭) */
async function resolveCatalog(sale: any) {
  if (sale.catalog_id) {
    const r = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM tire_catalog WHERE id = ?`, sale.catalog_id)
    if (r[0]) return r[0]
  }
  const name = String(sale.item_name || '').trim()
  const spec = String(sale.spec || '').trim()
  if (!name || !spec) return null
  const r = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM tire_catalog WHERE spec = ? AND CONCAT(brand, ' ', model) = ? LIMIT 1`, spec, name)
  if (r[0]) return r[0]
  const loose = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM tire_catalog WHERE spec = ? AND (? LIKE CONCAT('%', model, '%') OR model LIKE CONCAT('%', ?, '%'))
     ORDER BY times_purchased DESC LIMIT 1`, spec, name, name)
  return loose[0] || null
}

async function loadSale(id: string) {
  const r = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM tire_sales WHERE id = ?`, id)
  return r[0] || null
}

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const saleId = req.nextUrl.searchParams.get('sale_id') || ''
  const sale = await loadSale(saleId)
  if (!sale) return NextResponse.json({ error: '판매 건을 찾을 수 없습니다' }, { status: 404 })

  const cat = await resolveCatalog(sale)
  if (!cat) return NextResponse.json({ error: `카탈로그에서 품목을 찾지 못했습니다 (${sale.item_name} ${sale.spec}) — 품목·단가 탭에서 확인해주세요` }, { status: 400 })
  if (!cat.io_no || !cat.it_id || !cat.ca_id) {
    return NextResponse.json({ error: '이 품목은 발주 식별자가 없습니다 — 블랙서클 동기화를 한 번 실행해주세요' }, { status: 400 })
  }

  try {
    const cookie = await bcSession()
    const quote = await bcQuote(cookie, cat.io_no, cat.it_id, cat.ca_id)
    return NextResponse.json({
      sale: {
        id: sale.id, item_name: sale.item_name, spec: sale.spec, qty: N(sale.qty),
        customer_name: sale.customer_name, car_number: sale.car_number,
        delivery_address: sale.delivery_address, amount: N(sale.amount),
        ordered_at: sale.ordered_at,
      },
      catalog: { id: cat.id, brand: cat.brand, model: cat.model, spec: cat.spec, purchase_price: N(cat.purchase_price) },
      options: quote.options,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '시세 조회 실패' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  const sale = await loadSale(String(b.sale_id || ''))
  if (!sale) return NextResponse.json({ error: '판매 건을 찾을 수 없습니다' }, { status: 404 })
  if (sale.ordered_at) return NextResponse.json({ error: '이미 발주한 건입니다' }, { status: 400 })

  const cat = await resolveCatalog(sale)
  if (!cat?.io_no || !cat?.it_id || !cat?.ca_id) {
    return NextResponse.json({ error: '발주 가능한 품목 정보를 찾지 못했습니다' }, { status: 400 })
  }

  const qty = Math.max(1, N(b.qty) || N(sale.qty) || 1)
  const deliverySelect = String(b.delivery_select || '2')

  try {
    const cookie = await bcSession()
    // 발주 직전 시세·재고 재확인 (담기 후 가격이 달라지는 사고 방지)
    const quote = await bcQuote(cookie, cat.io_no, cat.it_id, cat.ca_id)
    const opt = quote.options.find(o => o.code === deliverySelect)
    if (!opt) return NextResponse.json({ error: '선택한 배송 방법은 현재 이용할 수 없습니다' }, { status: 400 })
    if (opt.stock < qty) return NextResponse.json({ error: `재고 부족 — 현재 ${opt.stock}개 (요청 ${qty}개)` }, { status: 400 })

    const r = await bcAddToCart(cookie, {
      ioNo: cat.io_no, itId: cat.it_id, caId: cat.ca_id, qty, deliverySelect,
    })
    if (!r.ok) return NextResponse.json({ error: `장바구니 담기 실패: ${r.message || r.code}` }, { status: 500 })

    const cost = opt.price * qty + (opt.deliveryFee || 0)
    const note = `${DELIVERY_LABEL[deliverySelect] || deliverySelect} · 매입 ${opt.price.toLocaleString()}×${qty}${opt.deliveryFee ? ` + 배송비 ${opt.deliveryFee.toLocaleString()}` : ''}`
    await prisma.$executeRawUnsafe(
      `UPDATE tire_sales SET ordered_at = NOW(), order_note = ?, purchase_cost = ?, fulfill_status = 'ordered',
         catalog_id = COALESCE(catalog_id, ?), status = CASE WHEN status = 'requested' THEN 'unbilled' ELSE status END
       WHERE id = ?`,
      note, cost, cat.id, sale.id)

    return NextResponse.json({
      ok: true,
      cartUrl: 'https://blackcircles.co.kr/shop/cart.php',
      cost, unitPrice: opt.price, deliveryFee: opt.deliveryFee, qty,
      note,
    })
  } catch (e: any) {
    console.error('[tire/order] 실패:', e)
    return NextResponse.json({ error: e.message || '발주 실패' }, { status: 500 })
  }
}
