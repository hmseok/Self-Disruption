/**
 * /api/ride-compliance/documents
 *
 * GET  — 매뉴얼·서식 카탈로그 list (filter: type/status/verified/parent/q)
 *        manager+ 권한 (handler 는 status='active' 만 조회)
 * POST — 신규 매뉴얼·서식 등록 (file_url 입력) — manager+
 *
 * 매뉴얼 근거: 통합본 5.17 「파생서류 목차」 별첨 1~6 + 별첨 7 (F-06/F-07).
 *
 * 운영 흐름:
 *   1. 마이그 시드 25행 — status='pending', is_master_verified=0, file_url=NULL
 *   2. 관리자(석호민)가 file_url 입력 (POST/PATCH — 추후 PATCH 분리)
 *   3. CPO(임성민)가 /verify endpoint 로 검수 완료 → is_master_verified=1, status='active'
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { isManager, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface DocumentRow {
  id: string
  doc_code: string
  doc_type: string
  title: string
  parent_manual_code: string | null
  description: string | null
  current_version_id: string | null
  current_version_no: string | null
  effective_date: string | null
  retention_years: number
  classification: string
  is_master_verified: number
  verified_by_user_id: string | null
  verified_by_user_name: string | null
  verified_by_cpo_at: string | null
  verification_note: string | null
  file_url: string | null
  status: string
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

const DOC_TYPES = ['manual', 'form', 'policy'] as const
const STATUSES = ['pending', 'active', 'superseded', 'retired'] as const

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  const isMgr = role === 'cpo' || role === 'manager'

  const url = new URL(request.url)
  const docType = (url.searchParams.get('type') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const verified = url.searchParams.get('verified')  // '1' | '0' | null
  const parent = (url.searchParams.get('parent') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()
  const like = q ? `%${q}%` : null

  try {
    const rows = await prisma.$queryRaw<DocumentRow[]>`
      SELECT d.id, d.doc_code, d.doc_type, d.title, d.parent_manual_code, d.description,
             d.current_version_id, d.current_version_no, d.effective_date,
             d.retention_years, d.classification,
             d.is_master_verified, d.verified_by_user_id, v.name AS verified_by_user_name,
             d.verified_by_cpo_at, d.verification_note,
             d.file_url, d.status, d.sort_order, d.notes,
             d.created_at, d.updated_at
        FROM ride_compliance_documents d
        LEFT JOIN profiles v ON v.id = d.verified_by_user_id
       WHERE (${isMgr ? '__ALL__' : 'active'} = '__ALL__' OR d.status = 'active')
         AND (${docType} = '' OR d.doc_type = ${docType})
         AND (${status} = '' OR d.status = ${status})
         AND (${verified === null ? '__ANY__' : verified} = '__ANY__' OR d.is_master_verified = ${verified === '1' ? 1 : 0})
         AND (${parent} = '' OR d.parent_manual_code = ${parent})
         AND (${like} IS NULL OR d.title LIKE ${like} OR d.doc_code LIKE ${like} OR d.description LIKE ${like})
       ORDER BY d.sort_order ASC, d.doc_code ASC
       LIMIT 500
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, my_role: role, filters: { type: docType, status, verified, parent, q } },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true, data: [],
        meta: { _migration_pending: 'phase12', migration: '2026-05-18_ride_compliance_phase12.sql', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/documents GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  if (!(await isManager(user))) {
    return NextResponse.json({ success: false, error: 'forbidden — 관리자(manager) 이상만 매뉴얼·서식 등록 가능' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const docCode = String(body.doc_code || '').trim()
  const docType = String(body.doc_type || '').trim()
  const title = String(body.title || '').trim()
  const parentManualCode = body.parent_manual_code ? String(body.parent_manual_code).trim() : null
  const description = body.description ? String(body.description) : null
  const retentionYears = body.retention_years != null ? parseInt(String(body.retention_years), 10) : 3
  const classification = String(body.classification || 'internal').trim()
  const fileUrl = body.file_url ? String(body.file_url).trim() : null
  const notes = body.notes ? String(body.notes) : null
  // 기존 row 의 file_url 갱신 (검수 단계 진입) 지원
  const updateFileUrlOnly = body.update_file_url_only === true || body.update_file_url_only === 'true'
  const gcsObjectPath = body.gcs_object_path ? String(body.gcs_object_path).trim() : null

  if (!docCode) return NextResponse.json({ success: false, error: 'doc_code 필수' }, { status: 400 })

  // PATCH-like: 기존 doc_code 가 있으면 file_url / gcs_object_path 갱신 (Phase 1.2.0 + 1.3 GCS)
  if (updateFileUrlOnly && (fileUrl || gcsObjectPath)) {
    try {
      // Phase 1.3 — gcs_object_path 컬럼은 마이그 적용 후 활용. 컬럼 없으면 try/catch 후 file_url 만.
      try {
        await prisma.$executeRaw`
          UPDATE ride_compliance_documents
             SET file_url = COALESCE(${fileUrl}, file_url),
                 gcs_object_path = COALESCE(${gcsObjectPath}, gcs_object_path),
                 updated_at = NOW()
           WHERE doc_code = ${docCode}
        `
      } catch (innerErr) {
        const ie = innerErr as { message?: string }
        if (ie.message?.includes('Unknown column') && ie.message?.includes('gcs_object_path')) {
          // Phase 1.3 마이그 미적용 — file_url 만 갱신 (Phase 1.2 호환)
          await prisma.$executeRaw`
            UPDATE ride_compliance_documents
               SET file_url = ${fileUrl}, updated_at = NOW()
             WHERE doc_code = ${docCode}
          `
        } else {
          throw innerErr
        }
      }
      const [row] = await prisma.$queryRaw<DocumentRow[]>`
        SELECT d.id, d.doc_code, d.doc_type, d.title, d.parent_manual_code, d.description,
               d.current_version_id, d.current_version_no, d.effective_date,
               d.retention_years, d.classification,
               d.is_master_verified, d.verified_by_user_id, v.name AS verified_by_user_name,
               d.verified_by_cpo_at, d.verification_note,
               d.file_url, d.status, d.sort_order, d.notes, d.created_at, d.updated_at
          FROM ride_compliance_documents d
          LEFT JOIN profiles v ON v.id = d.verified_by_user_id
         WHERE d.doc_code = ${docCode} LIMIT 1
      `
      return NextResponse.json({ success: true, data: row })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      console.error('[/api/ride-compliance/documents PATCH file_url]', err.code, err.message)
      return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
    }
  }

  if (!DOC_TYPES.includes(docType as typeof DOC_TYPES[number])) {
    return NextResponse.json({ success: false, error: `doc_type 은 ${DOC_TYPES.join('/')} 중 하나` }, { status: 400 })
  }
  if (!title) return NextResponse.json({ success: false, error: 'title 필수' }, { status: 400 })

  try {
    const id = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_documents
        (id, doc_code, doc_type, title, parent_manual_code, description,
         retention_years, classification, file_url, status, notes, created_by)
      VALUES
        (${id}, ${docCode}, ${docType}, ${title}, ${parentManualCode}, ${description},
         ${retentionYears}, ${classification}, ${fileUrl}, 'pending', ${notes}, ${user.id})
    `
    const [row] = await prisma.$queryRaw<DocumentRow[]>`
      SELECT d.id, d.doc_code, d.doc_type, d.title, d.parent_manual_code, d.description,
             d.current_version_id, d.current_version_no, d.effective_date,
             d.retention_years, d.classification,
             d.is_master_verified, d.verified_by_user_id, v.name AS verified_by_user_name,
             d.verified_by_cpo_at, d.verification_note,
             d.file_url, d.status, d.sort_order, d.notes, d.created_at, d.updated_at
        FROM ride_compliance_documents d
        LEFT JOIN profiles v ON v.id = d.verified_by_user_id
       WHERE d.id = ${id} LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: 'doc_code 중복' }, { status: 409 })
    }
    console.error('[/api/ride-compliance/documents POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
