/**
 * /api/ride-compliance/policies/[id]/sections
 *
 * GET   — 검수용 sections list (filter: kind / user_status)
 * PATCH — bulk 검수 액션 ({ section_id, action: 'confirm' | 'edit' | 'reject', edited_title?, edited_body? })
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'

interface SectionRow {
  id: string
  policy_id: string
  section_kind: string
  section_code: string | null
  title: string
  body_md: string | null
  ai_confidence: number | null
  ai_raw_excerpt: string | null
  sort_order: number
  user_status: string
  user_edited_title: string | null
  user_edited_body_md: string | null
  user_review_note: string | null
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const url = new URL(request.url)
  const kind = (url.searchParams.get('kind') || '').trim()
  const userStatus = (url.searchParams.get('user_status') || '').trim()

  try {
    const rows = await prisma.$queryRaw<SectionRow[]>`
      SELECT s.id, s.policy_id, s.section_kind, s.section_code, s.title, s.body_md,
             s.ai_confidence, s.ai_raw_excerpt, s.sort_order,
             s.user_status, s.user_edited_title, s.user_edited_body_md, s.user_review_note,
             s.reviewed_by, r.name AS reviewed_by_name, s.reviewed_at,
             s.created_at, s.updated_at
        FROM ride_compliance_policy_sections s
        LEFT JOIN profiles r ON r.id = s.reviewed_by
       WHERE s.policy_id = ${id}
         AND (${kind} = '' OR s.section_kind = ${kind})
         AND (${userStatus} = '' OR s.user_status = ${userStatus})
       ORDER BY s.section_kind ASC, s.sort_order ASC, s.created_at ASC
       LIMIT 2000
    `
    return NextResponse.json({
      success: true, data: rows,
      meta: {
        count: rows.length,
        by_kind: {
          article: rows.filter(r => r.section_kind === 'article').length,
          attachment: rows.filter(r => r.section_kind === 'attachment').length,
          playbook_step: rows.filter(r => r.section_kind === 'playbook_step').length,
          annual_event: rows.filter(r => r.section_kind === 'annual_event').length,
        },
        by_status: {
          ai_draft: rows.filter(r => r.user_status === 'ai_draft').length,
          user_edited: rows.filter(r => r.user_status === 'user_edited').length,
          user_confirmed: rows.filter(r => r.user_status === 'user_confirmed').length,
          rejected: rows.filter(r => r.user_status === 'rejected').length,
        },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({ success: true, data: [], meta: { _migration_pending: 'phase20' } })
    }
    console.error('[/api/ride-compliance/policies/[id]/sections GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자 이상만 검수 가능' }, { status: 403 })
  }
  const { id: policyId } = await params

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const sectionId = String(body.section_id || '').trim()
  const action = String(body.action || '').trim() as 'confirm' | 'edit' | 'reject' | 'reset'
  if (!sectionId) return NextResponse.json({ success: false, error: 'section_id 필수' }, { status: 400 })
  if (!['confirm', 'edit', 'reject', 'reset'].includes(action)) {
    return NextResponse.json({ success: false, error: 'action 은 confirm/edit/reject/reset' }, { status: 400 })
  }

  const editedTitle = body.edited_title != null ? String(body.edited_title).trim() : null
  const editedBody = body.edited_body != null ? String(body.edited_body) : null
  const note = body.note != null ? String(body.note) : null

  let newStatus: string
  switch (action) {
    case 'confirm': newStatus = 'user_confirmed'; break
    case 'edit':    newStatus = 'user_edited';    break
    case 'reject':  newStatus = 'rejected';       break
    case 'reset':   newStatus = 'ai_draft';       break
    default:        newStatus = 'ai_draft'
  }

  try {
    await prisma.$executeRaw`
      UPDATE ride_compliance_policy_sections
         SET user_status         = ${newStatus},
             user_edited_title   = COALESCE(${editedTitle}, user_edited_title),
             user_edited_body_md = COALESCE(${editedBody}, user_edited_body_md),
             user_review_note    = COALESCE(${note}, user_review_note),
             reviewed_by         = ${user.id},
             reviewed_at         = NOW(),
             updated_at          = NOW()
       WHERE id = ${sectionId}
         AND policy_id = ${policyId}
    `
    const [row] = await prisma.$queryRaw<SectionRow[]>`
      SELECT * FROM ride_compliance_policy_sections WHERE id = ${sectionId} LIMIT 1
    `
    if (!row) return NextResponse.json({ success: false, error: 'section not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/policies/[id]/sections PATCH]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
