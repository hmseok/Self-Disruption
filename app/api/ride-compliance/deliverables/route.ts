/**
 * /api/ride-compliance/deliverables
 *
 * GET  — 산출물·외부 송부 list (filter: category / status / q / sent_from / sent_to)
 * POST — 신규 산출물 등록 (manager+ 권한)
 *
 * 도메인 (Phase 1.5 — 2026-05-28):
 *   임명장 / 단말기 반출대장 / 파기 확인서 / 유출 통지서 / 자체감사 결과서 등
 *   외부 기관·내부 부서 송부 추적. form_submissions(내부 작성본) 과 별개.
 *
 * 운영 사실 (_docs/COMPLIANCE-OPERATIONS.md):
 *   - 데이터 영역 — 웹 UI 자유 CRUD
 *   - 매뉴얼 영역 (ride_compliance_documents) 과 다름 — 산출물은 변경 가능
 *
 * Rule 11 사전 검증:
 *   - profiles.id, profiles.name (schema.prisma:profiles 모델 확인 완료)
 *   - ride_compliance_deliverables 컬럼 22개 (마이그 2026-05-28 적용 확인 — SHOW CREATE 통과)
 *
 * Rule 13 회색 함수 미사용 — COALESCE / LEFT JOIN / 단순 SELECT 만.
 *
 * Rule 22 _docs 동기화:
 *   - app/(employees)/RideCompliance/_docs/CHANGELOG.md (이 PR 한 줄 추가)
 *   - app/(employees)/RideCompliance/_docs/DATA-MODEL.md (테이블 정의 추가)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

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

const CATEGORIES = [
  'appointment',        // 임명장
  'device_logbook',     // 단말기 반출대장
  'destruction_cert',   // 파기 확인서
  'breach_notice',      // 유출 통지서
  'audit_report',       // 자체감사 결과서
  'inspection_request', // 점검 의뢰
  'training_record',    // 교육 결과 송부
  'other',
] as const

// STATUSES / SENT_METHODS 는 PATCH 측 ([id]/route.ts) + UI 측 page.tsx 에서 검증.

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)

  const url = new URL(request.url)
  const category = (url.searchParams.get('category') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()
  const sentFrom = (url.searchParams.get('sent_from') || '').trim()
  const sentTo = (url.searchParams.get('sent_to') || '').trim()
  const like = q ? `%${q}%` : null

  try {
    const rows = await prisma.$queryRaw<DeliverableRow[]>`
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
       WHERE (${category} = '' OR d.category = ${category})
         AND (${status} = '' OR d.status = ${status})
         AND (${like} IS NULL
              OR d.title LIKE ${like}
              OR d.deliverable_code LIKE ${like}
              OR d.external_recipient LIKE ${like}
              OR d.notes LIKE ${like})
         AND (${sentFrom} = '' OR d.sent_at >= ${sentFrom})
         AND (${sentTo} = '' OR d.sent_at <= ${sentTo})
       ORDER BY
         CASE d.status
           WHEN 'draft' THEN 1
           WHEN 'approved' THEN 2
           WHEN 'sent' THEN 3
           WHEN 'responded' THEN 4
           WHEN 'closed' THEN 5
           ELSE 99
         END ASC,
         d.created_at DESC
       LIMIT 500
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        count: rows.length,
        my_role: role,
        filters: { category, status, q, sent_from: sentFrom, sent_to: sentTo },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: {
          _migration_pending: 'phase15',
          migration: '2026-05-28_ride_compliance_phase15.sql',
          my_role: role,
        },
      })
    }
    console.error('[/api/ride-compliance/deliverables GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json(
      { success: false, error: 'forbidden — 관리자(manager) 이상만 산출물 등록 가능' },
      { status: 403 }
    )
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const deliverableCode = String(body.deliverable_code || '').trim()
  const category = String(body.category || '').trim()
  const title = String(body.title || '').trim()
  const sourceDocumentId = body.source_document_id ? String(body.source_document_id).trim() : null
  const sourceSubmissionId = body.source_submission_id ? String(body.source_submission_id).trim() : null
  const contentMd = body.content_md ? String(body.content_md) : null
  const gcsObjectPath = body.gcs_object_path ? String(body.gcs_object_path).trim() : null
  const externalRecipient = body.external_recipient ? String(body.external_recipient).trim() : null
  const recipientEmail = body.recipient_email ? String(body.recipient_email).trim() : null
  const preparedBy = body.prepared_by ? String(body.prepared_by).trim() : user.id
  const retentionUntil = body.retention_until ? String(body.retention_until).trim() : null
  const notes = body.notes ? String(body.notes) : null

  if (!deliverableCode) {
    return NextResponse.json({ success: false, error: 'deliverable_code 필수' }, { status: 400 })
  }
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    return NextResponse.json(
      { success: false, error: `category 는 ${CATEGORIES.join('/')} 중 하나` },
      { status: 400 }
    )
  }
  if (!title) return NextResponse.json({ success: false, error: 'title 필수' }, { status: 400 })

  try {
    const id = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_deliverables
        (id, deliverable_code, category, title,
         source_document_id, source_submission_id,
         content_md, gcs_object_path,
         external_recipient, recipient_email,
         prepared_by, status,
         retention_until, notes, created_by)
      VALUES
        (${id}, ${deliverableCode}, ${category}, ${title},
         ${sourceDocumentId}, ${sourceSubmissionId},
         ${contentMd}, ${gcsObjectPath},
         ${externalRecipient}, ${recipientEmail},
         ${preparedBy}, 'draft',
         ${retentionUntil}, ${notes}, ${user.id})
    `
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
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: 'deliverable_code 중복' }, { status: 409 })
    }
    console.error('[/api/ride-compliance/deliverables POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

// 도메인 옵션은 UI 페이지에 직접 정의 — Next.js route handler 는 GET/POST 등만 export.
