import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createHash, randomUUID } from 'crypto'
import { parseSms, detectIssuer } from '@/lib/sms-parsers'

// ═══════════════════════════════════════════════════════════
// SMS 웹훅 — 안드로이드 공기계 SMS Forwarder 수신 엔드포인트
//
// 요청:
//   POST /api/finance/sms-webhook
//   Headers: X-Sms-Token: <SMS_WEBHOOK_TOKEN>
//   Body: { from: string, text: string, receivedAt?: ISO8601 }
//
// 동작:
//   1) 토큰 검증 (env SMS_WEBHOOK_TOKEN)
//   2) raw_hash 계산 → 중복 skip
//   3) 파서 실행 → 성공 시 parse_status='parsed', 실패 시 'failed'
//   4) 취소 SMS 라면 같은 금액 승인 건 매칭 (TODO: Phase 2)
//   5) transactions 테이블로 자동 적재 (TODO: Phase 2 — 우선 SMS만 쌓음)
//
// 보안:
//   · 토큰은 long random string (env 로 주입)
//   · IP 화이트리스트는 Cloud Run 앞단이 아닌 앱 레벨에서 (선택)
// ═══════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  // ── 1. 토큰 검증 ─────────────────────────────────────
  const expectedToken = process.env.SMS_WEBHOOK_TOKEN
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'SMS_WEBHOOK_TOKEN not configured on server' },
      { status: 500 }
    )
  }
  const token = req.headers.get('x-sms-token') || ''
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. 페이로드 파싱 ─────────────────────────────────
  let body: { from?: string; text?: string; receivedAt?: string; sentStamp?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const from = (body.from || '').trim()
  const text = (body.text || '').trim()
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  let receivedAt = new Date()
  try {
    if (body.receivedAt) {
      const d = new Date(body.receivedAt)
      if (Number.isFinite(d.getTime())) receivedAt = d
    } else if (body.sentStamp) {
      const stamp = typeof body.sentStamp === 'string' ? Number(body.sentStamp) : body.sentStamp
      if (stamp > 0) {
        // 13자리 = ms, 10자리 = seconds
        const ms = stamp > 9999999999 ? stamp : stamp * 1000
        const d = new Date(ms)
        if (Number.isFinite(d.getTime())) receivedAt = d
      }
    }
  } catch {
    // fallback to now
  }

  // ── 3. 중복 체크 (raw_hash) ───────────────────────────
  const raw_hash = createHash('sha256').update(`${from}|${text}`).digest('hex')
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM card_sms_transactions WHERE raw_hash = ${raw_hash} LIMIT 1
  `
  if (existing.length > 0) {
    return NextResponse.json({ status: 'duplicate', id: existing[0].id })
  }

  // ── 4. 파싱 ──────────────────────────────────────────
  const issuer = detectIssuer(from || null, text)
  const parsed = parseSms(from || null, text)

  const id = randomUUID()
  const parseStatus = parsed ? 'parsed' : 'failed'
  const parseError = parsed ? null : 'parser returned null — unknown format'

  // ── 5. DB 적재 ───────────────────────────────────────
  await prisma.$executeRaw`
    INSERT INTO card_sms_transactions (
      id, raw_text, raw_hash, sender, received_at,
      parse_status, parse_error,
      card_issuer, card_alias, holder_name,
      transaction_type, transaction_at, amount, merchant, installment
    ) VALUES (
      ${id}, ${text}, ${raw_hash}, ${from || null}, ${receivedAt},
      ${parseStatus}, ${parseError},
      ${parsed?.issuer || (issuer !== 'UNKNOWN' ? issuer : null)},
      ${parsed?.card_alias || null},
      ${parsed?.holder || null},
      ${parsed?.type || 'approved'},
      ${parsed?.txAt || null},
      ${parsed?.amount || null},
      ${parsed?.merchant || null},
      ${parsed?.installment || null}
    )
  `

  return NextResponse.json({
    status: parseStatus,
    id,
    parsed: parsed ? {
      issuer: parsed.issuer,
      type: parsed.type,
      holder: parsed.holder,
      amount: parsed.amount,
      merchant: parsed.merchant,
      installment: parsed.installment,
      txAt: parsed.txAt,
    } : null,
  })
}

// ── GET: 헬스체크 ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.headers.get('x-sms-token') || ''
  const expectedToken = process.env.SMS_WEBHOOK_TOKEN
  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ ok: true, endpoint: 'sms-webhook' })
  }
  // 토큰 맞으면 최근 수신 통계 반환
  const stats = await prisma.$queryRaw<Array<{ parse_status: string; cnt: bigint }>>`
    SELECT parse_status, COUNT(*) as cnt
    FROM card_sms_transactions
    WHERE received_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY parse_status
  `
  return NextResponse.json({
    ok: true,
    last7days: stats.map(s => ({ status: s.parse_status, count: Number(s.cnt) })),
  })
}
