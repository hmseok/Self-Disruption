/**
 * /api/ride-compliance/documents/bulk-delete
 *
 * Phase 1.4-fix14 — 규정 문서 관리 「전체 삭제」 (필터 단위 일괄).
 *
 * POST — manager+. body: { ids: string[] } (1~100건).
 *        $transaction cascade (각 id 마다):
 *          · ride_compliance_form_submissions (document_id) 삭제
 *          · ride_compliance_document_versions (document_id) 삭제
 *          · ride_compliance_tasks.source_document_id → NULL
 *          · ride_compliance_documents 삭제
 *        GCS object best-effort 삭제 (트랜잭션 밖).
 *
 * 사용자 통찰: "전체삭제기능추가" — 필터 단위 일괄 삭제로 안전 + 유연.
 * 안전망: 한 번에 100건 이하 + UI 2단계 confirm + 시드 강조.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'

interface DocRow {
  id: string
  doc_code: string
  gcs_object_path: string | null
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — manager+ only' }, { status: 403 })
  }

  let body: { ids?: unknown } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const rawIds = Array.isArray(body.ids) ? body.ids : []
  const ids = rawIds
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    // 중복 제거
    .filter((v, i, a) => a.indexOf(v) === i)

  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: 'ids 배열 필수 (1건 이상)' }, { status: 400 })
  }
  if (ids.length > 100) {
    return NextResponse.json({ success: false, error: '한 번에 100건 이하만 삭제 가능' }, { status: 400 })
  }

  try {
    // 1. 사전 조회 — cascade 전 GCS path 확보
    const docs: DocRow[] = []
    for (const id of ids) {
      const rows = await prisma.$queryRaw<DocRow[]>`
        SELECT id, doc_code, gcs_object_path
          FROM ride_compliance_documents
         WHERE id = ${id} LIMIT 1
      `
      if (rows.length) docs.push(rows[0])
    }

    if (docs.length === 0) {
      return NextResponse.json({ success: false, error: '해당 ID 의 문서를 찾을 수 없음' }, { status: 404 })
    }

    // 2. $transaction cascade — 한 트랜잭션 안에 모두
    let deletedCount = 0
    let versionsCount = 0
    let submissionsCount = 0
    let tasksDetachedCount = 0
    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        // 2-1. form_submissions
        const subResult = await tx.$executeRaw`
          DELETE FROM ride_compliance_form_submissions WHERE document_id = ${id}
        `
        submissionsCount += Number(subResult)

        // 2-2. document_versions
        const verResult = await tx.$executeRaw`
          DELETE FROM ride_compliance_document_versions WHERE document_id = ${id}
        `
        versionsCount += Number(verResult)

        // 2-3. tasks.source_document_id → NULL — Phase 1.4 마이그 미적용 호환
        try {
          const tResult = await tx.$executeRaw`
            UPDATE ride_compliance_tasks
               SET source_document_id = NULL
             WHERE source_document_id = ${id}
          `
          tasksDetachedCount += Number(tResult)
        } catch (innerErr) {
          const ie = innerErr as { message?: string }
          if (!ie.message?.includes('Unknown column')) throw innerErr
          // source_document_id 컬럼 미적용 — skip
        }

        // 2-4. documents 본체
        const dResult = await tx.$executeRaw`
          DELETE FROM ride_compliance_documents WHERE id = ${id}
        `
        deletedCount += Number(dResult)
      }
    })

    // 3. GCS best-effort — 트랜잭션 밖 (실패해도 DB 삭제 유효)
    let gcsDeleted = 0
    const gcsFailures: Array<{ id: string; doc_code: string; error: string }> = []
    if (process.env.GCS_COMPLIANCE_BUCKET) {
      try {
        const { Storage } = await import('@google-cloud/storage')
        const storage = new Storage()
        const bucket = storage.bucket(process.env.GCS_COMPLIANCE_BUCKET)
        for (const doc of docs) {
          if (!doc.gcs_object_path) continue
          try {
            await bucket.file(doc.gcs_object_path).delete({ ignoreNotFound: true })
            gcsDeleted++
          } catch (e) {
            gcsFailures.push({
              id: doc.id,
              doc_code: doc.doc_code,
              error: String((e as { message?: string }).message || e),
            })
          }
        }
      } catch (e) {
        console.warn('[bulk-delete] GCS Storage 초기화 실패 (DB 삭제는 완료):', e)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        requested: ids.length,
        deleted: deletedCount,
        cascade: {
          versions: versionsCount,
          submissions: submissionsCount,
          detached_tasks: tasksDetachedCount,
        },
        gcs: {
          deleted: gcsDeleted,
          failures: gcsFailures,
        },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({ success: false, error: '테이블 미적용 — 마이그레이션 필요' }, { status: 500 })
    }
    console.error('[/api/ride-compliance/documents/bulk-delete POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
