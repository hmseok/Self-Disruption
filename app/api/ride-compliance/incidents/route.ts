/**
 * /api/ride-compliance/incidents
 *
 * GET  — 침해사고 list (필터: type / severity / status / q)
 *        manager+/incident_team → 전체, handler → 본인 reporter_user_id row 만
 * POST — 사고 보고 (인증된 모든 사용자 가능 — 제27조 "즉시 모든 직원은 관리팀에 사고 접수")
 *
 * 매뉴얼 근거: 통합본 5.17 제25조 (유출통지 24시간 의무),
 *              제26조 (침해대응 조직 — 관리팀 일선),
 *              제27조 (침해대응 절차).
 * 부속: 유출대응 매뉴얼 (서식 F-M01-01~06).
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { canHandleIncident, canReportIncident, getOfficerRole } from '@/lib/ride-compliance-perm'
import { randomUUID } from 'crypto'

interface IncidentRow {
  id: string
  incident_code: string
  title: string
  incident_type: string
  severity: string
  occurred_at: Date | string | null
  detected_at: Date | string
  notified_at: Date | string | null
  resolved_at: Date | string | null
  reporter_user_id: string | null
  reporter_user_name: string | null
  assignee_user_id: string | null
  assignee_user_name: string | null
  affected_pii_items: string | null
  affected_subjects_count: number | null
  cause_summary: string | null
  containment_actions: string | null
  notification_method: string | null
  response_details: string | null
  related_asset_id: string | null
  related_asset_code: string | null
  related_asset_name: string | null
  related_processor_id: string | null
  status: string
  cpo_reviewed_at: Date | string | null
  cpo_review_note: string | null
  retention_until: Date | string | null
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

const INCIDENT_TYPES = [
  'external_hacking', 'internal_leak', 'unauthorized_modification',
  'compliance_violation', 'device_loss', 'other',
] as const
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })

  const role = await getOfficerRole(user)
  const canHandle = await canHandleIncident(user)

  const url = new URL(request.url)
  const type = (url.searchParams.get('type') || '').trim()
  const severity = (url.searchParams.get('severity') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const q = (url.searchParams.get('q') || '').trim()
  const like = q ? `%${q}%` : null
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 1000)

  try {
    const rows = await prisma.$queryRaw<IncidentRow[]>`
      SELECT i.id, i.incident_code, i.title, i.incident_type, i.severity,
             i.occurred_at, i.detected_at, i.notified_at, i.resolved_at,
             i.reporter_user_id, ru.name AS reporter_user_name,
             i.assignee_user_id, au.name AS assignee_user_name,
             i.affected_pii_items, i.affected_subjects_count,
             i.cause_summary, i.containment_actions, i.notification_method,
             i.response_details,
             i.related_asset_id, ra.asset_code AS related_asset_code, ra.name AS related_asset_name,
             i.related_processor_id,
             i.status, i.cpo_reviewed_at, i.cpo_review_note, i.retention_until,
             i.created_by, i.created_at, i.updated_at
        FROM ride_compliance_incidents i
        LEFT JOIN profiles ru ON ru.id = i.reporter_user_id
        LEFT JOIN profiles au ON au.id = i.assignee_user_id
        LEFT JOIN ride_compliance_assets ra ON ra.id = i.related_asset_id
       WHERE (${canHandle ? '__ALL__' : user.id} = '__ALL__' OR i.reporter_user_id = ${user.id})
         AND (${type} = '' OR i.incident_type = ${type})
         AND (${severity} = '' OR i.severity = ${severity})
         AND (${status} = '' OR i.status = ${status})
         AND (${like} IS NULL OR i.title LIKE ${like} OR i.incident_code LIKE ${like} OR i.cause_summary LIKE ${like})
       ORDER BY
         CASE i.status
           WHEN 'reported'      THEN 1
           WHEN 'triaging'      THEN 2
           WHEN 'containing'    THEN 3
           WHEN 'notifying'     THEN 4
           WHEN 'investigating' THEN 5
           WHEN 'resolved'      THEN 6
           WHEN 'closed'        THEN 7
           ELSE 9
         END,
         i.detected_at DESC
       LIMIT ${limit}
    `
    return NextResponse.json({
      success: true,
      data: rows,
      meta: { count: rows.length, my_role: role, can_handle: canHandle, filters: { type, severity, status, q } },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true, migration: '2026-05-18_ride_compliance_phase11.sql', my_role: role },
      })
    }
    console.error('[/api/ride-compliance/incidents GET]', err.code, err.message)
    return NextResponse.json({ success: false, data: [], error: String(err.message) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = await verifyUser(request)
  if (!user || !canReportIncident(user)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ success: false, error: 'invalid json' }, { status: 400 }) }

  const title = String(body.title || '').trim()
  const incidentType = String(body.incident_type || '').trim()
  const severity = String(body.severity || 'medium').trim()
  const occurredAt = body.occurred_at ? String(body.occurred_at).trim() : null
  const affectedPiiItems = body.affected_pii_items ? String(body.affected_pii_items) : null
  const affectedSubjectsCount = body.affected_subjects_count != null && body.affected_subjects_count !== ''
    ? parseInt(String(body.affected_subjects_count), 10)
    : null
  const causeSummary = body.cause_summary ? String(body.cause_summary) : null
  const containmentActions = body.containment_actions ? String(body.containment_actions) : null
  const relatedAssetId = body.related_asset_id ? String(body.related_asset_id).trim() : null

  if (!title) return NextResponse.json({ success: false, error: 'title 필수' }, { status: 400 })
  if (!INCIDENT_TYPES.includes(incidentType as typeof INCIDENT_TYPES[number])) {
    return NextResponse.json({ success: false, error: `incident_type 은 ${INCIDENT_TYPES.join('/')} 중 하나` }, { status: 400 })
  }
  if (!SEVERITIES.includes(severity as typeof SEVERITIES[number])) {
    return NextResponse.json({ success: false, error: `severity 은 ${SEVERITIES.join('/')} 중 하나` }, { status: 400 })
  }

  try {
    // incident_code 생성: INC-{YYYY}-{4자리}
    const year = new Date().getFullYear()
    const prefix = `INC-${year}-`
    const result = await prisma.$transaction(async (tx) => {
      const seqRows = await tx.$queryRaw<Array<{ max_code: string | null }>>`
        SELECT MAX(incident_code) AS max_code
          FROM ride_compliance_incidents
         WHERE incident_code LIKE ${`${prefix}%`}
      `
      let seq = 1
      const maxCode = seqRows[0]?.max_code
      if (maxCode && maxCode.startsWith(prefix)) {
        const tail = maxCode.substring(prefix.length)
        const n = parseInt(tail, 10)
        if (!isNaN(n)) seq = n + 1
      }
      const incidentCode = `${prefix}${String(seq).padStart(4, '0')}`
      const id = randomUUID()

      await tx.$executeRaw`
        INSERT INTO ride_compliance_incidents
          (id, incident_code, title, incident_type, severity,
           occurred_at, reporter_user_id,
           affected_pii_items, affected_subjects_count,
           cause_summary, containment_actions,
           related_asset_id, status, created_by)
        VALUES
          (${id}, ${incidentCode}, ${title}, ${incidentType}, ${severity},
           ${occurredAt}, ${user.id},
           ${affectedPiiItems}, ${affectedSubjectsCount},
           ${causeSummary}, ${containmentActions},
           ${relatedAssetId}, 'reported', ${user.id})
      `
      return { id, incidentCode }
    })

    const [row] = await prisma.$queryRaw<IncidentRow[]>`
      SELECT i.id, i.incident_code, i.title, i.incident_type, i.severity,
             i.occurred_at, i.detected_at, i.notified_at, i.resolved_at,
             i.reporter_user_id, ru.name AS reporter_user_name,
             i.assignee_user_id, au.name AS assignee_user_name,
             i.affected_pii_items, i.affected_subjects_count,
             i.cause_summary, i.containment_actions, i.notification_method,
             i.response_details,
             i.related_asset_id, ra.asset_code AS related_asset_code, ra.name AS related_asset_name,
             i.related_processor_id,
             i.status, i.cpo_reviewed_at, i.cpo_review_note, i.retention_until,
             i.created_by, i.created_at, i.updated_at
        FROM ride_compliance_incidents i
        LEFT JOIN profiles ru ON ru.id = i.reporter_user_id
        LEFT JOIN profiles au ON au.id = i.assignee_user_id
        LEFT JOIN ride_compliance_assets ra ON ra.id = i.related_asset_id
       WHERE i.id = ${result.id}
       LIMIT 1
    `
    return NextResponse.json({ success: true, data: row })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.message?.includes('Duplicate') || err.message?.includes('unique')) {
      return NextResponse.json({ success: false, error: 'incident_code 중복 — 재시도 부탁드립니다' }, { status: 409 })
    }
    console.error('[/api/ride-compliance/incidents POST]', err.code, err.message)
    return NextResponse.json({ success: false, error: String(err.message) }, { status: 500 })
  }
}
