/**
 * /api/ride-compliance/documents/[id]/approve
 *
 * POST — CPO 승인 + 스케줄 자동 적용 (Phase 1.4-C + D).
 *        1. is_master_verified=1 + status='active' (검수 완료)
 *        2. extracted_actions → ride_compliance_tasks 자동 INSERT
 *        3. documents.schedule_applied_at = NOW()
 *
 * 권한: cpo only.
 *
 * 사용자 비전 (2026-05-19):
 *   "최종 정정 또는 완료 승인이 되면 기준에 따라 적용 스케줄, 스텝별 작동"
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { canVerifyMaster } from '@/lib/ride-compliance-perm'
import { applySchedule } from '@/lib/compliance-schedule-applier'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await canVerifyMaster(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — CPO 또는 시스템 관리자만 승인 가능' }, { status: 403 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  let body: { approve_note?: string; skip_schedule?: boolean } = {}
  try { body = await request.json() } catch { /* allow empty */ }
  const approveNote = body.approve_note ? String(body.approve_note) : null
  const skipSchedule = body.skip_schedule === true

  try {
    // 1. 사전 조건 — content_md 있어야 + review_results 있어야 (review 안 했으면 차단)
    const docs = await prisma.$queryRaw<Array<{
      id: string
      doc_code: string
      title: string
      content_md: string | null
      review_results: unknown
      extracted_actions: unknown
    }>>`
      SELECT id, doc_code, title, content_md, review_results, extracted_actions
        FROM ride_compliance_documents
       WHERE id = ${id} LIMIT 1
    `
    if (!docs.length) return NextResponse.json({ success: false, error: 'document not found' }, { status: 404 })
    const doc = docs[0]

    if (!doc.content_md || doc.content_md.length < 50) {
      return NextResponse.json({ success: false, error: 'content_md 미입력 — 본문 등록 후 승인 가능' }, { status: 400 })
    }
    if (!doc.review_results) {
      return NextResponse.json({ success: false, error: '자동 검토 미실행 — single-review 먼저 실행 후 승인' }, { status: 400 })
    }

    // 2. 승인 — is_master_verified=1, status='active'
    await prisma.$executeRaw`
      UPDATE ride_compliance_documents
         SET is_master_verified = 1,
             verified_by_user_id = ${user.id},
             verified_by_cpo_at = NOW(),
             verification_note = ${approveNote},
             status = 'active',
             updated_at = NOW()
       WHERE id = ${id}
    `

    // 3. 스케줄 자동 적용 (skip_schedule=false 일 때만)
    let scheduleResult = null
    if (!skipSchedule && doc.extracted_actions) {
      scheduleResult = await applySchedule(id, user.id)
    }

    return NextResponse.json({
      success: true,
      data: {
        doc_code: doc.doc_code,
        title: doc.title,
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        schedule: scheduleResult,
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist") || err.message?.includes('Unknown column')) {
      return NextResponse.json({
        success: true, data: null,
        meta: { _migration_pending: 'phase14' },
      }, { status: 200 })
    }
    console.error('[/api/ride-compliance/documents/[id]/approve POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
