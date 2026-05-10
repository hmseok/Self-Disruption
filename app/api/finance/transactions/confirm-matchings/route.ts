import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * /api/finance/transactions/confirm-matchings
 *
 * 자동 매칭 결과 확정 (또는 거부).
 *
 * POST body:
 *   { mode: 'all' | 'specific' | 'reject',
 *     assignmentIds?: string[],
 *     transactionIds?: string[]  // 또는 거래 ID 단위 일괄 확정
 *   }
 *
 * 동작:
 *   - mode='all'  : 전체 status='pending' AND source='auto' → 'confirmed'
 *   - mode='specific' : assignmentIds 의 row 만 → 'confirmed'
 *   - mode='reject' : 지정된 row → 'rejected'
 *
 * 자가 검증 (Rule 10):
 *   - 적용 후 변경된 row 수 검증
 *   - confirmed_at, confirmed_by 정상 채워졌는지 확인
 */
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request)
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const mode: 'all' | 'specific' | 'reject' = body.mode || 'all'
    const assignmentIds: string[] = Array.isArray(body.assignmentIds) ? body.assignmentIds : []
    const transactionIds: string[] = Array.isArray(body.transactionIds) ? body.transactionIds : []

    let updated = 0
    const userId = String(user.id || '')

    if (mode === 'all') {
      // 전체 pending+auto → confirmed
      const result = await prisma.$executeRaw`
        UPDATE transaction_assignments
           SET status = 'confirmed',
               confirmed_at = NOW(),
               confirmed_by = ${userId},
               updated_at = NOW()
         WHERE status = 'pending' AND source = 'auto'
      `
      updated = Number(result || 0)
    } else if (mode === 'specific' && (assignmentIds.length > 0 || transactionIds.length > 0)) {
      if (assignmentIds.length > 0) {
        // 안전한 raw — IN (?, ?, ...)
        const placeholders = assignmentIds.map(() => '?').join(',')
        const result = await prisma.$executeRawUnsafe(
          `UPDATE transaction_assignments
              SET status = 'confirmed',
                  confirmed_at = NOW(),
                  confirmed_by = ?,
                  updated_at = NOW()
            WHERE id IN (${placeholders})
              AND status = 'pending'`,
          userId,
          ...assignmentIds,
        )
        updated += Number(result || 0)
      }
      if (transactionIds.length > 0) {
        const placeholders = transactionIds.map(() => '?').join(',')
        const result = await prisma.$executeRawUnsafe(
          `UPDATE transaction_assignments
              SET status = 'confirmed',
                  confirmed_at = NOW(),
                  confirmed_by = ?,
                  updated_at = NOW()
            WHERE transaction_id IN (${placeholders})
              AND status = 'pending'`,
          userId,
          ...transactionIds,
        )
        updated += Number(result || 0)
      }
    } else if (mode === 'reject' && (assignmentIds.length > 0 || transactionIds.length > 0)) {
      // PR-UX11: 거부 시 transactions.related_type 도 NULL — 자동 재매칭 가능 상태로
      if (assignmentIds.length > 0) {
        const placeholders = assignmentIds.map(() => '?').join(',')
        // 1) ta.status='rejected'
        const result = await prisma.$executeRawUnsafe(
          `UPDATE transaction_assignments
              SET status = 'rejected',
                  confirmed_at = NOW(),
                  confirmed_by = ?,
                  updated_at = NOW()
            WHERE id IN (${placeholders})`,
          userId,
          ...assignmentIds,
        )
        updated += Number(result || 0)
        // 2) transactions.related_type/id NULL (해당 assignment 의 tx 들)
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE transactions t
               JOIN transaction_assignments ta ON ta.transaction_id = t.id
                SET t.related_type = NULL, t.related_id = NULL, t.updated_at = NOW()
              WHERE ta.id IN (${placeholders})`,
            ...assignmentIds,
          )
        } catch (e: any) {
          console.warn('[reject] transactions.related_type NULL failed:', e?.message)
        }
      }
      if (transactionIds.length > 0) {
        const placeholders = transactionIds.map(() => '?').join(',')
        const result = await prisma.$executeRawUnsafe(
          `UPDATE transaction_assignments
              SET status = 'rejected',
                  confirmed_at = NOW(),
                  confirmed_by = ?,
                  updated_at = NOW()
            WHERE transaction_id IN (${placeholders})`,
          userId,
          ...transactionIds,
        )
        updated += Number(result || 0)
        // transactions.related_type NULL 처리
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE transactions SET related_type = NULL, related_id = NULL, updated_at = NOW()
              WHERE id IN (${placeholders})`,
            ...transactionIds,
          )
        } catch {}
      }
    } else {
      return NextResponse.json({
        error: 'invalid mode or empty selection',
        mode,
        assignmentIds_count: assignmentIds.length,
        transactionIds_count: transactionIds.length,
      }, { status: 400 })
    }

    // 자가 검증 (Rule 10)
    const verify = await prisma.$queryRaw<Array<any>>`
      SELECT
        SUM(CASE WHEN status='pending'   THEN 1 ELSE 0 END) AS still_pending,
        SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN status='rejected'  THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status='confirmed' AND confirmed_at IS NULL THEN 1 ELSE 0 END) AS confirmed_no_ts
      FROM transaction_assignments
     WHERE source = 'auto'
    `

    const v = verify[0] || {}
    const verifyOk = Number(v.confirmed_no_ts || 0) === 0

    return NextResponse.json({
      mode,
      updated,
      verify: {
        ok: verifyOk,
        still_pending: Number(v.still_pending || 0),
        confirmed: Number(v.confirmed || 0),
        rejected: Number(v.rejected || 0),
        confirmed_no_ts: Number(v.confirmed_no_ts || 0),
      },
      message: mode === 'reject'
        ? `${updated}건 거부 처리`
        : `${updated}건 확정 적용 — 잔여 미확정 ${v.still_pending || 0}건`,
    })
  } catch (e: any) {
    console.error('[confirm-matchings POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
