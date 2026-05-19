/**
 * /api/ride-compliance/documents/[id]/verify
 *
 * PATCH — CPO 원본 검수 완료 (is_master_verified=1, status='active')
 *
 * 매뉴얼 근거: 사용자 추가-C 통찰 — 원본 매뉴얼·서식 파일이 시스템에 정확히
 * 등록되었음을 CPO가 검수 완료해야 운영 task의 related_form 으로 연결 가능.
 *
 * 전제 조건: documents.file_url IS NOT NULL (관리자가 URL 입력 완료한 상태).
 * 권한: canVerifyMaster (= isCpo, admin 자동 포함).
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { canVerifyMaster } from '@/lib/ride-compliance-perm'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await canVerifyMaster(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — CPO(또는 시스템 관리자)만 원본 검수 가능' }, { status: 403 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* empty body OK */ }
  const verificationNote = body.verification_note ? String(body.verification_note) : null
  const revoke = body.revoke === true || body.revoke === 'true'   // 검수 취소 (재검수 사유 발생 시)

  try {
    // 전제: file_url IS NOT NULL (검수할 원본이 있어야)
    const existing = await prisma.$queryRaw<Array<{ file_url: string | null; status: string }>>`
      SELECT file_url, status FROM ride_compliance_documents WHERE id = ${id} LIMIT 1
    `
    if (!existing.length) return NextResponse.json({ success: false, error: 'document not found' }, { status: 404 })
    if (!revoke && !existing[0].file_url) {
      return NextResponse.json({ success: false, error: 'file_url 미입력 — 관리자가 원본 URL 등록 후 검수 가능' }, { status: 400 })
    }

    if (revoke) {
      await prisma.$executeRaw`
        UPDATE ride_compliance_documents
           SET is_master_verified = 0,
               verified_by_user_id = NULL,
               verified_by_cpo_at = NULL,
               verification_note = ${verificationNote},
               status = 'pending',
               updated_at = NOW()
         WHERE id = ${id}
      `
    } else {
      await prisma.$executeRaw`
        UPDATE ride_compliance_documents
           SET is_master_verified = 1,
               verified_by_user_id = ${user.id},
               verified_by_cpo_at = NOW(),
               verification_note = ${verificationNote},
               status = 'active',
               updated_at = NOW()
         WHERE id = ${id}
      `
    }

    const [row] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT d.id, d.doc_code, d.doc_type, d.title,
             d.is_master_verified, d.verified_by_user_id, v.name AS verified_by_user_name,
             d.verified_by_cpo_at, d.verification_note, d.status, d.file_url
        FROM ride_compliance_documents d
        LEFT JOIN profiles v ON v.id = d.verified_by_user_id
       WHERE d.id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row, action: revoke ? 'revoked' : 'verified' })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/documents/[id]/verify PATCH]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
