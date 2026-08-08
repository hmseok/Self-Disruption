// ═══════════════════════════════════════════════════════════════
// /api/violations — 과태료·통행료 미납 관리 (2026-08-08)
//   GET    ?status&q&days     목록 + 요약
//   POST   {car_number, violation_at, vtype, amount, ...} 등록 — 당시 운행 고객 자동 매칭
//   PATCH  {id, ...}          수정 (상태·고객·금액 등)
//   DELETE ?id
// 자동 매칭: 위반 일시가 단기 배차(fmi_rentals) 또는 장기계약(long_term_rentals) 기간에
//   해당하면 그 고객을 제안 (수동 수정 가능)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'
import { randomUUID } from 'crypto'

const N = (v: unknown) => Number(v) || 0
const digits = (s: unknown) => String(s || '').replace(/[^0-9]/g, '')

/** 위반 일시 기준 당시 고객 찾기 — 단기 배차 우선, 없으면 장기계약 */
async function matchCustomer(carNumber: string, violationAt: string): Promise<{
  source: string; id: string; name: string | null; phone: string | null
} | null> {
  const d = digits(carNumber)
  if (!d) return null

  // 단기 배차: dispatch_date ~ (actual_return_date | expected_return_date | +30일)
  const rentals = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, customer_name, customer_phone, vehicle_car_number, dispatch_date,
      COALESCE(actual_return_date, expected_return_date) ret
    FROM fmi_rentals
    WHERE dispatch_date IS NOT NULL AND dispatch_date <= ?
    ORDER BY dispatch_date DESC LIMIT 500`, violationAt)
  for (const r of rentals) {
    if (digits(r.vehicle_car_number) !== d) continue
    const end = r.ret ? new Date(r.ret) : new Date(new Date(r.dispatch_date).getTime() + 30 * 86400000)
    if (new Date(violationAt) <= end) {
      return { source: 'fmi_rental', id: r.id, name: r.customer_name, phone: r.customer_phone }
    }
  }

  // 장기계약: start_date ~ (end_date | 진행중)
  const lts = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, customer_name, customer_phone, vehicle_car_number, start_date, end_date
    FROM long_term_rentals
    WHERE start_date IS NOT NULL AND start_date <= ?
    ORDER BY start_date DESC LIMIT 200`, violationAt)
  for (const r of lts) {
    if (digits(r.vehicle_car_number) !== d) continue
    if (!r.end_date || new Date(violationAt) <= new Date(String(r.end_date) + 'T23:59:59')) {
      return { source: 'long_term', id: r.id, name: r.customer_name, phone: r.customer_phone }
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const status = sp.get('status')
  const q = sp.get('q')
  const conds: string[] = ['1=1']
  const args: unknown[] = []
  if (status) { conds.push('status = ?'); args.push(status) }
  if (q?.trim()) {
    conds.push('(car_number LIKE ? OR customer_name LIKE ? OR notice_no LIKE ? OR agency LIKE ?)')
    const like = `%${q.trim()}%`
    args.push(like, like, like, like)
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM vehicle_violations WHERE ${conds.join(' AND ')}
    ORDER BY violation_at DESC LIMIT 500`, ...args)
  const sum = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*) cnt,
      SUM(status='open') open_cnt, SUM(CASE WHEN status='open' THEN amount ELSE 0 END) open_amt,
      SUM(status='billed') billed_cnt, SUM(CASE WHEN status='billed' THEN amount ELSE 0 END) billed_amt,
      SUM(status IN ('customer_paid','company_paid')) done_cnt,
      SUM(CASE WHEN status='company_paid' THEN amount ELSE 0 END) company_amt
    FROM vehicle_violations`)

  return NextResponse.json({
    rows: rows.map(r => ({ ...r, amount: N(r.amount) })),
    summary: {
      cnt: N(sum[0]?.cnt),
      open: { cnt: N(sum[0]?.open_cnt), amt: N(sum[0]?.open_amt) },
      billed: { cnt: N(sum[0]?.billed_cnt), amt: N(sum[0]?.billed_amt) },
      done: N(sum[0]?.done_cnt),
      companyAmt: N(sum[0]?.company_amt),
    },
  })
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  const carNumber = String(b.car_number || '').trim()
  const violationAt = String(b.violation_at || '').trim()
  if (!carNumber || !violationAt) return NextResponse.json({ error: '차량번호와 위반 일시는 필수입니다' }, { status: 400 })

  // 당시 고객 자동 매칭 (수동 지정이 오면 그대로)
  let matched: Awaited<ReturnType<typeof matchCustomer>> = null
  if (!b.customer_name) matched = await matchCustomer(carNumber, violationAt.replace('T', ' '))

  const id = randomUUID()
  await prisma.$executeRawUnsafe(`
    INSERT INTO vehicle_violations
      (id, car_number, violation_at, vtype, amount, notice_no, agency, due_date,
       matched_source, matched_id, customer_name, customer_phone, status, memo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    id, carNumber, violationAt.replace('T', ' '),
    String(b.vtype || '기타').slice(0, 30), N(b.amount),
    String(b.notice_no || '').trim().slice(0, 60) || null,
    String(b.agency || '').trim().slice(0, 100) || null,
    b.due_date || null,
    b.customer_name ? 'manual' : matched?.source || null,
    matched?.id || null,
    String(b.customer_name || '').trim() || matched?.name || null,
    String(b.customer_phone || '').trim() || matched?.phone || null,
    String(b.memo || '').trim().slice(0, 500) || null)

  return NextResponse.json({
    ok: true, id,
    matched: matched ? { source: matched.source, name: matched.name } : null,
  })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })

  // 재매칭 요청
  if (b.action === 'rematch') {
    const row = (await prisma.$queryRawUnsafe<any[]>(`SELECT car_number, violation_at FROM vehicle_violations WHERE id = ?`, b.id))[0]
    if (!row) return NextResponse.json({ error: '건을 찾을 수 없습니다' }, { status: 404 })
    const m = await matchCustomer(row.car_number, String(row.violation_at).slice(0, 19).replace('T', ' '))
    if (!m) return NextResponse.json({ ok: true, matched: null })
    await prisma.$executeRawUnsafe(
      `UPDATE vehicle_violations SET matched_source=?, matched_id=?, customer_name=?, customer_phone=? WHERE id=?`,
      m.source, m.id, m.name, m.phone, b.id)
    return NextResponse.json({ ok: true, matched: m })
  }

  const ALLOWED = ['car_number', 'violation_at', 'vtype', 'amount', 'notice_no', 'agency', 'due_date', 'customer_name', 'customer_phone', 'status', 'memo']
  const sets: string[] = []
  const args: unknown[] = []
  for (const k of ALLOWED) {
    if (k in b) { sets.push(`${k} = ?`); args.push(b[k] === '' ? null : b[k]) }
  }
  if (!sets.length) return NextResponse.json({ error: '변경 항목 없음' }, { status: 400 })
  args.push(b.id)
  await prisma.$executeRawUnsafe(`UPDATE vehicle_violations SET ${sets.join(', ')} WHERE id = ?`, ...args)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })
  await prisma.$executeRawUnsafe(`DELETE FROM vehicle_violations WHERE id = ?`, id)
  return NextResponse.json({ ok: true })
}
