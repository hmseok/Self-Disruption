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

  // 원장 생존 플래그 (2026-07-08) — 파싱 성공인데 거래가 삭제/부재인 건에 「거래로 등록」 버튼 노출용
  const txIds = rows.map((r: any) => r.transaction_id).filter(Boolean)
  const aliveSet = new Set<string>()
  if (txIds.length > 0) {
    try {
      const alive = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM transactions WHERE deleted_at IS NULL AND id IN (${txIds.map(() => '?').join(',')})`,
        ...txIds,
      )
      for (const a of alive) aliveSet.add(String(a.id))
    } catch { /* 조회 실패 — 플래그 생략 (버튼 미노출) */ }
  }

  return NextResponse.json({
    rows: rows.map((r: any) => ({
      ...r,
      amount: r.amount !== null && r.amount !== undefined ? Number(r.amount) : null,
      tx_alive: r.transaction_id ? aliveSet.has(String(r.transaction_id)) : false,
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

// ── PUT: 파싱 성공 건 개별 원장(거래) 등록 ──────────────
//   (2026-07-08 사용자 요청 — 통장 전체삭제로 사라진 오늘 문자 건을 개별 복구)
//   조건: parse_status='parsed' + 금액 있음 + 살아있는 거래 없음 + 통장 3계열 중복 없음
export async function PUT(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const rows = await prisma.$queryRaw<any[]>`
    SELECT * FROM card_sms_transactions WHERE id = ${id} LIMIT 1
  `
  const sms = rows[0]
  if (!sms) return NextResponse.json({ error: '문자를 찾을 수 없습니다' }, { status: 404 })
  if (sms.parse_status !== 'parsed' || sms.amount == null) {
    return NextResponse.json({ error: '내용이 해석된 문자만 등록할 수 있습니다' }, { status: 400 })
  }

  // 이미 살아있는 거래가 연결돼 있으면 중단
  if (sms.transaction_id) {
    const live = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM transactions WHERE id = ${sms.transaction_id} AND deleted_at IS NULL LIMIT 1
    `
    if (live.length > 0) {
      return NextResponse.json({ ok: false, reason: '이미 거래에 등록되어 있습니다', transaction_id: sms.transaction_id })
    }
  }

  // webhook 과 동형 (규칙 14): type/출처/잔액/계좌 매핑
  const importedFrom = /BANK$/i.test(String(sms.card_issuer || '')) ? 'sms_bank' : 'sms'
  const txType = (sms.transaction_type === 'deposit' || sms.transaction_type === 'canceled') ? 'income' : 'expense'
  const txDate = sms.transaction_at || sms.received_at || new Date()
  const description = sms.merchant || sms.card_issuer || '문자 거래'
  const amount = Number(sms.amount)
  const balanceMatch = importedFrom === 'sms_bank' ? String(sms.raw_text || '').match(/잔액\s*([\d,]+)\s*원?/) : null
  const balanceAfter = balanceMatch ? Number(balanceMatch[1].replace(/,/g, '')) : null
  const aliasDigits = String(sms.card_alias || '').replace(/\D/g, '')
  const starMatch = String(sms.raw_text || '').match(/\*\s?(\d{4,})/)
  const acctLast4 = (aliasDigits || (starMatch ? starMatch[1] : '')).slice(-4) || null

  // 통장 3계열 중복 검사 (codef/bank 와 같은 판별자) — 은행 문자만
  if (importedFrom === 'sms_bank') {
    try {
      const dup = balanceAfter != null
        ? await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM transactions
            WHERE deleted_at IS NULL
              AND (imported_from LIKE 'excel_bank%' OR imported_from IN ('sms_bank', 'codef_bank'))
              AND DATE(transaction_date) = DATE(${txDate}) AND type = ${txType}
              AND amount = ${amount} AND balance_after = ${balanceAfter}
            LIMIT 1`
        : await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM transactions
            WHERE deleted_at IS NULL
              AND (imported_from LIKE 'excel_bank%' OR imported_from IN ('sms_bank', 'codef_bank'))
              AND DATE(transaction_date) = DATE(${txDate}) AND type = ${txType}
              AND amount = ${amount} AND description = ${description}
            LIMIT 1`
      if (dup.length > 0) {
        return NextResponse.json({ ok: false, reason: '같은 거래가 이미 통장에 있습니다', transaction_id: dup[0].id })
      }
    } catch { /* 검사 실패 — 등록 진행 (누락 방지 우선) */ }
  }

  const { randomUUID } = await import('crypto')
  const transactionId = randomUUID()
  const insertLegacy = () => prisma.$executeRaw`
    INSERT INTO transactions (
      id, transaction_date, type, amount, description, client_name,
      card_company, imported_from, status, balance_after, created_at, updated_at
    ) VALUES (
      ${transactionId}, ${txDate}, ${txType}, ${amount}, ${description}, ${sms.holder_name || ''},
      ${sms.card_issuer}, ${importedFrom}, 'completed', ${balanceAfter}, NOW(), NOW()
    )
  `
  if (acctLast4) {
    try {
      await prisma.$executeRaw`
        INSERT INTO transactions (
          id, transaction_date, type, amount, description, client_name,
          card_company, imported_from, status, balance_after, account_last4, created_at, updated_at
        ) VALUES (
          ${transactionId}, ${txDate}, ${txType}, ${amount}, ${description}, ${sms.holder_name || ''},
          ${sms.card_issuer}, ${importedFrom}, 'completed', ${balanceAfter}, ${acctLast4}, NOW(), NOW()
        )
      `
    } catch (e: any) {
      if (/Unknown column/i.test(e?.message || '')) await insertLegacy()  // V10 미적용 DB (규칙 23)
      else throw e
    }
  } else {
    await insertLegacy()
  }

  await prisma.$executeRaw`
    UPDATE card_sms_transactions SET transaction_id = ${transactionId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}
  `

  // 은행 입금이면 대차 자동매칭 트리거 (webhook 과 동형, fire-and-forget)
  if (importedFrom === 'sms_bank' && txType === 'income' && process.env.CRON_SECRET) {
    try {
      const proto = req.headers.get('x-forwarded-proto') || 'https'
      const host = req.headers.get('host') || ''
      fetch(`${proto}://${host}/api/finance/transactions/auto-match-fmi-rental`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': process.env.CRON_SECRET },
        body: JSON.stringify({ mode: 'insurance', dryRun: false }),
      }).catch(() => {})
    } catch { /* 트리거 실패 무시 — 30분 주기가 재시도 */ }
  }

  return NextResponse.json({ ok: true, transaction_id: transactionId })
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
