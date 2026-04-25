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

// ── POST: 실패 건 재파싱 ──────────────────────────
export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { parseSms, detectIssuer } = await import('@/lib/sms-parsers')

  // 실패 건 모두 조회
  const failedRows = await prisma.$queryRaw<Array<{ id: string; raw_text: string; sender: string | null }>>`
    SELECT id, raw_text, sender FROM card_sms_transactions WHERE parse_status = 'failed'
  `

  let fixed = 0
  for (const row of failedRows) {
    let text = (row.raw_text || '').trim()
    let sender = row.sender || ''

    // 웹훅 전처리 재적용
    // 1) "보낸사람 : 번호" 제거
    const prefixMatch = text.match(/^보낸사람\s*:\s*([\d+\-\s]+)\s*/)
    if (prefixMatch) {
      if (!sender) sender = prefixMatch[1].replace(/[\s\-]/g, '')
      text = text.slice(prefixMatch[0].length).trim()
    }
    // 2) "이름: " 접두어 제거 (영문/한글)
    text = text.replace(/^[A-Za-z가-힣\s]+:\s*/, '')
    // 3) [Web발신] 제거 (위치 무관)
    text = text.replace(/\[Web발신\]\s*/g, '').trim()

    const issuer = detectIssuer(sender || null, text)
    const parsed = parseSms(sender || null, text)

    if (parsed) {
      await prisma.$executeRaw`
        UPDATE card_sms_transactions SET
          raw_text = ${text},
          sender = ${sender || null},
          parse_status = 'parsed',
          parse_error = NULL,
          card_issuer = ${parsed.issuer},
          card_alias = ${parsed.card_alias || null},
          holder_name = ${parsed.holder || null},
          transaction_type = ${parsed.type},
          transaction_at = ${parsed.txAt || null},
          amount = ${parsed.amount},
          merchant = ${parsed.merchant || null},
          installment = ${parsed.installment || null},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${row.id}
      `
      fixed++
    } else if (issuer === 'UNKNOWN') {
      // 카드/은행 SMS가 아닌 일반 문자 → ignored 처리
      await prisma.$executeRaw`
        UPDATE card_sms_transactions SET
          parse_status = 'ignored',
          parse_error = 'non-financial SMS',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${row.id}
      `
    }
  }

  const ignored = failedRows.length - fixed
  return NextResponse.json({ ok: true, total: failedRows.length, fixed, ignored })
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
