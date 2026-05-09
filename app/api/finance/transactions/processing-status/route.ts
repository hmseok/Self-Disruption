import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/finance/transactions/processing-status
 *
 * 「오늘의 처리 현황」 5 카드용 카운트.
 * GET — 인증된 사용자만.
 *
 * 응답:
 *   {
 *     unmatched:    1219,  // 매칭 안 된 거래 (related_type IS NULL)
 *     pending_auto:  270,  // 자동 매칭 미확정 (status='pending', source='auto')
 *     confirmed:       0,  // 사용자 확정 (status='confirmed')
 *     rejected:        0,  // 사용자 거부 (status='rejected')
 *     total:        1755,  // 전체 거래
 *     processed_pct: 27.7  // (confirmed) / total * 100
 *     last_auto_match_at: '2026-05-08T07:45:50Z',
 *     recommended_actions: [
 *       { key: 'confirm', label: '✅ 매칭 확정 (270건)', priority: 1 },
 *       { key: 'auto-match', label: '🪄 자동 매칭 실행', priority: 2 },
 *     ],
 *   }
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    // 한 쿼리로 모든 카운트 (성능) — PR-UX2: 5단계 funnel 데이터
    const rows = await prisma.$queryRaw<Array<any>>`
      SELECT
        (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL) AS total,
        (SELECT COUNT(*) FROM transactions
          WHERE deleted_at IS NULL AND DATE(created_at) = CURDATE()) AS today_input,
        (SELECT COUNT(*) FROM transactions
          WHERE deleted_at IS NULL
            AND category IS NOT NULL AND category != '' AND category != '미분류') AS classified,
        (SELECT COUNT(*) FROM transactions
          WHERE deleted_at IS NULL
            AND (category IS NULL OR category = '' OR category = '미분류')) AS unclassified,
        (SELECT COUNT(*) FROM transactions
          WHERE deleted_at IS NULL
            AND related_type IS NOT NULL AND related_id IS NOT NULL) AS matched,
        (SELECT COUNT(*) FROM transactions
          WHERE deleted_at IS NULL
            AND (related_type IS NULL OR related_id IS NULL)) AS unmatched,
        (SELECT COUNT(DISTINCT transaction_id) FROM transaction_assignments
          WHERE status = 'pending' AND source = 'auto') AS pending_auto,
        (SELECT COUNT(DISTINCT transaction_id) FROM transaction_assignments
          WHERE status = 'confirmed') AS confirmed,
        (SELECT COUNT(DISTINCT transaction_id) FROM transaction_assignments
          WHERE status = 'rejected') AS rejected,
        (SELECT MAX(created_at) FROM transaction_assignments
          WHERE source = 'auto') AS last_auto_match_at
    `

    const r = rows[0] || {}
    const total = Number(r.total || 0)
    const todayInput = Number(r.today_input || 0)
    const classified = Number(r.classified || 0)
    const unclassified = Number(r.unclassified || 0)
    const matched = Number(r.matched || 0)
    const unmatched = Number(r.unmatched || 0)
    const pendingAuto = Number(r.pending_auto || 0)
    const confirmed = Number(r.confirmed || 0)
    const rejected = Number(r.rejected || 0)
    const processedPct = total > 0 ? Math.round((confirmed / total) * 1000) / 10 : 0

    // 추천 액션 — 우선순위 결정 (PR-UX2: 분류 단계도 포함)
    const recommended: Array<{ key: string; label: string; priority: number; reason: string }> = []
    if (unclassified > 0) {
      recommended.push({
        key: 'classify',
        label: `🤖 분류 실행 (${unclassified}건)`,
        priority: 1,
        reason: '미분류 거래를 룰 + AI 로 분류',
      })
    }
    if (pendingAuto > 0) {
      recommended.push({
        key: 'confirm',
        label: `✅ 매칭 확정 (${pendingAuto}건)`,
        priority: unclassified > 0 ? 2 : 1,
        reason: '자동 매칭 결과를 검토 후 확정하세요',
      })
    }
    if (unmatched > 0) {
      recommended.push({
        key: 'auto-match',
        label: `🪄 자동 매칭 실행 (${unmatched}건 후보)`,
        priority: 3,
        reason: '미매칭 거래를 매처에 돌려 자동 매칭',
      })
    }
    if (recommended.length === 0) {
      recommended.push({
        key: 'done',
        label: '🎉 모든 거래 처리 완료',
        priority: 0,
        reason: '추가 작업 없음',
      })
    }

    // 5단계 funnel — 운영 흐름 가시화
    const funnel = [
      { key: 'input',    label: '① 입력',  done: total,      todo: 0,            value: total,        sub: `오늘 +${todayInput}` },
      { key: 'classify', label: '② 분류',  done: classified, todo: unclassified, value: classified,   sub: unclassified > 0 ? `미${unclassified}` : '✓' },
      { key: 'match',    label: '③ 매칭',  done: matched,    todo: unmatched,    value: matched,      sub: unmatched > 0 ? `미${unmatched}` : '✓' },
      { key: 'confirm',  label: '④ 확정',  done: confirmed,  todo: pendingAuto,  value: confirmed,    sub: pendingAuto > 0 ? `대기${pendingAuto}` : '✓' },
      { key: 'final',    label: '⑤ 완료',  done: confirmed,  todo: 0,            value: confirmed,    sub: `${processedPct}%` },
    ]

    return NextResponse.json({
      // 5단계 funnel
      funnel,
      // 기존 필드 유지 (backward compat)
      total,
      today_input: todayInput,
      classified,
      unclassified,
      matched,
      unmatched,
      pending_auto: pendingAuto,
      confirmed,
      rejected,
      processed_pct: processedPct,
      last_auto_match_at: r.last_auto_match_at || null,
      recommended_actions: recommended,
    })
  } catch (e: any) {
    console.error('[processing-status]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
