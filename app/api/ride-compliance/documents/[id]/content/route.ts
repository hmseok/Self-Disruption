/**
 * /api/ride-compliance/documents/[id]/content
 *
 * GET   — 매뉴얼·서식 마크다운 본문 조회.
 *         manager+ 모든 활성 본문 / handler 는 status='active' 만.
 * PATCH — 본문 편집 (manager+).
 *         CPO 검수 후에는 자동으로 is_master_verified=0 으로 되돌아감 (재검수 필요).
 *
 * 매뉴얼 근거: 사용자 통찰 (2026-05-19) — "내용 표출 + 검수 + 안전·확실"
 *              마크다운 본문을 DB 에 보존하여 시스템 안 직접 열람·검색 + PDF 원본은 별도 보존.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  const params = await context.params
  const id = params?.id
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  try {
    const [row] = await prisma.$queryRaw<Array<{
      id: string; doc_code: string; title: string; content_md: string | null;
      current_version_no: string | null; effective_date: string | null;
      status: string; is_master_verified: number; file_url: string | null;
      gcs_object_path: string | null;
    }>>`
      SELECT id, doc_code, title, content_md,
             current_version_no, effective_date,
             status, is_master_verified, file_url, gcs_object_path
        FROM ride_compliance_documents
       WHERE id = ${id} LIMIT 1
    `
    if (!row) return NextResponse.json({ success: false, error: 'document not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist") || err.message?.includes('Unknown column')) {
      return NextResponse.json({
        success: true, data: null,
        meta: { _migration_pending: 'phase13', migration: '2026-05-19_ride_compliance_phase13.sql' },
      })
    }
    console.error('[/api/ride-compliance/documents/[id]/content GET]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — manager+ only (본문 편집은 관리자 권한)' }, { status: 403 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const contentMd = body.content_md != null ? String(body.content_md) : null
  // 본문 편집 시 검수 상태를 되돌릴지 결정 (안전 기본값 = revoke)
  const revokeVerification = body.revoke_verification !== false  // 기본 true

  try {
    if (revokeVerification) {
      await prisma.$executeRaw`
        UPDATE ride_compliance_documents
           SET content_md = ${contentMd},
               is_master_verified = 0,
               verified_by_user_id = NULL,
               verified_by_cpo_at = NULL,
               verification_note = CONCAT(COALESCE(verification_note, ''), ' [본문 편집 ', NOW(), ' by ', ${user.id}, ' — 재검수 필요]'),
               status = 'pending',
               updated_at = NOW()
         WHERE id = ${id}
      `
    } else {
      await prisma.$executeRaw`
        UPDATE ride_compliance_documents
           SET content_md = ${contentMd}, updated_at = NOW()
         WHERE id = ${id}
      `
    }

    const [row] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, doc_code, title, content_md,
             status, is_master_verified, updated_at
        FROM ride_compliance_documents WHERE id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row, revoke_verification: revokeVerification })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/documents/[id]/content PATCH]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
