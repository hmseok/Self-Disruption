/**
 * /api/ride-compliance/form-submissions
 *
 * GET  — 작성된 서식 인스턴스 list (filter: doc_code/task_id/q/expiring_days)
 *        manager+ 전체 / handler 는 본인 submitted_by 만
 * POST — 서식 작성 (canSubmitForm — 인증 사용자 모두)
 *
 * 매뉴얼 근거: 별첨 1~6 18 서식 + 별첨 7 F-06/F-07.
 *              제33조 「파기대장 최소 3년 보관」 + 제15조 「접속기록 12개월~3년」.
 *
 * retention_until 자동 계산: submitted_at + documents.retention_years.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, canSubmitForm, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface SubmissionRow {
  id: string
  submission_code: string
  document_id: string
  document_code: string
  document_title: string | null
  task_id: string | null
  task_code: string | null
  title: string | null
  submitted_by_user_id: string
  submitted_by_user_name: string | null
  submitted_at: string
  form_data: Record<string, unknown> | null
  file_url: string | null
  retention_until: string
  reviewed_by_user_id: string | null
  reviewed_by_user_name: string | null
  reviewed_at: string | null
  review_status: string
  review_note: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  const isMgr = role === 'cpo' || role === 'manager'

  const url = new URL(request.url)
  const docCode = (url.searchParams.get('doc_code') || '').trim()
  const taskId = (url.searchParams.get('task_id') || '').trim()
  const expiringDaysRaw = url.searchParams.get('expiring_days')
  const expiringDays = expiringDaysRaw ? parseInt(expiringDaysRaw, 10) : null
  const reviewStatus = (url.searchParams.get('review_status') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()
  const like = q ? `%${q}%` : null

  try {
    const rows = await prisma.$queryRaw<SubmissionRow[]>`
      SELECT s.id, s.submission_code, s.document_id, s.document_code, d.title AS document_title,
             s.task_id, t.task_code, s.title,
             s.submitted_by_user_id, su.name AS submitted_by_user_name,
             s.submitted_at, s.form_data, s.file_url, s.retention_until,
             s.reviewed_by_user_id, ru.name AS reviewed_by_user_name,
             s.reviewed_at, s.review_status, s.review_note, s.notes,
             s.created_at, s.updated_at
        FROM ride_compliance_form_submissions s
        LEFT JOIN ride_compliance_documents d ON d.id = s.document_id
        LEFT JOIN ride_compliance_tasks t ON t.id = s.task_id
        LEFT JOIN profiles su ON su.id = s.submitted_by_user_id
        LEFT JOIN profiles ru ON ru.id = s.reviewed_by_user_id
       WHERE (${isMgr ? '__ALL__' : user.id} = '__ALL__' OR s.submitted_by_user_id = ${user.id})
         AND (${docCode} = '' OR s.document_code = ${docCode})
         AND (${taskId} = '' OR s.task_id = ${taskId})
         AND (${reviewStatus} = '' OR s.review_status = ${reviewStatus})
         AND (${expiringDays === null ? -1 : expiringDays} = -1
              OR s.retention_until BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ${expiringDays === null ? 0 : expiringDays} DAY))
         AND (${like} IS NULL OR s.title LIKE ${like} OR s.submission_code LIKE ${like})
       ORDER BY s.submitted_at DESC
       LIMIT 500
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, my_role: role, filters: { doc_code: docCode, task_id: taskId, review_status: reviewStatus, expiring_days: expiringDays, q } },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: 'phase12', migration: '2026-05-18_ride_compliance_phase12.sql', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/form-submissions GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user || !canSubmitForm(user)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const docCode = String(body.document_code || '').trim()
  const taskId = body.task_id ? String(body.task_id).trim() : null
  const title = body.title ? String(body.title).trim() : null
  const formData = body.form_data ? JSON.stringify(body.form_data) : null
  const fileUrl = body.file_url ? String(body.file_url).trim() : null
  const notes = body.notes ? String(body.notes) : null

  if (!docCode) return NextResponse.json({ success: false, error: 'document_code 필수 (예: F-07)' }, { status: 400 })

  try {
    // documents 에서 doc 조회 + 원본 검수 완료 여부 확인
    const docRows = await prisma.$queryRaw<Array<{ id: string; retention_years: number; is_master_verified: number; status: string; title: string }>>`
      SELECT id, retention_years, is_master_verified, status, title
        FROM ride_compliance_documents
       WHERE doc_code = ${docCode} LIMIT 1
    `
    if (!docRows.length) return NextResponse.json({ success: false, error: `document_code 미존재: ${docCode}` }, { status: 404 })
    const doc = docRows[0]
    if (doc.is_master_verified !== 1) {
      return NextResponse.json({
        success: false,
        error: `서식 원본 미검수 — 「자료실」 탭에서 ${docCode} ${doc.title} 의 file_url 등록 + CPO 검수 완료 후 작성 가능 (사용자 추가-C 통찰)`,
        code: 'MASTER_NOT_VERIFIED',
      }, { status: 409 })
    }

    // submission_code 자동: SUB-{YYYY}-{4자리}
    const year = new Date().getFullYear()
    const prefix = `SUB-${year}-`
    const result = await prisma.$transaction(async (tx) => {
      const seqRows = await tx.$queryRaw<Array<{ max_code: string | null }>>`
        SELECT MAX(submission_code) AS max_code FROM ride_compliance_form_submissions
         WHERE submission_code LIKE ${`${prefix}%`}
      `
      let seq = 1
      const maxCode = seqRows[0]?.max_code
      if (maxCode && maxCode.startsWith(prefix)) {
        const tail = maxCode.substring(prefix.length)
        const n = parseInt(tail, 10)
        if (!isNaN(n)) seq = n + 1
      }
      const submissionCode = `${prefix}${String(seq).padStart(4, '0')}`
      const id = randomUUID()
      // retention_until 자동 계산: 현재 + retention_years
      await tx.$executeRaw`
        INSERT INTO ride_compliance_form_submissions
          (id, submission_code, document_id, document_code, task_id, title,
           submitted_by_user_id, form_data, file_url,
           retention_until, review_status, notes)
        VALUES
          (${id}, ${submissionCode}, ${doc.id}, ${docCode}, ${taskId}, ${title},
           ${user.id}, ${formData}, ${fileUrl},
           DATE_ADD(CURDATE(), INTERVAL ${doc.retention_years} YEAR),
           'submitted', ${notes})
      `
      return { id, submissionCode }
    })

    const [row] = await prisma.$queryRaw<SubmissionRow[]>`
      SELECT s.id, s.submission_code, s.document_id, s.document_code, d.title AS document_title,
             s.task_id, t.task_code, s.title,
             s.submitted_by_user_id, su.name AS submitted_by_user_name,
             s.submitted_at, s.form_data, s.file_url, s.retention_until,
             s.reviewed_by_user_id, ru.name AS reviewed_by_user_name,
             s.reviewed_at, s.review_status, s.review_note, s.notes,
             s.created_at, s.updated_at
        FROM ride_compliance_form_submissions s
        LEFT JOIN ride_compliance_documents d ON d.id = s.document_id
        LEFT JOIN ride_compliance_tasks t ON t.id = s.task_id
        LEFT JOIN profiles su ON su.id = s.submitted_by_user_id
        LEFT JOIN profiles ru ON ru.id = s.reviewed_by_user_id
       WHERE s.id = ${result.id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/form-submissions POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
