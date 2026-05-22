/**
 * /api/ride-compliance/documents/[id]
 *
 * Phase 1.4-fix13 — 규정 문서 관리 CRUD 완성.
 *
 * DELETE — 문서 삭제 (manager+). $transaction cascade:
 *          · ride_compliance_form_submissions (document_id) 삭제
 *          · ride_compliance_document_versions (document_id) 삭제
 *          · ride_compliance_tasks.source_document_id → NULL (task 자체 보존)
 *          · ride_compliance_documents 삭제
 *          · GCS object best-effort 삭제 (gcs_object_path 있으면)
 *
 * PATCH  — 검수 상태 리셋 (manager+). body { action: 'reset' }:
 *          · is_master_verified = 0
 *          · status = 'pending'
 *          · verified_by_user_id / verified_by_cpo_at / verification_note → NULL
 *          · content_md / gcs_object_path / current_version_id 는 유지 (업로드본 보존)
 *          → 업로드 → 검토 → 승인 흐름 재실행 가능
 *
 * 사용자 통찰 (2026-05-19): "기존 자료 삭제 후 새로 업로드하여 플로우 확인" —
 *   카탈로그 고정 모델에서 자유 CRUD 모델로 보완.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'

interface DocRow {
  id: string
  doc_code: string
  doc_type: string
  title: string
  gcs_object_path: string | null
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — manager+ only' }, { status: 403 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  try {
    // 1. 문서 로드 (존재 확인 + GCS path 확보)
    const docs = await prisma.$queryRaw<DocRow[]>`
      SELECT id, doc_code, doc_type, title, gcs_object_path
        FROM ride_compliance_documents
       WHERE id = ${id} LIMIT 1
    `
    if (!docs.length) {
      return NextResponse.json({ success: false, error: 'document not found' }, { status: 404 })
    }
    const doc = docs[0]

    // 2. $transaction cascade 삭제
    let deletedVersions = 0
    let deletedSubmissions = 0
    let detachedTasks = 0
    await prisma.$transaction(async (tx) => {
      // 2-1. form_submissions 삭제
      deletedSubmissions = await tx.$executeRaw`
        DELETE FROM ride_compliance_form_submissions WHERE document_id = ${id}
      `
      // 2-2. document_versions 삭제
      deletedVersions = await tx.$executeRaw`
        DELETE FROM ride_compliance_document_versions WHERE document_id = ${id}
      `
      // 2-3. tasks.source_document_id → NULL (task 보존, 출처만 분리)
      //      Phase 1.4 마이그 미적용 환경 호환 — 컬럼 없으면 graceful skip
      try {
        detachedTasks = await tx.$executeRaw`
          UPDATE ride_compliance_tasks
             SET source_document_id = NULL
           WHERE source_document_id = ${id}
        `
      } catch (e) {
        const err = e as { message?: string }
        if (!err.message?.includes('Unknown column')) throw e
        // source_document_id 컬럼 미적용 — skip
      }
      // 2-4. documents 본체 삭제
      await tx.$executeRaw`
        DELETE FROM ride_compliance_documents WHERE id = ${id}
      `
    })

    // 3. GCS object best-effort 삭제 (트랜잭션 밖 — 실패해도 DB 삭제는 유효)
    let gcsDeleted = false
    let gcsError: string | null = null
    if (doc.gcs_object_path && process.env.GCS_COMPLIANCE_BUCKET) {
      try {
        const { Storage } = await import('@google-cloud/storage')
        const storage = new Storage()
        await storage.bucket(process.env.GCS_COMPLIANCE_BUCKET)
          .file(doc.gcs_object_path)
          .delete({ ignoreNotFound: true })
        gcsDeleted = true
      } catch (e) {
        gcsError = String((e as { message?: string }).message || e)
        console.warn('[documents DELETE] GCS 삭제 실패 (DB 삭제는 완료):', gcsError)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        deleted_document: { id: doc.id, doc_code: doc.doc_code, title: doc.title },
        cascade: {
          versions: deletedVersions,
          submissions: deletedSubmissions,
          detached_tasks: detachedTasks,
        },
        gcs: { deleted: gcsDeleted, error: gcsError },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({ success: false, error: '테이블 미적용 — 마이그레이션 필요' }, { status: 500 })
    }
    console.error('[/api/ride-compliance/documents/[id] DELETE]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — manager+ only' }, { status: 403 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  let body: { action?: string } = {}
  try { body = await request.json() } catch { /* allow empty */ }
  const action = String(body.action || '').trim()

  if (action !== 'reset') {
    return NextResponse.json({ success: false, error: "action 은 'reset' 만 지원" }, { status: 400 })
  }

  try {
    // 존재 확인
    const docs = await prisma.$queryRaw<DocRow[]>`
      SELECT id, doc_code, doc_type, title, gcs_object_path
        FROM ride_compliance_documents
       WHERE id = ${id} LIMIT 1
    `
    if (!docs.length) {
      return NextResponse.json({ success: false, error: 'document not found' }, { status: 404 })
    }

    // 검수 상태 리셋 — content_md / gcs_object_path / current_version_id 는 유지
    await prisma.$executeRaw`
      UPDATE ride_compliance_documents
         SET is_master_verified = 0,
             status = 'pending',
             verified_by_user_id = NULL,
             verified_by_cpo_at = NULL,
             verification_note = NULL,
             updated_at = NOW()
       WHERE id = ${id}
    `

    return NextResponse.json({
      success: true,
      data: {
        id: docs[0].id,
        doc_code: docs[0].doc_code,
        message: '검수 상태 리셋 완료 — pending 상태. 재검토 → 승인 흐름 재실행 가능',
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/documents/[id] PATCH]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
