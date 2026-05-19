/**
 * /api/ride-compliance/tasks/[id]/complete
 *
 * PATCH — task 완료/진행상태 처리.
 * 권한: assignee 본인 또는 manager+ (handler 가 본인 task 완료 처리 가능).
 *
 * body:
 *   { action: 'start' | 'complete' | 'cpo_review' | 'reopen' | 'skip',
 *     evidence_notes?: string,
 *     cpo_review_note?: string }
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, isCpo } from '@/lib/ride-compliance-perm'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const params = await context.params
  const id = params?.id
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* allow empty */ }
  const action = String(body.action || 'complete').trim()
  const evidenceNotes = body.evidence_notes ? String(body.evidence_notes) : null
  const cpoReviewNote = body.cpo_review_note ? String(body.cpo_review_note) : null

  try {
    // 권한: assignee 본인 또는 manager+
    const taskRows = await prisma.$queryRaw<Array<{ assignee_user_id: string | null; status: string }>>`
      SELECT assignee_user_id, status FROM ride_compliance_tasks WHERE id = ${id} LIMIT 1
    `
    if (!taskRows.length) return NextResponse.json({ success: false, error: 'task not found' }, { status: 404 })

    const isMgr = await isManager(user)
    const isCpoUser = await isCpo(user)
    const isAssignee = taskRows[0].assignee_user_id === user.id
    if (!isMgr && !isAssignee) {
      return NextResponse.json({ success: false, error: 'forbidden — 본인 task 또는 관리자만 처리 가능' }, { status: 403 })
    }

    if (action === 'start') {
      await prisma.$executeRaw`
        UPDATE ride_compliance_tasks
           SET status = 'in_progress', updated_at = NOW()
         WHERE id = ${id} AND status = 'pending'
      `
    } else if (action === 'complete') {
      await prisma.$executeRaw`
        UPDATE ride_compliance_tasks
           SET status = 'done',
               completed_at = NOW(),
               completed_by_user_id = ${user.id},
               evidence_notes = COALESCE(${evidenceNotes}, evidence_notes),
               updated_at = NOW()
         WHERE id = ${id}
      `
    } else if (action === 'cpo_review') {
      if (!isCpoUser) return NextResponse.json({ success: false, error: 'forbidden — CPO 검토는 CPO만' }, { status: 403 })
      await prisma.$executeRaw`
        UPDATE ride_compliance_tasks
           SET cpo_reviewed_at = NOW(),
               cpo_review_note = COALESCE(${cpoReviewNote}, cpo_review_note),
               updated_at = NOW()
         WHERE id = ${id}
      `
    } else if (action === 'reopen') {
      if (!isMgr) return NextResponse.json({ success: false, error: 'forbidden — 재오픈은 관리자만' }, { status: 403 })
      await prisma.$executeRaw`
        UPDATE ride_compliance_tasks
           SET status = 'pending',
               completed_at = NULL,
               completed_by_user_id = NULL,
               updated_at = NOW()
         WHERE id = ${id}
      `
    } else if (action === 'skip') {
      if (!isMgr) return NextResponse.json({ success: false, error: 'forbidden — 건너뛰기는 관리자만' }, { status: 403 })
      await prisma.$executeRaw`
        UPDATE ride_compliance_tasks
           SET status = 'skipped',
               evidence_notes = COALESCE(${evidenceNotes}, evidence_notes),
               updated_at = NOW()
         WHERE id = ${id}
      `
    } else {
      return NextResponse.json({ success: false, error: `unknown action: ${action}` }, { status: 400 })
    }

    const [row] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT t.id, t.task_code, t.title, t.status, t.completed_at, t.completed_by_user_id,
             cu.name AS completed_by_user_name,
             t.evidence_notes, t.cpo_reviewed_at, t.cpo_review_note, t.updated_at
        FROM ride_compliance_tasks t
        LEFT JOIN profiles cu ON cu.id = t.completed_by_user_id
       WHERE t.id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row, action })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/tasks/[id]/complete PATCH]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
