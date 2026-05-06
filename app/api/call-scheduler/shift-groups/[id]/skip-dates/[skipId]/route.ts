// ═══════════════════════════════════════════════════════════════════
// PR-2SS-h-1 — 그룹 회피일 단일 항목 API
//
// PATCH  /api/call-scheduler/shift-groups/[id]/skip-dates/[skipId]
//   body: { status?, reason?, start_date?, end_date? }
//   status='approved' 변경 시 approved_by/approved_at 자동 기록
//
// DELETE /api/call-scheduler/shift-groups/[id]/skip-dates/[skipId]
// ═══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

const STATUSES = new Set(['requested', 'approved', 'rejected', 'canceled'])

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; skipId: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId, skipId } = await context.params
    const body = await request.json()

    // 마이그 미적용 graceful
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_member_skip_dates LIMIT 1`
    } catch {
      return NextResponse.json({ error: '테이블 미생성' }, { status: 503 })
    }

    const sets: string[] = []
    const params: any[] = []
    if (body?.status != null) {
      const st = String(body.status)
      if (!STATUSES.has(st)) {
        return NextResponse.json({ error: 'status 무효' }, { status: 400 })
      }
      sets.push('status = ?'); params.push(st)
      // 'approved' 로 변경 시 승인자 기록
      if (st === 'approved') {
        const approvedBy = (user as any)?.id || (user as any)?.profile_id || null
        sets.push('approved_by = ?'); params.push(approvedBy)
        sets.push('approved_at = NOW()')
      }
    }
    if (body?.reason !== undefined) {
      sets.push('reason = ?'); params.push(body.reason ? String(body.reason).trim() : null)
    }
    if (body?.start_date != null && /^\d{4}-\d{2}-\d{2}$/.test(String(body.start_date))) {
      sets.push('start_date = ?'); params.push(String(body.start_date))
    }
    if (body?.end_date != null && /^\d{4}-\d{2}-\d{2}$/.test(String(body.end_date))) {
      sets.push('end_date = ?'); params.push(String(body.end_date))
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
    }
    sets.push('updated_at = NOW()')

    const sql = `UPDATE cs_group_member_skip_dates
                 SET ${sets.join(', ')}
                 WHERE id = ? AND group_id = ?`
    params.push(skipId, groupId)
    await prisma.$executeRawUnsafe(sql, ...params)

    return NextResponse.json({ data: { id: skipId, updated: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; skipId: string }> },
) {
  const user = await verifyUser(request)
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  try {
    const { id: groupId, skipId } = await context.params
    // 마이그 미적용 graceful
    try {
      await prisma.$queryRaw<any[]>`SELECT 1 FROM cs_group_member_skip_dates LIMIT 1`
    } catch {
      return NextResponse.json({ error: '테이블 미생성' }, { status: 503 })
    }
    await prisma.$executeRaw`
      DELETE FROM cs_group_member_skip_dates
      WHERE id = ${skipId} AND group_id = ${groupId}
    `
    return NextResponse.json({ data: { id: skipId, deleted: true }, error: null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'DB error' }, { status: 500 })
  }
}
