import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createHash, randomUUID } from 'crypto'
import { parseSms, detectIssuer, isNonTransactionSms } from '@/lib/sms-parsers'
import { classifyByRules } from '@/lib/transaction-classifier'
import { resolveClientName } from '@/lib/client-name-aliases'
import { resolveAccountLast4 } from '@/lib/last4-match'

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
  const isNonTx = isNonTransactionSms(text)  // 승인거절/한도초과/결제거절 등

  const id = randomUUID()
  const parseStatus = parsed
    ? 'parsed'
    : isNonTx
      ? 'ignored'
      : (issuer === 'UNKNOWN' ? 'ignored' : 'failed')
  const parseError = parsed
    ? null
    : isNonTx
      ? 'non-transaction (declined/over-limit)'
      : (issuer === 'UNKNOWN' ? 'non-financial SMS' : 'parser returned null — unknown format')

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
      // ── 재발 방지 dedup (규칙 15 — 거래 중복 N배 사고 차단) ──
      // 같은 SMS row (id) 가 이미 transaction_id 를 가지고 있다면 skip.
      // raw_hash dedup 은 위(line 89)에서 이미 한 번 했지만, 그 후 재파싱
      // 루트 (sms-recanceled, sms-rebuild 등) 가 같은 sms id 에 대해 두 번
      // INSERT 하지 못하도록 한 번 더 안전망.
      const linkCheck = await prisma.$queryRaw<Array<{ transaction_id: string | null }>>`
        SELECT transaction_id FROM card_sms_transactions WHERE id = ${id} LIMIT 1
      `
      if (linkCheck[0]?.transaction_id) {
        return NextResponse.json({
          status: 'already_linked',
          id,
          existing_transaction_id: linkCheck[0].transaction_id,
        })
      }

      const txDate = parsed.txAt || receivedAt
      // type 매핑 (회계 관점):
      //   deposit/canceled → income (입금/환불)
      //   approved/withdrawal → expense (출금/사용)
      // ※ 표시는 sms.transaction_type 으로 결정 (UI 단순화)
      //   description 에 [취소] prefix 안 박음 — 가맹점만 그대로
      const txType = (parsed.type === 'deposit' || parsed.type === 'canceled') ? 'income' : 'expense'
      transactionId = randomUUID()

      // ── PHASE 3: 규칙 기반 1차 자동 분류 ──
      const ruleResult = classifyByRules(parsed.merchant, txType)
      if (ruleResult) {
        autoCategory = ruleResult.category
        autoConfidence = ruleResult.confidence
        classificationTier = ruleResult.tier
      }

      // description = 가맹점 그대로 (prefix 없음 — UI 가 sms.transaction_type 으로 [취소] 표시)
      const description = parsed.merchant || parsed.issuer

      // PR-SMS-BANK (2026-07-05) — 은행 SMS 는 'sms_bank' (매처 후보 풀 규칙과 동형).
      //   기존: 'sms' 하드코딩 → 통장 입금이 대차/투자자 매칭 풀에서 제외되던 버그.
      //   rebuild/link-cards 와 동일 규칙: issuer 가 BANK 로 끝나면 은행.
      const importedFrom = /BANK$/i.test(String(parsed.issuer || '')) ? 'sms_bank' : 'sms'

      // PR-SOURCE-ONE (2026-07-07 사용자 명시 「자료가 맞나 의심」) — 계좌 정본 입구 하나:
      //   오픈뱅킹(codef) 연동 은행의 문자는 거래로 저장하지 않음 (중복 원천 차단).
      //   문자는 알림 역할 — 즉시 오픈뱅킹 동기화를 깨워서 정본(codef_bank)으로 들어오게 함.
      if (importedFrom === 'sms_bank') {
        const ORG_BY_ISSUER: Record<string, string> = { WOORI_BANK: '0020', KB_BANK: '0004' }
        const orgCode = ORG_BY_ISSUER[String(parsed.issuer || '')]
        if (orgCode) {
          try {
            const conn = await prisma.codefConnection.findFirst({
              where: { is_active: true, org_type: 'bank', org_code: orgCode },
              select: { id: true },
            })
            if (conn) {
              // 정본 = 오픈뱅킹 → 문자 거래 저장 skip + 동기화 트리거 (수분 내 정본 유입 + 자동매칭)
              if (process.env.CRON_SECRET) {
                const proto = req.headers.get('x-forwarded-proto') || 'https'
                const host = req.headers.get('host') || ''
                fetch(`${proto}://${host}/api/codef/sync`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': process.env.CRON_SECRET },
                  body: JSON.stringify({}),
                }).catch(() => {})
              }
              transactionId = null
              return NextResponse.json({
                status: parseStatus,
                id,
                linked: { cardId, carId, transactionId: null },
                source_policy: '오픈뱅킹 정본 — 문자는 동기화 알림으로만 사용',
              })
            }
          } catch { /* 연동 조회 실패 — 기존대로 저장 (누락 방지 우선) */ }
        }
      }

      // PR-RECONCILE — 은행 문자의 「잔액 N원」 저장 → 잔액 사슬 자동 검증 재료
      //   (카드의 「잔여한도」는 '잔액' 표기가 아니라 자동 제외)
      //   KB 신형 문자는 「잔액26,149,599」 처럼 원 없이 옴 (2026-07-08) → 원 선택
      const balanceMatch = importedFrom === 'sms_bank' ? String(text || '').match(/잔액\s*([\d,]+)\s*원?/) : null
      const balanceAfter = balanceMatch ? Number(balanceMatch[1].replace(/,/g, '')) : null

      // PR-ACCOUNT (V10) — 카드/계좌 끝4자리: 파서 별칭 또는 원문 *번호 에서 추출 (카드·계좌별 관리)
      //   KB 마스킹(**168 — 꼬리 3자리)은 매핑 테이블로 실제 끝4자리 승격 (계좌별 잔액 사슬 유지)
      const aliasDigits = String(parsed.card_alias || '').replace(/\D/g, '')
      const starMatch = String(text || '').match(/\*\s?(\d{4,})/)
      const acctLast4 = await resolveAccountLast4(prisma, aliasDigits || (starMatch ? starMatch[1] : ''))

      const resolvedClient = await resolveClientName(parsed.holder || '')
      const insertLegacy = () => prisma.$executeRaw`
        INSERT INTO transactions (
          id, transaction_date, type, amount, description, client_name,
          card_company, imported_from, related_type, related_id,
          category, status, balance_after, created_at, updated_at
        ) VALUES (
          ${transactionId}, ${txDate}, ${txType}, ${parsed.amount},
          ${description}, ${resolvedClient},
          ${parsed.issuer}, ${importedFrom},
          ${carId ? 'car' : null}, ${carId},
          ${ruleResult && ruleResult.tier === 'auto' ? ruleResult.category : null},
          'completed', ${balanceAfter}, NOW(), NOW()
        )
      `
      if (acctLast4) {
        try {
          await prisma.$executeRaw`
            INSERT INTO transactions (
              id, transaction_date, type, amount, description, client_name,
              card_company, imported_from, related_type, related_id,
              category, status, balance_after, account_last4, created_at, updated_at
            ) VALUES (
              ${transactionId}, ${txDate}, ${txType}, ${parsed.amount},
              ${description}, ${resolvedClient},
              ${parsed.issuer}, ${importedFrom},
              ${carId ? 'car' : null}, ${carId},
              ${ruleResult && ruleResult.tier === 'auto' ? ruleResult.category : null},
              'completed', ${balanceAfter}, ${acctLast4}, NOW(), NOW()
            )
          `
        } catch (e: any) {
          if (/Unknown column/i.test(e?.message || '')) await insertLegacy()  // V10 미적용 DB
          else throw e
        }
      } else {
        await insertLegacy()
      }
      // SMS 레코드에 transaction_id 연결
      await prisma.$executeRaw`
        UPDATE card_sms_transactions SET transaction_id = ${transactionId} WHERE id = ${id}
      `

      // PR-SMS-BANK — 은행 입금이면 대차 자동매칭 즉시 트리거 (fire-and-forget, CRON_SECRET 체인)
      //   codef/bank 훅과 동형 (규칙 14). 실패해도 30분 주기 cron 이 재시도.
      if (importedFrom === 'sms_bank' && txType === 'income' && process.env.CRON_SECRET) {
        try {
          const proto = req.headers.get('x-forwarded-proto') || 'https'
          const host = req.headers.get('host') || ''
          fetch(`${proto}://${host}/api/finance/transactions/auto-match-fmi-rental`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': process.env.CRON_SECRET },
            body: JSON.stringify({ mode: 'insurance', dryRun: false }),
          }).catch(() => {})
        } catch { /* 매칭 트리거 실패 무시 */ }
      }
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
