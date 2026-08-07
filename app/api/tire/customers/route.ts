// ═══════════════════════════════════════════════════════════════
// /api/tire/customers — 거래처 관리 (ERP, 인증 필요, 2026-08-07)
//   GET    목록 (+신청 건수·최근 신청일)
//   POST   {name, phone?, memo?}  등록 → 전용 토큰 발급
//   PATCH  {id, name?, phone?, memo?, status?}  수정/비활성
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { randomUUID, randomBytes } from 'crypto'

const N = (v: unknown) => Number(v) || 0

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c.*,
      (SELECT COUNT(*) FROM tire_sales s WHERE s.customer_id = c.id) order_cnt,
      (SELECT MAX(s.created_at) FROM tire_sales s WHERE s.customer_id = c.id) last_order_at
    FROM tire_customers c ORDER BY c.created_at DESC`)
  return NextResponse.json({ rows: rows.map(r => ({ ...r, order_cnt: N(r.order_cnt) })) })
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  const name = String(b.name || '').trim()
  if (!name) return NextResponse.json({ error: '거래처명은 필수입니다' }, { status: 400 })

  const id = randomUUID()
  const token = randomBytes(6).toString('base64url').replace(/[-_]/g, 'a')  // 8자 영숫자
  await prisma.$executeRawUnsafe(
    `INSERT INTO tire_customers (id, token, name, phone, memo) VALUES (?, ?, ?, ?, ?)`,
    id, token, name.slice(0, 100), String(b.phone || '').trim().slice(0, 30) || null,
    String(b.memo || '').trim().slice(0, 300) || null)
  return NextResponse.json({ ok: true, id, token })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })
  const sets: string[] = []
  const args: unknown[] = []
  for (const k of ['name', 'phone', 'memo', 'status']) {
    if (k in b) { sets.push(`${k} = ?`); args.push(String(b[k] || '').trim() || null) }
  }
  if (!sets.length) return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })
  args.push(b.id)
  await prisma.$executeRawUnsafe(`UPDATE tire_customers SET ${sets.join(', ')} WHERE id = ?`, ...args)
  return NextResponse.json({ ok: true })
}
