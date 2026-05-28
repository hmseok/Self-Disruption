/**
 * POST /api/ride-compliance/disposal/sync-all
 *
 * 외부 yangjaehee (cafe24) 의 expired_approval 전체를 본 ERP DB 의
 * ride_compliance_disposal_reviews 로 ETL mirror.
 * 각 결재의 items 도 ride_compliance_disposal_items 로 함께 mirror.
 *
 * 사용자 결정 (2026-05-28):
 *   직접 cafe24 호출 X — 본 ERP DB 의 mirror 만 평시 조회.
 *   외부에서 가져오기는 본 endpoint 명시적 호출 (관리자 액션 또는 일일 cron).
 *
 * body (optional):
 *   { since?: 'YYYY-MM-DD', limit?: number, dry_run?: boolean }
 *
 * 응답:
 *   { success: true, data: {
 *       fetched, new, updated, items_inserted, errors: [] } }
 *
 * 인증: verifyUser + admin/manager 권한 권장 (CPO/시스템관리자).
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { getDisposalAdapter, getAdapterMode } from '@/lib/external-disposal-adapter'
import { randomUUID } from 'crypto'

export const maxDuration = 60

// P12-H — 외부 varchar(100) 날짜를 MySQL DATETIME 컬럼이 받는 문자열로 정규화.
// Prisma $executeRaw 는 Date 객체를 nested JSON 으로 직렬화 → "Expected Flat JSON array" 오류 발생.
// → 'YYYY-MM-DD HH:MM:SS' 문자열로 넘기면 안전.
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
    const since: string | undefined = body?.since
    const limit = Math.max(1, Math.min(500, Number(body?.limit ?? 100)))
    const dryRun = !!body?.dry_run

    const adapter = getDisposalAdapter()
    const mode = getAdapterMode()
    const actorName = (user as any).name || user.email || 'system'

    // 1. 외부 결재 전체 fetch
    let externals: Awaited<ReturnType<typeof adapter.listApprovals>> = []
    try {
      externals = await adapter.listApprovals({ sinceDate: since, limit })
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: `외부 어댑터 호출 실패: ${e?.message || e}`,
        adapter_mode: mode,
      }, { status: 500 })
    }

    const result = {
      adapter_mode: mode,
      fetched: externals.length,
      new: 0,
      updated: 0,
      items_inserted: 0,
      errors: [] as Array<{ external_approval_id: number; error: string }>,
    }

    if (dryRun) {
      return NextResponse.json({ success: true, data: { ...result, dry_run: true, sample: externals.slice(0, 5) } })
    }

    // 2. 각 외부 결재 → mirror UPSERT + items 재삽입
    for (const ext of externals) {
      try {
        const existing = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM ride_compliance_disposal_reviews WHERE external_approval_id = ${ext.id} LIMIT 1
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
          result.updated++
        } else {
          reviewId = randomUUID()
          await prisma.$executeRaw`
            INSERT INTO ride_compliance_disposal_reviews
              (id, external_approval_id, external_request_at, external_request_by,
               external_expired_count, external_approval_doc_id, external_approval_at,
               external_deleted_at, external_deleted_by, external_confirmed_at, external_confirmed_by,
               review_status, last_sync_at, sync_source)
            VALUES
              (${reviewId}, ${ext.id},
               ${toDt(ext.request_at)}, ${ext.request_by},
               ${ext.expired_count}, ${ext.approval_request_id},
               ${toDt(ext.approval_request_at)},
               ${toDt(ext.deleted_at)}, ${ext.deleted_by},
               ${toDt(ext.confirmed_at)}, ${ext.confirmed_by},
               'pending', NOW(), ${mode})
          `
          result.new++
        }

        // items 재삽입 (snapshot 갱신)
        try {
          const items = await adapter.listItemsByApproval(ext.id)
          await prisma.$executeRaw`DELETE FROM ride_compliance_disposal_items WHERE review_id = ${reviewId}`
          for (const it of items) {
            await prisma.$executeRaw`
              INSERT INTO ride_compliance_disposal_items
                (id, review_id, external_item_id, data_type, data_id,
                 custname, carsnums, carsodnm, imagkind_label, imagonam, external_deleted_at)
              VALUES
                (${randomUUID()}, ${reviewId}, ${it.external_item_id}, ${it.data_type}, ${it.data_id},
                 ${it.custname}, ${it.carsnums}, ${it.carsodnm}, ${it.imagkind_label}, ${it.imagonam},
                 ${toDt(it.external_deleted_at)})
            `
            result.items_inserted++
          }
        } catch (itErr: any) {
          result.errors.push({
            external_approval_id: ext.id,
            error: `items sync 실패: ${itErr?.message || itErr}`,
          })
        }

        // audit
        await prisma.$executeRaw`
          INSERT INTO ride_compliance_disposal_audit
            (id, review_id, action, actor_id, actor_name, note)
          VALUES
            (${randomUUID()}, ${reviewId}, 'sync', ${user.id}, ${actorName},
             ${`batch sync — 외부 #${ext.id}`})
        `
      } catch (e: any) {
        result.errors.push({
          external_approval_id: ext.id,
          error: String(e?.message || e),
        })
      }
    }

    return NextResponse.json({ success: true, data: result })
  } catch (e: any) {
    console.error('[POST /disposal/sync-all] error:', e)
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}
