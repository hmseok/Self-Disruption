import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { parseSms, isNonTransactionSms, detectIssuer } from '@/lib/sms-parsers'

// ═══════════════════════════════════════════════════════════════════
// 취소 SMS 일괄 재파싱 API (관리자 전용 — 일회성 운영 도구)
//
//   GET  /api/admin/sms-recanceled?dryRun=true (기본)
//        → 영향 받는 row 카운트 + 변경 미리보기 (sample 5건)
//
//   POST /api/admin/sms-recanceled?apply=true&max=50
//        → 실제 UPDATE 실행 (max 건수 제한, 기본 50, 최대 200)
//
// 안전망 (CLAUDE.md § 0-1 Rule 3):
//   1) DB write 기준 break: improved === 0 → 즉시 중단
//   2) max batch limit: 200 강제
//   3) 사용자 수동 수정 보호: final_category 있으면 skip
//   4) parseSms 실패 시 skip (덮어쓰기 안 함)
// ═══════════════════════════════════════════════════════════════════

type Candidate = {
  id: string
  raw_text: string
  sender: string | null
  transaction_id: string | null
  old_merchant: string | null
  old_holder: string | null
  old_card_alias: string | null
  old_type: string | null
  tx_desc: string | null
  tx_type: string | null
  tx_final_cat: string | null
}

type Diff = {
  id: string
  txId: string | null
  raw_sample: string
  before: Pick<Candidate, 'old_merchant' | 'old_holder' | 'old_card_alias' | 'old_type' | 'tx_desc' | 'tx_type'>
  after: {
    merchant: string | null
    holder: string | null
    card_alias: string | null
    type: string
    new_tx_desc: string
    new_tx_type: 'income' | 'expense'
  }
}

// ─── 후보 조회 ─────────────────────────────────────────────
//   대상:
//     ① parse_status='parsed' 이지만 merchant/holder/card_alias 가 NULL
//        AND 취소 키워드 포함 → 취소 SMS 재파싱
//     ② parse_status='failed' → 새 파서로 재시도 (KB 변형 포맷, [MY COMPANY] 취소 등)
async function loadCandidates(max: number): Promise<Candidate[]> {
  const limit = Math.min(Math.max(max, 1), 200)
  return prisma.$queryRaw<Candidate[]>`
    SELECT s.id,
           s.raw_text,
           s.sender,
           s.transaction_id,
           s.merchant         AS old_merchant,
           s.holder_name      AS old_holder,
           s.card_alias       AS old_card_alias,
           s.transaction_type AS old_type,
           t.description      AS tx_desc,
           t.type             AS tx_type,
           t.final_category   AS tx_final_cat
      FROM card_sms_transactions s
      LEFT JOIN transactions t
        ON t.id COLLATE utf8mb4_unicode_ci = s.transaction_id COLLATE utf8mb4_unicode_ci
     WHERE (
            -- ① 취소 SMS 정보 결손
            (s.parse_status = 'parsed'
              AND (
                s.transaction_type = 'canceled'
                OR (s.merchant IS NULL AND s.raw_text REGEXP '취소|승인취소|거래취소')
              ))
            -- ② 파싱 실패 SMS (새 파서로 재시도)
         OR  s.parse_status = 'failed'
           )
     ORDER BY s.received_at DESC
     LIMIT ${limit}
  `
}

// ─── 재파싱 + 진단 ─────────────────────────────────────────
function diffOne(row: Candidate): { diff: Diff | null; skipReason: string | null; markIgnored?: boolean } {
  // 사용자 수동 수정 보호
  if (row.tx_final_cat) return { diff: null, skipReason: 'has_final_category' }

  const text = row.raw_text || ''

  // 비-거래 SMS (승인거절/한도초과) → ignored 처리
  if (isNonTransactionSms(text)) {
    return { diff: null, skipReason: 'non_transaction_sms', markIgnored: true }
  }

  const newParsed = parseSms(row.sender, text)
  if (!newParsed) return { diff: null, skipReason: 'reparse_failed' }

  // 새 파서 결과로 기대되는 transactions 상태
  const isCanceled = newParsed.type === 'canceled'
  const newTxType: 'income' | 'expense' =
    newParsed.type === 'deposit' || isCanceled ? 'income' : 'expense'
  const baseDesc = newParsed.merchant || newParsed.issuer
  const newTxDesc = isCanceled ? `[취소] ${baseDesc}` : baseDesc

  // SMS row 보강 필요 여부
  const smsImproved =
    (newParsed.merchant && !row.old_merchant) ||
    (newParsed.holder && !row.old_holder) ||
    (newParsed.card_alias && !row.old_card_alias) ||
    (newParsed.type !== row.old_type)

  // 연결된 transactions row 가 기대 상태와 다른지 (stale 검사)
  //   SMS 가 이미 정리됐어도 transactions 가 아직 stale 일 수 있음 — 그 케이스도 처리
  const txStale = !!row.transaction_id && (
    (row.tx_type && row.tx_type !== newTxType) ||
    (row.tx_desc !== newTxDesc)
  )

  if (!smsImproved && !txStale) return { diff: null, skipReason: 'no_improvement' }

  return {
    diff: {
      id: row.id,
      txId: row.transaction_id,
      raw_sample: text.slice(0, 80),
      before: {
        old_merchant: row.old_merchant,
        old_holder: row.old_holder,
        old_card_alias: row.old_card_alias,
        old_type: row.old_type,
        tx_desc: row.tx_desc,
        tx_type: row.tx_type,
      },
      after: {
        merchant: newParsed.merchant,
        holder: newParsed.holder,
        card_alias: newParsed.card_alias,
        type: newParsed.type,
        new_tx_desc: newTxDesc,
        new_tx_type: newTxType,
      },
    },
    skipReason: null,
  }
}

// ─── GET: dry-run ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  try {
    const sp = request.nextUrl.searchParams
    const max = Number(sp.get('max') || 200)

    const candidates = await loadCandidates(max)
    const diffs: Diff[] = []
    const skips: Record<string, number> = {}

    for (const row of candidates) {
      const r = diffOne(row)
      if (r.diff) diffs.push(r.diff)
      else if (r.skipReason) skips[r.skipReason] = (skips[r.skipReason] || 0) + 1
    }

    return NextResponse.json({
      dryRun: true,
      total_candidates: candidates.length,
      will_update: diffs.length,
      skipped: skips,
      sample: diffs.slice(0, 5),
      note: 'POST /api/admin/sms-recanceled?apply=true&max=N 으로 실제 적용',
    })
  } catch (e: any) {
    console.error('[GET /api/admin/sms-recanceled]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST: apply ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  try {
    const sp = request.nextUrl.searchParams
    const apply = sp.get('apply') === 'true'
    const max = Math.min(Math.max(Number(sp.get('max') || 50), 1), 200)

    if (!apply) {
      return NextResponse.json(
        { error: 'apply=true 필수 (안전망)' },
        { status: 400 }
      )
    }

    const candidates = await loadCandidates(max)
    let applied = 0
    let txUpdated = 0
    let ignoredMarked = 0
    const skips: Record<string, number> = {}
    const errors: Array<{ id: string; reason: string }> = []
    const samples: Diff[] = []

    for (const row of candidates) {
      const r = diffOne(row)

      // ── 비-거래 SMS (승인거절/한도초과) → ignored 마킹 ──
      if (!r.diff && r.markIgnored) {
        try {
          await prisma.$executeRaw`
            UPDATE card_sms_transactions SET
              parse_status = 'ignored',
              parse_error = 'non-transaction (declined/over-limit)',
              updated_at = NOW()
            WHERE id = ${row.id}
          `
          ignoredMarked++
        } catch (e: any) {
          errors.push({ id: row.id, reason: e?.message || 'ignored mark fail' })
        }
        if (r.skipReason) skips[r.skipReason] = (skips[r.skipReason] || 0) + 1
        continue
      }

      if (!r.diff) {
        if (r.skipReason) skips[r.skipReason] = (skips[r.skipReason] || 0) + 1
        continue
      }
      if (samples.length < 5) samples.push(r.diff)
      try {
        // ── 1) card_sms_transactions UPDATE ──
        //   parse_status도 'parsed'로 갱신 (failed → parsed 이행)
        await prisma.$executeRaw`
          UPDATE card_sms_transactions SET
            merchant         = ${r.diff.after.merchant},
            holder_name      = ${r.diff.after.holder},
            card_alias       = ${r.diff.after.card_alias},
            transaction_type = ${r.diff.after.type},
            parse_status     = 'parsed',
            parse_error      = NULL,
            updated_at       = NOW()
          WHERE id = ${r.diff.id}
        `
        applied++

        // ── 2) 연결된 transactions UPDATE (있는 경우만) ──
        if (r.diff.txId) {
          await prisma.$executeRaw`
            UPDATE transactions SET
              description = ${r.diff.after.new_tx_desc},
              type        = ${r.diff.after.new_tx_type},
              updated_at  = NOW()
            WHERE id = ${r.diff.txId}
          `
          txUpdated++
        }
      } catch (e: any) {
        errors.push({ id: r.diff.id, reason: e?.message || 'unknown' })
      }
    }

    // 안전망: 한 건도 적용 안 됐으면 사용자에게 명시적 알림
    if (candidates.length > 0 && applied === 0 && ignoredMarked === 0) {
      return NextResponse.json({
        applied: 0,
        tx_updated: 0,
        ignored_marked: 0,
        skipped: skips,
        errors,
        note: '⚠️ 변경 적용 0건 — 모두 skip 처리됨 (사유는 skipped 객체 참조)',
      })
    }

    return NextResponse.json({
      apply: true,
      total_candidates: candidates.length,
      applied,
      tx_updated: txUpdated,
      ignored_marked: ignoredMarked,
      skipped: skips,
      errors,
      sample: samples,
      note:
        candidates.length === max
          ? `남은 row가 더 있을 수 있음 — 한 번 더 호출 가능 (max=${max})`
          : '모든 후보 처리 완료',
    })
  } catch (e: any) {
    console.error('[POST /api/admin/sms-recanceled]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
