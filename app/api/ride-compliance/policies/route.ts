/**
 * /api/ride-compliance/policies
 *
 * GET  — 내규 list (filter: status / q)
 * POST — 신규 내규 등록 (메타만 — 텍스트/파일은 별도 endpoint)
 *
 * Phase 2.0 (2026-05-28) — 내규 마스터.
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { jsonSafe } from '@/lib/json-safe'
import { randomUUID } from 'crypto'

interface PolicyRow {
  id: string
  policy_code: string
  title: string
  version: string
  effective_date: string | null
  superseded_by_id: string | null
  source_file_name: string | null
  source_file_type: string | null
  gcs_object_path: string | null
  file_size_bytes: number | null
  uploaded_at: string | null
  uploaded_by: string | null
  uploaded_by_name: string | null
  ai_extracted_at: string | null
  ai_model: string | null
  ai_confidence: number | null
  ai_summary_md: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  const role = await getOfficerRole(user)

  const url = new URL(request.url)
  const status = (url.searchParams.get('status') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()
  const like = q ? `%${q}%` : null

  try {
    const rows = await prisma.$queryRaw<PolicyRow[]>`
      SELECT p.id, p.policy_code, p.title, p.version, p.effective_date, p.superseded_by_id,
             p.source_file_name, p.source_file_type, p.gcs_object_path, p.file_size_bytes,
             p.uploaded_at, p.uploaded_by, u.name AS uploaded_by_name,
             p.ai_extracted_at, p.ai_model, p.ai_confidence, p.ai_summary_md,
             p.status, p.notes, p.created_at, p.updated_at
        FROM ride_compliance_policies p
        LEFT JOIN profiles u ON u.id = p.uploaded_by
       WHERE (${status} = '' OR p.status = ${status})
         AND (${like} IS NULL
              OR p.title LIKE ${like}
              OR p.policy_code LIKE ${like}
              OR p.notes LIKE ${like})
       ORDER BY p.created_at DESC
       LIMIT 200
    `
    return NextResponse.json({
      success: true, data: jsonSafe(rows),
      meta: { count: rows.length, my_role: role, filters: { status, q } },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: 'phase20', migration: '2026-05-29_ride_compliance_phase20_policies.sql', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/policies GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자 이상만 내규 등록 가능' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 })
  }

  const policyCode = String(body.policy_code || '').trim()
  const title = String(body.title || '').trim()
  const version = String(body.version || 'v1.0').trim()
  const effectiveDate = body.effective_date ? String(body.effective_date).trim() : null
  const sourceFileName = body.source_file_name ? String(body.source_file_name).trim() : null
  const sourceFileType = body.source_file_type ? String(body.source_file_type).trim() : null
  const gcsObjectPath = body.gcs_object_path ? String(body.gcs_object_path).trim() : null
  const fileSizeBytes = body.file_size_bytes != null ? Number(body.file_size_bytes) : null
  const notes = body.notes ? String(body.notes) : null

  if (!policyCode) return NextResponse.json({ success: false, error: 'policy_code 필수' }, { status: 400 })
  if (!title) return NextResponse.json({ success: false, error: 'title 필수' }, { status: 400 })

  try {
    const id = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_policies
        (id, policy_code, title, version, effective_date,
         source_file_name, source_file_type, gcs_object_path, file_size_bytes,
         uploaded_at, uploaded_by, status, notes)
      VALUES
        (${id}, ${policyCode}, ${title}, ${version}, ${effectiveDate},
         ${sourceFileName}, ${sourceFileType}, ${gcsObjectPath}, ${fileSizeBytes},
         ${gcsObjectPath ? new Date() : null}, ${user.id}, 'uploaded', ${notes})
    `
    const [row] = await prisma.$queryRaw<PolicyRow[]>`
      SELECT p.id, p.policy_code, p.title, p.version, p.effective_date, p.superseded_by_id,
             p.source_file_name, p.source_file_type, p.gcs_object_path, p.file_size_bytes,
             p.uploaded_at, p.uploaded_by, u.name AS uploaded_by_name,
             p.ai_extracted_at, p.ai_model, p.ai_confidence, p.ai_summary_md,
             p.status, p.notes, p.created_at, p.updated_at
        FROM ride_compliance_policies p
        LEFT JOIN profiles u ON u.id = p.uploaded_by
       WHERE p.id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: jsonSafe(row) })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: 'policy_code + version 중복' }, { status: 409 })
    }
    console.error('[/api/ride-compliance/policies POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
