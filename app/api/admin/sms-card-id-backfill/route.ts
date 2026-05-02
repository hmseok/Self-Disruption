import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/admin/sms-card-id-backfill
 *
 * 이전 파싱된 SMS 거래의 card_sms_transactions.card_id 가 NULL 인 row 들을
 * transactions.raw_data 의 $.card_last4 ↔ corporate_cards.card_number 의 last4 매칭으로 채움.
 *
 * 흐름:
 *   1. card_sms_transactions.card_id 가 NULL (또는 빈 문자열)
 *   2. transactions.raw_data 안 $.card_last4 추출
 *   3. corporate_cards.status='active' 중 card_number last4 일치하는 row 찾음
 *   4. card_sms_transactions.card_id 갱신
 *
 * body:
 *   { dryRun?: boolean = true }
 *
 * 응답 (dryRun):
 *   { dryRun: true, candidates: number, samples: [...], by_card: [{ card_alias, count }] }
 *
 * 응답 (apply):
 *   { dryRun: false, updated: number, by_card: [...] }
 *
 * (CLAUDE.md 규칙 1 — 풀 파이프라인. dryRun 후 사용자 확인 후 apply)
 */

interface Candidate {
  sms_id: string
  current_alias: string | null
  tx_last4: string | null
  cc_id: string
  cc_alias: string | null
  cc_number_last4: string
}

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun !== false

    // 1) 매칭 후보 조회 (raw_data 의 card_last4 + corporate_cards last4 매칭)
    const candidates = await prisma.$queryRaw<Candidate[]>`
      SELECT
        s.id AS sms_id,
        s.card_alias AS current_alias,
        JSON_UNQUOTE(JSON_EXTRACT(t.raw_data, '$.card_last4')) AS tx_last4,
        cc.id AS cc_id,
        cc.card_alias AS cc_alias,
        RIGHT(TRIM(cc.card_number), 4) AS cc_number_last4
      FROM card_sms_transactions s
      INNER JOIN transactions t
        ON t.id COLLATE utf8mb4_unicode_ci = s.transaction_id COLLATE utf8mb4_unicode_ci
        AND t.deleted_at IS NULL
      INNER JOIN corporate_cards cc
        ON cc.status = 'active'
        AND cc.card_number IS NOT NULL
        AND CHAR_LENGTH(TRIM(cc.card_number)) >= 4
        AND JSON_UNQUOTE(JSON_EXTRACT(t.raw_data, '$.card_last4')) IS NOT NULL
        AND RIGHT(TRIM(cc.card_number), 4) COLLATE utf8mb4_unicode_ci =
            JSON_UNQUOTE(JSON_EXTRACT(t.raw_data, '$.card_last4')) COLLATE utf8mb4_unicode_ci
      WHERE (s.card_id IS NULL OR s.card_id = '')
      LIMIT 5000
    `

    // 카드 별 집계
    const byCardMap = new Map<string, { cc_alias: string | null; count: number }>()
    for (const c of candidates) {
      const key = c.cc_id
      if (!byCardMap.has(key)) byCardMap.set(key, { cc_alias: c.cc_alias, count: 0 })
      byCardMap.get(key)!.count++
    }
    const by_card = [...byCardMap.entries()].map(([cc_id, v]) => ({ cc_id, cc_alias: v.cc_alias, count: v.count }))
                                              .sort((a, b) => b.count - a.count)

    if (dryRun) {
      return NextResponse.json(serialize({
        dryRun: true,
        candidates: candidates.length,
        samples: candidates.slice(0, 10),
        by_card,
      }))
    }

    // 2) APPLY — UPDATE 단건씩 수행 (안전망: applied 0 시 즉시 break)
    let updated = 0
    for (const c of candidates) {
      try {
        const result = await prisma.$executeRaw`
          UPDATE card_sms_transactions
          SET card_id = ${c.cc_id}
          WHERE id = ${c.sms_id}
            AND (card_id IS NULL OR card_id = '')
        `
        if (Number(result) > 0) updated++
      } catch (e: any) {
        console.warn('[sms-card-id-backfill] update 실패:', c.sms_id, e?.message?.slice(0, 200))
      }
    }

    return NextResponse.json(serialize({
      dryRun: false,
      updated,
      candidates: candidates.length,
      by_card,
    }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 })
  }
}
