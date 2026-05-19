/**
 * /api/ride-compliance/document-versions
 *
 * GET — 매뉴얼·서식 버전 이력 (filter: document_id 또는 doc_code).
 *       manager+ 권한.
 *
 * POST — 신규 버전 등록 (개정 시) — manager+
 *        새 버전 활성화 시 이전 active 버전을 superseded 로 자동 전환.
 *
 * 매뉴얼 근거: 통합본 5.17 「제·개정 이력」 — 2019.07.01 제정 후 9차례 수정.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface VersionRow {
  id: string
  document_id: string
  document_code: string | null
  document_title: string | null
  version_no: string
  effective_date: string
  superseded_date: string | null
  change_summary: string | null
  approved_by: string | null
  approved_at: string | null
  file_url: string | null
  status: string
  created_at: string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  const url = new URL(request.url)
  const documentId = (url.searchParams.get('document_id') || '').trim()
  const docCode = (url.searchParams.get('doc_code') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()

  try {
    const rows = await prisma.$queryRaw<VersionRow[]>`
      SELECT v.id, v.document_id, d.doc_code AS document_code, d.title AS document_title,
             v.version_no, v.effective_date, v.superseded_date,
             v.change_summary, v.approved_by, v.approved_at, v.file_url, v.status, v.created_at
        FROM ride_compliance_document_versions v
        LEFT JOIN ride_compliance_documents d ON d.id = v.document_id
       WHERE (${documentId} = '' OR v.document_id = ${documentId})
         AND (${docCode} = '' OR d.doc_code = ${docCode})
         AND (${status} = '' OR v.status = ${status})
       ORDER BY v.effective_date DESC
       LIMIT 200
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, my_role: role },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: 'phase12', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/document-versions GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — manager+ only' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const documentId = String(body.document_id || '').trim()
  const versionNo = String(body.version_no || '').trim()
  const effectiveDate = body.effective_date ? String(body.effective_date).trim() : null
  const changeSummary = body.change_summary ? String(body.change_summary) : null
  const approvedBy = body.approved_by ? String(body.approved_by).trim() : null
  const fileUrl = body.file_url ? String(body.file_url).trim() : null
  const activateNow = body.activate === true || body.activate === 'true'

  if (!documentId) return NextResponse.json({ success: false, error: 'document_id 필수' }, { status: 400 })
  if (!versionNo) return NextResponse.json({ success: false, error: 'version_no 필수 (예: V1.1)' }, { status: 400 })
  if (!effectiveDate) return NextResponse.json({ success: false, error: 'effective_date 필수' }, { status: 400 })

  try {
    const id = randomUUID()
    await prisma.$transaction(async (tx) => {
      // 새 버전 INSERT
      await tx.$executeRaw`
        INSERT INTO ride_compliance_document_versions
          (id, document_id, version_no, effective_date, change_summary, approved_by, approved_at, file_url, status)
        VALUES
          (${id}, ${documentId}, ${versionNo}, ${effectiveDate}, ${changeSummary}, ${approvedBy},
           ${activateNow ? new Date() : null}, ${fileUrl},
           ${activateNow ? 'active' : 'draft'})
      `
      // 활성화 시 이전 active 버전을 superseded 로
      if (activateNow) {
        await tx.$executeRaw`
          UPDATE ride_compliance_document_versions
             SET status = 'superseded',
                 superseded_date = ${effectiveDate}
           WHERE document_id = ${documentId}
             AND id <> ${id}
             AND status = 'active'
        `
        // documents 의 current_version 캐시 갱신
        await tx.$executeRaw`
          UPDATE ride_compliance_documents
             SET current_version_id = ${id},
                 current_version_no = ${versionNo},
                 effective_date = ${effectiveDate},
                 updated_at = NOW()
           WHERE id = ${documentId}
        `
      }
    })

    const [row] = await prisma.$queryRaw<VersionRow[]>`
      SELECT v.id, v.document_id, d.doc_code AS document_code, d.title AS document_title,
             v.version_no, v.effective_date, v.superseded_date,
             v.change_summary, v.approved_by, v.approved_at, v.file_url, v.status, v.created_at
        FROM ride_compliance_document_versions v
        LEFT JOIN ride_compliance_documents d ON d.id = v.document_id
       WHERE v.id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/document-versions POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
