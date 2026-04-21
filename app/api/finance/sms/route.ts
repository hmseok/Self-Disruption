import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyUser } from '@/lib/auth-server'

// ═══════════════════════════════════════════════════════════
// SMS 관리 API — 관리자 UI 전용 (인증 필수)
//   GET    /api/finance/sms          수신 로그 목록 (필터/페이지)
//   DELETE /api/finance/sms?id=...   단일 삭제
//   PATCH  /api/finance/sms          수동 파싱 결과 반영
// ═══════════════════════════════════════════════════════════

// ── GET: 목록 ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || '' // parsed, failed, canceled
  const issuer = sp.get('issuer') || '' // KB, WOORI, HYUNDAI
  const limit = Math.min(Number(sp.get('limit') || 200), 500)

  let rows: any[]
  if (status && issuer) {
    rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM card_sms_transactions
      WHERE parse_status = ${status} AND card_issuer = ${issuer}
      ORDER BY received_at DESC LIMIT ${limit}
    `
  } else if (status) {
    rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM card_sms_transactions
      WHERE parse_status = ${status}
      ORDER BY received_at DESC LIMIT ${limit}
    `
  } else if (issuer) {
    rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM card_sms_transactions
      WHERE card_issuer = ${issuer}
      ORDER BY received_at DESC LIMIT ${limit}
    `
  } else {
    rows = await prisma.$queryRaw<any[]>`
      SELECT * FROM card_sms_transactions
      ORDER BY received_at DESC LIMIT ${limit}
    `
  }

  // 통계
  const stats = await prisma.$queryRaw<Array<{ parse_status: string; cnt: bigint; total: any }>>`
    SELECT parse_status,
           COUNT(*) as cnt,
           COALESCE(SUM(CASE WHEN transaction_type='approved' THEN amount ELSE -amount END), 0) as total
    FROM card_sms_transactions
    WHERE received_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY parse_status
  `

  return NextResponse.json({
    rows: rows.map((r: any) => ({
      ...r,
      amount: r.amount !== null && r.amount !== undefined ? Number(r.amount) : null,
    })),
    stats: stats.map(s => ({
      status: s.parse_status,
      count: Number(s.cnt),
      total: Number(s.total || 0),
    })),
  })
}

// ── DELETE: 단건 ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.$executeRaw`DELETE FROM card_sms_transactions WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}

// ── PATCH: 수동 파싱 결과 반영 ──────────────────────
export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    id,
    card_issuer,
    card_alias,
    holder_name,
    transaction_type,
    transaction_at,
    amount,
    merchant,
    installment,
  } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.$executeRaw`
    UPDATE card_sms_transactions SET
      parse_status = 'parsed',
      parse_error = NULL,
      card_issuer = ${card_issuer || null},
      card_alias = ${card_alias || null},
      holder_name = ${holder_name || null},
      transaction_type = ${transaction_type || 'approved'},
      transaction_at = ${transaction_at ? new Date(transaction_at) : null},
      amount = ${amount !== undefined && amount !== null ? Number(amount) : null},
      merchant = ${merchant || null},
      installment = ${installment || null},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `
  return NextResponse.json({ ok: true })
}
