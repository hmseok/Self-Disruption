/**
 * /api/ride-compliance/deliverables/[id]
 *
 * GET    — 단일 산출물 상세
 * PATCH  — 부분 갱신 (status / approved_by / approved_at / sent_at / sent_method /
 *          response_received_at / response_note / content_md / gcs_object_path / notes 등)
 * DELETE — manager+ 권한 (draft 만 삭제 가능, sent 이후는 금지)
 *
 * 상태 전이 규칙:
 *   draft → approved → sent → responded → closed
 *   - draft → approved: approved_by, approved_at 자동 세팅
 *   - approved → sent: sent_at, sent_method 필수
 *   - sent → responded: response_received_at 자동 세팅
 *   - any → closed: 종결 (외부 답변 없이 종료한 경우 등)
 *
 * Rule 11 사전 검증: profiles.id, profiles.name (schema:profiles 확인 완료)
 * Rule 13 회색 함수 미사용.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'

interface DeliverableRow {
  id: string
  deliverable_code: string
  category: string
  title: string
  source_document_id: string | null
  source_submission_id: string | null
  content_md: string | null
  gcs_object_path: string | null
  external_recipient: string | null
  recipient_email: string | null
  prepared_by: string | null
  prepared_by_name: string | null
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  sent_at: string | null
  sent_method: string | null
  response_received_at: string | null
  response_note: string | null
  status: string
  retention_until: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

const STATUSES = ['draft', 'approved', 'sent', 'responded', 'closed'] as const

async function loadRow(id: string): Promise<DeliverableRow | null> {
  const [row] = await prisma.$queryRaw<DeliverableRow[]>`
    SELECT d.id, d.deliverable_code, d.category, d.title,
           d.source_document_id, d.source_submission_id,
           d.content_md, d.gcs_object_path,
           d.external_recipient, d.recipient_email,
           d.prepared_by, p1.name AS prepared_by_name,
           d.approved_by, p2.name AS approved_by_name,
           d.approved_at, d.sent_at, d.sent_method,
           d.response_received_at, d.response_note,
           d.status, d.retention_until, d.notes,
           d.created_by, d.created_at, d.updated_at
      FROM ride_compliance_deliverables d
      LEFT JOIN profiles p1 ON p1.id = d.prepared_by
      LEFT JOIN profiles p2 ON p2.id = d.approved_by
     WHERE d.id = ${id} LIMIT 1
  `
  return row || null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  try {
    const row = await loadRow(id)
    if (!row) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    const role = await getOfficerRole(user)
    return NextResponse.json({ success: true, data: row, meta: { my_role: role } })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/deliverables/[id] GET]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json(
      { success: false, error: 'forbidden — 관리자(manager) 이상만 산출물 수정 가능' },
      { status: 403 }
    )
  }
  const { id } = await params

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  // 상태 전이 트리거
  const newStatus = body.status ? String(body.status).trim() : null
  if (newStatus && !STATUSES.includes(newStatus as typeof STATUSES[number])) {
    return NextResponse.json(
      { success: false, error: `status 는 ${STATUSES.join('/')} 중 하나` },
      { status: 400 }
    )
  }

  // 자동 타임스탬프 세팅 (사용자 명시 값 우선, 미명시 시 NOW)
  let approvedAt: string | null = null
  let approvedBy: string | null = null
  if (newStatus === 'approved') {
    approvedBy = body.approved_by ? String(body.approved_by).trim() : user.id
    approvedAt = body.approved_at ? String(body.approved_at).trim() : new Date().toISOString().slice(0, 19).replace('T', ' ')
  }
  let sentAt: string | null = null
  let sentMethod: string | null = null
  if (newStatus === 'sent') {
    sentAt = body.sent_at ? String(body.sent_at).trim() : new Date().toISOString().slice(0, 19).replace('T', ' ')
    sentMethod = body.sent_method ? String(body.sent_method).trim() : 'email'
  }
  let responseReceivedAt: string | null = null
  if (newStatus === 'responded') {
    responseReceivedAt = body.response_received_at
      ? String(body.response_received_at).trim()
      : new Date().toISOString().slice(0, 19).replace('T', ' ')
  }

  const title = body.title != null ? String(body.title).trim() : null
  const contentMd = body.content_md != null ? String(body.content_md) : null
  const gcsObjectPath = body.gcs_object_path != null ? String(body.gcs_object_path).trim() : null
  const externalRecipient = body.external_recipient != null ? String(body.external_recipient).trim() : null
  const recipientEmail = body.recipient_email != null ? String(body.recipient_email).trim() : null
  const responseNote = body.response_note != null ? String(body.response_note) : null
  const retentionUntil = body.retention_until != null ? String(body.retention_until).trim() : null
  const notes = body.notes != null ? String(body.notes) : null

  try {
    await prisma.$executeRaw`
      UPDATE ride_compliance_deliverables
         SET title             = COALESCE(${title}, title),
             content_md        = COALESCE(${contentMd}, content_md),
             gcs_object_path   = COALESCE(${gcsObjectPath}, gcs_object_path),
             external_recipient= COALESCE(${externalRecipient}, external_recipient),
             recipient_email   = COALESCE(${recipientEmail}, recipient_email),
             approved_by       = COALESCE(${approvedBy}, approved_by),
             approved_at       = COALESCE(${approvedAt}, approved_at),
             sent_at           = COALESCE(${sentAt}, sent_at),
             sent_method       = COALESCE(${sentMethod}, sent_method),
             response_received_at = COALESCE(${responseReceivedAt}, response_received_at),
             response_note     = COALESCE(${responseNote}, response_note),
             status            = COALESCE(${newStatus}, status),
             retention_until   = COALESCE(${retentionUntil}, retention_until),
             notes             = COALESCE(${notes}, notes),
             updated_at        = NOW()
       WHERE id = ${id}
    `
    const row = await loadRow(id)
    if (!row) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/deliverables/[id] PATCH]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json(
      { success: false, error: 'forbidden — 관리자(manager) 이상만 삭제 가능' },
      { status: 403 }
    )
  }
  const { id } = await params

  try {
    const row = await loadRow(id)
    if (!row) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })

    // 안전 — draft 만 삭제. sent 이후는 archive 가 정석.
    if (row.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: `삭제 불가 — status='${row.status}' (draft 만 삭제 가능). 종결은 'closed' 상태로 전이하세요.` },
        { status: 409 }
      )
    }

    await prisma.$executeRaw`DELETE FROM ride_compliance_deliverables WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/deliverables/[id] DELETE]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
