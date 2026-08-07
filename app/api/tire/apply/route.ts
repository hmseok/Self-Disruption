// ═══════════════════════════════════════════════════════════════
// POST /api/tire/apply — 타이어 주문 신청 (공개 — 인증 없음, 2026-08-07)
// 신청 페이지(/tire/apply)에서 고객이 직접 제출 → tire_sales status='requested'
// 참고가(sale_price)가 있으면 금액 자동 산정 — 확정은 대표가 판매내역에서
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const N = (v: unknown) => Number(v) || 0
const S = (v: unknown, max: number) => String(v || '').trim().slice(0, max)

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const name = S(b.customer_name, 100)
    const phone = S(b.customer_phone, 30)
    if (!name || !phone) return NextResponse.json({ error: '이름과 연락처는 필수입니다' }, { status: 400 })

    const qty = Math.min(Math.max(1, N(b.qty) || 1), 20)

    // 카탈로그 품목 선택 시 참고가 조회 (서버에서 재조회 — 클라이언트 금액 신뢰 안 함)
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

    const id = randomUUID()
    await prisma.$executeRawUnsafe(
      `INSERT INTO tire_sales (id, sale_date, customer_name, customer_phone, car_number, delivery_address, item_name, spec, catalog_id, qty, unit_price, amount, status, fulfill_status, source, memo)
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', 'received', 'apply', ?)`,
      id, name, phone, S(b.car_number, 30) || null, S(b.delivery_address, 300) || null,
      itemName || null, spec || null, catalogId, qty, unitPrice, unitPrice * qty,
      S(b.memo, 500) || null)

    return NextResponse.json({ ok: true, id })
  } catch (e) {
    console.error('[tire/apply] 실패:', e)
    return NextResponse.json({ error: '신청 처리에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }
}
