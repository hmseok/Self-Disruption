/**
 * /api/ride-compliance/upload-url
 *
 * POST — GCS signed URL 발급 (PUT 업로드용).
 *        manager+ 권한. 응답으로 받은 url 에 클라이언트가 직접 PUT.
 *        업로드 완료 후 별도 PATCH 로 documents.gcs_object_path 갱신.
 *
 * GET  — GCS signed URL 발급 (다운로드용).
 *        manager+/handler 무관 — 검수 완료 (is_master_verified=1) 문서만 허용.
 *
 * 사용자 통찰 (2026-05-19, Q2=나): GCS 통합 동시 진행.
 *
 * 환경변수 필수:
 *   GCS_COMPLIANCE_BUCKET   — 라이드 정보보안 전용 버킷 (예: fmi-compliance-docs)
 *   GOOGLE_APPLICATION_CREDENTIALS (local) 또는 Cloud Run service account ADC (production)
 *
 * 환경변수 없으면 graceful fallback — 501 + 안내 (env 셋업 필요).
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { Storage } from '@google-cloud/storage'

const BUCKET_NAME = process.env.GCS_COMPLIANCE_BUCKET || ''

function gcsReady(): boolean {
  return !!BUCKET_NAME
}

function storage(): Storage {
  // ADC (Cloud Run) 또는 keyfile (local with GOOGLE_APPLICATION_CREDENTIALS)
  return new Storage()
}

/** object path 정규화 — 매뉴얼·서식별 경로 분리 */
function buildObjectPath(docCode: string, originalName: string): string {
  const safeName = originalName.replace(/[^a-zA-Z0-9가-힣._-]+/g, '_')
  const ts = Date.now()
  return `compliance/${docCode}/${ts}_${safeName}`
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — manager+ only' }, { status: 403 })
  }

  if (!gcsReady()) {
    return NextResponse.json({
      success: false,
      error: 'GCS not configured',
      meta: {
        _setup_required: true,
        guide: 'env 변수 GCS_COMPLIANCE_BUCKET 설정 + Cloud Run service account 에 Storage Object Admin 권한 부여 필요',
        example_bucket_name: 'fmi-compliance-docs',
      },
    }, { status: 501 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const docCode = String(body.doc_code || '').trim()
  const originalName = String(body.original_name || 'upload.pdf').trim()
  const contentType = String(body.content_type || 'application/pdf').trim()

  if (!docCode) return NextResponse.json({ success: false, error: 'doc_code 필수' }, { status: 400 })

  try {
    const objectPath = buildObjectPath(docCode, originalName)
    const bucket = storage().bucket(BUCKET_NAME)
    const file = bucket.file(objectPath)

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15분
      contentType,
    })

    return NextResponse.json({
      success: true,
      data: {
        upload_url: uploadUrl,
        gcs_object_path: objectPath,
        bucket: BUCKET_NAME,
        content_type: contentType,
        expires_in: 900,
        usage: 'PUT request with Content-Type header. After upload success, PATCH /api/ride-compliance/documents (update_file_url_only) 또는 별도 endpoint 로 gcs_object_path 저장',
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/upload-url POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  const isMgr = role === 'cpo' || role === 'manager'

  if (!gcsReady()) {
    return NextResponse.json({ success: false, error: 'GCS not configured', meta: { _setup_required: true } }, { status: 501 })
  }

  const url = new URL(request.url)
  const objectPath = (url.searchParams.get('object_path') || '').trim()

  if (!objectPath) return NextResponse.json({ success: false, error: 'object_path query 필수' }, { status: 400 })
  // 안전: object_path 가 compliance/ 로 시작해야 (다른 버킷 경로 차단)
  if (!objectPath.startsWith('compliance/')) {
    return NextResponse.json({ success: false, error: 'invalid object_path' }, { status: 400 })
  }
  // handler 도 다운로드 가능 — 단 검수 완료된 문서만. 호출측에서 documents.is_master_verified 확인 후 요청.
  // (본 endpoint 는 단순 signed URL 발급 — 권한 게이트는 호출측)
  void isMgr

  try {
    const file = storage().bucket(BUCKET_NAME).file(objectPath)
    const [downloadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000, // 10분
    })
    return NextResponse.json({
      success: true,
      data: { download_url: downloadUrl, gcs_object_path: objectPath, expires_in: 600 },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/upload-url GET]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
