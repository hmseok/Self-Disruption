// ═══════════════════════════════════════════════════════════════
// /api/tire/catalog — 타이어 품목 카탈로그 (2026-08-07)
//   GET  ?q=          공개: active 품목 + 판매단가만 (신청 페이지용 — 매입가 노출 금지)
//   GET  ?admin=1     인증: 매입가·구매횟수 포함 전체
//   PATCH {id, sale_price?, active?}  인증: 판매단가/노출 설정
//   POST  {brand, model, spec, sale_price?}  인증: 수동 추가
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { randomUUID } from 'crypto'

const N = (v: unknown) => Number(v) || 0

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const isAdmin = sp.get('admin') === '1'

  if (isAdmin) {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM tire_catalog ORDER BY times_purchased DESC, brand, model`)
    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        purchase_price: r.purchase_price == null ? null : N(r.purchase_price),
        consumer_price: r.consumer_price == null ? null : N(r.consumer_price),
        sale_price: r.sale_price == null ? null : N(r.sale_price),
        times_purchased: N(r.times_purchased),
      })),
    })
  }

  // 공개 조회 — 매입가 제외
  const conds = ['active = 1']
  const args: unknown[] = []
  const brand = (sp.get('brand') || '').trim()
  const spec = (sp.get('spec') || '').trim()
  if (brand) { conds.push('brand = ?'); args.push(brand) }
  if (spec) { conds.push('spec = ?'); args.push(spec) }
  if (q) {
    // 숫자만 입력해도 규격 검색되게 (2454519 → 245/45R19)
    const dm = q.replace(/[^0-9]/g, '')
    if (dm.length === 7) {
      conds.push('(spec = ? OR brand LIKE ? OR model LIKE ?)')
      args.push(`${dm.slice(0, 3)}/${dm.slice(3, 5)}R${dm.slice(5, 7)}`, `%${q}%`, `%${q}%`)
    } else {
      conds.push('(brand LIKE ? OR model LIKE ? OR spec LIKE ?)')
      const like = `%${q}%`
      args.push(like, like, like)
    }
  }
  // 매입 이력 많은(우리가 실제 취급한) 품목 우선 노출
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, brand, model, spec, sale_price, purchase_price, stock_note, delivery_note FROM tire_catalog
     WHERE ${conds.join(' AND ')} ORDER BY times_purchased DESC, brand, model, spec LIMIT 200`, ...args)

  // 판매가 자동 마진율 모드 — 수동 sale_price 우선, 없으면 매입가×(1+마진%) 천원 올림
  const marginRow = await prisma.$queryRawUnsafe<any[]>(
    `SELECT setting_value FROM tire_settings WHERE setting_key = 'sale_margin_percent'`)
  const margin = Number(marginRow[0]?.setting_value)
  const auto = (p: unknown) => {
    const cost = N(p)
    if (!cost || !Number.isFinite(margin) || margin <= 0) return null
    return Math.ceil(cost * (1 + margin / 100) / 1000) * 1000
  }
  return NextResponse.json({
    rows: rows.map(r => {
      const manual = r.sale_price == null ? null : N(r.sale_price)
      const { purchase_price, ...pub } = r
      return { ...pub, sale_price: manual ?? auto(purchase_price) }
    }),
  })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })
  const sets: string[] = []
  const args: unknown[] = []
  if ('sale_price' in b) { sets.push('sale_price = ?'); args.push(b.sale_price === '' || b.sale_price == null ? null : N(b.sale_price)) }
  if ('active' in b) { sets.push('active = ?'); args.push(b.active ? 1 : 0) }
  if (!sets.length) return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })
  args.push(b.id)
  await prisma.$executeRawUnsafe(`UPDATE tire_catalog SET ${sets.join(', ')} WHERE id = ?`, ...args)
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json()
  if (!b.brand || !b.model || !b.spec) return NextResponse.json({ error: '브랜드/모델/규격은 필수입니다' }, { status: 400 })
  await prisma.$executeRawUnsafe(
    `INSERT INTO tire_catalog (id, brand, model, spec, sale_price)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE sale_price = COALESCE(VALUES(sale_price), sale_price), active = 1`,
    randomUUID(), String(b.brand).trim(), String(b.model).trim(), String(b.spec).trim(),
    b.sale_price != null && b.sale_price !== '' ? N(b.sale_price) : null)
  return NextResponse.json({ ok: true })
}
