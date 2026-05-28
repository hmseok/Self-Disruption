/**
 * GET /api/ride-compliance/disposal/probe
 *
 * 어댑터 모드 + 외부 yangjaehee DB 연결 상태 진단.
 *   - mode=mock  → 시연 데이터 출력 가능 여부
 *   - mode=direct → cafe24Db.probe() + 사용자 SQL N=1 dry-run
 *
 * 인증 필요. 운영자/CPO 용 진단 화면에서 호출.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { getAdapterMode, getDisposalAdapter } from '@/lib/external-disposal-adapter'

export async function GET(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

    const mode = getAdapterMode()
    const result: Record<string, any> = { mode }

    if (mode === 'direct') {
      // cafe24Db pool 헬스체크
      const { cafe24Db } = await import('@/lib/cafe24-db')
      const p = await cafe24Db.probe()
      result.cafe24_db = p
      if (p.ok) {
        try {
          // N=1 dry-run — expired_approval count + 최신 1건
          const cntRow = await cafe24Db.query<any>('SELECT COUNT(*) AS c FROM expired_approval')
          const latestRow = await cafe24Db.query<any>(`
            SELECT id, request_at, request_by, expired_count,
                   approval_request_id, approval_request_at, deleted_at, confirmed_at
              FROM expired_approval
             ORDER BY request_at DESC
             LIMIT 1
          `)
          result.expired_approval_count = Number(cntRow[0]?.c ?? 0)
          result.expired_approval_latest = latestRow[0] || null
        } catch (e: any) {
          result.dry_run_error = String(e?.message || e)
        }
      }
    }

    // 어댑터 자체 시연 — listApprovals 호출 가능 여부
    try {
      const adapter = getDisposalAdapter()
      const approvals = await adapter.listApprovals({ limit: 3 })
      result.adapter_sample = approvals.map(a => ({
        id: a.id,
        request_at: a.request_at,
        expired_count: a.expired_count,
        confirmed_at: a.confirmed_at,
      }))
    } catch (e: any) {
      result.adapter_error = String(e?.message || e)
    }

    return NextResponse.json({ success: true, data: result })
  } catch (e: any) {
    console.error('[GET /disposal/probe] error:', e)
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}
