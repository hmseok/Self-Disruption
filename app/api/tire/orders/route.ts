// ═══════════════════════════════════════════════════════════════
// /api/tire/orders — 블랙서클 주문내역 동기화 · 주문취소 (2026-08-07)
//   GET  ?days=30        주문내역 조회 + 판매건 자동 매칭·상태 반영
//   POST {sale_id, action:'cancel'}   주문 취소 (블랙서클 + ERP 원복)
// 매칭: 발주 이후 날짜 + 규격 + 수량 일치 건
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { bcSession, bcFetchOrders, bcCancelOrder, BC_STATUS_TO_FULFILL } from '@/lib/blackcircle'
import { randomUUID } from 'crypto'

export const maxDuration = 120

const N = (v: unknown) => Number(v) || 0
const ymd = (d: Date) => d.toISOString().slice(0, 10)

export async function GET(req: NextRequest) {
  const cronOk = Boolean(process.env.CRON_SECRET) && req.headers.get('x-cron-secret') === process.env.CRON_SECRET
  if (!cronOk) {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Math.min(N(req.nextUrl.searchParams.get('days')) || 30, 365)
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400000)

  try {
    const cookie = await bcSession()
    const orders = await bcFetchOrders(cookie, ymd(from), ymd(to))

    // 발주된 판매건과 매칭 (규격+수량, 발주일 이후, 아직 od_id 없는 건 우선)
    const sales = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, spec, qty, ordered_at, bc_od_id FROM tire_sales
       WHERE ordered_at IS NOT NULL AND ordered_at >= ? ORDER BY ordered_at DESC`, from)

    let matched = 0, statusUpdated = 0
    const usedOd = new Set(sales.map(s => s.bc_od_id).filter(Boolean))

    for (const s of sales) {
      let od = s.bc_od_id ? orders.find(o => o.odId === s.bc_od_id) : null
      if (!od) {
        od = orders.find(o =>
          !usedOd.has(o.odId) &&
          o.spec && s.spec && o.spec === s.spec &&
          o.qty === N(s.qty) &&
          new Date(o.date + 'T23:59:59') >= new Date(s.ordered_at)) || null
        if (od) { usedOd.add(od.odId); matched += 1 }
      }
      if (!od) continue

      const fulfill = od.status === '취소완료' ? null : (BC_STATUS_TO_FULFILL[od.status || ''] || null)
      await prisma.$executeRawUnsafe(
        `UPDATE tire_sales SET bc_od_id = ?, bc_ct_id = ?, bc_status = ?,
           fulfill_status = COALESCE(?, fulfill_status),
           ordered_at = CASE WHEN ? = '취소완료' THEN NULL ELSE ordered_at END
         WHERE id = ?`,
        od.odId, od.ctId, od.status, fulfill, od.status || '', s.id)
      statusUpdated += 1
    }

    // 주문 ↔ 판매건 연결 현황 (미등록 주문 구분용)
    const linked = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, bc_od_id, customer_name, car_number, item_name, spec, amount, status
       FROM tire_sales WHERE bc_od_id IS NOT NULL`)
    const byOd = new Map(linked.map(l => [l.bc_od_id, l]))

    const enriched = orders.map(o => {
      const s = byOd.get(o.odId)
      return {
        ...o,
        canceled: o.status === '취소완료',
        sale: s ? {
          id: s.id, customer_name: s.customer_name, car_number: s.car_number,
          item_name: s.item_name, amount: N(s.amount), status: s.status,
        } : null,
      }
    })

    return NextResponse.json({
      ok: true,
      orders: enriched,
      matched, statusUpdated,
      counts: {
        total: enriched.length,
        linked: enriched.filter(o => o.sale).length,
        unlinked: enriched.filter(o => !o.sale && !o.canceled).length,
        canceled: enriched.filter(o => o.canceled).length,
      },
    })
  } catch (e: any) {
    console.error('[tire/orders] 실패:', e)
    return NextResponse.json({ error: e.message || '주문내역 조회 실패' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()

  // ── 블랙서클 직접 주문 → 판매건으로 등록 ──
  if (b.action === 'import') {
    const odId = String(b.od_id || '')
    if (!odId) return NextResponse.json({ error: '주문번호 누락' }, { status: 400 })
    const dup = await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM tire_sales WHERE bc_od_id = ?`, odId)
    if (dup[0]) return NextResponse.json({ error: '이미 등록된 주문입니다' }, { status: 400 })

    const spec = String(b.spec || '').trim()
    const qty = Math.max(1, N(b.qty) || 1)
    const cost = N(b.total) || null
    const text = String(b.text || '')

    // 카탈로그에서 품목 찾기 (규격 일치 + 설명에 모델명 포함)
    let itemName: string | null = null
    let catalogId: string | null = null
    if (spec) {
      const cands = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, brand, model FROM tire_catalog WHERE spec = ? ORDER BY times_purchased DESC LIMIT 60`, spec)
      const hit = cands.find(c => text.replace(/\s/g, '').includes(String(c.model).replace(/\s/g, '')))
      if (hit) { itemName = `${hit.brand} ${hit.model}`; catalogId = hit.id }
    }
    if (!itemName) itemName = text.slice(0, 80) || '(품목 미상)'

    const fulfill = b.status === '취소완료' ? null : (BC_STATUS_TO_FULFILL[String(b.status || '')] || 'ordered')
    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO tire_sales (id, sale_date, item_name, spec, catalog_id, qty, unit_price, amount, purchase_cost,
         status, fulfill_status, source, ordered_at, order_note, bc_od_id, bc_status, memo)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'unbilled', ?, 'bc_order', ?, ?, ?, ?, ?)`,
      id, b.date || new Date(), itemName, spec || null, catalogId, qty, cost,
      fulfill, b.date ? new Date(String(b.date) + 'T00:00:00') : new Date(),
      `블랙서클 직접 주문 ${odId}`, odId, b.status || null,
      String(b.memo || '').slice(0, 500) || null)

    return NextResponse.json({ ok: true, id, item_name: itemName, matchedCatalog: Boolean(catalogId) })
  }

  if (b.action !== 'cancel') return NextResponse.json({ error: '지원하지 않는 action' }, { status: 400 })

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM tire_sales WHERE id = ?`, String(b.sale_id || ''))
  const sale = rows[0]
  if (!sale) return NextResponse.json({ error: '판매 건을 찾을 수 없습니다' }, { status: 404 })
  if (!sale.ordered_at) return NextResponse.json({ error: '발주되지 않은 건입니다' }, { status: 400 })

  try {
    // 블랙서클 주문이 잡혀 있으면 취소 요청, 아직 장바구니 단계면 ERP 상태만 원복
    let message = '발주 기록을 취소했습니다 (블랙서클 주문 전 단계 — 장바구니에서 직접 빼주세요)'
    if (sale.bc_ct_id) {
      const cookie = await bcSession()
      const r = await bcCancelOrder(cookie, sale.bc_ct_id)
      if (!r.ok) return NextResponse.json({ error: `블랙서클 취소 실패: ${r.message}` }, { status: 500 })
      message = r.message
    } else if (sale.bc_od_id) {
      return NextResponse.json({
        error: '이 주문은 블랙서클에서 취소할 수 없는 상태입니다 (배송중/완료 등) — 블랙서클 고객센터로 문의해주세요',
      }, { status: 400 })
    }

    await prisma.$executeRawUnsafe(
      `UPDATE tire_sales SET ordered_at = NULL, order_note = NULL, purchase_cost = NULL,
         bc_ct_id = NULL, bc_status = '취소완료', fulfill_status = 'confirmed'
       WHERE id = ?`, sale.id)

    return NextResponse.json({ ok: true, message })
  } catch (e: any) {
    console.error('[tire/orders cancel] 실패:', e)
    return NextResponse.json({ error: e.message || '취소 실패' }, { status: 500 })
  }
}
