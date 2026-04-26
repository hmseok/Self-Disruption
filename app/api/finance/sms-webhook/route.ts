import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createHash, randomUUID } from 'crypto'
import { parseSms, detectIssuer } from '@/lib/sms-parsers'
import { classifyByRules } from '@/lib/transaction-classifier'
import { resolveClientName } from '@/lib/client-name-aliases'

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
//   4) 카드/은행 자동 매칭 → corporate_cards / bank_account_mappings
//   5) transactions 테이블 자동 적재 + 차량 연결
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

  let from = (body.from || '').trim()
  let text = (body.text || '').trim()
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  // SMS Forwarder 앱 메시지 형식 전처리:
  // 1) "보낸사람 : 01050349550 homin seok: [Web발신]..." → 발신번호 추출 + 접두어 제거
  const prefixMatch = text.match(/^보낸사람\s*:\s*([\d+\-\s]+)\s*/)
  if (prefixMatch) {
    if (!from) from = prefixMatch[1].replace(/[\s\-]/g, '')
    text = text.slice(prefixMatch[0].length).trim()
  }

  // 2) "homin seok: [Web발신]..." → 이름: 접두어 제거 (영문/한글 이름 뒤 콜론)
  text = text.replace(/^[A-Za-z가-힣\s]+:\s*/, '')

  // 3) [Web발신] 제거 (위치 무관)
  text = text.replace(/\[Web발신\]\s*/g, '').trim()

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
  const parseStatus = parsed ? 'parsed' : (issuer === 'UNKNOWN' ? 'ignored' : 'failed')
  const parseError = parsed ? null : (issuer === 'UNKNOWN' ? 'non-financial SMS' : 'parser returned null — unknown format')

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

  // ── 6. 자동 매칭 + 거래 생성 (PHASE 2) ──────────────────
  let cardId: string | null = null
  let carId: string | null = null
  let transactionId: string | null = null

  if (parsed && parsed.card_alias) {
    try {
      // 카드 매칭: card_alias로 corporate_cards 조회
      const cards = await prisma.$queryRaw<Array<{ id: string; assigned_car_id: string | null }>>`
        SELECT id, assigned_car_id FROM corporate_cards
        WHERE card_alias = ${parsed.card_alias} LIMIT 1
      `
      if (cards.length > 0) {
        cardId = cards[0].id
        carId = cards[0].assigned_car_id
        // SMS 레코드에 card_id 연결
        await prisma.$executeRaw`
          UPDATE card_sms_transactions SET card_id = ${cardId} WHERE id = ${id}
        `
      }
    } catch { /* 카드 미등록 — 정상 */ }
  }

  // 은행 SMS인 경우 bank_account_mappings 조회
  if (parsed && !cardId && (parsed.issuer === 'WOORI_BANK' || parsed.issuer === 'KB_BANK') && parsed.card_alias) {
    try {
      const bankAccounts = await prisma.$queryRaw<Array<{ id: string; assigned_car_id: string | null; purpose: string | null }>>`
        SELECT id, assigned_car_id, purpose FROM bank_account_mappings
        WHERE account_alias = ${parsed.card_alias} LIMIT 1
      `
      if (bankAccounts.length > 0) {
        carId = bankAccounts[0].assigned_car_id
      }
    } catch { /* 테이블 미생성 또는 미등록 — 정상 */ }
  }

  // 거래(transactions) 자동 생성 + PHASE 3 자동 분류
  let autoCategory: string | null = null
  let autoConfidence: number | null = null
  let classificationTier: string | null = null

  if (parsed && parsed.amount) {
    try {
      const txDate = parsed.txAt || receivedAt
      const txType = (parsed.type === 'deposit') ? 'income' : 'expense'
      transactionId = randomUUID()

      // ── PHASE 3: 규칙 기반 1차 자동 분류 ──
      const ruleResult = classifyByRules(parsed.merchant, txType)
      if (ruleResult) {
        autoCategory = ruleResult.category
        autoConfidence = ruleResult.confidence
        classificationTier = ruleResult.tier
      }

      await prisma.$executeRaw`
        INSERT INTO transactions (
          id, transaction_date, type, amount, description, client_name,
          card_company, imported_from, related_type, related_id,
          category, status, created_at, updated_at
        ) VALUES (
          ${transactionId}, ${txDate}, ${txType}, ${parsed.amount},
          ${parsed.merchant || parsed.issuer}, ${await resolveClientName(parsed.holder || '')},
          ${parsed.issuer}, 'sms',
          ${carId ? 'car' : null}, ${carId},
          ${ruleResult && ruleResult.tier === 'auto' ? ruleResult.category : null},
          'completed', NOW(), NOW()
        )
      `
      // SMS 레코드에 transaction_id 연결
      await prisma.$executeRaw`
        UPDATE card_sms_transactions SET transaction_id = ${transactionId} WHERE id = ${id}
      `
    } catch (e) {
      // 거래 생성 실패해도 SMS 저장은 유지
      transactionId = null
    }
  }

  return NextResponse.json({
    status: parseStatus,
    id,
    linked: { cardId, carId, transactionId },
    classification: autoCategory ? {
      category: autoCategory,
      confidence: autoConfidence,
      tier: classificationTier,
    } : null,
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
