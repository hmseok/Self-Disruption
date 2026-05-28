/**
 * POST /api/ride-compliance/disposal/sync
 *   외부 결재 1건을 본 시스템 ride_compliance_disposal_reviews 에 mirror.
 *   같이 ride_compliance_disposal_items 도 채움.
 *   이미 mirror 됐으면 외부 메타만 업데이트.
 *
 * body: { external_approval_id: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { getDisposalAdapter, getAdapterMode } from '@/lib/external-disposal-adapter'
import { randomUUID } from 'crypto'

// P12-H — varchar(100) 외부 날짜 → MySQL DATETIME 호환 문자열
// Prisma $executeRaw 의 Date 객체 직렬화 회피 (nested JSON 오류).
function toDt(v: string | null | undefined): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (s === '') return null
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const extId = Number(body?.external_approval_id || 0)
    if (!extId) {
      return NextResponse.json({ success: false, error: 'external_approval_id 필요' }, { status: 400 })
    }

    const adapter = getDisposalAdapter()
    const mode = getAdapterMode()

    // 1. 외부 결재 1건 조회
    const externals = await adapter.listApprovals({ limit: 200 })
    const ext = externals.find(e => e.id === extId)
    if (!ext) {
      return NextResponse.json({ success: false, error: `외부 결재 #${extId} 못 찾음` }, { status: 404 })
    }

    // 2. 외부 항목 조회 (사용자 SQL JOIN 결과)
    const items = await adapter.listItemsByApproval(extId)

    // 3. mirror — UPSERT 패턴
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM ride_compliance_disposal_reviews WHERE external_approval_id = ${extId} LIMIT 1
    `

    let reviewId: string
    if (existing.length > 0) {
      reviewId = existing[0].id
      await prisma.$executeRaw`
        UPDATE ride_compliance_disposal_reviews
           SET external_request_at      = ${toDt(ext.request_at)},
               external_request_by      = ${ext.request_by},
               external_expired_count   = ${ext.expired_count},
               external_approval_doc_id = ${ext.approval_request_id},
               external_approval_at     = ${toDt(ext.approval_request_at)},
               external_deleted_at      = ${toDt(ext.deleted_at)},
               external_deleted_by      = ${ext.deleted_by},
               external_confirmed_at    = ${toDt(ext.confirmed_at)},
               external_confirmed_by    = ${ext.confirmed_by},
               last_sync_at             = NOW(),
               sync_source              = ${mode}
         WHERE id = ${reviewId}
      `
      // 기존 items 삭제 후 재삽입 (스냅샷 갱신)
      await prisma.$executeRaw`DELETE FROM ride_compliance_disposal_items WHERE review_id = ${reviewId}`
    } else {
      reviewId = randomUUID()
      await prisma.$executeRaw`
        INSERT INTO ride_compliance_disposal_reviews
          (id, external_approval_id, external_request_at, external_request_by,
           external_expired_count, external_approval_doc_id, external_approval_at,
           external_deleted_at, external_deleted_by, external_confirmed_at, external_confirmed_by,
           review_status, last_sync_at, sync_source)
        VALUES
          (${reviewId}, ${extId},
           ${toDt(ext.request_at)}, ${ext.request_by},
           ${ext.expired_count}, ${ext.approval_request_id},
           ${toDt(ext.approval_request_at)},
           ${toDt(ext.deleted_at)}, ${ext.deleted_by},
           ${toDt(ext.confirmed_at)}, ${ext.confirmed_by},
           'pending', NOW(), ${mode})
      `
    }

    // 4. items insert
    for (const it of items) {
      await prisma.$executeRaw`
        INSERT INTO ride_compliance_disposal_items
          (id, review_id, external_item_id, data_type, data_id,
           custname, carsnums, carsodnm, imagkind_label, imagonam, external_deleted_at)
        VALUES
          (${randomUUID()}, ${reviewId}, ${it.external_item_id}, ${it.data_type}, ${it.data_id},
           ${it.custname}, ${it.carsnums}, ${it.carsodnm}, ${it.imagkind_label}, ${it.imagonam},
           ${it.external_deleted_at ? new Date(it.external_deleted_at) : null})
      `
    }

    // 5. audit
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_disposal_audit
        (id, review_id, action, actor_id, actor_name, note)
      VALUES
        (${randomUUID()}, ${reviewId}, 'sync', ${user.id}, ${(user as any).name || user.email || null},
         ${`외부 결재 #${extId} ${existing.length > 0 ? '갱신' : '신규'} sync — items ${items.length}건`})
    `

    return NextResponse.json({
      success: true,
      data: { review_id: reviewId, items_count: items.length, mode },
    })
  } catch (e: any) {
    console.error('[POST /disposal/sync] error:', e)
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}
