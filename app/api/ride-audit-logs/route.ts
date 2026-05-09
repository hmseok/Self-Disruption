/**
 * /api/ride-audit-logs
 *
 * GET — 변경 이력 조회 (filter: table=&record_id= 또는 changed_by=)
 *
 * PR-6.10.g
 */
import { NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

interface AuditRow {
  id: string
  table_name: string
  record_id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_by_name: string | null
  changed_at: Date | string
}

export async function GET(request: Request) {
  const user = await verifyUser(request)
  if (!user)
    return NextResponse.json({ success: false, data: [], error: 'unauthorized' }, { status: 401 })
  if (user.role !== 'admin')
    return NextResponse.json({ success: false, data: [], error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const tableName = url.searchParams.get('table') || ''
  const recordId = url.searchParams.get('record_id') || ''
  const changedBy = url.searchParams.get('changed_by') || ''
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1),
    500
  )

  try {
    let rows: AuditRow[]
    if (tableName && recordId) {
      rows = await prisma.$queryRaw<AuditRow[]>`
        SELECT id, table_name, record_id, action, field_name,
               old_value, new_value, changed_by, changed_by_name, changed_at
          FROM ride_audit_logs
         WHERE table_name = ${tableName} AND record_id = ${recordId}
         ORDER BY changed_at DESC
         LIMIT ${limit}
      `
    } else if (changedBy) {
      rows = await prisma.$queryRaw<AuditRow[]>`
        SELECT id, table_name, record_id, action, field_name,
               old_value, new_value, changed_by, changed_by_name, changed_at
          FROM ride_audit_logs
         WHERE changed_by = ${changedBy}
         ORDER BY changed_at DESC
         LIMIT ${limit}
      `
    } else {
      rows = await prisma.$queryRaw<AuditRow[]>`
        SELECT id, table_name, record_id, action, field_name,
               old_value, new_value, changed_by, changed_by_name, changed_at
          FROM ride_audit_logs
         ORDER BY changed_at DESC
         LIMIT ${limit}
      `
    }
    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        fetched_at: new Date().toISOString(),
        count: rows.length,
        filters: { tableName, recordId, changedBy },
      },
    })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P2010' || err.message?.includes("doesn't exist")) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { _migration_pending: true },
      })
    }
    console.error('[/api/ride-audit-logs GET]', err.code, err.message)
    return NextResponse.json(
      { success: false, data: [], error: String(err.message || err.code) },
      { status: 500 }
    )
  }
}
