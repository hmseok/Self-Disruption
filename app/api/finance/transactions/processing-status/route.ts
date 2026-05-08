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

    // 한 쿼리로 모든 카운트 (성능)
    const rows = await prisma.$queryRaw<Array<any>>`
      SELECT
        (SELECT COUNT(*) FROM transactions
          WHERE deleted_at IS NULL
            AND (related_type IS NULL OR related_id IS NULL)) AS unmatched,
        (SELECT COUNT(DISTINCT transaction_id) FROM transaction_assignments
          WHERE status = 'pending' AND source = 'auto') AS pending_auto,
        (SELECT COUNT(DISTINCT transaction_id) FROM transaction_assignments
          WHERE status = 'confirmed') AS confirmed,
        (SELECT COUNT(DISTINCT transaction_id) FROM transaction_assignments
          WHERE status = 'rejected') AS rejected,
        (SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL) AS total,
        (SELECT MAX(created_at) FROM transaction_assignments
          WHERE source = 'auto') AS last_auto_match_at
    `

    const r = rows[0] || {}
    const unmatched = Number(r.unmatched || 0)
    const pendingAuto = Number(r.pending_auto || 0)
    const confirmed = Number(r.confirmed || 0)
    const rejected = Number(r.rejected || 0)
    const total = Number(r.total || 0)
    const processedPct = total > 0 ? Math.round((confirmed / total) * 1000) / 10 : 0

    // 추천 액션 — 우선순위 결정
    const recommended: Array<{ key: string; label: string; priority: number; reason: string }> = []
    if (pendingAuto > 0) {
      recommended.push({
        key: 'confirm',
        label: `✅ 매칭 확정 (${pendingAuto}건)`,
        priority: 1,
        reason: '자동 매칭 결과를 검토 후 확정하세요',
      })
    }
    if (unmatched > 0) {
      recommended.push({
        key: 'auto-match',
        label: `🪄 자동 매칭 실행 (${unmatched}건 후보)`,
        priority: 2,
        reason: '미매칭 거래를 매처에 돌려 자동 매칭',
      })
    }
    if (unmatched > 0 && pendingAuto === 0) {
      recommended.push({
        key: 'manual-review',
        label: `👀 수동 검수 (${unmatched}건)`,
        priority: 3,
        reason: '매처가 잡지 못한 거래 — 사전 추가 또는 카테고리 매칭',
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

    return NextResponse.json({
      unmatched,
      pending_auto: pendingAuto,
      confirmed,
      rejected,
      total,
      processed_pct: processedPct,
      last_auto_match_at: r.last_auto_match_at || null,
      recommended_actions: recommended,
    })
  } catch (e: any) {
    console.error('[processing-status]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
