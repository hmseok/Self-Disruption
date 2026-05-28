/**
 * /api/ride-compliance/policies/[id]
 *
 * GET    — 단일 내규 상세
 * PATCH  — 부분 갱신 (title / status / notes / ai_summary_md 등)
 * DELETE — manager+ (uploaded / ai_extracted 만 삭제 가능, active 는 superseded 처리)
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager } from '@/lib/ride-compliance-perm'
import { jsonSafe } from '@/lib/json-safe'

interface PolicyRow {
  id: string
  policy_code: string
  title: string
  version: string
  status: string
  ai_extracted_at: string | null
  ai_summary_md: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const STATUSES = ['uploaded', 'ai_extracted', 'user_reviewing', 'active', 'superseded'] as const

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const [row] = await prisma.$queryRaw<PolicyRow[]>`
      SELECT p.id, p.policy_code, p.title, p.version, p.effective_date, p.superseded_by_id,
             p.source_file_name, p.source_file_type, p.gcs_object_path, p.file_size_bytes,
             p.uploaded_at, p.uploaded_by, u.name AS uploaded_by_name,
             p.ai_extracted_at, p.ai_model, p.ai_confidence, p.ai_raw_response, p.ai_summary_md,
             p.status, p.notes, p.created_at, p.updated_at
        FROM ride_compliance_policies p
        LEFT JOIN profiles u ON u.id = p.uploaded_by
       WHERE p.id = ${id} LIMIT 1
    `
    if (!row) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: jsonSafe(row) })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/policies/[id] GET]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자 이상만 수정 가능' }, { status: 403 })
  }
  const { id } = await params

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const title = body.title != null ? String(body.title).trim() : null
  const version = body.version != null ? String(body.version).trim() : null
  const effectiveDate = body.effective_date != null ? String(body.effective_date).trim() : null
  const status = body.status != null ? String(body.status).trim() : null
  if (status && !STATUSES.includes(status as typeof STATUSES[number])) {
    return NextResponse.json({ success: false, error: `status 는 ${STATUSES.join('/')} 중 하나` }, { status: 400 })
  }
  const aiSummaryMd = body.ai_summary_md != null ? String(body.ai_summary_md) : null
  const notes = body.notes != null ? String(body.notes) : null

  try {
    await prisma.$executeRaw`
      UPDATE ride_compliance_policies
         SET title          = COALESCE(${title}, title),
             version        = COALESCE(${version}, version),
             effective_date = COALESCE(${effectiveDate}, effective_date),
             status         = COALESCE(${status}, status),
             ai_summary_md  = COALESCE(${aiSummaryMd}, ai_summary_md),
             notes          = COALESCE(${notes}, notes),
             updated_at     = NOW()
       WHERE id = ${id}
    `
    const [row] = await prisma.$queryRaw<PolicyRow[]>`
      SELECT * FROM ride_compliance_policies WHERE id = ${id} LIMIT 1
    `
    if (!row) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: jsonSafe(row) })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/policies/[id] PATCH]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자 이상만 삭제 가능' }, { status: 403 })
  }
  const { id } = await params
  try {
    const [row] = await prisma.$queryRaw<PolicyRow[]>`SELECT status FROM ride_compliance_policies WHERE id = ${id} LIMIT 1`
    if (!row) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    if (row.status === 'active') {
      return NextResponse.json({
        success: false,
        error: `삭제 불가 — status='active'. superseded 로 상태 전이 후 삭제하세요.`,
      }, { status: 409 })
    }
    // cascade — sections 도 함께 삭제
    await prisma.$executeRaw`DELETE FROM ride_compliance_policy_sections WHERE policy_id = ${id}`
    await prisma.$executeRaw`DELETE FROM ride_compliance_policies WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    console.error('[/api/ride-compliance/policies/[id] DELETE]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
