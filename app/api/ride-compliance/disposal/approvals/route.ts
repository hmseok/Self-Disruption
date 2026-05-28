/**
 * GET /api/ride-compliance/disposal/approvals
 *   외부 결재 list + 본 시스템 mirror 결재 통합 조회.
 *   - 본 시스템 (ride_compliance_disposal_reviews) 에 sync 된 row 와
 *     아직 mirror 안 된 외부 결재를 합쳐서 list.
 *   - mirror 안 됨 → "신규 (sync 필요)" 마크
 *
 * 인증: verifyUser 필요.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { getDisposalAdapter, getAdapterMode } from '@/lib/external-disposal-adapter'

interface UnifiedRow {
  // identity
  review_id: string | null              // 본 시스템 row id (없으면 sync 안 됨)
  external_approval_id: number          // 외부 expired_approval.id
  // 외부 메타
  external_request_at: string | null
  external_request_by: string | null
  external_expired_count: number | null
  external_approval_doc_id: string | null
  external_approval_at: string | null
  external_deleted_at: string | null
  external_deleted_by: string | null
  external_confirmed_at: string | null
  external_confirmed_by: string | null
  // 본 시스템 게이트
  review_status: string                 // pending / approved / rejected / executed / confirmed / not_synced
  reviewer_id: string | null
  reviewed_at: string | null
  review_note: string | null
  // 파기확인서
  deliverable_id: string | null
  deliverable_issued_at: string | null
  // 표시용
  needs_sync: boolean                   // true → 본 시스템 row 없음
  adapter_mode: string
}

export async function GET(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

    const mode = getAdapterMode()

    // 1. 외부 어댑터 list (mock / direct / api / etl 모드)
    const adapter = getDisposalAdapter()
    let externalApprovals: Awaited<ReturnType<typeof adapter.listApprovals>> = []
    try {
      externalApprovals = await adapter.listApprovals({ limit: 100 })
    } catch (e) {
      console.warn('[disposal/approvals] adapter listApprovals failed:', e)
    }

    // 2. 본 시스템 mirror — already-synced
    let mirroredRows: Array<{
      id: string
      external_approval_id: bigint | number | null
      external_request_at: Date | null
      external_request_by: string | null
      external_expired_count: bigint | number | null
      external_approval_doc_id: string | null
      external_approval_at: Date | null
      external_deleted_at: Date | null
      external_deleted_by: string | null
      external_confirmed_at: Date | null
      external_confirmed_by: string | null
      review_status: string
      reviewer_id: string | null
      reviewed_at: Date | null
      review_note: string | null
      deliverable_id: string | null
      deliverable_issued_at: Date | null
    }> = []
    try {
      mirroredRows = await prisma.$queryRaw`
        SELECT id, external_approval_id, external_request_at, external_request_by,
               external_expired_count, external_approval_doc_id, external_approval_at,
               external_deleted_at, external_deleted_by, external_confirmed_at, external_confirmed_by,
               review_status, reviewer_id, reviewed_at, review_note,
               deliverable_id, deliverable_issued_at
          FROM ride_compliance_disposal_reviews
         ORDER BY COALESCE(external_request_at, created_at) DESC
         LIMIT 200
      ` as any[]
    } catch (e: any) {
      // 테이블 미생성 시 graceful fallback
      const migrationPending = /doesn't exist|Unknown table/i.test(String(e?.message || e))
      if (migrationPending) {
        return NextResponse.json({
          success: true,
          data: [],
          adapter_mode: mode,
          _migration_pending: true,
          _hint: 'migrations/2026-05-30_ride_compliance_phase40_disposal.sql 적용 후 새로고침',
        })
      }
      throw e
    }

    // 3. mirror 인덱스 (external_approval_id → row)
    const mirroredMap = new Map<number, (typeof mirroredRows)[number]>()
    for (const m of mirroredRows) {
      const key = Number(m.external_approval_id || 0)
      if (key) mirroredMap.set(key, m)
    }

    // 4. 통합 list — mirror 우선, 외부에만 있으면 needs_sync
    const unified: UnifiedRow[] = []

    // 4-A. mirrored rows (이미 본 시스템에 들어옴)
    for (const m of mirroredRows) {
      unified.push({
        review_id: m.id,
        external_approval_id: Number(m.external_approval_id || 0),
        external_request_at: m.external_request_at?.toISOString().slice(0, 19).replace('T', ' ') || null,
        external_request_by: m.external_request_by,
        external_expired_count: m.external_expired_count != null ? Number(m.external_expired_count) : null,
        external_approval_doc_id: m.external_approval_doc_id,
        external_approval_at: m.external_approval_at?.toISOString().slice(0, 19).replace('T', ' ') || null,
        external_deleted_at: m.external_deleted_at?.toISOString().slice(0, 19).replace('T', ' ') || null,
        external_deleted_by: m.external_deleted_by,
        external_confirmed_at: m.external_confirmed_at?.toISOString().slice(0, 19).replace('T', ' ') || null,
        external_confirmed_by: m.external_confirmed_by,
        review_status: m.review_status,
        reviewer_id: m.reviewer_id,
        reviewed_at: m.reviewed_at?.toISOString().slice(0, 19).replace('T', ' ') || null,
        review_note: m.review_note,
        deliverable_id: m.deliverable_id,
        deliverable_issued_at: m.deliverable_issued_at?.toISOString().slice(0, 19).replace('T', ' ') || null,
        needs_sync: false,
        adapter_mode: mode,
      })
    }

    // 4-B. 외부에만 있는 결재 (sync 필요)
    for (const ext of externalApprovals) {
      if (mirroredMap.has(ext.id)) continue
      unified.push({
        review_id: null,
        external_approval_id: ext.id,
        external_request_at: ext.request_at,
        external_request_by: ext.request_by,
        external_expired_count: ext.expired_count,
        external_approval_doc_id: ext.approval_request_id,
        external_approval_at: ext.approval_request_at,
        external_deleted_at: ext.deleted_at,
        external_deleted_by: ext.deleted_by,
        external_confirmed_at: ext.confirmed_at,
        external_confirmed_by: ext.confirmed_by,
        review_status: 'not_synced',
        reviewer_id: null,
        reviewed_at: null,
        review_note: null,
        deliverable_id: null,
        deliverable_issued_at: null,
        needs_sync: true,
        adapter_mode: mode,
      })
    }

    // 5. 정렬: 외부 요청일 desc
    unified.sort((a, b) => (b.external_request_at || '').localeCompare(a.external_request_at || ''))

    return NextResponse.json({
      success: true,
      data: unified,
      adapter_mode: mode,
      total: unified.length,
    })
  } catch (e: any) {
    console.error('[GET /disposal/approvals] error:', e)
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}
