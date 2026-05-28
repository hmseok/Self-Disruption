/**
 * GET    /api/ride-compliance/disposal/[id]    — 결재 상세 + items
 * PATCH  /api/ride-compliance/disposal/[id]    — 액션 (approve / reject / confirm)
 *
 * body (PATCH):
 *   { action: 'approve' | 'reject' | 'confirm', note?: string, reason?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

type Row = { [k: string]: any }

function fmtDate(d: Date | null | undefined) {
  if (!d) return null
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

    const { id } = await ctx.params

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT * FROM ride_compliance_disposal_reviews WHERE id = ${id} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '결재 row 없음' }, { status: 404 })
    }
    const r = rows[0]

    const items = await prisma.$queryRaw<Row[]>`
      SELECT id, external_item_id, data_type, data_id, custname,
             carsnums, carsodnm, imagkind_label, imagonam, external_deleted_at
        FROM ride_compliance_disposal_items WHERE review_id = ${id}
        ORDER BY custname, data_type, data_id
    `

    const audits = await prisma.$queryRaw<Row[]>`
      SELECT id, action, actor_id, actor_name, action_at, note
        FROM ride_compliance_disposal_audit WHERE review_id = ${id}
        ORDER BY action_at DESC
        LIMIT 50
    `

    return NextResponse.json({
      success: true,
      data: {
        review: {
          id: r.id,
          external_approval_id: r.external_approval_id != null ? Number(r.external_approval_id) : null,
          external_request_at: fmtDate(r.external_request_at),
          external_request_by: r.external_request_by,
          external_expired_count: r.external_expired_count != null ? Number(r.external_expired_count) : null,
          external_approval_doc_id: r.external_approval_doc_id,
          external_approval_at: fmtDate(r.external_approval_at),
          external_deleted_at: fmtDate(r.external_deleted_at),
          external_deleted_by: r.external_deleted_by,
          external_confirmed_at: fmtDate(r.external_confirmed_at),
          external_confirmed_by: r.external_confirmed_by,
          review_status: r.review_status,
          reviewer_id: r.reviewer_id,
          reviewed_at: fmtDate(r.reviewed_at),
          review_note: r.review_note,
          review_reason: r.review_reason,
          deliverable_id: r.deliverable_id,
          deliverable_issued_at: fmtDate(r.deliverable_issued_at),
          last_sync_at: fmtDate(r.last_sync_at),
          sync_source: r.sync_source,
          created_at: fmtDate(r.created_at),
          updated_at: fmtDate(r.updated_at),
        },
        items: items.map(it => ({
          id: it.id,
          external_item_id: it.external_item_id != null ? Number(it.external_item_id) : null,
          data_type: it.data_type,
          data_id: it.data_id,
          custname: it.custname,
          carsnums: it.carsnums,
          carsodnm: it.carsodnm,
          imagkind_label: it.imagkind_label,
          imagonam: it.imagonam,
          external_deleted_at: fmtDate(it.external_deleted_at),
        })),
        audits: audits.map(a => ({
          id: a.id,
          action: a.action,
          actor_id: a.actor_id,
          actor_name: a.actor_name,
          action_at: fmtDate(a.action_at),
          note: a.note,
        })),
      },
    })
  } catch (e: any) {
    console.error('[GET /disposal/:id] error:', e)
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')
    const note = body?.note ? String(body.note) : null
    const reason = body?.reason ? String(body.reason) : null

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT id, review_status FROM ride_compliance_disposal_reviews WHERE id = ${id} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '결재 row 없음' }, { status: 404 })
    }
    const current = rows[0]

    let nextStatus = current.review_status

    if (action === 'approve') {
      if (current.review_status !== 'pending') {
        return NextResponse.json({ success: false, error: `현재 상태 ${current.review_status} — pending 만 승인 가능` }, { status: 400 })
      }
      nextStatus = 'approved'
      await prisma.$executeRaw`
        UPDATE ride_compliance_disposal_reviews
           SET review_status = 'approved',
               reviewer_id   = ${user.id},
               reviewed_at   = NOW(),
               review_note   = ${note}
         WHERE id = ${id}
      `
    } else if (action === 'reject') {
      if (current.review_status !== 'pending') {
        return NextResponse.json({ success: false, error: `현재 상태 ${current.review_status} — pending 만 반려 가능` }, { status: 400 })
      }
      if (!reason) {
        return NextResponse.json({ success: false, error: '반려 사유 (reason) 필수' }, { status: 400 })
      }
      nextStatus = 'rejected'
      await prisma.$executeRaw`
        UPDATE ride_compliance_disposal_reviews
           SET review_status = 'rejected',
               reviewer_id   = ${user.id},
               reviewed_at   = NOW(),
               review_note   = ${note},
               review_reason = ${reason}
         WHERE id = ${id}
      `
    } else if (action === 'confirm') {
      // executed → confirmed (외부 삭제 실행 후 본 시스템 최종 확인)
      if (current.review_status !== 'executed' && current.review_status !== 'approved') {
        return NextResponse.json({ success: false, error: `현재 상태 ${current.review_status} — executed/approved 만 confirm 가능` }, { status: 400 })
      }
      nextStatus = 'confirmed'
      await prisma.$executeRaw`
        UPDATE ride_compliance_disposal_reviews
           SET review_status = 'confirmed',
               reviewed_at   = NOW(),
               review_note   = ${note}
         WHERE id = ${id}
      `
    } else {
      return NextResponse.json({ success: false, error: `미지원 action: ${action}` }, { status: 400 })
    }

    // audit
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_disposal_audit
        (id, review_id, action, actor_id, actor_name, note)
      VALUES
        (${randomUUID()}, ${id}, ${action}, ${user.id}, ${(user as any).name || user.email || null}, ${note || reason || null})
    `

    return NextResponse.json({ success: true, data: { id, review_status: nextStatus } })
  } catch (e: any) {
    console.error('[PATCH /disposal/:id] error:', e)
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}
